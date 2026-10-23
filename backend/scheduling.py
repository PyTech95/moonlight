"""Session scheduling: center hours and rooms, therapist availability, booking with clash checks,
weekly series, reschedule/cancel, family change requests, attendance, reminders and 1:1 online sessions."""
import re
from datetime import datetime, timedelta, timezone
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import Field, field_validator

from center import IST, WEEKDAYS, add_care_link, center_wide, iso, local_dt, local_label, notify_family, parse_iso, staff_member, today_ist, week_bounds
from config import Input, Payload, db, now, uid
from security import ScopedRepo, audit, authorize, can, principal

router = APIRouter()
MODES = {'center': 'At the center', 'home': 'At home', 'online': 'Online (video)'}
EXTRA_SERVICES = ['Assessment', 'Home Tutor (Special Educator)', 'Parent consultation', 'Therapy Home Visit']
DEFAULT_SETTINGS = {'rooms': ['Therapy room 1', 'Therapy room 2', 'Sensory room'], 'open_days': ['mon', 'tue', 'wed', 'thu', 'fri', 'sat'],
                    'day_start': '09:00', 'day_end': '19:00', 'default_duration': 45, 'notify_family': True, 'reminders': True}
HHMM = re.compile(r'^([01]\d|2[0-3]):[0-5]\d$')
PARENT_HIDDEN = {'notes', 'history', 'created_by', 'video_room', 'billing'}


def _hhmm(value: str) -> str:
    if not HHMM.match(value or ''):
        raise ValueError('Use 24-hour time, for example 09:30.')
    return value


class SchedulingSettingsInput(Input):
    rooms: list[str] = Field(default_factory=list, max_length=20)
    open_days: list[Literal['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun']] = Field(min_length=1, max_length=7)
    day_start: str
    day_end: str
    default_duration: int = Field(ge=15, le=180)
    notify_family: bool = True
    reminders: bool = True

    @field_validator('day_start', 'day_end')
    @classmethod
    def check_times(cls, value):
        return _hhmm(value)

    @field_validator('rooms')
    @classmethod
    def rooms_ok(cls, value):
        return list(dict.fromkeys(r.strip()[:60] for r in value if r.strip()))


class WindowInput(Input):
    start: str
    end: str

    @field_validator('start', 'end')
    @classmethod
    def check_times(cls, value):
        return _hhmm(value)


class TimeOffInput(Input):
    start: str = Field(min_length=10, max_length=10)
    end: str = Field(min_length=10, max_length=10)
    note: str = Field(default='', max_length=120)


class AvailabilityInput(Input):
    weekly: dict[Literal['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'], list[WindowInput]]
    time_off: list[TimeOffInput] = Field(default_factory=list, max_length=40)
    services: list[str] = Field(default_factory=list, max_length=20)


class SlotFields(Input):
    date: str = Field(min_length=10, max_length=10)
    time: str
    duration_minutes: int = Field(ge=15, le=240)

    @field_validator('time')
    @classmethod
    def check_time(cls, value):
        return _hhmm(value)


class SessionInput(SlotFields):
    child_id: str = Field(min_length=1, max_length=100)
    therapist_id: str = Field(min_length=1, max_length=100)
    service: str = Field(min_length=2, max_length=80)
    mode: Literal['center', 'home', 'online'] = 'center'
    room: str = Field(default='', max_length=60)
    notes: str = Field(default='', max_length=600)
    repeat_weeks: int = Field(default=0, ge=0, le=26)
    allow_outside_hours: bool = False
    skip_conflicts: bool = False
    notify: bool = True


class CheckInput(SlotFields):
    child_id: str = Field(min_length=1, max_length=100)
    therapist_id: str = Field(min_length=1, max_length=100)
    mode: Literal['center', 'home', 'online'] = 'center'
    room: str = Field(default='', max_length=60)
    repeat_weeks: int = Field(default=0, ge=0, le=26)
    exclude_id: str = Field(default='', max_length=100)


class SessionUpdateInput(SlotFields):
    therapist_id: str = Field(min_length=1, max_length=100)
    service: str = Field(min_length=2, max_length=80)
    mode: Literal['center', 'home', 'online'] = 'center'
    room: str = Field(default='', max_length=60)
    notes: str = Field(default='', max_length=600)
    version: int = Field(ge=1)
    allow_outside_hours: bool = False
    notify: bool = True
    reason: str = Field(default='', max_length=300)


class CancelInput(Input):
    reason: str = Field(min_length=3, max_length=300)
    notify: bool = True
    scope: Literal['one', 'series'] = 'one'


class AttendanceInput(Input):
    attendance: Literal['Present', 'Absent', 'Not recorded']
    version: int = Field(ge=1)


