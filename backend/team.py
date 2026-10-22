from typing import Literal

from fastapi import APIRouter, Depends, HTTPException
from pydantic import Field

from config import WEB_ORIGIN, Input, Payload, db, now, uid
from jobs import enqueue_email
from school_access import child_access, require_clinical, require_scope, retain_until, team_members
from security import audit, authorize, principal

router = APIRouter()
GOAL_FIELDS = ['title', 'description', 'strategies', 'responsible', 'review_date', 'progress_measure', 'school_visible']


class Strategies(Input):
    home: str = Field(default='', max_length=800)
    school: str = Field(default='', max_length=800)
    therapy: str = Field(default='', max_length=800)


class GoalInput(Input):
    title: str = Field(min_length=3, max_length=160)
    description: str = Field(min_length=3, max_length=1200)
    strategies: Strategies
    responsible: list[str] = Field(default_factory=list, max_length=10)
    review_date: str = Field(min_length=10, max_length=10)
    progress_measure: str = Field(min_length=3, max_length=500)
    school_visible: bool = False


class GoalUpdate(GoalInput):
    version: int = Field(ge=1)
    change_note: str = Field(min_length=3, max_length=300)


class ContributionInput(Input):
    kind: Literal['observation', 'evidence', 'proposal', 'comment']
    context: Literal['home', 'school', 'therapy']
    body: str = Field(min_length=3, max_length=2000)
    share_with_school: bool = False


class AmendInput(Input):
    body: str = Field(min_length=3, max_length=2000)


class ReviewInput(Input):
    decision: Literal['accepted', 'declined']
    note: str = Field(min_length=3, max_length=600)


class ObservationInput(Input):
    observed_on: str = Field(min_length=10, max_length=10)
    goal_id: str = Field(default='', max_length=100)
    participation: str = Field(default='', max_length=600)
    communication: str = Field(default='', max_length=600)
    transitions: str = Field(default='', max_length=600)
    accommodations: str = Field(default='', max_length=600)
    peer_interaction: str = Field(default='', max_length=600)
    support_needs: str = Field(default='', max_length=600)
    what_helped: str = Field(default='', max_length=600)
    what_was_difficult: str = Field(default='', max_length=600)
    needs_guidance: bool = False
    guidance_question: str = Field(default='', max_length=600)


class ActivityInput(Input):
    goal_id: str = Field(min_length=1, max_length=100)
    title: str = Field(min_length=3, max_length=160)
    instructions: str = Field(min_length=10, max_length=2000)
    frequency: str = Field(min_length=2, max_length=120)
    duration: str = Field(min_length=2, max_length=120)
    materials: str = Field(default='', max_length=600)
    adaptations: str = Field(default='', max_length=800)
    precautions: str = Field(default='', max_length=800)
    media_video_id: str = Field(default='', max_length=100)


class ActivityResponseInput(Input):
    status: Literal['Attempted', 'Partly attempted', 'Not attempted']
    feedback: str = Field(default='', max_length=600)


class MessageInput(Input):
    body: str = Field(min_length=1, max_length=2000)
    recipients_confirmed: bool
    attachment_ids: list[str] = Field(default_factory=list, max_length=3)


class MeetingInput(Input):
    title: str = Field(min_length=3, max_length=160)
    proposed_for: str = Field(min_length=10, max_length=40)
    agenda: str = Field(min_length=3, max_length=1500)


class ActionItem(Input):
    id: str = Field(default='', max_length=100)
    text: str = Field(min_length=2, max_length=300)
    owner: str = Field(default='', max_length=120)
    due: str = Field(default='', max_length=10)
    done: bool = False


class MeetingUpdate(Input):
    status: Literal['requested', 'scheduled', 'completed', 'cancelled']
    scheduled_for: str = Field(default='', max_length=40)
    agenda: str = Field(default='', max_length=1500)
    minutes: str = Field(default='', max_length=4000)
    actions: list[ActionItem] = Field(default_factory=list, max_length=20)
    review_date: str = Field(default='', max_length=10)
    version: int = Field(ge=1)


