import hashlib
import secrets
from datetime import datetime, timezone, timedelta
from fastapi import Request, Response, HTTPException, Depends
from config import db, now, uid


def digest(token):
    return hashlib.sha256(token.encode()).hexdigest()


def cookie(response, name, value, age):
    response.set_cookie(name, value, max_age=age, httponly=True, secure=True, samesite='lax', path='/')


async def sandbox(request: Request, response: Response):
    raw = request.cookies.get('mnc_demo', '')
    record = await db.sandboxes.find_one({'token_hash': digest(raw)}, {'_id': 0}) if raw else None
    if not record:
        raw = secrets.token_urlsafe(32)
        record = {'id': uid(), 'org_id': uid(), 'token_hash': digest(raw), 'created_at': now()}
        await db.sandboxes.insert_one(record.copy())
        cookie(response, 'mnc_demo', raw, 86400)
    return record


async def principal(request: Request):
    raw = request.cookies.get('mnc_session', '')
    session = await db.sessions.find_one({'token_hash': digest(raw), 'expires_at': {'$gt': datetime.now(timezone.utc)}}, {'_id': 0})
    if not session:
        raise HTTPException(401, 'Please sign in to continue.')
    user = await db.users.find_one({'id': session['user_id'], 'org_id': session['org_id'], 'active': True}, {'_id': 0, 'password_hash': 0})
    if not user:
        raise HTTPException(401, 'Your access has been revoked.')
    if request.method not in {'GET', 'HEAD', 'OPTIONS'} and not secrets.compare_digest(request.headers.get('x-csrf-token', ''), session['csrf']):
        raise HTTPException(403, 'Your security token is invalid. Refresh and try again.')
    return {**user, 'csrf': session['csrf'], 'session_hash': session['token_hash']}


PERMISSIONS = {
    'parent': {'children:read', 'appointments:read', 'requests:create', 'activities:read', 'activities:update', 'announcements:read', 'practice_videos:read', 'practice_videos:view'},
    'staff': {'children:read', 'appointments:read', 'activities:read', 'announcements:read', 'attendance:update', 'practice_videos:read', 'practice_videos:create', 'practice_videos:update', 'practice_videos:delete'},
    'admin': {'children:read', 'appointments:read', 'enquiries:read', 'enquiries:update', 'requests:read', 'requests:update', 'settings:read', 'settings:update', 'audit:read', 'access:revoke', 'practice_videos:read', 'practice_videos:create', 'practice_videos:update', 'practice_videos:delete'}
}


async def audit(p, action, resource_id, result='allowed'):
    await db.audit.insert_one({'id': uid(), 'org_id': p['org_id'], 'actor_id': p['id'], 'action': action, 'resource_id': resource_id, 'result': result, 'created_at': now()})


async def authorize(p, action, resource=None):
    if resource and resource.get('org_id') != p['org_id']:
        await audit(p, action, resource.get('id'), 'not_visible')
        raise HTTPException(404, 'Record not found.')
    if action not in PERMISSIONS.get(p['role'], set()):
        await audit(p, action, resource.get('id') if resource else None, 'forbidden')
        raise HTTPException(403, 'This workspace does not have permission for that action.')


class ScopedRepo:
    """All operational reads/writes are tenant-scoped; child predicates are applied before pagination."""
    def __init__(self, p):
        self.p = p

    async def scope(self, collection, action):
        await authorize(self.p, action)
        query = {'org_id': self.p['org_id']}
        if collection in {'children', 'appointments', 'activities', 'announcements', 'practice_videos'} and self.p['role'] != 'admin':
            field = 'guardian_ids' if self.p['role'] == 'parent' else 'staff_ids'
            children = await db.children.find({'org_id': self.p['org_id'], field: self.p['id']}, {'_id': 0, 'id': 1}).to_list(1000)
            query['id' if collection == 'children' else 'child_id'] = {'$in': [c['id'] for c in children]}
        if collection == 'practice_videos':
            query['is_deleted'] = {'$ne': True}
        return query

    async def list(self, collection, action, fields=None, limit=100, offset=0):
        query = await self.scope(collection, action)
        projection = {'_id': 0, **({f: 1 for f in fields} if fields else {})}
        records = await db[collection].find(query, projection).skip(offset).limit(limit).to_list(limit)
        await audit(self.p, action, collection)
        return records

    async def one(self, collection, action, record_id):
        query = await self.scope(collection, action)
        query = {'$and': [query, {'id': record_id}]}
        record = await db[collection].find_one(query, {'_id': 0})
        if not record:
            await audit(self.p, action, record_id, 'not_visible')
            raise HTTPException(404, 'Record not found.')
        await authorize(self.p, action, record)
        await audit(self.p, action, record_id)
        return record

    async def update(self, collection, action, record_id, changes, version=None):
        record = await self.one(collection, action, record_id)
        query = {'org_id': self.p['org_id'], 'id': record_id}
        if version is not None:
            query['version'] = version
        result = await db[collection].update_one(query, {'$set': changes, '$inc': {'version': 1}})
        if not result.matched_count:
            raise HTTPException(409, 'This record changed. Refresh before trying again.')
        return {**record, **changes, 'version': record.get('version', 0) + 1}


async def rate_limit(key, max_attempts=20):
    window = int(datetime.now(timezone.utc).timestamp()) // 600
    result = await db.rate_limits.find_one_and_update({'_id': f'{digest(key)}:{window}'}, {'$inc': {'count': 1}}, upsert=True, return_document=True)
    if result['count'] > max_attempts:
        raise HTTPException(429, 'Too many attempts. Please try again in 10 minutes.')