class DecisionInput(Input):
    decision: Literal['approve', 'decline']
    note: str = Field(default='', max_length=400)
    date: str = Field(default='', max_length=10)
    time: str = Field(default='', max_length=5)
    therapist_id: str = Field(default='', max_length=100)
    room: str = Field(default='', max_length=60)
    allow_outside_hours: bool = False


# ---------- settings and availability ----------

async def scheduling_settings(org_id: str) -> dict:
    doc = await db.settings.find_one({'org_id': org_id}, {'_id': 0, 'scheduling': 1}) or {}
    return {**DEFAULT_SETTINGS, **(doc.get('scheduling') or {})}


async def service_names(org_id: str) -> list[str]:
    content = await db.site_content.find_one({'org_id': org_id}, {'_id': 0, 'collections.therapies': 1}) or {}
    titles = [t.get('title') for t in (content.get('collections') or {}).get('therapies') or [] if t.get('title')]
    if not titles:
        from public import SERVICES
        titles = [s for s in SERVICES if s not in {'Indoor Sports', 'I am not sure', 'Therapy Home Visit', 'Home Tutor (Special Educator)'}]
    return list(dict.fromkeys(titles + EXTRA_SERVICES))


def windows_for(user: dict, settings: dict, day_key: str) -> list[tuple[str, str]]:
    availability = user.get('availability') or {}
    weekly = availability.get('weekly')
    if weekly is not None:
        return [(w['start'], w['end']) for w in weekly.get(day_key, [])]
    return [(settings['day_start'], settings['day_end'])] if day_key in settings['open_days'] else []


def availability_problem(user: dict, settings: dict, start: datetime, end: datetime) -> str:
    """'' when the session sits inside the therapist's hours; otherwise a plain explanation."""
    local_start, local_end = start.astimezone(IST), end.astimezone(IST)
    day = local_start.date().isoformat()
    for off in (user.get('availability') or {}).get('time_off', []):
        if off['start'] <= day <= off['end']:
            return f"{user['display_name']} is on leave on this day" + (f" ({off['note']})" if off.get('note') else '') + '.'
    if local_end.date() != local_start.date():
        return 'Sessions must finish on the same day.'
    key = WEEKDAYS[local_start.weekday()]
    s, e = local_start.strftime('%H:%M'), local_end.strftime('%H:%M')
    windows = windows_for(user, settings, key)
    if not windows:
        return f"{user['display_name']} doesn't work on {local_start.strftime('%A')}s."
    if not any(ws <= s and e <= we for ws, we in windows):
        hours = ', '.join(f'{ws}–{we}' for ws, we in windows)
        return f"Outside {user['display_name']}'s hours on {local_start.strftime('%A')} ({hours})."
    return ''


async def find_clashes(org_id: str, start: datetime, end: datetime, therapist_id: str, child_id: str, room: str, exclude: set[str]) -> list[dict]:
    query = {'org_id': org_id, 'status': {'$ne': 'Cancelled'}, 'starts_at': {'$lt': iso(end)}, 'ends_at': {'$gt': iso(start)},
             '$or': [{'therapist_id': therapist_id}, {'child_id': child_id}] + ([{'room': room, 'mode': MODES['center']}] if room else [])}
    clashes = []
    async for a in db.appointments.find(query, {'_id': 0, 'id': 1, 'child_id': 1, 'child_name': 1, 'therapist_id': 1, 'therapist_name': 1,
                                                'staff_label': 1, 'room': 1, 'service': 1, 'starts_at': 1, 'ends_at': 1}):
        if a['id'] in exclude:
            continue
        when = f"{parse_iso(a['starts_at']).astimezone(IST).strftime('%H:%M')}–{parse_iso(a['ends_at']).astimezone(IST).strftime('%H:%M')}"
        if a.get('therapist_id') == therapist_id:
            kind, text = 'therapist', f"{a.get('therapist_name') or a.get('staff_label')} already has {a['child_name']} ({a['service']}) {when}"
        elif a['child_id'] == child_id:
            kind, text = 'child', f"{a['child_name']} already has {a['service']} with {a.get('therapist_name') or a.get('staff_label')} {when}"
        else:
            kind, text = 'room', f"{a['room']} is booked for {a['child_name']} {when}"
        clashes.append({'kind': kind, 'id': a['id'], 'text': text})
    async for c in db.therapy_classes.find({'org_id': org_id, 'therapist_id': therapist_id, 'status': 'scheduled',
                                            'starts_at': {'$lt': iso(end)}, 'ends_at': {'$gt': iso(start)}}, {'_id': 0, 'title': 1, 'starts_at': 1}):
        clashes.append({'kind': 'class', 'id': '', 'text': f"The therapist runs the group class “{c['title']}” at that time"})
    return clashes


