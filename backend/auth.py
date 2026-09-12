import secrets
import bcrypt
from typing import Literal
from datetime import datetime, timezone, timedelta
from fastapi import APIRouter, Depends, Request, Response, HTTPException
from pydantic import Field
from config import db, Input, Payload, APP_MODE
from security import sandbox, principal, cookie, digest, rate_limit, audit
from seed import seed_demo

router = APIRouter()


class DemoInput(Input):
    role: Literal['parent', 'staff', 'admin']


class LoginInput(Input):
    email: str = Field(min_length=3, max_length=254)
    password: str = Field(min_length=1, max_length=72)


async def start_session(user, request, response):
    old = request.cookies.get('mnc_session')
    if old:
        await db.sessions.delete_one({'token_hash': digest(old)})
    raw = secrets.token_urlsafe(48)
    csrf = secrets.token_urlsafe(32)
    await db.sessions.insert_one({'token_hash': digest(raw), 'user_id': user['id'], 'org_id': user['org_id'], 'csrf': csrf, 'expires_at': datetime.now(timezone.utc) + timedelta(hours=8)})
    cookie(response, 'mnc_session', raw, 8 * 3600)
    await audit(user, 'auth:login', user['id'])
    return {'id': user['id'], 'display_name': user['display_name'], 'role': user['role'], 'roles': user['roles'], 'csrf': csrf, 'demo': True}


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
    await rate_limit('login:' + space['org_id'], 8)
    user = await db.users.find_one({'email': data.email.lower(), 'org_id': space['org_id'], 'active': True}, {'_id': 0})
    valid = user and bcrypt.checkpw(data.password.encode(), user['password_hash'].encode())
    if not valid:
        raise HTTPException(401, 'Email or password not recognized. Demo access is available below.')
    return await start_session(user, request, response)


@router.get('/auth/me', response_model=Payload)
async def me(p=Depends(principal)):
    return {key: p[key] for key in ['id', 'display_name', 'role', 'roles', 'csrf']} | {'demo': True}


@router.post('/auth/logout', response_model=Payload)
async def logout(response: Response, p=Depends(principal)):
    await db.sessions.delete_one({'token_hash': p['session_hash']})
    response.delete_cookie('mnc_session', path='/', secure=True, httponly=True, samesite='lax')
    return {'message': 'Signed out.'}