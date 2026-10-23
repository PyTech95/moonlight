"""Shared helpers for day-to-day center operations: India time, phone numbers, staff lookups, family notices."""
import re
from datetime import date, datetime, time, timedelta, timezone
from zoneinfo import ZoneInfo

from fastapi import HTTPException

from config import db, now
from jobs import enqueue_email

IST = ZoneInfo('Asia/Kolkata')
CENTER_WIDE_PROFILES = {'administrator', 'reception', 'finance'}
WEEKDAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun']


def center_wide(p: dict) -> bool:
    """Admin, reception and finance see every child; therapists and parents only their own."""
    return p.get('role') == 'admin' or p.get('access_profile') in CENTER_WIDE_PROFILES


def iso(dt: datetime) -> str:
    """Stored timestamps: UTC, second precision, '+00:00' suffix, so string order = time order."""
    return dt.astimezone(timezone.utc).replace(microsecond=0).isoformat()


def parse_iso(value: str) -> datetime:
    dt = datetime.fromisoformat(str(value).replace('Z', '+00:00'))
    return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)


def local_dt(day: str, hhmm: str) -> datetime:
    try:
        d = date.fromisoformat(day)
        h, m = (int(x) for x in hhmm.split(':'))
        return datetime.combine(d, time(h, m), IST)
    except (ValueError, TypeError):
        raise HTTPException(422, 'Choose a valid date and time.')


def local_parts(value: str) -> tuple[str, str]:
    dt = parse_iso(value).astimezone(IST)
    return dt.date().isoformat(), dt.strftime('%H:%M')


def local_label(value: str) -> str:
    dt = parse_iso(value).astimezone(IST)
    return dt.strftime('%a %d %b %Y, ') + dt.strftime('%I:%M %p').lstrip('0')


def today_ist() -> date:
    return datetime.now(IST).date()


def week_bounds(start: str | None) -> tuple[datetime, datetime]:
    """Monday 00:00 IST of the given (or current) week, and 7 days later."""
    d = date.fromisoformat(start) if start else today_ist()
    monday = d - timedelta(days=d.weekday())
    begin = datetime.combine(monday, time(0, 0), IST)
    return begin, begin + timedelta(days=7)


def normalize_phone(value: str) -> str:
    """Indian numbers default to +91. Returns '' for blank input; raises on nonsense."""
    raw = re.sub(r'[\s()\-.]', '', value or '')
    if not raw:
        return ''
    if raw.startswith('00'):
        raw = '+' + raw[2:]
    digits = re.sub(r'\D', '', raw)
    if raw.startswith('+'):
        result = '+' + digits
    elif len(digits) == 10 and digits[0] in '6789':
        result = '+91' + digits
    elif len(digits) == 12 and digits.startswith('91'):
        result = '+' + digits
    elif len(digits) == 11 and digits.startswith('0'):
        result = '+91' + digits[1:]
    else:
        result = '+' + digits
    if not re.fullmatch(r'\+[1-9]\d{9,14}', result):
        raise HTTPException(422, 'Enter a valid mobile number, for example 98765 43210 or +91 98765 43210.')
    return result


def mask_phone(value: str) -> str:
    return f'••••{value[-4:]}' if value else ''


def mask_email(value: str) -> str:
    if not value or '@' not in value:
        return ''
    name, domain = value.split('@', 1)
    return f'{name[:2]}•••@{domain}'


def initials(name: str) -> str:
    parts = [part for part in re.sub(r'[^\w\s]', '', name or '').split() if part]
    return ''.join(part[0].upper() for part in parts[:2]) or 'C'


def age_label(dob: str) -> str:
    try:
        born = date.fromisoformat(dob)
    except (TypeError, ValueError):
        return ''
    today = today_ist()
    months = (today.year - born.year) * 12 + today.month - born.month - (1 if today.day < born.day else 0)
    if months < 0:
        return ''
    if months < 24:
        return f'{months} month{"s" if months != 1 else ""}'
    years = months // 12
    return f'{years} years'


async def staff_member(org_id: str, user_id: str) -> dict:
    user = await db.users.find_one({'org_id': org_id, 'id': user_id, 'role': 'staff', 'active': True},
                                   {'_id': 0, 'id': 1, 'display_name': 1, 'email': 1, 'access_profile': 1, 'availability': 1, 'phone': 1})
    if not user:
        raise HTTPException(422, 'Choose an active therapist.')
    return user


async def family_emails(org_id: str, child: dict) -> list[str]:
    """Portal guardians first, then contacts saved on the child record (deduplicated)."""
    emails = []
    if child.get('guardian_ids'):
        guardians = await db.users.find({'org_id': org_id, 'id': {'$in': child['guardian_ids']}, 'active': True}, {'_id': 0, 'email': 1}).to_list(10)
        emails += [g['email'] for g in guardians if g.get('email')]
    emails += [c['email'] for c in child.get('contacts', []) if c.get('email')]
    return list(dict.fromkeys(e.lower() for e in emails))


async def notify_family(org_id: str, child: dict, subject: str, body: str, dedupe_key: str) -> int:
    """Queue one email per family address. Returns how many were queued (0 when none is known)."""
    settings = await db.settings.find_one({'org_id': org_id}, {'_id': 0, 'name': 1, 'phone': 1}) or {}
    footer = f"\n\n— {settings.get('name') or 'Moonlight Neurocare'}" + (f" · {settings['phone']}" if settings.get('phone') else '')
    count = 0
    for email in await family_emails(org_id, child):
        await enqueue_email(org_id, email, subject, body + footer, f'{dedupe_key}:{email}', {'child_id': child['id']})
        count += 1
    return count


async def add_care_link(org_id: str, child_id: str, user_id: str, relationship: str, method: str):
    """Link a guardian or therapist to a child, with the same access-grant record the invitation flow writes."""
    field = 'guardian_ids' if relationship == 'guardian' else 'staff_ids'
    await db.children.update_one({'org_id': org_id, 'id': child_id}, {'$addToSet': {field: user_id}, '$inc': {'version': 1}})
    existing = await db.access_grants.find_one({'org_id': org_id, 'user_id': user_id, 'child_id': child_id, 'status': 'active'}, {'_id': 0, 'id': 1})
    if not existing:
        from config import uid
        await db.access_grants.insert_one({'id': uid(), 'org_id': org_id, 'user_id': user_id, 'child_id': child_id, 'relationship': relationship,
                                           'status': 'active', 'verified_at': now(), 'verification_method': method, 'created_at': now(), 'version': 1})


async def remove_care_link(org_id: str, child_id: str, user_id: str, by: str, reason: str):
    await db.children.update_one({'org_id': org_id, 'id': child_id}, {'$pull': {'guardian_ids': user_id, 'staff_ids': user_id}, '$inc': {'version': 1}})
    await db.access_grants.update_many({'org_id': org_id, 'user_id': user_id, 'child_id': child_id, 'status': 'active'},
                                       {'$set': {'status': 'revoked', 'revoked_at': now(), 'revoked_by': by, 'reason': reason}})