def occurrences(day: str, hhmm: str, minutes: int, repeat_weeks: int) -> list[tuple[datetime, datetime]]:
    first = local_dt(day, hhmm)
    return [(first + timedelta(weeks=w), first + timedelta(weeks=w, minutes=minutes)) for w in range(repeat_weeks + 1)]


async def _manage(p: dict):
    await authorize(p, 'schedule:manage')
    if not center_wide(p):
        raise HTTPException(403, 'Only the front desk and administration can change the schedule.')


async def _child(org_id: str, child_id: str) -> dict:
    child = await db.children.find_one({'org_id': org_id, 'id': child_id}, {'_id': 0})
    if not child:
        raise HTTPException(404, 'Child not found.')
    if child.get('status') == 'archived':
        raise HTTPException(409, 'This child record is archived. Restore it before booking.')
    return child


def _room(mode: str, room: str, settings: dict) -> str:
    if mode != 'center':
        return ''
    if room and settings['rooms'] and room not in settings['rooms']:
        raise HTTPException(422, 'Choose one of the rooms from Schedule settings.')
    return room


def _public(session: dict, role: str) -> dict:
    return {k: v for k, v in session.items() if k not in PARENT_HIDDEN} if role == 'parent' else session


@router.get('/schedule/settings', response_model=Payload)
async def get_settings(p=Depends(principal)):
    await authorize(p, 'appointments:read')
    return {'settings': await scheduling_settings(p['org_id']), 'services': await service_names(p['org_id']), 'modes': MODES}


@router.patch('/admin/schedule/settings', response_model=Payload)
async def update_settings(data: SchedulingSettingsInput, p=Depends(principal)):
    await _manage(p)
    if data.day_start >= data.day_end:
        raise HTTPException(422, 'Opening time must be before closing time.')
    await db.settings.update_one({'org_id': p['org_id']}, {'$set': {'scheduling': data.model_dump()}, '$inc': {'version': 1}})
    await audit(p, 'schedule:settings', 'organization')
    return {'settings': await scheduling_settings(p['org_id'])}


@router.put('/admin/staff/{user_id}/availability', response_model=Payload)
async def set_availability(user_id: str, data: AvailabilityInput, p=Depends(principal)):
    await _manage(p)
    await staff_member(p['org_id'], user_id)
    weekly = {}
    for day, windows in data.weekly.items():
        spans = sorted((w.start, w.end) for w in windows)
        for (s, e), nxt in zip(spans, spans[1:] + [None]):
            if s >= e:
                raise HTTPException(422, f'{day.title()}: each start time must be before its end time.')
            if nxt and nxt[0] < e:
                raise HTTPException(422, f'{day.title()}: working hours overlap.')
        weekly[day] = [{'start': s, 'end': e} for s, e in spans]
    for off in data.time_off:
        if off.start > off.end:
            raise HTTPException(422, 'Leave must end on or after its start date.')
    availability = {'weekly': weekly, 'time_off': [o.model_dump() for o in data.time_off], 'updated_at': now(), 'updated_by': p['id']}
    await db.users.update_one({'org_id': p['org_id'], 'id': user_id}, {'$set': {'availability': availability, 'services': data.services}})
    await audit(p, 'schedule:availability', user_id)
    return {'availability': availability}


# ---------- reading the schedule ----------

