import os
from datetime import datetime, timedelta, timezone
from typing import Literal

import httpx
from fastapi import APIRouter, Depends, HTTPException
from pydantic import Field

from config import Input, Payload, db, now, uid
from security import audit, authorize, principal

router = APIRouter()
FORMATS = {'center': 'At the center', 'online': 'Online (video)', 'home': 'At home'}
JOIN_EARLY = timedelta(minutes=15)


class ClassInput(Input):
    title: str = Field(min_length=3, max_length=120)
    therapy: str = Field(min_length=2, max_length=80)
    format: Literal['center', 'online', 'home']
    starts_at: datetime
    duration_minutes: int = Field(ge=15, le=180)
    capacity: int = Field(ge=1, le=6)
    therapist_id: str = Field(default='', max_length=100)
    area: str = Field(default='', max_length=160)
    notes: str = Field(default='', max_length=600)


class BookingInput(Input):
    child_id: str = Field(min_length=1, max_length=100)
    home_address: str = Field(default='', max_length=400)
    access_notes: str = Field(default='', max_length=300)


def _parse(value: str) -> datetime:
    return datetime.fromisoformat(value)


def video_connected() -> bool:
    return bool(os.environ.get('DAILY_API_KEY') and os.environ.get('DAILY_DOMAIN'))


async def _staff_class(p: dict, class_id: str) -> dict:
    record = await db.therapy_classes.find_one({'org_id': p['org_id'], 'id': class_id}, {'_id': 0})
    if not record or (p['role'] == 'staff' and record['therapist_id'] != p['id']):
        raise HTTPException(404, 'Class not found.')
    return record


@router.get('/classes', response_model=Payload)
async def list_classes(p=Depends(principal)):
    await authorize(p, 'classes:read')
    org = p['org_id']
    since = (datetime.now(timezone.utc) - timedelta(days=1)).isoformat()
    q = {'org_id': org, 'starts_at': {'$gte': since}}
    if p['role'] == 'staff':
        q['therapist_id'] = p['id']
    if p['role'] == 'parent':
        q['status'] = 'scheduled'
    classes = await db.therapy_classes.find(q, {'_id': 0, 'video_room': 0}).sort('starts_at', 1).to_list(300)
    bookings = await db.class_bookings.find({'org_id': org, 'class_id': {'$in': [c['id'] for c in classes]}, 'status': 'booked'}, {'_id': 0}).to_list(2000)
    data = {'formats': FORMATS, 'video_connected': video_connected()}
    if p['role'] == 'parent':
        children = await db.children.find({'org_id': org, 'guardian_ids': p['id']}, {'_id': 0, 'id': 1, 'name': 1}).to_list(20)
        mine = {c['id'] for c in children}
        for c in classes:
            c['seats_left'] = c['capacity'] - sum(1 for b in bookings if b['class_id'] == c['id'])
            c['my_bookings'] = [{k: b[k] for k in ['id', 'child_id', 'child_name', 'home_address']} for b in bookings if b['class_id'] == c['id'] and b['child_id'] in mine]
        data.update(classes=classes, children=children)
    else:
        for c in classes:
            c['bookings'] = [b for b in bookings if b['class_id'] == c['id']]
        data['classes'] = classes
        if p['role'] == 'admin':
            data['therapists'] = await db.users.find({'org_id': org, 'role': 'staff', 'active': True}, {'_id': 0, 'id': 1, 'display_name': 1}).to_list(200)
    await audit(p, 'classes:read', 'classes')
    return data


@router.post('/classes', response_model=Payload, status_code=201)
async def create_class(data: ClassInput, p=Depends(principal)):
    await authorize(p, 'classes:manage')
    therapist_id = p['id'] if p['role'] == 'staff' else data.therapist_id
    therapist = await db.users.find_one({'org_id': p['org_id'], 'id': therapist_id, 'role': 'staff', 'active': True}, {'_id': 0, 'id': 1, 'display_name': 1})
    if not therapist:
        raise HTTPException(422, 'Choose an active therapist for this class.')
    starts = data.starts_at if data.starts_at.tzinfo else data.starts_at.replace(tzinfo=timezone.utc)
    if starts < datetime.now(timezone.utc):
        raise HTTPException(422, 'Choose a future start time.')
    if data.format == 'home' and not data.area:
        raise HTTPException(422, 'Add the service area for at-home classes.')
    record = {'id': uid(), 'org_id': p['org_id'], **data.model_dump(exclude={'starts_at', 'therapist_id'}), 'starts_at': starts.astimezone(timezone.utc).isoformat(),
              'ends_at': (starts + timedelta(minutes=data.duration_minutes)).astimezone(timezone.utc).isoformat(), 'therapist_id': therapist['id'],
              'therapist_name': therapist['display_name'], 'status': 'scheduled', 'created_by': p['id'], 'created_at': now()}
    if data.format == 'home':
        record['capacity'] = 1
    await db.therapy_classes.insert_one(record.copy())
    await audit(p, 'classes:create', record['id'])
    return record


@router.post('/classes/{class_id}/cancel', response_model=Payload)
async def cancel_class(class_id: str, p=Depends(principal)):
    await authorize(p, 'classes:manage')
    await _staff_class(p, class_id)
    await db.therapy_classes.update_one({'org_id': p['org_id'], 'id': class_id}, {'$set': {'status': 'cancelled', 'cancelled_at': now()}})
    await audit(p, 'classes:cancel', class_id)
    return {'message': 'Class cancelled. Booked families will see the change in their portal.'}


