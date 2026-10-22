import secrets
from datetime import datetime, timezone, timedelta
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException
from pydantic import EmailStr, Field

from config import APP_MODE, WEB_ORIGIN, Input, Payload, db, now, uid
from jobs import enqueue_email
from security import ScopedRepo, audit, authorize, digest, principal


router = APIRouter()
PROFILE_ROLE = {'guardian': 'parent', 'clinical': 'staff', 'reception': 'staff', 'finance': 'staff', 'administrator': 'admin'}


class InvitationInput(Input):
    email: EmailStr
    display_name: str = Field(min_length=2, max_length=100)
    access_profile: Literal['guardian', 'clinical', 'reception', 'finance', 'administrator']
    child_ids: list[str] = Field(default_factory=list, max_length=50)
    expires_hours: int = Field(default=72, ge=1, le=168)


class DeactivateInput(Input):
    reason: str = Field(min_length=3, max_length=300)


@router.get('/admin/access', response_model=Payload)
async def access_overview(p=Depends(principal)):
    await authorize(p, 'accounts:manage')
    users = await db.users.find({'org_id': p['org_id']}, {'_id': 0, 'password_hash': 0, 'mfa_secret': 0, 'mfa_pending_secret': 0, 'mfa_recovery_hashes': 0}).sort('display_name', 1).to_list(500)
    invites = await db.invitations.find({'org_id': p['org_id']}, {'_id': 0, 'token_hash': 0}).sort('created_at', -1).limit(100).to_list(100)
    grants = await db.access_grants.find({'org_id': p['org_id']}, {'_id': 0}).to_list(1000)
    await audit(p, 'accounts:manage', 'access-overview')
    return {'users': users, 'invitations': invites, 'grants': grants}


@router.post('/admin/invitations', response_model=Payload, status_code=201)
async def invite_user(data: InvitationInput, p=Depends(principal)):
    await authorize(p, 'accounts:manage')
    email = str(data.email).lower()
    if await db.users.find_one({'org_id': p['org_id'], 'email': email, 'active': True}, {'_id': 0, 'id': 1}):
        raise HTTPException(409, 'An active account already uses this email.')
    child_ids = list(dict.fromkeys(data.child_ids))
    if data.access_profile in {'guardian', 'clinical'}:
        found = await db.children.find({'org_id': p['org_id'], 'id': {'$in': child_ids}}, {'_id': 0, 'id': 1}).to_list(100)
        if len(found) != len(child_ids) or not child_ids:
            raise HTTPException(422, 'Select at least one valid child for guardian or clinical access.')
    else:
        child_ids = []
    await db.invitations.update_many({'org_id': p['org_id'], 'email': email, 'used_at': {'$exists': False}}, {'$set': {'cancelled_at': now()}})
    raw = secrets.token_urlsafe(40)
    record = {'id': uid(), 'org_id': p['org_id'], 'email': email, 'display_name': data.display_name,
              'role': PROFILE_ROLE[data.access_profile], 'access_profile': data.access_profile, 'child_ids': child_ids,
              'token_hash': digest(raw), 'created_by': p['id'], 'created_at': now(),
              'expires_at': datetime.now(timezone.utc) + timedelta(hours=data.expires_hours)}
    await db.invitations.insert_one(record.copy())
    link = f'{WEB_ORIGIN}/accept-invite?token={raw}'
    job = await enqueue_email(p['org_id'], email, 'Your Moonlight Neurocare portal invitation',
                              f'You have been invited to the Moonlight Neurocare portal.\n\nUse this single-use link within {data.expires_hours} hours:\n{link}\n\nIf you were not expecting this invitation, contact the center.',
                              f'invitation:{record["id"]}')
    await audit(p, 'accounts:invite', record['id'])
    result = {key: record[key] for key in ['id', 'email', 'display_name', 'role', 'access_profile', 'child_ids', 'created_at', 'expires_at']}
    result['delivery_status'] = job['status']
    if APP_MODE == 'demo':
        result['demo_invitation_token'] = raw
    return result


@router.post('/admin/users/{user_id}/deactivate', response_model=Payload)
async def deactivate_user(user_id: str, data: DeactivateInput, p=Depends(principal)):
    await authorize(p, 'accounts:manage')
    if user_id == p['id']:
        raise HTTPException(422, 'You cannot deactivate your own active account.')
    user = await db.users.find_one({'org_id': p['org_id'], 'id': user_id}, {'_id': 0})
    if not user:
        raise HTTPException(404, 'Account not found.')
    await db.users.update_one({'org_id': p['org_id'], 'id': user_id}, {'$set': {'active': False, 'deactivated_at': now(), 'deactivation_reason': data.reason}, '$inc': {'security_version': 1}})
    await db.sessions.delete_many({'org_id': p['org_id'], 'user_id': user_id})
    await db.access_grants.update_many({'org_id': p['org_id'], 'user_id': user_id, 'status': 'active'}, {'$set': {'status': 'revoked', 'revoked_at': now(), 'revoked_by': p['id'], 'reason': data.reason}})
    await db.children.update_many({'org_id': p['org_id']}, {'$pull': {'guardian_ids': user_id, 'staff_ids': user_id}})
    await audit(p, 'accounts:deactivate', user_id)
    return {'message': 'Account deactivated and all active sessions revoked.'}


@router.post('/admin/access-grants/{grant_id}/revoke', response_model=Payload)
async def revoke_access_grant(grant_id: str, data: DeactivateInput, p=Depends(principal)):
    await authorize(p, 'accounts:manage')
    grant = await db.access_grants.find_one({'org_id': p['org_id'], 'id': grant_id, 'status': 'active'}, {'_id': 0})
    if not grant:
        raise HTTPException(404, 'Active access grant not found.')
    await db.access_grants.update_one({'org_id': p['org_id'], 'id': grant_id}, {'$set': {'status': 'revoked', 'revoked_at': now(), 'revoked_by': p['id'], 'reason': data.reason}, '$inc': {'version': 1}})
    field = 'guardian_ids' if grant['relationship'] == 'guardian' else 'staff_ids'
    await db.children.update_one({'org_id': p['org_id'], 'id': grant['child_id']}, {'$pull': {field: grant['user_id']}, '$inc': {'version': 1}})
    await db.sessions.delete_many({'org_id': p['org_id'], 'user_id': grant['user_id']})
    await audit(p, 'access:revoke', grant_id)
    return {'message': 'Child access revoked and active sessions ended.'}