@router.get('/schedule', response_model=Payload)
async def week(week: str = Query('', max_length=10), therapist_id: str = Query('', max_length=100), child_id: str = Query('', max_length=100),
               p=Depends(principal)):
    await authorize(p, 'appointments:read')
    try:
        begin, end = week_bounds(week or None)
    except ValueError:
        raise HTTPException(422, 'Choose a valid week.')
    query = await ScopedRepo(p).scope('appointments', 'appointments:read')
    if p['role'] == 'staff' and not center_wide(p):
        # A therapist sees their own sessions plus legacy sessions of children in their caseload.
        query = {'org_id': p['org_id'], '$or': [{'therapist_id': p['id']}, {**{k: v for k, v in query.items() if k != 'org_id'}, 'therapist_id': {'$exists': False}}]}
    query['starts_at'] = {'$gte': iso(begin), '$lt': iso(end)}
    if therapist_id:
        query['therapist_id'] = therapist_id
    if child_id:
        query['child_id'] = child_id
    sessions = [_public(s, p['role']) for s in await db.appointments.find(query, {'_id': 0}).sort('starts_at', 1).to_list(3000)]
    data = {'week_start': begin.date().isoformat(), 'days': [(begin + timedelta(days=i)).date().isoformat() for i in range(7)], 'sessions': sessions,
            'today': today_ist().isoformat(), 'modes': MODES}
    if center_wide(p):
        settings = await scheduling_settings(p['org_id'])
        staff = await db.users.find({'org_id': p['org_id'], 'role': 'staff', 'active': True, 'access_profile': {'$in': ['clinical', None]}},
                                    {'_id': 0, 'id': 1, 'display_name': 1, 'availability': 1, 'services': 1}).sort('display_name', 1).to_list(200)
        classes = await db.therapy_classes.find({'org_id': p['org_id'], 'status': 'scheduled', 'starts_at': {'$gte': iso(begin), '$lt': iso(end)}},
                                                {'_id': 0, 'id': 1, 'title': 1, 'therapist_id': 1, 'therapist_name': 1, 'starts_at': 1, 'ends_at': 1, 'format': 1}).to_list(300)
        requests = await db.requests.find({'org_id': p['org_id'], 'status': 'Pending'}, {'_id': 0}).sort('created_at', 1).to_list(200)
        appointment_ids = [r['appointment_id'] for r in requests]
        lookup = {a['id']: a for a in await db.appointments.find({'org_id': p['org_id'], 'id': {'$in': appointment_ids}}, {'_id': 0}).to_list(500)}
        for r in requests:
            r['appointment'] = lookup.get(r['appointment_id'])
        data.update(settings=settings, therapists=staff, classes=classes, requests=requests, services=await service_names(p['org_id']),
                    children=await db.children.find({'org_id': p['org_id'], 'status': {'$ne': 'archived'}},
                                                    {'_id': 0, 'id': 1, 'name': 1, 'staff_ids': 1, 'concerns': 1, 'home_address': 1}).sort('name', 1).to_list(2000))
    elif p['role'] == 'parent':
        data['requests'] = await db.requests.find({'org_id': p['org_id'], 'created_by': p['id']}, {'_id': 0}).sort('created_at', -1).to_list(100)
    await audit(p, 'appointments:read', f'week:{data["week_start"]}')
    return data


@router.get('/schedule/slots', response_model=Payload)
async def free_slots(therapist_id: str, date: str, duration: int = Query(45, ge=15, le=240), child_id: str = Query('', max_length=100), p=Depends(principal)):
    """Free start times (15-minute steps) for one therapist on one day, avoiding their sessions, the child's sessions and group classes."""
    await _manage(p)
    therapist = await staff_member(p['org_id'], therapist_id)
    settings = await scheduling_settings(p['org_id'])
    day_start = local_dt(date, '00:00')
    windows = windows_for(therapist, settings, WEEKDAYS[day_start.weekday()])
    for off in (therapist.get('availability') or {}).get('time_off', []):
        if off['start'] <= date <= off['end']:
            windows = []
    busy_query = {'org_id': p['org_id'], 'status': {'$ne': 'Cancelled'}, 'starts_at': {'$lt': iso(day_start + timedelta(days=1))}, 'ends_at': {'$gt': iso(day_start)},
                  '$or': [{'therapist_id': therapist_id}] + ([{'child_id': child_id}] if child_id else [])}
    busy = [(parse_iso(a['starts_at']), parse_iso(a['ends_at'])) for a in await db.appointments.find(busy_query, {'_id': 0, 'starts_at': 1, 'ends_at': 1}).to_list(200)]
    busy += [(parse_iso(c['starts_at']), parse_iso(c['ends_at'])) for c in await db.therapy_classes.find(
        {'org_id': p['org_id'], 'therapist_id': therapist_id, 'status': 'scheduled', 'starts_at': {'$lt': iso(day_start + timedelta(days=1))},
         'ends_at': {'$gt': iso(day_start)}}, {'_id': 0, 'starts_at': 1, 'ends_at': 1}).to_list(50)]
    current = datetime.now(timezone.utc)
    slots = []
    for ws, we in windows:
        cursor, limit = local_dt(date, ws), local_dt(date, we)
        while cursor + timedelta(minutes=duration) <= limit:
            finish = cursor + timedelta(minutes=duration)
            if cursor > current and not any(s < finish and e > cursor for s, e in busy):
                slots.append(cursor.astimezone(IST).strftime('%H:%M'))
            cursor += timedelta(minutes=15)
    return {'date': date, 'slots': slots, 'working': [f'{ws}–{we}' for ws, we in windows]}