@router.post('/classes/{class_id}/book', response_model=Payload, status_code=201)
async def book(class_id: str, data: BookingInput, p=Depends(principal)):
    await authorize(p, 'classes:book')
    child = await db.children.find_one({'org_id': p['org_id'], 'id': data.child_id, 'guardian_ids': p['id']}, {'_id': 0, 'id': 1, 'name': 1})
    record = await db.therapy_classes.find_one({'org_id': p['org_id'], 'id': class_id, 'status': 'scheduled'}, {'_id': 0})
    if not child or not record:
        raise HTTPException(404, 'Class not found.')
    if _parse(record['starts_at']) < datetime.now(timezone.utc):
        raise HTTPException(422, 'This class has already started.')
    if record['format'] == 'home' and len(data.home_address.strip()) < 8:
        raise HTTPException(422, 'Add the home address for the therapist’s visit.')
    if await db.class_bookings.find_one({'org_id': p['org_id'], 'class_id': class_id, 'child_id': child['id'], 'status': 'booked'}, {'_id': 0, 'id': 1}):
        raise HTTPException(409, f"{child['name']} is already booked for this class.")
    if await db.class_bookings.count_documents({'org_id': p['org_id'], 'class_id': class_id, 'status': 'booked'}) >= record['capacity']:
        raise HTTPException(409, 'This class is full.')
    booking = {'id': uid(), 'org_id': p['org_id'], 'class_id': class_id, 'child_id': child['id'], 'child_name': child['name'], 'guardian_id': p['id'],
               'guardian_name': p['display_name'], 'home_address': data.home_address if record['format'] == 'home' else '',
               'access_notes': data.access_notes if record['format'] == 'home' else '', 'status': 'booked', 'created_at': now()}
    await db.class_bookings.insert_one(booking.copy())
    await audit(p, 'classes:book', booking['id'])
    return {'message': f"{child['name']} is booked.", 'id': booking['id']}


@router.post('/classes/bookings/{booking_id}/cancel', response_model=Payload)
async def cancel_booking(booking_id: str, p=Depends(principal)):
    await authorize(p, 'classes:book')
    result = await db.class_bookings.update_one({'org_id': p['org_id'], 'id': booking_id, 'guardian_id': p['id'], 'status': 'booked'}, {'$set': {'status': 'cancelled', 'cancelled_at': now()}})
    if not result.matched_count:
        raise HTTPException(404, 'Booking not found.')
    await audit(p, 'classes:booking-cancel', booking_id)
    return {'message': 'Booking cancelled.'}


async def _daily(path: str, payload: dict) -> dict:
    async with httpx.AsyncClient(timeout=10) as client:
        response = await client.post(f'https://api.daily.co/v1/{path}', headers={'Authorization': f"Bearer {os.environ['DAILY_API_KEY']}"}, json=payload)
    if response.status_code >= 400 and not (path == 'rooms' and 'already exists' in response.text):
        raise HTTPException(502, 'The video provider could not open the room. Please try again.')
    return response.json()


@router.post('/classes/{class_id}/video/join', response_model=Payload)
async def join_video(class_id: str, p=Depends(principal)):
    await authorize(p, 'classes:read')
    record = await db.therapy_classes.find_one({'org_id': p['org_id'], 'id': class_id, 'format': 'online', 'status': 'scheduled'}, {'_id': 0})
    if not record:
        raise HTTPException(404, 'Online class not found.')
    is_therapist = p['role'] == 'staff' and record['therapist_id'] == p['id']
    is_family = p['role'] == 'parent' and await db.class_bookings.find_one({'org_id': p['org_id'], 'class_id': class_id, 'guardian_id': p['id'], 'status': 'booked'}, {'_id': 0, 'id': 1})
    if not (is_therapist or is_family):
        await audit(p, 'classes:video-join', class_id, 'forbidden')
        raise HTTPException(403, 'Only the therapist and booked families can join this class.')
    starts, ends, current = _parse(record['starts_at']), _parse(record['ends_at']), datetime.now(timezone.utc)
    if current < starts - JOIN_EARLY or current > ends + timedelta(minutes=10):
        raise HTTPException(409, 'The video room opens 15 minutes before the class starts.')
    if not video_connected():
        raise HTTPException(503, 'In-app video calling is not connected yet. The center needs to add its video provider key.')
    room_exp = int((ends + timedelta(minutes=15)).timestamp())
    room = record.get('video_room') or f'mnc-{uid()[:18]}'
    if not record.get('video_room'):
        await _daily('rooms', {'name': room, 'privacy': 'private', 'properties': {'geo': 'ap-south-1', 'max_participants': 7, 'exp': room_exp, 'eject_at_room_exp': True,
                                                                                 'enable_prejoin_ui': True, 'enable_chat': False, 'enable_screenshare': is_therapist, 'enable_knocking': False}})
        await db.therapy_classes.update_one({'org_id': p['org_id'], 'id': class_id, 'video_room': {'$exists': False}}, {'$set': {'video_room': room}})
        room = (await db.therapy_classes.find_one({'org_id': p['org_id'], 'id': class_id}, {'_id': 0, 'video_room': 1}))['video_room']
    exp = min(int((current + timedelta(minutes=90)).timestamp()), room_exp)
    token = await _daily('meeting-tokens', {'properties': {'room_name': room, 'user_id': p['id'], 'user_name': p['display_name'], 'is_owner': is_therapist, 'exp': exp,
                                                           'eject_at_token_exp': True, 'enable_screenshare': is_therapist, 'enable_recording': False}})
    await audit(p, 'classes:video-join', class_id)
    return {'room_url': f"{os.environ['DAILY_DOMAIN'].rstrip('/')}/{room}", 'token': token['token'], 'expires_at': exp}