class TaskDone(Input):
    response: str = Field(min_length=3, max_length=1000)


class ProfileInput(Input):
    strengths: str = Field(default='', max_length=800)
    communication: str = Field(default='', max_length=800)
    sensory: str = Field(default='', max_length=800)
    regulation: str = Field(default='', max_length=800)
    helpful_strategies: str = Field(default='', max_length=800)
    allergies: str = Field(default='', max_length=400)
    safety_alerts: str = Field(default='', max_length=600)
    emergency_plan: str = Field(default='', max_length=800)
    version: int = Field(ge=1)


def author(p: dict, ctx: dict) -> dict:
    return {'author_id': p['id'], 'author_name': p.get('display_name', ''), 'author_label': ctx['label'], 'author_kind': ctx['kind'],
            'school_id': ctx.get('school_id', ''), 'created_at': now()}


def school_can_see(record: dict, ctx: dict) -> bool:
    return ctx['kind'] != 'school' or record.get('share_with_school') or record.get('school_id') == ctx.get('school_id')


async def alert_team(p: dict, ctx: dict, recipients: list[dict], kind: str, ref: str):
    child = ctx['child']
    for member in recipients:
        if member['id'] == p['id']:
            continue
        user = await db.users.find_one({'org_id': p['org_id'], 'id': member['id'], 'active': True}, {'_id': 0, 'email': 1, 'school_id': 1})
        if not user:
            continue
        body = f'There is a new {kind} in a Moonlight support team space you belong to.\n\nSign in to read it securely: {WEB_ORIGIN}/login\n\nThis inbox is not monitored for emergencies.'
        await enqueue_email(p['org_id'], user['email'], 'New Moonlight team update', body, f'{kind}:{ref}:{member["id"]}',
                            meta={'child_id': child['id'], 'school_id': user.get('school_id', '')})


async def create_task(p: dict, ctx: dict, kind: str, title: str, detail: str, source_id: str) -> dict:
    staff_ids = ctx['child'].get('staff_ids', [])
    assignee = await db.users.find_one({'org_id': p['org_id'], 'id': {'$in': staff_ids}, 'active': True}, {'_id': 0, 'id': 1, 'display_name': 1}) if staff_ids else None
    task = {'id': uid(), 'org_id': p['org_id'], 'child_id': ctx['child']['id'], 'kind': kind, 'title': title, 'detail': detail,
            'source_id': source_id, 'assigned_to': assignee['id'] if assignee else '', 'assigned_name': assignee['display_name'] if assignee else 'Care coordinator',
            'status': 'open', 'created_by': p['id'], 'created_by_name': p.get('display_name', ''), 'created_at': now(), 'school_id': ctx.get('school_id', '')}
    await db.team_tasks.insert_one(task.copy())
    return task


async def ctx_for(p, child_id, permission='team:read'):
    await authorize(p, permission)
    return await child_access(p, child_id)


