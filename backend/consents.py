from typing import Literal

from fastapi import APIRouter, Depends, HTTPException
from pydantic import Field

from config import Input, Payload, db, now, uid
from security import ScopedRepo, audit, authorize, principal


router = APIRouter()
ConsentPurpose = Literal['care', 'private_video_sharing', 'public_photography', 'school_sharing', 'marketing', 'session_recording']


class ConsentRequestInput(Input):
    child_id: str = Field(min_length=1, max_length=100)
    guardian_id: str = Field(min_length=1, max_length=100)
    purposes: list[ConsentPurpose] = Field(min_length=1, max_length=6)
    policy_version: str = Field(min_length=2, max_length=40)
    purpose_text: str = Field(min_length=10, max_length=1000)


class ConsentSignInput(Input):
    signer_name: str = Field(min_length=2, max_length=100)
    accepted: bool


class ConsentWithdrawInput(Input):
    reason: str = Field(min_length=3, max_length=500)


async def effective_consent(org_id: str, child_id: str, purpose: str) -> dict | None:
    return await db.consents.find_one({'org_id': org_id, 'child_id': child_id, 'purpose': purpose, 'status': 'granted', 'withdrawn_at': {'$exists': False}}, {'_id': 0})


@router.get('/consents', response_model=Payload)
async def list_consents(p=Depends(principal)):
    await authorize(p, 'consents:read')
    query = {'org_id': p['org_id']}
    if p['role'] == 'parent':
        child_scope = await ScopedRepo(p).scope('children', 'children:read')
        query.update({'child_id': child_scope['id'], 'guardian_id': p['id']})
    records = await db.consents.find(query, {'_id': 0}).sort('created_at', -1).limit(500).to_list(500)
    await audit(p, 'consents:read', 'consents')
    return {'items': records}


@router.post('/admin/consent-requests', response_model=Payload, status_code=201)
async def request_consents(data: ConsentRequestInput, p=Depends(principal)):
    await authorize(p, 'consents:request')
    child = await ScopedRepo(p).one('children', 'children:read', data.child_id)
    if data.guardian_id not in child.get('guardian_ids', []):
        raise HTTPException(422, 'Choose a verified guardian for this child.')
    created = []
    for purpose in list(dict.fromkeys(data.purposes)):
        await db.consents.update_many({'org_id': p['org_id'], 'child_id': data.child_id, 'guardian_id': data.guardian_id,
                                       'purpose': purpose, 'status': 'pending'}, {'$set': {'superseded_at': now(), 'status': 'superseded'}})
        record = {'id': uid(), 'org_id': p['org_id'], 'child_id': child['id'], 'child_name': child['name'],
                  'guardian_id': data.guardian_id, 'purpose': purpose, 'purpose_text': data.purpose_text,
                  'policy_version': data.policy_version, 'status': 'pending', 'requested_by': p['id'],
                  'created_at': now(), 'version': 1}
        await db.consents.insert_one(record.copy())
        created.append(record)
    await audit(p, 'consents:request', data.child_id)
    return {'items': created}


@router.post('/consents/{consent_id}/sign', response_model=Payload)
async def sign_consent(consent_id: str, data: ConsentSignInput, p=Depends(principal)):
    await authorize(p, 'consents:sign')
    consent = await db.consents.find_one({'org_id': p['org_id'], 'id': consent_id, 'guardian_id': p['id'], 'status': 'pending'}, {'_id': 0})
    if not consent:
        raise HTTPException(404, 'Pending consent request not found.')
    status = 'granted' if data.accepted else 'declined'
    changes = {'status': status, 'signer_name': data.signer_name, 'signer_id': p['id'], 'signed_at': now(), 'updated_at': now()}
    await db.consents.update_one({'org_id': p['org_id'], 'id': consent_id, 'status': 'pending'}, {'$set': changes, '$inc': {'version': 1}})
    await audit(p, f'consents:{status}', consent_id)
    return {**consent, **changes, 'version': consent.get('version', 1) + 1}


@router.post('/consents/{consent_id}/withdraw', response_model=Payload)
async def withdraw_consent(consent_id: str, data: ConsentWithdrawInput, p=Depends(principal)):
    await authorize(p, 'consents:withdraw')
    consent = await db.consents.find_one({'org_id': p['org_id'], 'id': consent_id, 'guardian_id': p['id'], 'status': 'granted'}, {'_id': 0})
    if not consent:
        raise HTTPException(404, 'Active consent not found.')
    changes = {'status': 'withdrawn', 'withdrawn_at': now(), 'withdrawn_by': p['id'], 'withdrawal_reason': data.reason, 'updated_at': now()}
    await db.consents.update_one({'org_id': p['org_id'], 'id': consent_id, 'status': 'granted'}, {'$set': changes, '$inc': {'version': 1}})
    if consent['purpose'] == 'private_video_sharing':
        await db.practice_videos.update_many({'org_id': p['org_id'], 'child_id': consent['child_id'], 'is_deleted': {'$ne': True}}, {'$set': {'sharing_suspended': True, 'sharing_suspended_at': now()}})
    await audit(p, 'consents:withdraw', consent_id)
    return {**consent, **changes, 'version': consent.get('version', 1) + 1}