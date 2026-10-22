from fastapi import APIRouter, Depends, HTTPException
from pydantic import Field

from config import Input, Payload, db, now, uid
from school_access import SCOPES, cancel_school_alerts, history, iso_in
from security import audit, authorize, principal

router = APIRouter()
SCOPE_TEXT = {'profile': 'Practical child support profile', 'goals': 'Selected goals and progress summaries',
              'activities': 'School activities and classroom strategies', 'documents': 'Selected reports and documents',
              'videos': 'Specific videos approved for school use', 'safety': 'Relevant safety information',
              'messages': 'Team messages and meetings', 'download': 'Permission to download shared documents'}


class DecisionInput(Input):
    approve: bool
    scopes: list[str] = Field(default_factory=list, max_length=8)
    duration_days: int = Field(default=180, ge=7, le=365)
    signer_name: str = Field(min_length=2, max_length=100)


class LinkUpdate(Input):
    scopes: list[str] = Field(max_length=8)
    duration_days: int = Field(ge=7, le=365)
    approved_video_ids: list[str] = Field(default_factory=list, max_length=30)


class ReasonInput(Input):
    reason: str = Field(min_length=3, max_length=500)


class AssignmentDecision(Input):
    approve: bool


def _scopes(values: list[str]) -> list[str]:
    bad = [s for s in values if s not in SCOPES]
    if bad:
        raise HTTPException(422, 'Choose sharing categories from the list.')
    return list(dict.fromkeys(values))


async def _guardian_link(p, link_id, statuses):
    await authorize(p, 'sharing:manage')
    link = await db.school_links.find_one({'org_id': p['org_id'], 'id': link_id, 'status': {'$in': statuses}}, {'_id': 0})
    child = link and await db.children.find_one({'org_id': p['org_id'], 'id': link['child_id'], 'guardian_ids': p['id']}, {'_id': 0, 'id': 1})
    if not child:
        await audit(p, 'sharing:manage', link_id, 'not_visible')
        raise HTTPException(404, 'School sharing record not found.')
    return link


@router.get('/sharing/school', response_model=Payload)
async def overview(p=Depends(principal)):
    await authorize(p, 'sharing:manage')
    children = await db.children.find({'org_id': p['org_id'], 'guardian_ids': p['id']}, {'_id': 0, 'id': 1, 'name': 1}).to_list(20)
    ids = [c['id'] for c in children]
    links = await db.school_links.find({'org_id': p['org_id'], 'child_id': {'$in': ids}}, {'_id': 0}).sort('requested_at', -1).to_list(100)
    assignments = await db.school_assignments.find({'org_id': p['org_id'], 'child_id': {'$in': ids}, 'status': {'$in': ['proposed', 'active']}}, {'_id': 0}).to_list(200)
    videos = await db.practice_videos.find({'org_id': p['org_id'], 'child_id': {'$in': ids}, 'is_deleted': {'$ne': True}}, {'_id': 0, 'id': 1, 'child_id': 1, 'title': 1, 'therapy': 1, 'session_date': 1}).to_list(200)
    consents = await db.consents.find({'org_id': p['org_id'], 'child_id': {'$in': ids}, 'guardian_id': p['id']}, {'_id': 0}).sort('created_at', -1).to_list(200)
    await audit(p, 'sharing:read', 'school-sharing')
    return {'children': children, 'links': links, 'assignments': assignments, 'videos': videos, 'consents': consents, 'scope_text': SCOPE_TEXT}


@router.post('/sharing/school/links/{link_id}/decision', response_model=Payload)
async def decide_link(link_id: str, data: DecisionInput, p=Depends(principal)):
    link = await _guardian_link(p, link_id, ['pending'])
    if not data.approve:
        await db.school_links.update_one({'id': link_id, 'org_id': p['org_id'], 'status': 'pending'},
                                         {'$set': {'status': 'declined', 'ended_at': now()}, '$push': {'history': history(p, 'declined', signer=data.signer_name)}})
        await audit(p, 'sharing:link-declined', link_id)
        return {'message': 'You declined this school link. Nothing has been shared.'}
    scopes = _scopes(data.scopes)
    if not scopes:
        raise HTTPException(422, 'Choose at least one category to share, or decline.')
    consent = {'id': uid(), 'org_id': p['org_id'], 'child_id': link['child_id'], 'child_name': link['child_name'], 'guardian_id': p['id'],
               'purpose': 'school_sharing', 'purpose_text': f"Share selected information with {link['school_name']}: {link['purpose']}",
               'policy_version': 'school-sharing-v1', 'status': 'granted', 'signer_name': data.signer_name, 'signer_id': p['id'],
               'signed_at': now(), 'created_at': now(), 'link_id': link_id, 'scopes': scopes, 'version': 1}
    await db.consents.insert_one(consent.copy())
    result = await db.school_links.update_one({'id': link_id, 'org_id': p['org_id'], 'status': 'pending'}, {'$set': {
        'status': 'active', 'scopes': scopes, 'guardian_id': p['id'], 'approved_at': now(), 'expires_at': iso_in(data.duration_days), 'consent_id': consent['id']},
        '$push': {'history': history(p, 'approved', scopes=scopes, duration_days=data.duration_days, signer=data.signer_name)}})
    if not result.matched_count:
        raise HTTPException(409, 'This request changed. Refresh and try again.')
    await audit(p, 'sharing:link-approved', link_id)
    return {'message': f"Sharing with {link['school_name']} is active."}


