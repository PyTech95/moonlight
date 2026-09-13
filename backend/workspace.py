from typing import Literal
from fastapi import APIRouter, Depends, HTTPException
from pydantic import Field
from pymongo.errors import DuplicateKeyError
from config import db, Input, Payload, uid, now
from security import principal, ScopedRepo, authorize, audit

router = APIRouter()


@router.get('/workspace/{role}', response_model=Payload)
async def workspace(role: Literal['parent', 'staff', 'admin'], p=Depends(principal)):
    if role not in p['roles']:
        raise HTTPException(403, 'You do not have access to this workspace.')
    repo = ScopedRepo(p)
    fields = ['id', 'name', 'initials', 'age_label'] if role == 'admin' else ['id', 'name', 'initials', 'age_label', 'communication', 'goals', 'shared_summary']
    children = await repo.list('children', 'children:read', fields)
    appointments = await repo.list('appointments', 'appointments:read')
    video_fields = ['id', 'child_id', 'child_name', 'therapy', 'title', 'note', 'steps', 'session_date',
                    'duration_seconds', 'therapist_name', 'created_at', 'published_at', 'version', 'read_by']
    practice_videos = await repo.list('practice_videos', 'practice_videos:read', video_fields)
    practice_videos = sorted(practice_videos, key=lambda x: x.get('published_at', ''), reverse=True)
    for video in practice_videos:
        read_by = video.pop('read_by', [])
        video['viewed'] = p['id'] in read_by
        video['family_viewed'] = bool(read_by)
    data = {'children': children, 'appointments': sorted(appointments, key=lambda x: x['starts_at']), 'activities': [], 'announcements': [], 'requests': [],
            'practice_videos': practice_videos, 'practice_unread': sum(not video['viewed'] for video in practice_videos) if role == 'parent' else 0,
            'demo': True}
    if role != 'admin':
        data['activities'] = await repo.list('activities', 'activities:read')
        data['announcements'] = await repo.list('announcements', 'announcements:read')
        data['requests'] = await db.requests.find({'org_id': p['org_id'], 'created_by': p['id']}, {'_id': 0}).to_list(100)
    else:
        enquiries = await repo.list('enquiries', 'enquiries:read')
        requests = await repo.list('requests', 'requests:read')
        data.update({'enquiries': enquiries, 'requests': requests,
                     'stats': {'sessions': len(appointments), 'enquiries': len(enquiries), 'pending_requests': sum(r['status'] == 'Pending' for r in requests), 'attendance_unrecorded': sum(a['attendance'] == 'Not recorded' for a in appointments)}})
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


class AttendanceInput(Input):
    attendance: Literal['Present', 'Absent', 'Not recorded']
    version: int = Field(ge=1)


@router.patch('/appointments/{appointment_id}/attendance', response_model=Payload)
async def attendance(appointment_id: str, data: AttendanceInput, p=Depends(principal)):
    return await ScopedRepo(p).update('appointments', 'attendance:update', appointment_id,
                                     {'attendance': data.attendance, 'attendance_reviewer': p['id'], 'attendance_updated_at': now()}, data.version)