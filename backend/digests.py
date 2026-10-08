from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends

from config import Payload, db, now, uid
from school_access import child_access
from security import audit, authorize, principal

router = APIRouter()
IST = timezone(timedelta(hours=5, minutes=30))


def _week():
    end = datetime.now(IST)
    return (end - timedelta(days=7)).astimezone(timezone.utc).isoformat(), end.astimezone(timezone.utc).isoformat(), end.date().isoformat()


async def build_digest(org_id: str, child: dict, start: str, end: str) -> dict:
    q = {'org_id': org_id, 'child_id': child['id'], 'created_at': {'$gte': start, '$lt': end}}
    observations = await db.classroom_observations.find(q, {'_id': 0}).sort('observed_on', 1).to_list(200)
    responses = await db.school_activity_responses.find(q, {'_id': 0}).to_list(500)
    contributions = await db.goal_contributions.find({**q, 'author_kind': 'school'}, {'_id': 0}).to_list(200)
    guidance = await db.team_tasks.find({'org_id': org_id, 'child_id': child['id'], 'kind': 'guidance', 'done_at': {'$gte': start, '$lt': end}}, {'_id': 0}).to_list(100)
    meetings = await db.team_meetings.find({'org_id': org_id, 'child_id': child['id'], 'status': {'$in': ['requested', 'scheduled']}}, {'_id': 0, 'title': 1, 'status': 1, 'scheduled_for': 1, 'proposed_for': 1}).to_list(20)
    activities = {a['id']: a['title'] for a in await db.school_activities.find({'org_id': org_id, 'child_id': child['id']}, {'_id': 0, 'id': 1, 'title': 1}).to_list(200)}
    goals = {g['id']: g['title'] for g in await db.support_goals.find({'org_id': org_id, 'child_id': child['id']}, {'_id': 0, 'id': 1, 'title': 1}).to_list(200)}
    counts = {}
    for r in responses:
        counts.setdefault(r['activity_id'], {'title': activities.get(r['activity_id'], 'School activity'), 'Attempted': 0, 'Partly attempted': 0, 'Not attempted': 0, 'feedback': []})
        counts[r['activity_id']][r['status']] += 1
        if r.get('feedback'):
            counts[r['activity_id']]['feedback'].append(r['feedback'])
    return {
        'observations': [{'observed_on': o['observed_on'], 'school_name': o['school_name'], 'author': f"{o['author_name']} · {o['author_label']}",
                          'goal': goals.get(o.get('goal_id'), ''), 'what_helped': o.get('what_helped', ''), 'participation': o.get('participation', ''),
                          'communication': o.get('communication', ''), 'what_was_difficult': o.get('what_was_difficult', '')} for o in observations],
        'activities': list(counts.values()),
        'school_contributions': [{'goal': goals.get(c['goal_id'], ''), 'kind': c['kind'], 'body': c['body'], 'author': c['author_name']} for c in contributions],
        'guidance_answered': [{'title': t['title'], 'response': t.get('response', '')} for t in guidance],
        'upcoming_meetings': meetings,
        'totals': {'observations': len(observations), 'activity_feedback': len(responses), 'contributions': len(contributions)},
    }


async def generate_for_org(org_id: str) -> int:
    start, end, week_label = _week()
    child_ids = await db.school_links.distinct('child_id', {'org_id': org_id, 'status': {'$in': ['active', 'withdrawn', 'ended']}})
    created = 0
    for child in await db.children.find({'org_id': org_id, 'id': {'$in': child_ids}}, {'_id': 0}).to_list(1000):
        content = await build_digest(org_id, child, start, end)
        result = await db.school_digests.update_one({'org_id': org_id, 'child_id': child['id'], 'week_ending': week_label}, {'$setOnInsert': {
            'id': uid(), 'org_id': org_id, 'child_id': child['id'], 'child_name': child['name'], 'week_ending': week_label, 'period_start': start, 'period_end': end,
            **content, 'generated_at': now(), 'read_by': []}}, upsert=True)
        created += 1 if result.upserted_id else 0
    return created


async def generate_all_digests():
    for org_id in await db.school_links.distinct('org_id'):
        await generate_for_org(org_id)


@router.get('/team/children/{child_id}/digests', response_model=Payload)
async def list_digests(child_id: str, p=Depends(principal)):
    await authorize(p, 'team:read')
    ctx = await child_access(p, child_id)
    if ctx['kind'] == 'school':
        from fastapi import HTTPException
        raise HTTPException(403, 'Weekly digests are for the family and care team.')
    items = await db.school_digests.find({'org_id': p['org_id'], 'child_id': child_id}, {'_id': 0}).sort('week_ending', -1).to_list(26)
    for item in items:
        item['unread'] = p['id'] not in item.pop('read_by', [])
    start, end, _ = _week()
    preview = await build_digest(p['org_id'], ctx['child'], start, end)
    await db.school_digests.update_many({'org_id': p['org_id'], 'child_id': child_id}, {'$addToSet': {'read_by': p['id']}})
    return {'items': items, 'preview': preview, 'schedule': 'A new digest is prepared every Saturday at 9:00 am IST and shown here in the portal.'}


@router.post('/admin/school-digests/run', response_model=Payload)
async def run_now(p=Depends(principal)):
    await authorize(p, 'schools:manage')
    created = await generate_for_org(p['org_id'])
    await audit(p, 'schools:digest-run', str(created))
    return {'message': f'Weekly digests prepared ({created} new).', 'created': created}
