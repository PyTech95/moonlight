"""Child records for the center: create, edit, archive; link parents and therapists; enrol from an enquiry."""
from datetime import date, datetime, timezone
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import EmailStr, Field, field_validator

from access import create_invitation
from center import add_care_link, age_label, center_wide, initials, normalize_phone, remove_care_link
from config import Input, Payload, db, now, uid
from security import audit, authorize, principal

router = APIRouter()
CHILD_FIELDS = ['id', 'name', 'initials', 'age_label', 'date_of_birth', 'gender', 'school', 'concerns', 'communication', 'admin_notes',
                'contacts', 'home_address', 'status', 'guardian_ids', 'staff_ids', 'enquiry_id', 'created_at', 'updated_at', 'version',
                'archived_at', 'archive_reason']


class ContactInput(Input):
    name: str = Field(min_length=2, max_length=100)
    relation: str = Field(default='Parent', max_length=40)
    phone: str = Field(default='', max_length=25)
    email: EmailStr | None = None
    primary: bool = False

    @field_validator('phone')
    @classmethod
    def phone_ok(cls, value):
        return normalize_phone(value) if value else ''


class ChildInput(Input):
    name: str = Field(min_length=2, max_length=80)
    date_of_birth: str = Field(default='', max_length=10)
    age_label: str = Field(default='', max_length=30)
    gender: Literal['', 'Girl', 'Boy', 'Other'] = ''
    school: str = Field(default='', max_length=120)
    concerns: list[str] = Field(default_factory=list, max_length=12)
    communication: str = Field(default='', max_length=300)
    admin_notes: str = Field(default='', max_length=1500)
    home_address: str = Field(default='', max_length=400)
    contacts: list[ContactInput] = Field(default_factory=list, max_length=4)

    @field_validator('date_of_birth')
    @classmethod
    def dob_ok(cls, value):
        if not value:
            return ''
        try:
            born = date.fromisoformat(value)
        except ValueError:
            raise ValueError('Use the date picker for date of birth.')
        if born > date.today() or born.year < 1990:
            raise ValueError('Check the date of birth.')
        return value

    @field_validator('concerns')
    @classmethod
    def concerns_ok(cls, value):
        return [c.strip()[:80] for c in value if c.strip()]


class NewChildInput(ChildInput):
    enquiry_id: str = Field(default='', max_length=100)


class UpdateChildInput(ChildInput):
    version: int = Field(ge=1)


class ArchiveInput(Input):
    reason: str = Field(min_length=3, max_length=300)
    cancel_future: bool = False


class GuardianInput(Input):
    email: EmailStr
    display_name: str = Field(min_length=2, max_length=100)
    phone: str = Field(default='', max_length=25)


class GuardianUpdateInput(Input):
    display_name: str = Field(min_length=2, max_length=100)
    phone: str = Field(default='', max_length=25)


class TherapistInput(Input):
    user_id: str = Field(min_length=1, max_length=100)


def _profile(data: ChildInput) -> dict:
    contacts = [c.model_dump() for c in data.contacts]
    if not any(c['phone'] for c in contacts):
        raise HTTPException(422, 'Add at least one family contact with a mobile number.')
    if contacts and not any(c['primary'] for c in contacts):
        contacts[0]['primary'] = True
    for c in contacts:
        c['email'] = str(c['email']).lower() if c.get('email') else ''
    label = age_label(data.date_of_birth) if data.date_of_birth else data.age_label
    return {'name': data.name, 'initials': initials(data.name), 'date_of_birth': data.date_of_birth, 'age_label': label,
            'gender': data.gender, 'school': data.school, 'concerns': data.concerns, 'communication': data.communication,
            'admin_notes': data.admin_notes, 'home_address': data.home_address, 'contacts': contacts}


async def _child(p: dict, child_id: str) -> dict:
    record = await db.children.find_one({'org_id': p['org_id'], 'id': child_id}, {'_id': 0})
    if not record:
        raise HTTPException(404, 'Child not found.')
    return record