@router.post('/admin/sessions/check', response_model=Payload)
async def check(data: CheckInput, p=Depends(principal)):
    await _manage(p)
    therapist = await staff_member(p['org_id'], data.therapist_id)
    settings = await scheduling_settings(p['org_id'])
    room = _room(data.mode, data.room, settings)
    result = []
    for start, end in occurrences(data.date, data.time, data.duration_minutes, data.repeat_weeks):
        result.append({'starts_at': iso(start), 'label': local_label(iso(start)),
                       'clashes': await find_clashes(p['org_id'], start, end, data.therapist_id, data.child_id, room, {data.exclude_id}),
                       'outside_hours': availability_problem(therapist, settings, start, end)})
    return {'occurrences': result, 'ok': not any(o['clashes'] for o in result)}


# ---------- creating and changing sessions ----------

def _history(p: dict, action: str, detail: str) -> dict:
    return {'at': now(), 'by': p['id'], 'by_name': p['display_name'], 'action': action, 'detail': detail}


def _where(mode: str, room: str, child: dict) -> str:
    if mode == 'home':
        return 'At home' + (f" ({child['home_address']})" if child.get('home_address') else '')
    if mode == 'online':
        return 'Online video session (join from the portal or app)'
    return 'At the center' + (f' · {room}' if room else '')


@router.post('/admin/sessions', response_model=Payload, status_code=201)
async def create_sessions(data: SessionInput, p=Depends(principal)):
    await _manage(p)
    child = await _child(p['org_id'], data.child_id)
    therapist = await staff_member(p['org_id'], data.therapist_id)
    settings = await scheduling_settings(p['org_id'])
    room = _room(data.mode, data.room, settings)
    if data.mode == 'home' and not child.get('home_address'):
        raise HTTPException(422, f"Add {child['name']}'s home address to the child record before booking a home session.")
    planned, skipped = [], []
    for start, end in occurrences(data.date, data.time, data.duration_minutes, data.repeat_weeks):
        clashes = await find_clashes(p['org_id'], start, end, therapist['id'], child['id'], room, set())
        outside = availability_problem(therapist, settings, start, end)
        if clashes or (outside and not data.allow_outside_hours):
            skipped.append({'starts_at': iso(start), 'label': local_label(iso(start)), 'clashes': clashes, 'outside_hours': outside})
        else:
            planned.append((start, end))
    if skipped and (not data.skip_conflicts or not planned):
        total = data.repeat_weeks + 1
        first = skipped[0]
        reason = first['clashes'][0]['text'] if first['clashes'] else first['outside_hours']
        message = f'{reason}.' if total == 1 else f"{len(skipped)} of {total} dates are not free. First: {first['label']}: {reason}"
        raise HTTPException(409, {'message': message.replace('..', '.'), 'conflicts': skipped})
    series_id = uid() if data.repeat_weeks else ''
    records = []
    for start, end in planned:
        records.append({'id': uid(), 'org_id': p['org_id'], 'child_id': child['id'], 'child_name': child['name'], 'therapist_id': therapist['id'],
                        'therapist_name': therapist['display_name'], 'staff_label': therapist['display_name'], 'service': data.service,
                        'starts_at': iso(start), 'ends_at': iso(end), 'duration_minutes': data.duration_minutes, 'mode': MODES[data.mode], 'mode_key': data.mode,
                        'room': room or ('Home visit' if data.mode == 'home' else 'Online' if data.mode == 'online' else ''), 'notes': data.notes,
                        'status': 'Confirmed', 'attendance': 'Not recorded', 'series_id': series_id, 'created_by': p['id'], 'created_at': now(),
                        'updated_at': now(), 'version': 1, 'history': [_history(p, 'booked', '')], 'billing': {'status': 'unbilled'}})
    await db.appointments.insert_many([r.copy() for r in records])
    if therapist['id'] not in child.get('staff_ids', []):
        await add_care_link(p['org_id'], child['id'], therapist['id'], 'clinical', 'scheduled_session')
    future = [r for r in records if r['starts_at'] > now()]
    notified = 0
    if data.notify and settings['notify_family'] and future:
        dates = '\n'.join(f"• {local_label(r['starts_at'])}" for r in future)
        body = (f"Hello,\n\n{data.service} for {child['name']} is booked with {therapist['display_name']}:\n\n{dates}\n\n"
                f"Each session is {data.duration_minutes} minutes. {_where(data.mode, room, child)}.\n\n"
                'You can see the schedule and ask for a change in the parent portal or the Moonlight app.')
        notified = await notify_family(p['org_id'], child, f"Booked: {data.service} for {child['name']}", body, f"booked:{records[0]['id']}")
    await audit(p, 'schedule:create', series_id or records[0]['id'])
    return {'created': len(records), 'skipped': skipped, 'series_id': series_id, 'sessions': records, 'notified': notified}


async def _session(org_id: str, session_id: str) -> dict:
    record = await db.appointments.find_one({'org_id': org_id, 'id': session_id}, {'_id': 0})
    if not record:
        raise HTTPException(404, 'Session not found.')
    return record


