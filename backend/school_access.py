from datetime import datetime, timezone, timedelta

from fastapi import HTTPException

from config import db, now
from security import audit, authorize

SCOPES = ['profile', 'goals', 'activities', 'documents', 'videos', 'safety', 'messages', 'download']
ALL_SCOPES = set(SCOPES) | {'observations', 'clinical_review'}
TEAM_LABEL = {'parent': 'Parent', 'staff': 'Therapist', 'admin': 'Care coordinator'}


def iso_in(days: int) -> str:
    return (datetime.now(timezone.utc) + timedelta(days=days)).isoformat()


async def retain_until(org_id: str) -> str:
    settings = await db.settings.find_one({'org_id': org_id}, {'_id': 0, 'school_retention_days': 1}) or {}
    return iso_in(settings.get('school_retention_days', 2555))


def history(p: dict, action: str, **extra) -> dict:
    return {'at': now(), 'by': p['id'], 'by_name': p.get('display_name', ''), 'action': action, **extra}


async def active_link(org_id: str, child_id: str, school_id: str) -> dict | None:
    return await db.school_links.find_one({'org_id': org_id, 'child_id': child_id, 'school_id': school_id, 'status': 'active',
                                           'expires_at': {'$gt': now()}}, {'_id': 0})


async def school_children(p: dict) -> list[dict]:
    """Children a school user may open: active guardian link + active personal assignment."""
    school = await db.schools.find_one({'org_id': p['org_id'], 'id': p.get('school_id'), 'status': 'active'}, {'_id': 0, 'id': 1})
    if not school:
        return []
    assignments = await db.school_assignments.find({'org_id': p['org_id'], 'school_id': school['id'], 'user_id': p['id'], 'status': 'active'}, {'_id': 0}).to_list(500)
    result = []
    for assignment in assignments:
        link = await active_link(p['org_id'], assignment['child_id'], school['id'])
        if link:
            result.append({'assignment': assignment, 'link': link})
    return result


async def child_access(p: dict, child_id: str) -> dict:
    """Resolve who is asking about a child and which sharing scopes apply. Unauthorized children look missing."""
    child = await db.children.find_one({'org_id': p['org_id'], 'id': child_id}, {'_id': 0})
    ctx = None
    if child and p['role'] == 'parent' and p['id'] in child.get('guardian_ids', []):
        ctx = {'label': 'Parent', 'kind': 'parent', 'scopes': ALL_SCOPES - {'clinical_review'}}
    elif child and p['role'] == 'staff' and p['id'] in child.get('staff_ids', []):
        ctx = {'label': 'Therapist', 'kind': 'therapist', 'scopes': ALL_SCOPES}
    elif child and p['role'] == 'admin':
        ctx = {'label': 'Care coordinator', 'kind': 'coordinator', 'scopes': ALL_SCOPES}
    elif child and p['role'] == 'school':
        for item in await school_children(p):
            if item['link']['child_id'] == child_id:
                label = 'School coordinator' if p.get('school_role') == 'coordinator' else 'Teacher / special educator'
                ctx = {'label': label, 'kind': 'school', 'scopes': set(item['link'].get('scopes', [])) | {'observations'},
                       'link': item['link'], 'assignment': item['assignment'], 'school_id': p['school_id']}
    if not ctx:
        await audit(p, 'team:read', child_id, 'not_visible')
        raise HTTPException(404, 'Record not found.')
    await audit(p, 'team:read', child_id)
    return {**ctx, 'child': child}


async def require_scope(p: dict, ctx: dict, scope: str):
    if scope not in ctx['scopes']:
        await audit(p, f'team:{scope}', ctx['child']['id'], 'forbidden')
        raise HTTPException(403, 'This information has not been shared with you by the family.')


async def require_clinical(p: dict, ctx: dict):
    if ctx['kind'] not in {'therapist', 'coordinator'}:
        await audit(p, 'team:clinical', ctx['child']['id'], 'forbidden')
        raise HTTPException(403, 'Only the responsible clinician or care coordinator can do this.')


async def team_members(org_id: str, child: dict) -> list[dict]:
    """Everyone currently authorized on the child's team (no contact details)."""
    ids = list(child.get('guardian_ids', [])) + list(child.get('staff_ids', []))
    users = await db.users.find({'org_id': org_id, 'id': {'$in': ids}, 'active': True}, {'_id': 0, 'id': 1, 'display_name': 1, 'role': 1}).to_list(100)
    members = [{'id': u['id'], 'name': u['display_name'], 'label': TEAM_LABEL.get(u['role'], u['role'])} for u in users]
    links = await db.school_links.find({'org_id': org_id, 'child_id': child['id'], 'status': 'active', 'expires_at': {'$gt': now()}}, {'_id': 0}).to_list(20)
    for link in links:
        if 'messages' not in link.get('scopes', []):
            continue
        assignments = await db.school_assignments.find({'org_id': org_id, 'child_id': child['id'], 'school_id': link['school_id'], 'status': 'active'}, {'_id': 0}).to_list(50)
        for a in assignments:
            user = await db.users.find_one({'org_id': org_id, 'id': a['user_id'], 'active': True}, {'_id': 0, 'id': 1})
            if user:
                members.append({'id': a['user_id'], 'name': a['user_name'], 'label': f"{link['school_name']} · {'Coordinator' if a.get('school_role') == 'coordinator' else 'Teacher'}"})
    return members


async def cancel_school_alerts(org_id: str, child_id: str, school_id: str):
    await db.notification_jobs.update_many({'org_id': org_id, 'status': 'pending', 'meta.child_id': child_id, 'meta.school_id': school_id},
                                           {'$set': {'status': 'cancelled', 'updated_at': now(), 'last_error': 'Sharing withdrawn'}})


async def school_principal(p: dict, coordinator: bool = False):
    await authorize(p, 'school:read')
    if p['role'] != 'school':
        raise HTTPException(403, 'This workspace is for school accounts.')
    if coordinator and p.get('school_role') != 'coordinator':
        await audit(p, 'school:coordinate', p.get('school_id'), 'forbidden')
        raise HTTPException(403, 'Only the school coordinator can do this.')