@router.get('/team/children/{child_id}', response_model=Payload)
async def team_space(child_id: str, p=Depends(principal)):
    ctx = await ctx_for(p, child_id)
    child, scopes, org = ctx['child'], ctx['scopes'], p['org_id']
    q = {'org_id': org, 'child_id': child_id}
    data = {'child': {k: child.get(k) for k in ['id', 'name', 'initials', 'age_label']},
            'viewer': {'kind': ctx['kind'], 'label': ctx['label'], 'scopes': sorted(scopes)},
            'response_hours': 'The team usually replies within 2 working days (Mon–Sat, 9am–6pm IST).',
            'emergency_notice': 'Team messages are not monitored for emergencies. In an emergency call 112 or the center on +91 7982282025.'}
    if 'profile' in scopes:
        data['profile'] = child.get('support_profile', {}) | {'version': child.get('version', 1)}
    if 'safety' in scopes:
        data['safety'] = child.get('safety', {})
    goals = []
    if 'goals' in scopes:
        gq = {**q, 'status': 'published'} | ({'school_visible': True} if ctx['kind'] == 'school' else {})
        goals = await db.support_goals.find(gq, {'_id': 0}).sort('created_at', 1).to_list(100)
        contributions = await db.goal_contributions.find(q, {'_id': 0}).sort('created_at', 1).to_list(1000)
        for goal in goals:
            if ctx['kind'] == 'school':
                goal.pop('versions', None)
            goal['contributions'] = [c for c in contributions if c['goal_id'] == goal['id'] and school_can_see(c, ctx)]
    data['goals'] = goals
    if 'activities' in scopes:
        activities = await db.school_activities.find({**q, 'status': 'published'}, {'_id': 0}).sort('created_at', -1).to_list(100)
        responses = await db.school_activity_responses.find(q, {'_id': 0}).sort('created_at', -1).to_list(1000)
        approved = set(ctx.get('link', {}).get('approved_video_ids', [])) if 'videos' in scopes else set()
        for activity in activities:
            activity['responses'] = [r for r in responses if r['activity_id'] == activity['id'] and school_can_see(r, ctx)]
            if ctx['kind'] == 'school' and activity.get('media_video_id') not in approved:
                activity['media_video_id'] = ''
        data['activities'] = activities
    obs_q = q | ({'school_id': ctx['school_id']} if ctx['kind'] == 'school' else {})
    data['observations'] = await db.classroom_observations.find(obs_q, {'_id': 0}).sort('observed_on', -1).to_list(200)
    if ctx['kind'] == 'school':
        tasks = await db.team_tasks.find({**q, 'created_by': p['id']}, {'_id': 0, 'source_id': 1, 'status': 1, 'response': 1}).to_list(200)
        by_source = {t['source_id']: t for t in tasks}
        for obs in data['observations']:
            task = by_source.get(obs['id'])
            obs['guidance_status'] = task['status'] if task else ''
            obs['guidance_response'] = task.get('response', '') if task else ''
    if 'messages' in scopes:
        mq = q if ctx['kind'] == 'coordinator' else {**q, '$or': [{'author_id': p['id']}, {'recipients.id': p['id']}]}
        messages = await db.team_messages.find(mq, {'_id': 0}).sort('created_at', 1).to_list(500)
        for m in messages:
            m['unread'] = p['id'] not in m.pop('read_by', []) and m['author_id'] != p['id']
        data['messages'] = messages
        data['meetings'] = await db.team_meetings.find(q, {'_id': 0}).sort('proposed_for', 1).to_list(100)
        data['recipients'] = await team_members(org, child)
    if 'documents' in scopes:
        dq = q if ctx['kind'] != 'school' else {**q, 'share_with_school': True, 'school_access_expires_at': {'$gt': now()}}
        docs = await db.shared_documents.find(dq, {'_id': 0}).sort('created_at', -1).to_list(100)
        for doc in docs:
            for v in doc['versions']:
                v.pop('path', None)
            if ctx['kind'] == 'school':
                doc.pop('access_log', None)
            doc['can_download'] = 'download' in scopes and (ctx['kind'] != 'school' or doc.get('allow_download'))
        data['documents'] = docs
    if ctx['kind'] == 'school' and 'videos' in scopes:
        ids = ctx['link'].get('approved_video_ids', [])
        data['shared_videos'] = await db.practice_videos.find({'org_id': org, 'child_id': child_id, 'id': {'$in': ids}, 'is_deleted': {'$ne': True}, 'processing_status': 'ready'},
                                                             {'_id': 0, 'id': 1, 'title': 1, 'therapy': 1, 'steps': 1, 'session_date': 1}).to_list(50)
    if ctx['kind'] in {'therapist', 'coordinator'}:
        data['tasks'] = await db.team_tasks.find(q, {'_id': 0}).sort('created_at', -1).to_list(200)
        data['videos'] = await db.practice_videos.find({'org_id': org, 'child_id': child_id, 'is_deleted': {'$ne': True}}, {'_id': 0, 'id': 1, 'title': 1}).to_list(100)
    if ctx['kind'] != 'school':
        links = await db.school_links.find({'org_id': org, 'child_id': child_id}, {'_id': 0, 'history': 0}).sort('requested_at', -1).to_list(50)
        assignments = await db.school_assignments.find({'org_id': org, 'child_id': child_id, 'status': 'active'}, {'_id': 0}).to_list(100)
        for link in links:
            link['professionals'] = [a['user_name'] + ' · ' + a.get('class_group', '') for a in assignments if a['school_id'] == link['school_id']] if link['status'] == 'active' else []
        data['school_links'] = links
    return data