async def reschedule(p: dict, session: dict, day: str, hhmm: str, minutes: int, therapist_id: str, room: str, mode: str, service: str,
                     notes: str, allow_outside: bool, version: int | None, reason: str, notify: bool) -> dict:
    if session['status'] == 'Cancelled':
        raise HTTPException(409, 'This session is cancelled. Book a new one instead.')
    child = await _child(p['org_id'], session['child_id'])
    therapist = await staff_member(p['org_id'], therapist_id)
    settings = await scheduling_settings(p['org_id'])
    room = _room(mode, room, settings)
    start = local_dt(day, hhmm)
    end = start + timedelta(minutes=minutes)
    clashes = await find_clashes(p['org_id'], start, end, therapist['id'], child['id'], room, {session['id']})
    if clashes:
        raise HTTPException(409, {'message': 'That time is not free.', 'conflicts': [{'label': local_label(iso(start)), 'clashes': clashes, 'outside_hours': ''}]})
    outside = availability_problem(therapist, settings, start, end)
    if outside and not allow_outside:
        raise HTTPException(409, {'message': outside, 'conflicts': [{'label': local_label(iso(start)), 'clashes': [], 'outside_hours': outside}]})
    moved = iso(start) != session['starts_at']
    detail = f"{local_label(session['starts_at'])} → {local_label(iso(start))}" if moved else 'Details updated'
    changes = {'starts_at': iso(start), 'ends_at': iso(end), 'duration_minutes': minutes, 'therapist_id': therapist['id'],
               'therapist_name': therapist['display_name'], 'staff_label': therapist['display_name'], 'room': room or ('Home visit' if mode == 'home' else 'Online' if mode == 'online' else ''),
               'mode': MODES[mode], 'mode_key': mode, 'service': service, 'notes': notes, 'updated_at': now()}
    if moved:
        changes['attendance'] = 'Not recorded'
    query = {'org_id': p['org_id'], 'id': session['id']}
    if version is not None:
        query['version'] = version
    result = await db.appointments.update_one(query, {'$set': changes, '$inc': {'version': 1},
                                                      '$push': {'history': _history(p, 'rescheduled' if moved else 'edited', detail + (f' · {reason}' if reason else ''))}})
    if not result.matched_count:
        raise HTTPException(409, 'This session changed. Reload and try again.')
    if therapist['id'] not in child.get('staff_ids', []):
        await add_care_link(p['org_id'], child['id'], therapist['id'], 'clinical', 'scheduled_session')
    if moved and session.get('attendance') == 'Present':
        await _billing_hook(p, session, 'Present', 'Not recorded')
    if notify and moved and settings['notify_family'] and changes['starts_at'] > now():
        body = (f"Hello,\n\n{child['name']}'s {service} session has moved.\n\nWas: {local_label(session['starts_at'])}\n"
                f"Now: {local_label(changes['starts_at'])} with {therapist['display_name']} ({minutes} min).\n{_where(mode, room, child)}."
                + (f'\n\nNote from the center: {reason}' if reason else ''))
        await notify_family(p['org_id'], child, f"Session moved: {child['name']}, {local_label(changes['starts_at'])}", body, f"moved:{session['id']}:{changes['starts_at']}")
    await audit(p, 'schedule:update', session['id'])
    return await _session(p['org_id'], session['id'])


@router.patch('/admin/sessions/{session_id}', response_model=Payload)
async def update_session(session_id: str, data: SessionUpdateInput, p=Depends(principal)):
    await _manage(p)
    session = await _session(p['org_id'], session_id)
    return await reschedule(p, session, data.date, data.time, data.duration_minutes, data.therapist_id, data.room, data.mode, data.service,
                            data.notes, data.allow_outside_hours, data.version, data.reason, data.notify)


