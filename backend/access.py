import secrets
from datetime import datetime, timezone, timedelta
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException
from pydantic import EmailStr, Field

from config import APP_MODE, WEB_ORIGIN, Input, Payload, db, now, uid
from jobs import enqueue_email
from center import normalize_phone
from security import ScopedRepo, audit, authorize, digest, principal


router = APIRouter()
PROFILE_ROLE = {'guardian': 'parent', 'clinical': 'staff', 'reception': 'staff', 'finance': 'staff', 'administrator': 'admin'}


class InvitationInput(Input):
    email: EmailStr
    display_name: str = Field(min_length=2, max_length=100)
    access_profile: Literal['guardian', 'clinical', 'reception', 'finance', 'administrator']
    child_ids: list[str] = Field(default_factory=list, max_length=50)
    expires_hours: int = Field(default=72, ge=1, le=168)
    phone: str = Field(default='', max_length=25)


class DeactivateInput(Input):
    reason: str = Field(min_length=3, max_length=300)


@router.get('/admin/access', response_model=Payload)
async def access_overview(p=Depends(principal)):
    await authorize(p, 'accounts:manage')
    users = await db.users.find({'org_id': p['org_id']}, {'_id': 0, 'password_hash': 0, 'mfa_secret': 0, 'mfa_pending_secret': 0, 'mfa_recovery_hashes': 0}).sort('display_name', 1).to_list(500)
    invites = await db.invitations.find({'org_id': p['org_id']}, {'_id': 0, 'token_hash': 0}).sort('created_at', -1).limit(100).to_list(100)
    grants = await db.access_grants.find({'org_id': p['org_id']}, {'_id': 0}).to_list(1000)
    await audit(p, 'accounts:manage', 'access-overview')
    return {'users': users, 'invitations': invites, 'grants': grants}


async def create_invitation(p: dict, email: str, display_name: str, access_profile: str, child_ids: list[str],
                            expires_hours: int = 72, phone: str = '') -> dict:
    """Single-use invitation shared by the Accounts page and a child's record."""
    email = email.lower()
    if await db.users.find_one({'org_id': p['org_id'], 'email': email, 'active': True}, {'_id': 0, 'id': 1}):
        raise HTTPException(409, 'An active account already uses this email.')
    child_ids = list(dict.fromkeys(child_ids))
    if access_profile in {'guardian', 'clinical'}:
        found = await db.children.find({'org_id': p['org_id'], 'id': {'$in': child_ids}}, {'_id': 0, 'id': 1}).to_list(100)
        if len(found) != len(child_ids) or not child_ids:
            raise HTTPException(422, 'Select at least one valid child for guardian or clinical access.')
    else:
        child_ids = []
    await db.invitations.update_many({'org_id': p['org_id'], 'email': email, 'used_at': {'$exists': False}}, {'$set': {'cancelled_at': now()}})
    raw = secrets.token_urlsafe(40)
    record = {'id': uid(), 'org_id': p['org_id'], 'email': email, 'display_name': display_name,
              'role': PROFILE_ROLE[access_profile], 'access_profile': access_profile, 'child_ids': child_ids, 'phone': normalize_phone(phone),
              'token_hash': digest(raw), 'created_by': p['id'], 'created_at': now(),
              'expires_at': datetime.now(timezone.utc) + timedelta(hours=expires_hours)}
    await db.invitations.insert_one(record.copy())
    link = f'{WEB_ORIGIN}/accept-invite?token={raw}'
    job = await enqueue_email(p['org_id'], email, 'Your Moonlight Neurocare portal invitation',
                              f'You have been invited to the Moonlight Neurocare portal.\n\nUse this single-use link within {expires_hours} hours:\n{link}\n\n'
                              'You can also use the Moonlight Neurocare app with the same email and password.\n\n'
                              'If you were not expecting this invitation, contact the center.',
                              f'invitation:{record["id"]}')
    await audit(p, 'accounts:invite', record['id'])
    result = {key: record[key] for key in ['id', 'email', 'display_name', 'role', 'access_profile', 'child_ids', 'created_at', 'expires_at', 'phone']}
    result['delivery_status'] = job['status']
    if APP_MODE == 'demo':
        result['demo_invitation_token'] = raw
    return result


