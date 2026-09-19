import secrets
from datetime import datetime, timezone, timedelta
from typing import Literal

import bcrypt
import pyotp
from fastapi import APIRouter, Depends, HTTPException, Request, Response
from pydantic import EmailStr, Field
from pymongo import ReturnDocument

from config import APP_MODE, WEB_ORIGIN, Input, Payload, db, now, uid
from jobs import enqueue_email
from security import audit, cookie, digest, principal, rate_limit, sandbox
from seed import seed_demo
from vault import decrypt_secret, encrypt_secret


router = APIRouter()


class DemoInput(Input):
    role: Literal['parent', 'staff', 'admin']


class LoginInput(Input):
    email: EmailStr
    password: str = Field(min_length=1, max_length=72)


class InviteAcceptInput(Input):
    token: str = Field(min_length=32, max_length=500)
    display_name: str = Field(min_length=2, max_length=100)
    password: str = Field(min_length=12, max_length=72)


class ForgotInput(Input):
    email: EmailStr


class ResetInput(Input):
    token: str = Field(min_length=32, max_length=500)
    password: str = Field(min_length=12, max_length=72)


class MfaCodeInput(Input):
    code: str = Field(min_length=6, max_length=24)


class MfaLoginInput(MfaCodeInput):
    challenge_token: str = Field(min_length=32, max_length=500)


def _valid_password(value: str):
    if not any(char.islower() for char in value) or not any(char.isupper() for char in value) or not any(char.isdigit() for char in value):
        raise HTTPException(422, 'Use at least 12 characters with uppercase, lowercase and a number.')


def _user_payload(user: dict, csrf: str = '') -> dict:
    return {key: user.get(key) for key in ['id', 'display_name', 'email', 'role', 'roles', 'access_profile', 'mfa_enabled', 'mfa_required']} | {
        'csrf': csrf, 'demo': APP_MODE == 'demo', 'mfa_setup_required': bool(user.get('mfa_required') and not user.get('mfa_enabled')),
    }


async def start_session(user: dict, request: Request, response: Response, mfa_verified: bool = False):
    raw = secrets.token_urlsafe(48)
    csrf = secrets.token_urlsafe(32)
    record = {
        'id': uid(), 'token_hash': digest(raw), 'user_id': user['id'], 'org_id': user['org_id'], 'csrf': csrf,
        'security_version': user.get('security_version', 1), 'mfa_verified': mfa_verified or not user.get('mfa_required'),
        'created_at': now(), 'last_seen_at': now(), 'client_label': request.headers.get('user-agent', 'Unknown device')[:180],
        'ip_hash': digest(request.client.host if request.client else 'unknown'),
        'expires_at': datetime.now(timezone.utc) + timedelta(hours=8),
    }
    await db.sessions.insert_one(record.copy())
    cookie(response, 'mnc_session', raw, 8 * 3600)
    await audit(user, 'auth:login', user['id'])
    return _user_payload(user, csrf)


async def _find_login_user(email: str, org_id: str):
    query = {'email': str(email).lower(), 'active': True}
    if APP_MODE == 'demo':
        query['org_id'] = org_id
    users = await db.users.find(query, {'_id': 0}).limit(2).to_list(2)
    if len(users) != 1:
        return None
    return users[0]


@router.post('/auth/demo', response_model=Payload)
async def demo(data: DemoInput, request: Request, response: Response, space=Depends(sandbox)):
    if APP_MODE != 'demo':
        raise HTTPException(404)
    await rate_limit('demo:' + space['org_id'], 60)
    await seed_demo(space['org_id'])
    user = await db.users.find_one({'org_id': space['org_id'], 'role': data.role, 'active': True}, {'_id': 0, 'password_hash': 0})
    return await start_session(user, request, response)