@router.patch('/team/children/{child_id}/profile', response_model=Payload)
async def update_profile(child_id: str, data: ProfileInput, p=Depends(principal)):
    ctx = await ctx_for(p, child_id, 'team:clinical')
    await require_clinical(p, ctx)
    values = data.model_dump()
    profile = {k: values[k] for k in ['strengths', 'communication', 'sensory', 'regulation', 'helpful_strategies']}
    safety = {k: values[k] for k in ['allergies', 'safety_alerts', 'emergency_plan']}
    prev = {'support_profile': ctx['child'].get('support_profile', {}), 'safety': ctx['child'].get('safety', {}), 'at': now(), 'by_name': p['display_name'], 'version': data.version}
    result = await db.children.update_one({'org_id': p['org_id'], 'id': child_id, 'version': data.version},
                                          {'$set': {'support_profile': profile, 'safety': safety}, '$inc': {'version': 1}, '$push': {'profile_history': prev}})
    if not result.matched_count:
        raise HTTPException(409, 'Someone else updated this profile. Refresh before editing.')
    await audit(p, 'team:profile-update', child_id)
    return {'message': 'Support profile updated.'}


@router.post('/team/children/{child_id}/goals', response_model=Payload, status_code=201)
async def create_goal(child_id: str, data: GoalInput, p=Depends(principal)):
    ctx = await ctx_for(p, child_id, 'team:clinical')
    await require_clinical(p, ctx)
    goal = {'id': uid(), 'org_id': p['org_id'], 'child_id': child_id, **data.model_dump(), 'status': 'published', 'version': 1, 'published_version': 1,
            'created_by': p['id'], 'created_by_name': p['display_name'], 'created_at': now(), 'updated_at': now(),
            'versions': [{'version': 1, 'by_name': p['display_name'], 'by_label': ctx['label'], 'at': now(), 'change_note': 'First published version',
                          'snapshot': data.model_dump()}]}
    await db.support_goals.insert_one(goal.copy())
    await audit(p, 'team:goal-create', goal['id'])
    return goal


@router.patch('/team/children/{child_id}/goals/{goal_id}', response_model=Payload)
async def update_goal(child_id: str, goal_id: str, data: GoalUpdate, p=Depends(principal)):
    ctx = await ctx_for(p, child_id, 'team:clinical')
    await require_clinical(p, ctx)
    values = data.model_dump(exclude={'version', 'change_note'})
    entry = {'version': data.version + 1, 'by_name': p['display_name'], 'by_label': ctx['label'], 'at': now(), 'change_note': data.change_note, 'snapshot': values}
    result = await db.support_goals.update_one({'org_id': p['org_id'], 'child_id': child_id, 'id': goal_id, 'version': data.version},
                                               {'$set': {**values, 'updated_at': now(), 'published_version': data.version + 1}, '$inc': {'version': 1}, '$push': {'versions': entry}})
    if not result.matched_count:
        raise HTTPException(409, 'This goal changed since you opened it. Refresh to see the latest version first.')
    await audit(p, 'team:goal-amend', goal_id)
    return {'message': 'A new version of the goal was published. Earlier versions remain in the history.'}


