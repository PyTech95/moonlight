import secrets
from datetime import datetime, timezone, timedelta

from fastapi import APIRouter, Depends, HTTPException
from pydantic import EmailStr, Field

from config import APP_MODE, WEB_ORIGIN, Input, Payload, db, now, uid
from jobs import enqueue_email
from school_access import active_link, school_children, school_principal
from security import audit, digest, principal

router = APIRouter()


class StaffInvite(Input):
    email: EmailStr
    display_name: str = Field(min_length=2, max_length=100)


class AssignmentInput(Input):
    child_id: str = Field(min_length=1, max_length=100)
    user_id: str = Field(min_length=1, max_length=100)
    class_group: str = Field(min_length=1, max_length=80)


async def school_invitation(p: dict, school: dict, email: str, display_name: str, school_role: str) -> dict:
    email = email.lower()
    if await db.users.find_one({'org_id': p['org_id'], 'email': email, 'active': True}, {'_id': 0, 'id': 1}):
        raise HTTPException(409, 'An active account already uses this email.')
    await db.invitations.update_many({'org_id': p['org_id'], 'email': email, 'used_at': {'$exists': False}}, {'$set': {'cancelled_at': now()}})
    raw = secrets.token_urlsafe(40)
    profile = 'school_coordinator' if school_role == 'coordinator' else 'school_teacher'
    record = {'id': uid(), 'org_id': p['org_id'], 'email': email, 'display_name': display_name, 'role': 'school', 'access_profile': profile,
              'school_id': school['id'], 'school_name': school['name'], 'school_role': school_role, 'child_ids': [],
              'token_hash': digest(raw), 'created_by': p['id'], 'created_at': now(), 'expires_at': datetime.now(timezone.utc) + timedelta(hours=72)}
    await db.invitations.insert_one(record.copy())
    job = await enqueue_email(p['org_id'], email, 'Your Moonlight school portal invitation',
                              f'You have been invited to the Moonlight Neurocare school portal for {school["name"]}.\n\nUse this single-use link within 72 hours:\n{WEB_ORIGIN}/accept-invite?token={raw}\n\nAccess to any child’s records needs separate family approval.',
                              f'invitation:{record["id"]}')
    await audit(p, f'school:invite-{school_role}', record['id'])
    result = {k: record[k] for k in ['id', 'email', 'display_name', 'school_role', 'school_name', 'created_at']} | {'delivery_status': job['status']}
    if APP_MODE == 'demo':
        result['demo_invitation_token'] = raw
    return result


@router.get('/school/workspace', response_model=Payload)
async def workspace(p=Depends(principal)):
    await school_principal(p)
    org = p['org_id']
    school = await db.schools.find_one({'org_id': org, 'id': p.get('school_id')}, {'_id': 0})
    items = await school_children(p)
    children, ids = [], []
    for item in items:
        child = await db.children.find_one({'org_id': org, 'id': item['link']['child_id']}, {'_id': 0, 'id': 1, 'name': 1, 'initials': 1, 'age_label': 1})
        children.append({**child, 'class_group': item['assignment'].get('class_group', ''), 'scopes': item['link']['scopes'], 'access_expires_at': item['link']['expires_at']})
        ids.append(child['id'])
    scoped = {item['link']['child_id']: set(item['link']['scopes']) for item in items}
    goal_ids = [c for c in ids if 'goals' in scoped[c]]
    act_ids = [c for c in ids if 'activities' in scoped[c]]
    msg_ids = [c for c in ids if 'messages' in scoped[c]]
    goals = await db.support_goals.find({'org_id': org, 'child_id': {'$in': goal_ids}, 'status': 'published', 'school_visible': True}, {'_id': 0, 'versions': 0}).to_list(300)
    activities = await db.school_activities.find({'org_id': org, 'child_id': {'$in': act_ids}, 'status': 'published'}, {'_id': 0}).to_list(300)
    responded = {r['activity_id'] for r in await db.school_activity_responses.find({'org_id': org, 'author_id': p['id'], 'created_at': {'$gt': (datetime.now(timezone.utc) - timedelta(days=7)).isoformat()}}, {'_id': 0, 'activity_id': 1}).to_list(1000)}
    meetings = await db.team_meetings.find({'org_id': org, 'child_id': {'$in': msg_ids}, 'status': {'$in': ['requested', 'scheduled']}}, {'_id': 0}).sort('proposed_for', 1).to_list(100)
    unread = await db.team_messages.count_documents({'org_id': org, 'child_id': {'$in': msg_ids}, 'recipients.id': p['id'], 'read_by': {'$ne': p['id']}})
    guidance = await db.team_tasks.find({'org_id': org, 'child_id': {'$in': ids}, 'created_by': p['id']}, {'_id': 0}).sort('created_at', -1).to_list(50)
    names = {c['id']: c['name'] for c in children}
    data = {'school': school, 'children': children, 'goals': goals, 'meetings': meetings, 'unread_messages': unread, 'guidance': guidance,
            'activities': [{**a, 'needs_feedback': a['id'] not in responded, 'child_name': names.get(a['child_id'], '')} for a in activities],
            'reviews': sorted([{'goal_id': g['id'], 'title': g['title'], 'child_name': names.get(g['child_id'], ''), 'review_date': g['review_date']} for g in goals], key=lambda x: x['review_date']),
            'appointments': [], 'practice_unread': 0, 'enquiries': []}
    for m in meetings:
        m['child_name'] = names.get(m['child_id'], '')
    if p.get('school_role') == 'coordinator':
        links = await db.school_links.find({'org_id': org, 'school_id': p['school_id'], 'status': {'$in': ['active', 'pending']}}, {'_id': 0, 'id': 1, 'child_id': 1, 'child_name': 1, 'status': 1, 'expires_at': 1}).to_list(300)
        data['linked_children'] = [l for l in links if l['status'] == 'active' and l['expires_at'] > now()]
        data['members'] = await db.users.find({'org_id': org, 'school_id': p['school_id'], 'role': 'school'}, {'_id': 0, 'id': 1, 'display_name': 1, 'school_role': 1, 'active': 1}).to_list(200)
        data['assignments'] = await db.school_assignments.find({'org_id': org, 'school_id': p['school_id']}, {'_id': 0}).sort('created_at', -1).to_list(300)
        data['invitations'] = await db.invitations.find({'org_id': org, 'school_id': p['school_id']}, {'_id': 0, 'token_hash': 0}).sort('created_at', -1).to_list(50)
    await audit(p, 'school:workspace', p.get('school_id'))
    return data