@router.post('/auth/login', response_model=Payload)
async def login(data: LoginInput, request: Request, response: Response, space=Depends(sandbox)):
    identifier = digest(f'{request.client.host if request.client else "unknown"}:{str(data.email).lower()}')
    await rate_limit('login:' + identifier, 8)
    user = await _find_login_user(data.email, space['org_id'])
    try:
        valid = bool(user and bcrypt.checkpw(data.password.encode(), user['password_hash'].encode()))
    except (ValueError, TypeError):
        valid = False
    if not valid:
        raise HTTPException(401, 'Email or password not recognized.')
    if user.get('mfa_enabled'):
        raw = secrets.token_urlsafe(40)
        await db.mfa_challenges.insert_one({'id': uid(), 'token_hash': digest(raw), 'user_id': user['id'], 'org_id': user['org_id'],
                                            'attempts': 0, 'created_at': now(), 'expires_at': datetime.now(timezone.utc) + timedelta(minutes=5)})
        return {'mfa_required': True, 'challenge_token': raw, 'display_name': user['display_name']}
    return await start_session(user, request, response)


@router.post('/auth/mfa/verify-login', response_model=Payload)
async def verify_mfa_login(data: MfaLoginInput, request: Request, response: Response):
    challenge = await db.mfa_challenges.find_one_and_update(
        {'token_hash': digest(data.challenge_token), 'expires_at': {'$gt': datetime.now(timezone.utc)}, 'used_at': {'$exists': False}, 'attempts': {'$lt': 6}},
        {'$inc': {'attempts': 1}}, return_document=ReturnDocument.AFTER,
    )
    if not challenge:
        raise HTTPException(401, 'This verification request expired. Sign in again.')
    user = await db.users.find_one({'id': challenge['user_id'], 'org_id': challenge['org_id'], 'active': True}, {'_id': 0})
    code = data.code.replace(' ', '').replace('-', '')
    secret = decrypt_secret(user.get('mfa_secret', ''))
    valid_totp = bool(secret and pyotp.TOTP(secret).verify(code, valid_window=1))
    recovery_hash = digest(code.upper())
    valid_recovery = recovery_hash in user.get('mfa_recovery_hashes', [])
    if not valid_totp and not valid_recovery:
        raise HTTPException(401, 'Verification code not recognized.')
    if valid_recovery:
        await db.users.update_one({'id': user['id'], 'org_id': user['org_id']}, {'$pull': {'mfa_recovery_hashes': recovery_hash}})
    await db.mfa_challenges.update_one({'id': challenge['id']}, {'$set': {'used_at': now()}})
    return await start_session(user, request, response, mfa_verified=True)


@router.get('/auth/invitations/{token}', response_model=Payload)
async def invitation_details(token: str):
    record = await db.invitations.find_one({'token_hash': digest(token), 'expires_at': {'$gt': datetime.now(timezone.utc)}, 'used_at': {'$exists': False}, 'cancelled_at': {'$exists': False}}, {'_id': 0})
    if not record:
        raise HTTPException(404, 'This invitation is invalid or has expired.')
    return {key: record[key] for key in ['email', 'display_name', 'role', 'access_profile', 'expires_at']}