async def _require(p: dict, action: str):
    await authorize(p, action)
    if not center_wide(p):
        raise HTTPException(403, 'Only center administration can manage child records.')


async def _people(org_id: str, ids: list[str]) -> list[dict]:
    if not ids:
        return []
    users = await db.users.find({'org_id': org_id, 'id': {'$in': ids}}, {'_id': 0, 'id': 1, 'display_name': 1, 'email': 1, 'phone': 1, 'active': 1,
                                                                         'access_profile': 1, 'last_login_at': 1}).to_list(50)
    return sorted(users, key=lambda u: u.get('display_name', ''))


async def _summary(org_id: str, children: list[dict]) -> list[dict]:
    """Add therapist names, next session and billing balance for the list view."""
    ids = [c['id'] for c in children]
    staff_ids = sorted({s for c in children for s in c.get('staff_ids', [])})
    staff = {u['id']: u['display_name'] for u in await db.users.find({'org_id': org_id, 'id': {'$in': staff_ids}}, {'_id': 0, 'id': 1, 'display_name': 1}).to_list(500)}
    upcoming = await db.appointments.find({'org_id': org_id, 'child_id': {'$in': ids}, 'status': {'$ne': 'Cancelled'},
                                           'starts_at': {'$gte': datetime.now(timezone.utc).isoformat()}},
                                          {'_id': 0, 'child_id': 1, 'starts_at': 1, 'service': 1}).sort('starts_at', 1).to_list(5000)
    nxt = {}
    for a in upcoming:
        nxt.setdefault(a['child_id'], a)
    try:
        from billing import child_balances
        balances = await child_balances(org_id, ids)
    except Exception:
        balances = {}
    result = []
    for c in children:
        primary = next((x for x in c.get('contacts', []) if x.get('primary')), (c.get('contacts') or [{}])[0])
        result.append({**{k: c.get(k) for k in ['id', 'name', 'initials', 'age_label', 'status', 'concerns', 'school', 'created_at']},
                       'status': c.get('status', 'active'), 'primary_contact': {'name': primary.get('name', ''), 'phone': primary.get('phone', '')},
                       'guardian_count': len(c.get('guardian_ids', [])), 'therapists': [staff[s] for s in c.get('staff_ids', []) if s in staff],
                       'next_session': nxt.get(c['id']), 'balance': balances.get(c['id'], 0)})
    return result


@router.get('/admin/children', response_model=Payload)
async def list_children(status: Literal['active', 'archived', 'all'] = 'active', q: str = Query('', max_length=80), p=Depends(principal)):
    await _require(p, 'children:read')
    query = {'org_id': p['org_id']}
    if status == 'active':
        query['status'] = {'$ne': 'archived'}
    elif status == 'archived':
        query['status'] = 'archived'
    children = await db.children.find(query, {'_id': 0}).sort('name', 1).to_list(2000)
    if q:
        needle = q.lower()
        children = [c for c in children if needle in c['name'].lower()
                    or any(needle in (x.get('name', '') + ' ' + x.get('phone', '') + ' ' + x.get('email', '')).lower() for x in c.get('contacts', []))]
    await audit(p, 'children:read', 'children-list')
    return {'items': await _summary(p['org_id'], children), 'counts': {
        'active': await db.children.count_documents({'org_id': p['org_id'], 'status': {'$ne': 'archived'}}),
        'archived': await db.children.count_documents({'org_id': p['org_id'], 'status': 'archived'})}}