@router.post('/admin/invitations', response_model=Payload, status_code=201)
async def invite_user(data: InvitationInput, p=Depends(principal)):
    await authorize(p, 'accounts:manage')
    return await create_invitation(p, str(data.email), data.display_name, data.access_profile, data.child_ids, data.expires_hours, data.phone)


async def deactivate_account(p: dict, user_id: str, reason: str) -> dict:
    """Turn off an account: sign-in, sessions and child links end; records the center must keep stay."""
    user = await db.users.find_one({'org_id': p['org_id'], 'id': user_id}, {'_id': 0})
    if not user:
        raise HTTPException(404, 'Account not found.')
    await db.users.update_one({'org_id': p['org_id'], 'id': user_id}, {'$set': {'active': False, 'deactivated_at': now(), 'deactivation_reason': reason}, '$inc': {'security_version': 1}})
    await db.sessions.delete_many({'org_id': p['org_id'], 'user_id': user_id})
    await db.access_grants.update_many({'org_id': p['org_id'], 'user_id': user_id, 'status': 'active'}, {'$set': {'status': 'revoked', 'revoked_at': now(), 'revoked_by': p['id'], 'reason': reason}})
    await db.children.update_many({'org_id': p['org_id']}, {'$pull': {'guardian_ids': user_id, 'staff_ids': user_id}})
    await audit(p, 'accounts:deactivate', user_id)
    return user


@router.post('/admin/users/{user_id}/deactivate', response_model=Payload)
async def deactivate_user(user_id: str, data: DeactivateInput, p=Depends(principal)):
    await authorize(p, 'accounts:manage')
    if user_id == p['id']:
        raise HTTPException(422, 'You cannot deactivate your own active account.')
    await deactivate_account(p, user_id, data.reason)
    return {'message': 'Account deactivated and all active sessions revoked.'}


@router.post('/admin/access-grants/{grant_id}/revoke', response_model=Payload)
async def revoke_access_grant(grant_id: str, data: DeactivateInput, p=Depends(principal)):
    await authorize(p, 'accounts:manage')
    grant = await db.access_grants.find_one({'org_id': p['org_id'], 'id': grant_id, 'status': 'active'}, {'_id': 0})
    if not grant:
        raise HTTPException(404, 'Active access grant not found.')
    await db.access_grants.update_one({'org_id': p['org_id'], 'id': grant_id}, {'$set': {'status': 'revoked', 'revoked_at': now(), 'revoked_by': p['id'], 'reason': data.reason}, '$inc': {'version': 1}})
    field = 'guardian_ids' if grant['relationship'] == 'guardian' else 'staff_ids'
    await db.children.update_one({'org_id': p['org_id'], 'id': grant['child_id']}, {'$pull': {field: grant['user_id']}, '$inc': {'version': 1}})
    await db.sessions.delete_many({'org_id': p['org_id'], 'user_id': grant['user_id']})
    await audit(p, 'access:revoke', grant_id)
    return {'message': 'Child access revoked and active sessions ended.'}

# Account deletion (Google Play requires an in-app way and a web page to ask for it).
class DeletionRequestInput(Input):
    reason: str = Field(default='', max_length=500)


class DeletionDecisionInput(Input):
    note: str = Field(default='', max_length=300)


def _deletion_view(r: dict | None) -> dict | None:
    return {k: r.get(k) for k in ['id', 'status', 'created_at', 'completed_at', 'reason', 'note', 'user_id', 'display_name', 'email', 'role']} if r else None


@router.get('/account/deletion-request', response_model=Payload)
async def my_deletion_request(p=Depends(principal)):
    r = await db.deletion_requests.find_one({'org_id': p['org_id'], 'user_id': p['id'], 'status': 'open'}, {'_id': 0})
    return {'request': _deletion_view(r)}


