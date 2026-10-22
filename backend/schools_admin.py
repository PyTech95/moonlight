from fastapi import APIRouter, Depends, HTTPException
from pydantic import EmailStr, Field

from config import Input, Payload, db, now, uid
from school_access import history
from school_portal import school_invitation
from security import audit, authorize, principal
from sharing import end_link

router = APIRouter()
SCHOOL_COLLECTIONS = ['classroom_observations', 'school_activity_responses', 'goal_contributions']


class SchoolInput(Input):
    name: str = Field(min_length=3, max_length=160)
    address: str = Field(min_length=3, max_length=300)
    coordinator_name: str = Field(min_length=2, max_length=100)
    coordinator_email: EmailStr
    coordinator_phone: str = Field(default='', max_length=30)


class VerifyInput(Input):
    note: str = Field(min_length=3, max_length=300)


class LinkRequest(Input):
    child_id: str = Field(min_length=1, max_length=100)
    school_id: str = Field(min_length=1, max_length=100)
    purpose: str = Field(min_length=5, max_length=500)


class ReasonInput(Input):
    reason: str = Field(min_length=3, max_length=300)


class TransferInput(Input):
    to_school_id: str = Field(min_length=1, max_length=100)
    reason: str = Field(min_length=3, max_length=300)
    purpose: str = Field(min_length=5, max_length=500)


class RetentionInput(Input):
    days: int = Field(ge=30, le=3650)


async def _school(p, school_id, verified=False):
    q = {'org_id': p['org_id'], 'id': school_id, 'status': 'active'} | ({'verified': True} if verified else {})
    school = await db.schools.find_one(q, {'_id': 0})
    if not school:
        raise HTTPException(404 if not verified else 422, 'Choose an active, verified school.' if verified else 'School not found.')
    return school


async def _create_link(p, child, school, purpose):
    if await db.school_links.find_one({'org_id': p['org_id'], 'child_id': child['id'], 'school_id': school['id'], 'status': {'$in': ['pending', 'active']}}, {'_id': 0, 'id': 1}):
        raise HTTPException(409, 'A pending or active link already exists for this school.')
    record = {'id': uid(), 'org_id': p['org_id'], 'child_id': child['id'], 'child_name': child['name'], 'school_id': school['id'], 'school_name': school['name'],
              'status': 'pending', 'purpose': purpose, 'scopes': [], 'approved_video_ids': [], 'expires_at': '', 'requested_by': p['id'],
              'requested_at': now(), 'history': [history(p, 'requested', note=purpose)], 'version': 1}
    await db.school_links.insert_one(record.copy())
    return record


@router.get('/admin/schools', response_model=Payload)
async def directory(p=Depends(principal)):
    await authorize(p, 'schools:manage')
    org = {'org_id': p['org_id']}
    data = {'schools': await db.schools.find(org, {'_id': 0}).sort('name', 1).to_list(300),
            'links': await db.school_links.find(org, {'_id': 0}).sort('requested_at', -1).to_list(500),
            'assignments': await db.school_assignments.find(org, {'_id': 0}).sort('created_at', -1).to_list(500),
            'members': await db.users.find({**org, 'role': 'school'}, {'_id': 0, 'id': 1, 'display_name': 1, 'email': 1, 'school_id': 1, 'school_role': 1, 'active': 1}).to_list(500),
            'invitations': await db.invitations.find({**org, 'role': 'school'}, {'_id': 0, 'token_hash': 0}).sort('created_at', -1).to_list(100),
            'children': await db.children.find(org, {'_id': 0, 'id': 1, 'name': 1}).to_list(500),
            'retention_days': ((await db.settings.find_one(org, {'_id': 0, 'school_retention_days': 1})) or {}).get('school_retention_days', 2555)}
    await audit(p, 'schools:read', 'directory')
    return data


@router.post('/admin/schools', response_model=Payload, status_code=201)
async def add_school(data: SchoolInput, p=Depends(principal)):
    await authorize(p, 'schools:manage')
    record = {'id': uid(), 'org_id': p['org_id'], 'name': data.name, 'address': data.address, 'status': 'active', 'verified': False,
              'coordinator': {'name': data.coordinator_name, 'email': str(data.coordinator_email).lower(), 'phone': data.coordinator_phone},
              'created_at': now(), 'created_by': p['id']}
    await db.schools.insert_one(record.copy())
    await audit(p, 'schools:create', record['id'])
    return record


@router.post('/admin/schools/{school_id}/verify', response_model=Payload)
async def verify_school(school_id: str, data: VerifyInput, p=Depends(principal)):
    await authorize(p, 'schools:manage')
    await _school(p, school_id)
    await db.schools.update_one({'org_id': p['org_id'], 'id': school_id}, {'$set': {'verified': True, 'verified_at': now(), 'verified_by_name': p['display_name'], 'verification_note': data.note}})
    await audit(p, 'schools:verify', school_id)
    return {'message': 'School and coordinator contact verified.'}