@router.post('/admin/sessions/{session_id}/cancel', response_model=Payload)
async def cancel_session(session_id: str, data: CancelInput, p=Depends(principal)):
    await _manage(p)
    session = await _session(p['org_id'], session_id)
    if session['status'] == 'Cancelled':
        raise HTTPException(409, 'This session is already cancelled.')
    targets = [session]
    if data.scope == 'series' and session.get('series_id'):
        targets = await db.appointments.find({'org_id': p['org_id'], 'series_id': session['series_id'], 'status': {'$ne': 'Cancelled'},
                                              'starts_at': {'$gte': session['starts_at']}}, {'_id': 0}).to_list(100)
    for t in targets:
        await db.appointments.update_one({'org_id': p['org_id'], 'id': t['id']}, {'$set': {
            'status': 'Cancelled', 'cancelled_at': now(), 'cancelled_by': p['id'], 'cancel_reason': data.reason, 'updated_at': now()},
            '$inc': {'version': 1}, '$push': {'history': _history(p, 'cancelled', data.reason)}})
        if t.get('attendance') == 'Present':
            await _billing_hook(p, t, 'Present', 'Not recorded')
    settings = await scheduling_settings(p['org_id'])
    future = [t for t in targets if t['starts_at'] > now()]
    if data.notify and settings['notify_family'] and future:
        child = await db.children.find_one({'org_id': p['org_id'], 'id': session['child_id']}, {'_id': 0}) or {'id': session['child_id'], 'contacts': []}
        dates = '\n'.join(f"• {local_label(t['starts_at'])}" for t in future)
        await notify_family(p['org_id'], child, f"Cancelled: {session['service']} for {session['child_name']}",
                            f"Hello,\n\nThis {session['service']} session for {session['child_name']} is cancelled:\n\n{dates}\n\nReason: {data.reason}\n\n"
                            'Please call or WhatsApp the center if you would like another time.', f"cancelled:{session['id']}:{data.scope}")
    await audit(p, 'schedule:cancel', session_id)
    return {'cancelled': len(targets), 'message': f"{len(targets)} session{'s' if len(targets) != 1 else ''} cancelled."}


# ---------- attendance (therapist for own sessions; front desk for all) ----------

async def _billing_hook(p: dict, session: dict, before: str, after: str):
    from billing import on_attendance_change
    await on_attendance_change(p, session, before, after)


@router.patch('/appointments/{appointment_id}/attendance', response_model=Payload)
async def attendance(appointment_id: str, data: AttendanceInput, p=Depends(principal)):
    await authorize(p, 'attendance:update')
    session = await _session(p['org_id'], appointment_id)
    if not center_wide(p):
        if session.get('therapist_id') and session['therapist_id'] != p['id']:
            raise HTTPException(403, 'Only the session therapist or the front desk can record attendance.')
        await ScopedRepo(p).one('appointments', 'appointments:read', appointment_id)
    if session['status'] == 'Cancelled':
        raise HTTPException(409, 'This session was cancelled.')
    if data.attendance != 'Not recorded' and session['starts_at'] > iso(datetime.now(timezone.utc) + timedelta(minutes=30)):
        raise HTTPException(409, 'Attendance can be recorded from 30 minutes before the session starts.')
    result = await db.appointments.update_one({'org_id': p['org_id'], 'id': appointment_id, 'version': data.version},
                                              {'$set': {'attendance': data.attendance, 'attendance_reviewer': p['id'], 'attendance_updated_at': now()},
                                               '$inc': {'version': 1}, '$push': {'history': _history(p, 'attendance', data.attendance)}})
    if not result.matched_count:
        raise HTTPException(409, 'This record changed. Refresh before trying again.')
    if session.get('attendance') != data.attendance:
        await _billing_hook(p, session, session.get('attendance', 'Not recorded'), data.attendance)
    await audit(p, 'attendance:update', appointment_id)
    return await _session(p['org_id'], appointment_id)


# ---------- family change requests ----------

@router.post('/admin/requests/{request_id}/decision', response_model=Payload)
async def decide(request_id: str, data: DecisionInput, p=Depends(principal)):
    await authorize(p, 'requests:update')
    if not center_wide(p):
        raise HTTPException(403, 'Only the front desk and administration can answer requests.')
    request = await db.requests.find_one({'org_id': p['org_id'], 'id': request_id, 'status': 'Pending'}, {'_id': 0})
    if not request:
        raise HTTPException(404, 'This request was already answered.')
    session = await _session(p['org_id'], request['appointment_id'])
    child = await db.children.find_one({'org_id': p['org_id'], 'id': session['child_id']}, {'_id': 0})
    outcome, detail = 'Declined', data.note
    if data.decision == 'approve':
        if request['kind'] == 'Reschedule':
            if not data.date or not data.time:
                raise HTTPException(422, 'Choose the new date and time.')
            rooms = (await scheduling_settings(p['org_id']))['rooms']
            keep_room = data.room or (session.get('room') if session.get('room') in rooms else '')
            updated = await reschedule(p, session, data.date, data.time, session['duration_minutes'], data.therapist_id or session.get('therapist_id', ''),
                                       keep_room if session.get('mode_key', 'center') == 'center' else '',
                                       session.get('mode_key', 'center'), session['service'], session.get('notes', ''), data.allow_outside_hours, None,
                                       'Family request', notify=False)
            outcome, detail = 'Approved', f"Moved to {local_label(updated['starts_at'])}" + (f'. {data.note}' if data.note else '')
        else:
            await db.appointments.update_one({'org_id': p['org_id'], 'id': session['id']}, {'$set': {
                'status': 'Cancelled', 'cancelled_at': now(), 'cancelled_by': p['id'], 'cancel_reason': 'Family notified absence: ' + request['reason'],
                'attendance': 'Absent'}, '$inc': {'version': 1}, '$push': {'history': _history(p, 'cancelled', 'Family notified absence')}})
            outcome, detail = 'Approved', 'Session cancelled for the notified absence' + (f'. {data.note}' if data.note else '')
    elif not data.note:
        raise HTTPException(422, 'Add a short note so the family knows why.')
    await db.requests.update_one({'org_id': p['org_id'], 'id': request_id}, {'$set': {
        'id': f"{request_id}-{uid()[:8]}", 'status': outcome, 'decision_note': detail, 'decided_by': p['id'], 'decided_by_name': p['display_name'],
        'decided_at': now()}, '$inc': {'version': 1}})
    if child:
        await notify_family(p['org_id'], child, f"Your {request['kind'].lower()} request: {outcome.lower()}",
                            f"Hello,\n\nYour {request['kind'].lower()} request for {session['child_name']}'s {session['service']} session on "
                            f"{local_label(session['starts_at'])} was {outcome.lower()}.\n\n{detail}", f'request:{request_id}')
    await audit(p, 'requests:update', request_id)
    return {'status': outcome, 'message': f"Request {outcome.lower()}. The family has been told." if child else f'Request {outcome.lower()}.'}