@router.get('/admin/children/{child_id}', response_model=Payload)
async def child_detail(child_id: str, p=Depends(principal)):
    await _require(p, 'children:read')
    child = await _child(p, child_id)
    record = {k: child.get(k) for k in CHILD_FIELDS}
    record['status'] = child.get('status', 'active')
    record['guardians'] = await _people(p['org_id'], child.get('guardian_ids', []))
    record['therapists'] = await _people(p['org_id'], child.get('staff_ids', []))
    record['invitations'] = await db.invitations.find(
        {'org_id': p['org_id'], 'child_ids': child_id, 'used_at': {'$exists': False}, 'cancelled_at': {'$exists': False},
         'expires_at': {'$gt': datetime.now(timezone.utc)}},
        {'_id': 0, 'id': 1, 'email': 1, 'display_name': 1, 'created_at': 1, 'expires_at': 1, 'phone': 1}).to_list(20)
    current = datetime.now(timezone.utc).isoformat()
    fields = {'_id': 0, 'id': 1, 'starts_at': 1, 'ends_at': 1, 'service': 1, 'staff_label': 1, 'therapist_name': 1, 'mode': 1, 'room': 1,
              'status': 1, 'attendance': 1, 'duration_minutes': 1, 'version': 1}
    record['upcoming'] = await db.appointments.find({'org_id': p['org_id'], 'child_id': child_id, 'status': {'$ne': 'Cancelled'}, 'starts_at': {'$gte': current}},
                                                    fields).sort('starts_at', 1).to_list(8)
    record['recent'] = await db.appointments.find({'org_id': p['org_id'], 'child_id': child_id, 'starts_at': {'$lt': current}},
                                                  fields).sort('starts_at', -1).to_list(6)
    if child.get('enquiry_id'):
        record['enquiry'] = await db.enquiries.find_one({'org_id': p['org_id'], 'id': child['enquiry_id']}, {'_id': 0, 'reference': 1, 'service': 1, 'created_at': 1})
    try:
        from billing import child_billing_summary
        record['billing'] = await child_billing_summary(p['org_id'], child_id)
    except Exception:
        record['billing'] = None
    await audit(p, 'children:read', child_id)
    return record


@router.post('/admin/children', response_model=Payload, status_code=201)
async def create_child(data: NewChildInput, p=Depends(principal)):
    await _require(p, 'children:manage')
    enquiry = None
    if data.enquiry_id:
        enquiry = await db.enquiries.find_one({'org_id': p['org_id'], 'id': data.enquiry_id}, {'_id': 0})
        if not enquiry:
            raise HTTPException(404, 'Enquiry not found.')
        if enquiry.get('child_id'):
            raise HTTPException(409, 'This enquiry is already linked to a child record.')
    record = {'id': uid(), 'org_id': p['org_id'], **_profile(data), 'status': 'active', 'guardian_ids': [], 'staff_ids': [], 'goals': [],
              'shared_summary': '', 'enquiry_id': data.enquiry_id, 'created_at': now(), 'created_by': p['id'], 'updated_at': now(), 'version': 1}
    await db.children.insert_one(record.copy())
    if enquiry:
        await db.enquiries.update_one({'org_id': p['org_id'], 'id': enquiry['id']},
                                      {'$set': {'child_id': record['id'], 'stage': 'Enrolled', 'task.status': 'Done'}, '$inc': {'version': 1}})
    await audit(p, 'children:create', record['id'])
    return {k: record.get(k) for k in CHILD_FIELDS}


@router.patch('/admin/children/{child_id}', response_model=Payload)
async def update_child(child_id: str, data: UpdateChildInput, p=Depends(principal)):
    await _require(p, 'children:manage')
    await _child(p, child_id)
    changes = {**_profile(data), 'updated_at': now(), 'updated_by': p['id']}
    result = await db.children.update_one({'org_id': p['org_id'], 'id': child_id, 'version': data.version}, {'$set': changes, '$inc': {'version': 1}})
    if not result.matched_count:
        raise HTTPException(409, 'Someone else changed this record. Reload and try again.')
    # Keep the denormalised name on sessions and invoices in step.
    await db.appointments.update_many({'org_id': p['org_id'], 'child_id': child_id}, {'$set': {'child_name': data.name}})
    await audit(p, 'children:update', child_id)
    return await child_detail(child_id, p)