@router.post('/account/deletion-request', response_model=Payload, status_code=201)
async def request_deletion(data: DeletionRequestInput, p=Depends(principal)):
    existing = await db.deletion_requests.find_one({'org_id': p['org_id'], 'user_id': p['id'], 'status': 'open'}, {'_id': 0})
    if existing:
        return {'request': _deletion_view(existing), 'message': 'Your request is already with the center.'}
    record = {'id': uid(), 'org_id': p['org_id'], 'user_id': p['id'], 'display_name': p.get('display_name', ''), 'email': p.get('email', ''),
              'role': p.get('role', ''), 'reason': data.reason.strip(), 'status': 'open', 'created_at': now()}
    await db.deletion_requests.insert_one(record.copy())
    await audit(p, 'account:deletion-request', record['id'])
    admins = await db.users.find({'org_id': p['org_id'], 'active': True, 'role': 'admin'}, {'_id': 0, 'email': 1}).to_list(20)
    body = f"{record['display_name']} ({record['email']}, {record['role']}) asked for their Moonlight Neurocare account to be deleted.\n"
    if record['reason']:
        body += f"Reason: {record['reason']}\n"
    body += '\nOpen Admin > Accounts & consent to complete it.'
    for a in admins:
        await enqueue_email(p['org_id'], a['email'], 'Account deletion request', body, f"deletion-request:{record['id']}:{a['email']}")
    if record['email']:
        await enqueue_email(p['org_id'], record['email'], 'We received your account deletion request',
                            'The center has your request to delete your Moonlight Neurocare account. It is usually completed within 7 days, '
                            'and you will get an email when it is done. If you did not ask for this, contact the center.',
                            f"deletion-received:{record['id']}")
    return {'request': _deletion_view(record), 'message': 'Request sent. The center will confirm by email when your account is deleted.'}


@router.delete('/account/deletion-request', response_model=Payload)
async def cancel_deletion(p=Depends(principal)):
    res = await db.deletion_requests.update_many({'org_id': p['org_id'], 'user_id': p['id'], 'status': 'open'}, {'$set': {'status': 'cancelled', 'completed_at': now()}})
    if res.modified_count:
        await audit(p, 'account:deletion-cancel', p['id'])
    return {'message': 'Request cancelled. Your account stays as it is.'}


@router.get('/admin/deletion-requests', response_model=Payload)
async def deletion_requests(p=Depends(principal)):
    await authorize(p, 'accounts:manage')
    items = await db.deletion_requests.find({'org_id': p['org_id']}, {'_id': 0}).sort('created_at', -1).to_list(200)
    return {'items': [_deletion_view(r) for r in items]}


@router.post('/admin/deletion-requests/{request_id}/complete', response_model=Payload)
async def complete_deletion(request_id: str, data: DeletionDecisionInput, p=Depends(principal)):
    await authorize(p, 'accounts:manage')
    r = await db.deletion_requests.find_one({'org_id': p['org_id'], 'id': request_id, 'status': 'open'}, {'_id': 0})
    if not r:
        raise HTTPException(404, 'Open request not found.')
    if r['user_id'] == p['id']:
        raise HTTPException(422, 'Another administrator must delete your own account.')
    await deactivate_account(p, r['user_id'], 'Deleted at the account holder\'s request')
    # Remove sign-in details (the email can be invited again later); the name stays on records the center must keep.
    await db.users.update_one({'org_id': p['org_id'], 'id': r['user_id']},
                              {'$set': {'phone': '', 'email': f"deleted-{r['user_id']}@deleted.invalid", 'deleted_at': now(), 'password_hash': '', 'mfa_enabled': False},
                               '$unset': {'mfa_secret': '', 'mfa_pending_secret': '', 'mfa_recovery_hashes': ''}})
    await db.invitations.update_many({'org_id': p['org_id'], 'email': r['email'], 'used_at': {'$exists': False}}, {'$set': {'cancelled_at': now()}})
    await db.deletion_requests.update_one({'org_id': p['org_id'], 'id': request_id},
                                          {'$set': {'status': 'done', 'completed_at': now(), 'completed_by': p['id'], 'note': data.note.strip()}})
    await audit(p, 'account:deletion-complete', request_id)
    if r.get('email'):
        await enqueue_email(p['org_id'], r['email'], 'Your Moonlight Neurocare account has been deleted',
                            'Your account has been deleted and can no longer be used to sign in to the portal or the app. '
                            'Records the center must keep by law, such as invoices and clinical notes, are kept for the period the law requires.',
                            f'deletion-done:{request_id}')
    return {'message': 'Account deleted: sign-in removed, sessions ended, child links removed.'}