@router.post('/team/children/{child_id}/goals/{goal_id}/contributions', response_model=Payload, status_code=201)
async def contribute(child_id: str, goal_id: str, data: ContributionInput, p=Depends(principal)):
    ctx = await ctx_for(p, child_id, 'team:contribute')
    await require_scope(p, ctx, 'goals')
    gq = {'org_id': p['org_id'], 'child_id': child_id, 'id': goal_id, 'status': 'published'} | ({'school_visible': True} if ctx['kind'] == 'school' else {})
    goal = await db.support_goals.find_one(gq, {'_id': 0, 'id': 1, 'title': 1})
    if not goal:
        raise HTTPException(404, 'Goal not found.')
    record = {'id': uid(), 'org_id': p['org_id'], 'child_id': child_id, 'goal_id': goal_id, **data.model_dump(), **author(p, ctx), 'amendments': []}
    if ctx['kind'] == 'school':
        record['share_with_school'] = True
        record['retain_until'] = await retain_until(p['org_id'])
    if data.kind == 'proposal' and ctx['kind'] not in {'therapist', 'coordinator'}:
        record['status'] = 'pending_review'
        task = await create_task(p, ctx, 'proposal_review', f'Review proposed change · {goal["title"]}', data.body, record['id'])
        record['task_id'] = task['id']
    await db.goal_contributions.insert_one(record.copy())
    await audit(p, f'team:contribution-{data.kind}', record['id'])
    return record


@router.post('/team/contributions/{contribution_id}/amend', response_model=Payload)
async def amend_contribution(contribution_id: str, data: AmendInput, p=Depends(principal)):
    await authorize(p, 'team:contribute')
    record = await db.goal_contributions.find_one({'org_id': p['org_id'], 'id': contribution_id}, {'_id': 0})
    if not record:
        raise HTTPException(404, 'Record not found.')
    await child_access(p, record['child_id'])
    if record['author_id'] != p['id']:
        await audit(p, 'team:contribution-amend', contribution_id, 'forbidden')
        raise HTTPException(403, 'Only the author can amend their own contribution.')
    await db.goal_contributions.update_one({'id': contribution_id, 'org_id': p['org_id']}, {'$push': {'amendments': {'body': data.body, 'at': now()}}})
    await audit(p, 'team:contribution-amend', contribution_id)
    return {'message': 'Amendment added. The original remains visible.'}


@router.post('/team/contributions/{contribution_id}/review', response_model=Payload)
async def review_contribution(contribution_id: str, data: ReviewInput, p=Depends(principal)):
    await authorize(p, 'team:clinical')
    record = await db.goal_contributions.find_one({'org_id': p['org_id'], 'id': contribution_id, 'status': 'pending_review'}, {'_id': 0})
    if not record:
        raise HTTPException(404, 'Pending proposal not found.')
    ctx = await child_access(p, record['child_id'])
    await require_clinical(p, ctx)
    review = {'by_name': p['display_name'], 'by_label': ctx['label'], 'at': now(), 'note': data.note}
    await db.goal_contributions.update_one({'id': contribution_id, 'org_id': p['org_id']}, {'$set': {'status': data.decision, 'review': review}})
    if record.get('task_id'):
        await db.team_tasks.update_one({'id': record['task_id'], 'org_id': p['org_id']}, {'$set': {'status': 'done', 'done_at': now(), 'response': data.note}})
    await audit(p, f'team:proposal-{data.decision}', contribution_id)
    return {'message': 'Review recorded. Edit the goal to publish any accepted change.'}


@router.post('/team/children/{child_id}/observations', response_model=Payload, status_code=201)
async def add_observation(child_id: str, data: ObservationInput, p=Depends(principal)):
    ctx = await ctx_for(p, child_id, 'school:observe')
    if ctx['kind'] != 'school':
        raise HTTPException(403, 'Classroom observations are recorded by assigned school staff.')
    values = data.model_dump()
    if not any(values[k] for k in ['participation', 'communication', 'transitions', 'accommodations', 'peer_interaction', 'support_needs', 'what_helped', 'what_was_difficult']):
        raise HTTPException(422, 'Add at least one observation.')
    if data.needs_guidance and not data.guidance_question:
        raise HTTPException(422, 'Tell the therapist what guidance you need.')
    school = await db.schools.find_one({'org_id': p['org_id'], 'id': ctx['school_id']}, {'_id': 0, 'name': 1})
    record = {'id': uid(), 'org_id': p['org_id'], 'child_id': child_id, **values, **author(p, ctx), 'school_name': school['name'],
              'amendments': [], 'retain_until': await retain_until(p['org_id'])}
    if data.needs_guidance:
        task = await create_task(p, ctx, 'guidance', f'Therapist guidance requested · {ctx["child"]["name"]}', data.guidance_question, record['id'])
        record['task_id'] = task['id']
    await db.classroom_observations.insert_one(record.copy())
    await audit(p, 'school:observation', record['id'])
    return record