@router.post('/admin/schools/{school_id}/suspend', response_model=Payload)
async def suspend_school(school_id: str, data: ReasonInput, p=Depends(principal)):
    await authorize(p, 'schools:manage')
    await _school(p, school_id)
    await db.schools.update_one({'org_id': p['org_id'], 'id': school_id}, {'$set': {'status': 'suspended', 'suspended_at': now(), 'suspension_reason': data.reason}})
    await db.notification_jobs.update_many({'org_id': p['org_id'], 'status': 'pending', 'meta.school_id': school_id}, {'$set': {'status': 'cancelled', 'updated_at': now()}})
    await audit(p, 'schools:suspend', school_id)
    return {'message': 'School access suspended immediately for all school accounts.'}


@router.post('/admin/schools/{school_id}/invite-coordinator', response_model=Payload, status_code=201)
async def invite_coordinator(school_id: str, p=Depends(principal)):
    await authorize(p, 'schools:manage')
    school = await _school(p, school_id, verified=True)
    return await school_invitation(p, school, school['coordinator']['email'], school['coordinator']['name'], 'coordinator')


@router.post('/admin/school-links', response_model=Payload, status_code=201)
async def request_link(data: LinkRequest, p=Depends(principal)):
    await authorize(p, 'schools:manage')
    child = await db.children.find_one({'org_id': p['org_id'], 'id': data.child_id}, {'_id': 0})
    if not child or not child.get('guardian_ids'):
        raise HTTPException(422, 'Choose a child with a verified guardian.')
    school = await _school(p, data.school_id, verified=True)
    record = await _create_link(p, child, school, data.purpose)
    await audit(p, 'schools:link-request', record['id'])
    return {k: v for k, v in record.items() if k != '_id'}


@router.post('/admin/school-links/{link_id}/end', response_model=Payload)
async def admin_end_link(link_id: str, data: ReasonInput, p=Depends(principal)):
    await authorize(p, 'schools:manage')
    link = await db.school_links.find_one({'org_id': p['org_id'], 'id': link_id, 'status': {'$in': ['active', 'pending']}}, {'_id': 0})
    if not link:
        raise HTTPException(404, 'Active link not found.')
    await end_link(p, link, 'ended', data.reason)
    await audit(p, 'schools:link-end', link_id)
    return {'message': 'School access ended. Care history is kept.'}


@router.post('/admin/children/{child_id}/transfer', response_model=Payload)
async def transfer(child_id: str, data: TransferInput, p=Depends(principal)):
    await authorize(p, 'schools:manage')
    child = await db.children.find_one({'org_id': p['org_id'], 'id': child_id}, {'_id': 0})
    if not child:
        raise HTTPException(404, 'Record not found.')
    school = await _school(p, data.to_school_id, verified=True)
    old = await db.school_links.find({'org_id': p['org_id'], 'child_id': child_id, 'status': {'$in': ['active', 'pending']}, 'school_id': {'$ne': school['id']}}, {'_id': 0}).to_list(20)
    for link in old:
        await end_link(p, link, 'ended', f'School transfer: {data.reason}')
    record = await _create_link(p, child, school, data.purpose)
    await audit(p, 'schools:transfer', child_id)
    return {'message': f'Previous school access ended ({len(old)}). {school["name"]} needs guardian approval before anything is shared.', 'link_id': record['id']}


@router.post('/admin/school-assignments/{assignment_id}/revoke', response_model=Payload)
async def revoke_assignment(assignment_id: str, data: ReasonInput, p=Depends(principal)):
    await authorize(p, 'schools:manage')
    result = await db.school_assignments.update_one({'org_id': p['org_id'], 'id': assignment_id, 'status': {'$in': ['proposed', 'active']}},
                                                    {'$set': {'status': 'revoked', 'revoked_at': now(), 'reason': data.reason, 'revoked_by_name': p['display_name']}})
    if not result.matched_count:
        raise HTTPException(404, 'Assignment not found.')
    await audit(p, 'schools:assignment-revoke', assignment_id)
    return {'message': 'Access revoked immediately.'}


@router.post('/admin/school-retention', response_model=Payload)
async def set_retention(data: RetentionInput, p=Depends(principal)):
    await authorize(p, 'schools:manage')
    await db.settings.update_one({'org_id': p['org_id']}, {'$set': {'school_retention_days': data.days}})
    await audit(p, 'schools:retention-policy', str(data.days))
    return {'message': f'School-created records will be kept for {data.days} days.'}


@router.post('/admin/school-retention/run', response_model=Payload)
async def run_retention(p=Depends(principal)):
    await authorize(p, 'schools:manage')
    removed = 0
    for name in SCHOOL_COLLECTIONS:
        result = await db[name].delete_many({'org_id': p['org_id'], 'retain_until': {'$lt': now()}})
        removed += result.deleted_count
    await audit(p, 'schools:retention-run', str(removed))
    return {'message': f'Retention applied. {removed} expired school record(s) deleted.', 'removed': removed}