@router.post('/admin/children/{child_id}/archive', response_model=Payload)
async def archive_child(child_id: str, data: ArchiveInput, p=Depends(principal)):
    await _require(p, 'children:manage')
    await _child(p, child_id)
    future = {'org_id': p['org_id'], 'child_id': child_id, 'status': {'$ne': 'Cancelled'}, 'starts_at': {'$gte': datetime.now(timezone.utc).isoformat()}}
    upcoming = await db.appointments.count_documents(future)
    if upcoming and not data.cancel_future:
        raise HTTPException(409, f'{upcoming} upcoming session{"s are" if upcoming != 1 else " is"} still booked. Cancel them as well, or keep the record active.')
    if upcoming:
        await db.appointments.update_many(future, {'$set': {'status': 'Cancelled', 'cancelled_at': now(), 'cancelled_by': p['id'],
                                                            'cancel_reason': 'Child record archived: ' + data.reason}, '$inc': {'version': 1}})
    await db.children.update_one({'org_id': p['org_id'], 'id': child_id},
                                 {'$set': {'status': 'archived', 'archived_at': now(), 'archive_reason': data.reason, 'archived_by': p['id']}, '$inc': {'version': 1}})
    await audit(p, 'children:archive', child_id)
    return {'message': 'Record archived.' + (f' {upcoming} upcoming session(s) cancelled.' if upcoming else ''), 'cancelled': upcoming}


@router.post('/admin/children/{child_id}/restore', response_model=Payload)
async def restore_child(child_id: str, p=Depends(principal)):
    await _require(p, 'children:manage')
    await _child(p, child_id)
    await db.children.update_one({'org_id': p['org_id'], 'id': child_id}, {'$set': {'status': 'active'}, '$unset': {'archived_at': '', 'archive_reason': ''}, '$inc': {'version': 1}})
    await audit(p, 'children:restore', child_id)
    return {'message': 'Record restored.'}


@router.post('/admin/children/{child_id}/guardians', response_model=Payload, status_code=201)
async def add_guardian(child_id: str, data: GuardianInput, p=Depends(principal)):
    """Existing parent account → linked now. New email → single-use invitation (7 days)."""
    await _require(p, 'accounts:manage')
    child = await _child(p, child_id)
    if child.get('status') == 'archived':
        raise HTTPException(409, 'Restore this record before adding family members.')
    email = str(data.email).lower()
    phone = normalize_phone(data.phone)
    user = await db.users.find_one({'org_id': p['org_id'], 'email': email, 'active': True}, {'_id': 0, 'id': 1, 'role': 1, 'phone': 1, 'display_name': 1})
    if user:
        if user['role'] != 'parent':
            raise HTTPException(409, 'This email belongs to a staff or school account. Use a different email for the parent.')
        await add_care_link(p['org_id'], child_id, user['id'], 'guardian', 'admin_link')
        if phone and not user.get('phone'):
            await db.users.update_one({'org_id': p['org_id'], 'id': user['id']}, {'$set': {'phone': phone}})
        await audit(p, 'children:guardian-linked', child_id)
        return {'linked': True, 'message': f"{user['display_name']} can now see {child['name']} in their portal and app."}
    invitation = await create_invitation(p, email, data.display_name, 'guardian', [child_id], 168, phone)
    return {'linked': False, 'invitation': invitation,
            'message': 'Invitation sent. The parent sets a password from the email link (valid 7 days).' if invitation['delivery_status'] != 'not_configured'
            else 'Invitation created, but email is not set up yet: add the Gmail app password in Settings so it can be sent.'}


@router.patch('/admin/children/{child_id}/guardians/{user_id}', response_model=Payload)
async def update_guardian(child_id: str, user_id: str, data: GuardianUpdateInput, p=Depends(principal)):
    await _require(p, 'accounts:manage')
    child = await _child(p, child_id)
    if user_id not in child.get('guardian_ids', []):
        raise HTTPException(404, 'This parent is not linked to the child.')
    await db.users.update_one({'org_id': p['org_id'], 'id': user_id, 'role': 'parent'},
                              {'$set': {'display_name': data.display_name, 'phone': normalize_phone(data.phone)}})
    await audit(p, 'accounts:contact-update', user_id)
    return {'message': 'Parent details saved.'}