@router.patch('/sharing/school/links/{link_id}', response_model=Payload)
async def update_link(link_id: str, data: LinkUpdate, p=Depends(principal)):
    link = await _guardian_link(p, link_id, ['active'])
    scopes = _scopes(data.scopes)
    if not scopes:
        raise HTTPException(422, 'Keep at least one category, or withdraw sharing completely.')
    video_ids = list(dict.fromkeys(data.approved_video_ids)) if 'videos' in scopes else []
    if video_ids:
        found = await db.practice_videos.count_documents({'org_id': p['org_id'], 'child_id': link['child_id'], 'id': {'$in': video_ids}, 'is_deleted': {'$ne': True}})
        if found != len(video_ids):
            raise HTTPException(422, 'Choose videos recorded for this child.')
    await db.school_links.update_one({'id': link_id, 'org_id': p['org_id']}, {'$set': {'scopes': scopes, 'approved_video_ids': video_ids, 'expires_at': iso_in(data.duration_days)},
                                                                            '$push': {'history': history(p, 'changed', scopes=scopes, duration_days=data.duration_days, videos=len(video_ids))}})
    await db.consents.update_one({'org_id': p['org_id'], 'id': link.get('consent_id')}, {'$set': {'scopes': scopes, 'updated_at': now()}, '$inc': {'version': 1}})
    if 'messages' not in scopes:
        await cancel_school_alerts(p['org_id'], link['child_id'], link['school_id'])
    await audit(p, 'sharing:link-changed', link_id)
    return {'message': 'Sharing permissions updated.'}


async def end_link(p: dict, link: dict, status: str, reason: str):
    await db.school_links.update_one({'id': link['id'], 'org_id': p['org_id']}, {'$set': {'status': status, 'ended_at': now(), 'end_reason': reason},
                                                                                '$push': {'history': history(p, status, note=reason)}})
    await db.school_assignments.update_many({'org_id': p['org_id'], 'child_id': link['child_id'], 'school_id': link['school_id'], 'status': {'$in': ['proposed', 'active']}},
                                            {'$set': {'status': 'revoked', 'revoked_at': now(), 'reason': reason}})
    if link.get('consent_id'):
        await db.consents.update_one({'org_id': p['org_id'], 'id': link['consent_id'], 'status': 'granted'},
                                     {'$set': {'status': 'withdrawn', 'withdrawn_at': now(), 'withdrawn_by': p['id'], 'withdrawal_reason': reason}, '$inc': {'version': 1}})
    await cancel_school_alerts(p['org_id'], link['child_id'], link['school_id'])


@router.post('/sharing/school/links/{link_id}/withdraw', response_model=Payload)
async def withdraw_link(link_id: str, data: ReasonInput, p=Depends(principal)):
    link = await _guardian_link(p, link_id, ['active', 'pending'])
    await end_link(p, link, 'withdrawn', data.reason)
    await audit(p, 'sharing:link-withdrawn', link_id)
    return {'message': 'Sharing withdrawn. The school can no longer open these records. Files already downloaded cannot be recalled.'}


@router.post('/sharing/school/assignments/{assignment_id}/decision', response_model=Payload)
async def decide_assignment(assignment_id: str, data: AssignmentDecision, p=Depends(principal)):
    await authorize(p, 'sharing:manage')
    a = await db.school_assignments.find_one({'org_id': p['org_id'], 'id': assignment_id, 'status': 'proposed'}, {'_id': 0})
    if not a or not await db.children.find_one({'org_id': p['org_id'], 'id': a['child_id'], 'guardian_ids': p['id']}, {'_id': 0, 'id': 1}):
        raise HTTPException(404, 'Request not found.')
    if data.approve and not await db.school_links.find_one({'org_id': p['org_id'], 'child_id': a['child_id'], 'school_id': a['school_id'], 'status': 'active'}, {'_id': 0, 'id': 1}):
        raise HTTPException(422, 'Approve the school link first.')
    status = 'active' if data.approve else 'declined'
    await db.school_assignments.update_one({'id': assignment_id, 'org_id': p['org_id'], 'status': 'proposed'},
                                           {'$set': {'status': status, 'approved_by': p['id'], 'approved_by_name': p['display_name'], 'decided_at': now()}})
    await audit(p, f'sharing:assignment-{status}', assignment_id)
    return {'message': 'Professional access approved.' if data.approve else 'Request declined.'}


@router.post('/sharing/school/assignments/{assignment_id}/revoke', response_model=Payload)
async def revoke_assignment(assignment_id: str, data: ReasonInput, p=Depends(principal)):
    await authorize(p, 'sharing:manage')
    a = await db.school_assignments.find_one({'org_id': p['org_id'], 'id': assignment_id, 'status': 'active'}, {'_id': 0})
    if not a or not await db.children.find_one({'org_id': p['org_id'], 'id': a['child_id'], 'guardian_ids': p['id']}, {'_id': 0, 'id': 1}):
        raise HTTPException(404, 'Active access not found.')
    await db.school_assignments.update_one({'id': assignment_id, 'org_id': p['org_id']}, {'$set': {'status': 'revoked', 'revoked_at': now(), 'reason': data.reason}})
    await audit(p, 'sharing:assignment-revoked', assignment_id)
    return {'message': f"{a['user_name']} no longer has access."}
