from datetime import datetime, timedelta, timezone
from typing import Literal
from fastapi import APIRouter, Depends, HTTPException
from pydantic import Field
from pymongo.errors import DuplicateKeyError
from config import db, Input, Payload, uid, now, IS_DEMO
from security import principal, ScopedRepo, authorize, audit, can
from home_plans import serialize_plan

router = APIRouter()


@router.get('/workspace/{role}', response_model=Payload)
async def workspace(role: Literal['parent', 'staff', 'admin'], p=Depends(principal)):
    if role not in p['roles']:
        raise HTTPException(403, 'You do not have access to this workspace.')
    repo = ScopedRepo(p)

    async def optional(collection, action, fields=None, limit=100):
        # Reception and finance staff use the care-team workspace without clinical permissions.
        return await repo.list(collection, action, fields, limit=limit) if can(p, action) else []

    fields = ['id', 'name', 'initials', 'age_label'] if role == 'admin' else ['id', 'name', 'initials', 'age_label', 'communication', 'goals', 'shared_summary']
    children = [c for c in await optional('children', 'children:read', fields + ['status'], limit=1000) if c.get('status') != 'archived']
    appointments = []
    if can(p, 'appointments:read'):
        # The workspace shows a rolling window; the Schedule page loads any week on demand.
        current = datetime.now(timezone.utc)
        query = await repo.scope('appointments', 'appointments:read')
        query.update({'status': {'$ne': 'Cancelled'}, 'starts_at': {'$gte': (current - timedelta(days=14)).isoformat(), '$lte': (current + timedelta(days=60)).isoformat()}})
        appointments = await db.appointments.find(query, {'_id': 0}).sort('starts_at', 1).to_list(1500)
    video_fields = ['id', 'child_id', 'child_name', 'therapy', 'title', 'note', 'steps', 'session_date',
                    'duration_seconds', 'therapist_name', 'created_at', 'published_at', 'version', 'read_by',
                    'processing_status', 'processing_error', 'thumbnail_path', 'caption_path', 'transcript']
    practice_videos = await optional('practice_videos', 'practice_videos:read', video_fields)
    practice_videos = sorted(practice_videos, key=lambda x: x.get('published_at', ''), reverse=True)
    for video in practice_videos:
        read_by = video.pop('read_by', [])
        video['viewed'] = p['id'] in read_by
        video['family_viewed'] = bool(read_by)
        video['thumbnail_ready'] = bool(video.pop('thumbnail_path', ''))
        video['captions_available'] = bool(video.pop('caption_path', ''))
    plan_fields = ['id', 'child_id', 'child_name', 'week_start', 'week_end', 'title', 'note', 'why_this_helps',
                   'items', 'status', 'author_name', 'created_at', 'published_at', 'updated_at', 'version', 'read_by', 'responses']
    home_plans = await optional('home_plans', 'home_plans:read', plan_fields)
    home_plans = [serialize_plan(plan, p) for plan in sorted(home_plans, key=lambda x: x.get('week_start', ''), reverse=True)]
    video_unread = sum(not video['viewed'] for video in practice_videos) if role == 'parent' else 0
    plan_unread = sum(not plan['viewed'] for plan in home_plans) if role == 'parent' else 0
    data = {'children': children, 'appointments': sorted(appointments, key=lambda x: x['starts_at']), 'activities': [], 'announcements': [], 'requests': [],
            'practice_videos': practice_videos, 'home_plans': home_plans, 'video_unread': video_unread, 'plan_unread': plan_unread,
            'practice_unread': video_unread + plan_unread,
            'demo': IS_DEMO}
    if role != 'admin':
        data['activities'] = await optional('activities', 'activities:read')
        data['announcements'] = await optional('announcements', 'announcements:read')
        data['requests'] = await db.requests.find({'org_id': p['org_id'], 'created_by': p['id']}, {'_id': 0}).to_list(100)
    else:
        enquiries = await repo.list('enquiries', 'enquiries:read')
        requests = await repo.list('requests', 'requests:read')
        data.update({'enquiries': enquiries, 'requests': requests,
                     'stats': {'sessions': len(appointments), 'enquiries': len(enquiries), 'pending_requests': sum(r['status'] == 'Pending' for r in requests), 'attendance_unrecorded': sum(a.get('attendance') == 'Not recorded' and a['starts_at'] < now() for a in appointments)}})
    return data


@router.get('/children/{child_id}', response_model=Payload)
async def child(child_id: str, p=Depends(principal)):
    record = await ScopedRepo(p).one('children', 'children:read', child_id)
    fields = ['id', 'name', 'initials', 'age_label']
    if p['role'] != 'admin':
        fields += ['communication', 'goals', 'shared_summary']
    return {key: record[key] for key in fields}


class ActivityInput(Input):
    status: Literal['To try', 'Tried it', 'Need an adaptation']
    feedback: str = Field(default='', max_length=500)
    version: int = Field(ge=1)


@router.patch('/activities/{activity_id}', response_model=Payload)
async def activity(activity_id: str, data: ActivityInput, p=Depends(principal)):
    return await ScopedRepo(p).update('activities', 'activities:update', activity_id, {'status': data.status, 'feedback': data.feedback}, data.version)


class RequestInput(Input):
    appointment_id: str
    kind: Literal['Reschedule', 'Absence']
    preferred_date: str = Field(default='', max_length=10)
    reason: str = Field(min_length=2, max_length=500)


@router.post('/appointment-requests', response_model=Payload, status_code=201)
async def appointment_request(data: RequestInput, p=Depends(principal)):
    await authorize(p, 'requests:create')
    appointment = await ScopedRepo(p).one('appointments', 'appointments:read', data.appointment_id)
    if data.kind == 'Reschedule':
        from datetime import date
        try:
            preferred = date.fromisoformat(data.preferred_date)
            if preferred < date.today():
                raise ValueError()
        except ValueError:
            raise HTTPException(422, 'Choose today or a future preferred date.')
    key = f"{data.appointment_id}-{p['id']}-pending"
    record = {'id': key, 'org_id': p['org_id'], 'created_by': p['id'], **data.model_dump(), 'child_name': appointment['child_name'], 'service': appointment['service'], 'status': 'Pending', 'created_at': now(), 'version': 1}
    existing = await db.requests.find_one({'org_id': p['org_id'], 'id': key}, {'_id': 0})
    if existing and existing['status'] == 'Pending':
        raise HTTPException(409, 'A request for this session is already pending.')
    try:
        await db.requests.insert_one(record.copy())
    except DuplicateKeyError:
        raise HTTPException(409, 'A request for this session has already been submitted.')
    await audit(p, 'requests:create', key)
    return record