@router.delete('/admin/children/{child_id}/guardians/{user_id}', response_model=Payload)
async def remove_guardian(child_id: str, user_id: str, p=Depends(principal)):
    await _require(p, 'accounts:manage')
    child = await _child(p, child_id)
    if user_id not in child.get('guardian_ids', []):
        raise HTTPException(404, 'This parent is not linked to the child.')
    await remove_care_link(p['org_id'], child_id, user_id, p['id'], 'Removed from child record')
    await audit(p, 'access:revoke', child_id)
    return {'message': f"Access to {child['name']} removed. Their other children, if any, are not affected."}


@router.post('/admin/children/{child_id}/invitations/{invitation_id}/cancel', response_model=Payload)
async def cancel_invitation(child_id: str, invitation_id: str, p=Depends(principal)):
    await _require(p, 'accounts:manage')
    result = await db.invitations.update_one({'org_id': p['org_id'], 'id': invitation_id, 'child_ids': child_id, 'used_at': {'$exists': False}},
                                             {'$set': {'cancelled_at': now()}})
    if not result.matched_count:
        raise HTTPException(404, 'Invitation not found.')
    await audit(p, 'accounts:invitation-cancel', invitation_id)
    return {'message': 'Invitation cancelled.'}


@router.post('/admin/children/{child_id}/therapists', response_model=Payload, status_code=201)
async def add_therapist(child_id: str, data: TherapistInput, p=Depends(principal)):
    await _require(p, 'children:manage')
    child = await _child(p, child_id)
    staff = await db.users.find_one({'org_id': p['org_id'], 'id': data.user_id, 'role': 'staff', 'active': True, 'access_profile': {'$in': ['clinical', None]}},
                                    {'_id': 0, 'id': 1, 'display_name': 1})
    if not staff:
        raise HTTPException(422, 'Choose an active therapist account.')
    await add_care_link(p['org_id'], child_id, staff['id'], 'clinical', 'admin_assignment')
    await audit(p, 'children:therapist-assigned', child_id)
    return {'message': f"{staff['display_name']} now sees {child['name']} in their caseload."}


@router.delete('/admin/children/{child_id}/therapists/{user_id}', response_model=Payload)
async def remove_therapist(child_id: str, user_id: str, p=Depends(principal)):
    await _require(p, 'children:manage')
    child = await _child(p, child_id)
    if user_id not in child.get('staff_ids', []):
        raise HTTPException(404, 'This therapist is not assigned to the child.')
    upcoming = await db.appointments.count_documents({'org_id': p['org_id'], 'child_id': child_id, 'therapist_id': user_id, 'status': {'$ne': 'Cancelled'},
                                                      'starts_at': {'$gte': datetime.now(timezone.utc).isoformat()}})
    if upcoming:
        raise HTTPException(409, f'{upcoming} upcoming session(s) are booked with this therapist. Move or cancel them first.')
    await remove_care_link(p['org_id'], child_id, user_id, p['id'], 'Therapist unassigned')
    await audit(p, 'children:therapist-removed', child_id)
    return {'message': 'Therapist removed from this child.'}


@router.get('/admin/staff', response_model=Payload)
async def staff_directory(p=Depends(principal)):
    """Therapists and other staff, for pickers and the availability editor."""
    await authorize(p, 'children:read')
    if not center_wide(p):
        raise HTTPException(403, 'Only center administration can see the staff list.')
    users = await db.users.find({'org_id': p['org_id'], 'role': 'staff', 'active': True},
                                {'_id': 0, 'id': 1, 'display_name': 1, 'email': 1, 'phone': 1, 'access_profile': 1, 'availability': 1, 'services': 1}).sort('display_name', 1).to_list(300)
    counts = {}
    async for c in db.children.find({'org_id': p['org_id'], 'status': {'$ne': 'archived'}}, {'_id': 0, 'staff_ids': 1}):
        for s in c.get('staff_ids', []):
            counts[s] = counts.get(s, 0) + 1
    for u in users:
        u['caseload'] = counts.get(u['id'], 0)
        u['therapist'] = u.get('access_profile') in (None, 'clinical')
    return {'items': users}