@router.post('/school/invitations', response_model=Payload, status_code=201)
async def invite_staff(data: StaffInvite, p=Depends(principal)):
    await school_principal(p, coordinator=True)
    school = await db.schools.find_one({'org_id': p['org_id'], 'id': p['school_id'], 'status': 'active', 'verified': True}, {'_id': 0})
    if not school:
        raise HTTPException(403, 'Your school is not verified by the center.')
    return await school_invitation(p, school, str(data.email), data.display_name, 'teacher')


@router.post('/school/assignments', response_model=Payload, status_code=201)
async def propose_assignment(data: AssignmentInput, p=Depends(principal)):
    await school_principal(p, coordinator=True)
    link = await active_link(p['org_id'], data.child_id, p['school_id'])
    if not link:
        await audit(p, 'school:assignment-propose', data.child_id, 'not_visible')
        raise HTTPException(404, 'This child is not linked to your school by the family.')
    member = await db.users.find_one({'org_id': p['org_id'], 'id': data.user_id, 'school_id': p['school_id'], 'role': 'school', 'active': True}, {'_id': 0})
    if not member:
        raise HTTPException(422, 'Choose an active member of your school team.')
    if await db.school_assignments.find_one({'org_id': p['org_id'], 'child_id': data.child_id, 'user_id': data.user_id, 'status': {'$in': ['proposed', 'active']}}, {'_id': 0, 'id': 1}):
        raise HTTPException(409, 'This person already has a pending or active assignment for this child.')
    record = {'id': uid(), 'org_id': p['org_id'], 'school_id': p['school_id'], 'school_name': link['school_name'], 'child_id': data.child_id, 'child_name': link['child_name'],
              'user_id': member['id'], 'user_name': member['display_name'], 'school_role': member.get('school_role', 'teacher'), 'class_group': data.class_group,
              'status': 'proposed', 'proposed_by': p['id'], 'proposed_by_name': p['display_name'], 'created_at': now()}
    await db.school_assignments.insert_one(record.copy())
    await audit(p, 'school:assignment-propose', record['id'])
    return record


@router.post('/school/assignments/{assignment_id}/withdraw', response_model=Payload)
async def withdraw_assignment(assignment_id: str, p=Depends(principal)):
    await school_principal(p, coordinator=True)
    result = await db.school_assignments.update_one({'org_id': p['org_id'], 'id': assignment_id, 'school_id': p['school_id'], 'status': {'$in': ['proposed', 'active']}},
                                                    {'$set': {'status': 'revoked', 'revoked_at': now(), 'reason': 'Ended by school coordinator'}})
    if not result.matched_count:
        raise HTTPException(404, 'Assignment not found.')
    await audit(p, 'school:assignment-end', assignment_id)
    return {'message': 'Assignment ended. Access was removed immediately.'}