@router.post('/team/observations/{observation_id}/amend', response_model=Payload)
async def amend_observation(observation_id: str, data: AmendInput, p=Depends(principal)):
    await authorize(p, 'school:observe')
    record = await db.classroom_observations.find_one({'org_id': p['org_id'], 'id': observation_id, 'author_id': p['id']}, {'_id': 0})
    if not record:
        raise HTTPException(404, 'Record not found.')
    await child_access(p, record['child_id'])
    await db.classroom_observations.update_one({'id': observation_id, 'org_id': p['org_id']}, {'$push': {'amendments': {'body': data.body, 'at': now()}}})
    await audit(p, 'school:observation-amend', observation_id)
    return {'message': 'Amendment added.'}


@router.post('/team/tasks/{task_id}/complete', response_model=Payload)
async def complete_task(task_id: str, data: TaskDone, p=Depends(principal)):
    await authorize(p, 'team:clinical')
    task = await db.team_tasks.find_one({'org_id': p['org_id'], 'id': task_id, 'status': 'open'}, {'_id': 0})
    if not task:
        raise HTTPException(404, 'Open task not found.')
    ctx = await child_access(p, task['child_id'])
    await require_clinical(p, ctx)
    await db.team_tasks.update_one({'id': task_id, 'org_id': p['org_id']}, {'$set': {'status': 'done', 'done_at': now(), 'response': data.response, 'done_by_name': p['display_name']}})
    await audit(p, 'team:task-complete', task_id)
    return {'message': 'Guidance shared with the requester.'}


@router.post('/team/children/{child_id}/activities', response_model=Payload, status_code=201)
async def publish_activity(child_id: str, data: ActivityInput, p=Depends(principal)):
    ctx = await ctx_for(p, child_id, 'team:clinical')
    await require_clinical(p, ctx)
    if not await db.support_goals.find_one({'org_id': p['org_id'], 'child_id': child_id, 'id': data.goal_id}, {'_id': 0, 'id': 1}):
        raise HTTPException(422, 'Connect the activity to one of the child’s shared goals.')
    if data.media_video_id and not await db.practice_videos.find_one({'org_id': p['org_id'], 'child_id': child_id, 'id': data.media_video_id, 'is_deleted': {'$ne': True}}, {'_id': 0, 'id': 1}):
        raise HTTPException(422, 'Choose a demonstration video recorded for this child.')
    record = {'id': uid(), 'org_id': p['org_id'], 'child_id': child_id, **data.model_dump(), 'status': 'published',
              'precautions_reviewed_by': p['display_name'] if data.precautions else '', 'author_name': p['display_name'], 'author_label': ctx['label'],
              'created_at': now(), 'version': 1}
    await db.school_activities.insert_one(record.copy())
    await audit(p, 'team:school-activity', record['id'])
    return record


@router.post('/team/activities/{activity_id}/responses', response_model=Payload, status_code=201)
async def respond_activity(activity_id: str, data: ActivityResponseInput, p=Depends(principal)):
    await authorize(p, 'school:respond')
    activity = await db.school_activities.find_one({'org_id': p['org_id'], 'id': activity_id, 'status': 'published'}, {'_id': 0})
    if not activity:
        raise HTTPException(404, 'Record not found.')
    ctx = await child_access(p, activity['child_id'])
    await require_scope(p, ctx, 'activities')
    if ctx['kind'] != 'school':
        raise HTTPException(403, 'School activity responses are recorded by school staff.')
    record = {'id': uid(), 'org_id': p['org_id'], 'child_id': activity['child_id'], 'activity_id': activity_id, 'goal_id': activity['goal_id'],
              **data.model_dump(), **author(p, ctx), 'retain_until': await retain_until(p['org_id'])}
    await db.school_activity_responses.insert_one(record.copy())
    await audit(p, 'school:activity-response', record['id'])
    return record