@router.post('/auth/invitations/accept', response_model=Payload)
async def accept_invitation(data: InviteAcceptInput, request: Request, response: Response):
    _valid_password(data.password)
    invitation = await db.invitations.find_one_and_update(
        {'token_hash': digest(data.token), 'expires_at': {'$gt': datetime.now(timezone.utc)}, 'used_at': {'$exists': False}, 'cancelled_at': {'$exists': False}},
        {'$set': {'used_at': now()}}, return_document=ReturnDocument.BEFORE,
    )
    if not invitation:
        raise HTTPException(404, 'This invitation is invalid, expired or already used.')
    if await db.users.find_one({'org_id': invitation['org_id'], 'email': invitation['email']}, {'_id': 0, 'id': 1}):
        raise HTTPException(409, 'An account already exists for this email.')
    user = {
        'id': uid(), 'org_id': invitation['org_id'], 'email': invitation['email'], 'display_name': data.display_name,
        'role': invitation['role'], 'roles': [invitation['role']], 'access_profile': invitation['access_profile'],
        'password_hash': bcrypt.hashpw(data.password.encode(), bcrypt.gensalt()).decode(), 'active': True,
        'mfa_required': invitation['access_profile'] in {'clinical', 'reception', 'finance', 'administrator'},
        'mfa_enabled': False, 'security_version': 1, 'created_at': now(), 'invitation_id': invitation['id'],
    }
    await db.users.insert_one(user.copy())
    field = 'guardian_ids' if invitation['role'] == 'parent' else 'staff_ids'
    for child_id in invitation.get('child_ids', []):
        await db.children.update_one({'org_id': invitation['org_id'], 'id': child_id}, {'$addToSet': {field: user['id']}, '$inc': {'version': 1}})
        grant = {'id': uid(), 'org_id': invitation['org_id'], 'user_id': user['id'], 'child_id': child_id,
                 'relationship': 'guardian' if invitation['role'] == 'parent' else invitation['access_profile'],
                 'status': 'active', 'verified_at': now(), 'verification_method': 'accepted_invitation', 'created_at': now(), 'version': 1}
        await db.access_grants.insert_one(grant)
    await audit(user, 'auth:invitation-accepted', invitation['id'])
    return await start_session(user, request, response)


@router.post('/auth/forgot-password', response_model=Payload)
async def forgot_password(data: ForgotInput, request: Request, space=Depends(sandbox)):
    await rate_limit('recovery:' + digest(f'{request.client.host if request.client else "unknown"}:{str(data.email).lower()}'), 5)
    user = await _find_login_user(data.email, space['org_id'])
    raw = ''
    if user:
        raw = secrets.token_urlsafe(40)
        record = {'id': uid(), 'org_id': user['org_id'], 'user_id': user['id'], 'token_hash': digest(raw), 'created_at': now(),
                  'expires_at': datetime.now(timezone.utc) + timedelta(hours=1)}
        await db.password_reset_tokens.insert_one(record.copy())
        link = f'{WEB_ORIGIN}/reset-password?token={raw}'
        await enqueue_email(user['org_id'], user['email'], 'Reset your Moonlight portal password',
                            f'A password reset was requested for your Moonlight portal account.\n\nUse this single-use link within one hour:\n{link}\n\nIf you did not request this, ignore this email.',
                            f'password-reset:{record["id"]}')
        await audit(user, 'auth:password-reset-requested', user['id'])
    result = {'message': 'If an active account matches that email, a reset link will be sent.'}
    if APP_MODE == 'demo' and raw:
        result['demo_reset_token'] = raw
    return result


@router.post('/auth/reset-password', response_model=Payload)
async def reset_password(data: ResetInput):
    _valid_password(data.password)
    token = await db.password_reset_tokens.find_one_and_update(
        {'token_hash': digest(data.token), 'expires_at': {'$gt': datetime.now(timezone.utc)}, 'used_at': {'$exists': False}},
        {'$set': {'used_at': now()}}, return_document=ReturnDocument.BEFORE,
    )
    if not token:
        raise HTTPException(404, 'This reset link is invalid, expired or already used.')
    user = await db.users.find_one({'id': token['user_id'], 'org_id': token['org_id'], 'active': True}, {'_id': 0})
    if not user:
        raise HTTPException(404, 'Account not found.')
    await db.users.update_one({'id': user['id'], 'org_id': user['org_id']}, {'$set': {'password_hash': bcrypt.hashpw(data.password.encode(), bcrypt.gensalt()).decode(), 'password_changed_at': now()}, '$inc': {'security_version': 1}})
    await db.sessions.delete_many({'user_id': user['id'], 'org_id': user['org_id']})
    await audit(user, 'auth:password-reset', user['id'])
    return {'message': 'Password updated. Sign in again on all devices.'}