# ---------- reminders (cron) and online sessions ----------

async def send_reminders() -> int:
    """Email families about tomorrow's sessions. Safe to run more than once a day (deduplicated)."""
    tomorrow = today_ist() + timedelta(days=1)
    begin = local_dt(tomorrow.isoformat(), '00:00')
    count = 0
    async for org in db.settings.find({}, {'_id': 0, 'org_id': 1, 'scheduling': 1}):
        if not {**DEFAULT_SETTINGS, **(org.get('scheduling') or {})}.get('reminders'):
            continue
        sessions = await db.appointments.find({'org_id': org['org_id'], 'status': 'Confirmed', 'starts_at': {'$gte': iso(begin), '$lt': iso(begin + timedelta(days=1))}},
                                              {'_id': 0}).sort('starts_at', 1).to_list(1000)
        for s in sessions:
            child = await db.children.find_one({'org_id': org['org_id'], 'id': s['child_id']}, {'_id': 0})
            if not child:
                continue
            count += await notify_family(org['org_id'], child, f"Reminder: {s['service']} tomorrow, {local_label(s['starts_at'])}",
                                         f"Hello,\n\nA reminder that {child['name']} has {s['service']} with {s.get('therapist_name') or s.get('staff_label')} "
                                         f"tomorrow, {local_label(s['starts_at'])} ({s['duration_minutes']} min).\n{_where(s.get('mode_key', 'center'), s.get('room', ''), child)}.\n\n"
                                         'If you can’t make it, tell us from the portal or app (Request a change), or call the center.', f"reminder:{s['id']}")
    return count


@router.post('/sessions/{session_id}/video/join', response_model=Payload)
async def join_session_video(session_id: str, p=Depends(principal)):
    await authorize(p, 'appointments:read')
    session = await _session(p['org_id'], session_id)
    if session.get('mode_key') != 'online' or session['status'] == 'Cancelled':
        raise HTTPException(404, 'Online session not found.')
    is_therapist = p['role'] == 'staff' and session.get('therapist_id') == p['id']
    is_family = p['role'] == 'parent' and await db.children.find_one({'org_id': p['org_id'], 'id': session['child_id'], 'guardian_ids': p['id']}, {'_id': 0, 'id': 1})
    if not (is_therapist or is_family):
        raise HTTPException(403, 'Only the therapist and the child’s family can join this session.')
    starts, ends, current = parse_iso(session['starts_at']), parse_iso(session['ends_at']), datetime.now(timezone.utc)
    if current < starts - timedelta(minutes=15) or current > ends + timedelta(minutes=10):
        raise HTTPException(409, 'The video room opens 15 minutes before the session starts.')
    from video import join_room
    room, details = await join_room(p['org_id'], session.get('video_room'), ends, p, is_therapist, 4)
    if not session.get('video_room'):
        await db.appointments.update_one({'org_id': p['org_id'], 'id': session_id, 'video_room': {'$exists': False}}, {'$set': {'video_room': room}})
    await audit(p, 'schedule:video-join', session_id)
    return details


@router.get('/schedule/permissions', response_model=Payload)
async def permissions(p=Depends(principal)):
    return {'manage': can(p, 'schedule:manage') and center_wide(p), 'attendance': can(p, 'attendance:update'), 'requests': can(p, 'requests:update') and center_wide(p)}