@router.post('/team/children/{child_id}/messages', response_model=Payload, status_code=201)
async def send_message(child_id: str, data: MessageInput, p=Depends(principal)):
    ctx = await ctx_for(p, child_id, 'team:message')
    await require_scope(p, ctx, 'messages')
    if not data.recipients_confirmed:
        raise HTTPException(422, 'Review and confirm the recipients before sending.')
    recipients = await team_members(p['org_id'], ctx['child'])
    message_id = uid()
    from attachments import claim_attachments
    files = await claim_attachments(p, child_id, data.attachment_ids, message_id)
    record = {'id': message_id, 'org_id': p['org_id'], 'child_id': child_id, 'body': data.body, **author(p, ctx), 'recipients': recipients, 'attachments': files, 'read_by': [p['id']]}
    await db.team_messages.insert_one(record.copy())
    await alert_team(p, ctx, recipients, 'message', record['id'])
    await audit(p, 'team:message', record['id'])
    return {k: v for k, v in record.items() if k != 'read_by'}


@router.post('/team/children/{child_id}/messages/read', response_model=Payload)
async def read_messages(child_id: str, p=Depends(principal)):
    ctx = await ctx_for(p, child_id)
    await require_scope(p, ctx, 'messages')
    await db.team_messages.update_many({'org_id': p['org_id'], 'child_id': child_id, 'recipients.id': p['id']}, {'$addToSet': {'read_by': p['id']}})
    return {'message': 'Messages marked as read.'}


@router.post('/team/children/{child_id}/meetings', response_model=Payload, status_code=201)
async def request_meeting(child_id: str, data: MeetingInput, p=Depends(principal)):
    ctx = await ctx_for(p, child_id, 'team:message')
    await require_scope(p, ctx, 'messages')
    recipients = await team_members(p['org_id'], ctx['child'])
    record = {'id': uid(), 'org_id': p['org_id'], 'child_id': child_id, **data.model_dump(), 'status': 'requested', 'scheduled_for': '',
              'minutes': '', 'actions': [], 'review_date': '', **author(p, ctx), 'attendees': recipients, 'version': 1, 'history': []}
    await db.team_meetings.insert_one(record.copy())
    await alert_team(p, ctx, recipients, 'meeting request', record['id'])
    await audit(p, 'team:meeting-request', record['id'])
    return {k: v for k, v in record.items() if k != '_id'}


@router.patch('/team/meetings/{meeting_id}', response_model=Payload)
async def update_meeting(meeting_id: str, data: MeetingUpdate, p=Depends(principal)):
    await authorize(p, 'team:message')
    meeting = await db.team_meetings.find_one({'org_id': p['org_id'], 'id': meeting_id}, {'_id': 0})
    if not meeting:
        raise HTTPException(404, 'Record not found.')
    ctx = await child_access(p, meeting['child_id'])
    await require_scope(p, ctx, 'messages')
    if ctx['kind'] not in {'therapist', 'coordinator'} and meeting['author_id'] != p['id']:
        raise HTTPException(403, 'Only the requester or the care team can update this meeting.')
    values = data.model_dump(exclude={'version'})
    values['actions'] = [{**a, 'id': a['id'] or uid()} for a in values['actions']]
    result = await db.team_meetings.update_one({'org_id': p['org_id'], 'id': meeting_id, 'version': data.version},
                                               {'$set': {**values, 'updated_at': now()}, '$inc': {'version': 1},
                                                '$push': {'history': {'at': now(), 'by_name': p['display_name'], 'status': data.status}}})
    if not result.matched_count:
        raise HTTPException(409, 'This meeting changed. Refresh before editing.')
    if data.status == 'scheduled' and meeting['status'] != 'scheduled':
        await alert_team(p, ctx, meeting['attendees'], 'meeting reminder', f'{meeting_id}:scheduled')
    await audit(p, 'team:meeting-update', meeting_id)
    return {'message': 'Meeting updated.'}