@router.post('/auth/mfa/setup', response_model=Payload)
async def setup_mfa(p=Depends(principal)):
    if p.get('access_profile') == 'guardian' or p['role'] == 'parent':
        raise HTTPException(403, 'MFA enrollment is currently for staff and administrators.')
    secret = pyotp.random_base32()
    await db.users.update_one({'id': p['id'], 'org_id': p['org_id']}, {'$set': {'mfa_pending_secret': encrypt_secret(secret)}})
    uri = pyotp.TOTP(secret).provisioning_uri(name=p['email'], issuer_name='Moonlight Neurocare')
    await audit(p, 'auth:mfa-setup-started', p['id'])
    return {'secret': secret, 'otpauth_uri': uri, 'message': 'Add this key to your authenticator, then confirm a code.'}


@router.post('/auth/mfa/confirm', response_model=Payload)
async def confirm_mfa(data: MfaCodeInput, p=Depends(principal)):
    user = await db.users.find_one({'id': p['id'], 'org_id': p['org_id']}, {'_id': 0})
    secret = decrypt_secret(user.get('mfa_pending_secret', ''))
    if not secret or not pyotp.TOTP(secret).verify(data.code.replace(' ', ''), valid_window=1):
        raise HTTPException(422, 'Authenticator code not recognized.')
    recovery = [secrets.token_hex(5).upper() for _ in range(8)]
    await db.users.update_one({'id': p['id'], 'org_id': p['org_id']}, {'$set': {'mfa_secret': encrypt_secret(secret), 'mfa_enabled': True,
                              'mfa_confirmed_at': now(), 'mfa_recovery_hashes': [digest(code) for code in recovery]}, '$unset': {'mfa_pending_secret': ''}})
    await db.sessions.update_one({'token_hash': p['session_hash']}, {'$set': {'mfa_verified': True}})
    await audit(p, 'auth:mfa-enabled', p['id'])
    return {'message': 'Multi-factor authentication enabled.', 'recovery_codes': recovery}


@router.get('/auth/me', response_model=Payload)
async def me(p=Depends(principal)):
    return _user_payload(p, p['csrf'])


@router.get('/auth/sessions', response_model=Payload)
async def sessions(p=Depends(principal)):
    records = await db.sessions.find({'user_id': p['id'], 'org_id': p['org_id'], 'expires_at': {'$gt': datetime.now(timezone.utc)}},
                                     {'_id': 0, 'id': 1, 'created_at': 1, 'last_seen_at': 1, 'client_label': 1, 'expires_at': 1}).to_list(50)
    for record in records:
        record['current'] = record['id'] == p.get('session_id')
    return {'items': records}


@router.delete('/auth/sessions/{session_id}', response_model=Payload)
async def revoke_session(session_id: str, p=Depends(principal)):
    if session_id == p.get('session_id'):
        raise HTTPException(422, 'Use sign out to end your current session.')
    await db.sessions.delete_one({'id': session_id, 'user_id': p['id'], 'org_id': p['org_id']})
    await audit(p, 'auth:session-revoked', session_id)
    return {'message': 'Session revoked.'}


@router.post('/auth/sessions/revoke-others', response_model=Payload)
async def revoke_other_sessions(p=Depends(principal)):
    await db.sessions.delete_many({'user_id': p['id'], 'org_id': p['org_id'], 'id': {'$ne': p.get('session_id')}})
    await audit(p, 'auth:sessions-revoked', p['id'])
    return {'message': 'Other sessions revoked.'}


@router.post('/auth/logout', response_model=Payload)
async def logout(response: Response, p=Depends(principal)):
    await db.sessions.delete_one({'token_hash': p['session_hash']})
    response.delete_cookie('mnc_session', path='/', secure=True, httponly=True, samesite='lax')
    return {'message': 'Signed out.'}