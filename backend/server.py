from contextlib import asynccontextmanager
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
import logging
from config import db, client, ALLOWED_ORIGINS
from storage import init_storage
from public import router as public_router
from auth import router as auth_router
from workspace import router as workspace_router
from admin import router as admin_router
from practice import router as practice_router
from home_plans import router as home_plans_router
from access import router as access_router
from consents import router as consents_router
from operations import router as operations_router
from jobs import notification_worker
from media_processing import media_worker
from migrations import up as migrate_up
import asyncio


@asynccontextmanager
async def lifespan(app):
    await migrate_up()
    await db.sessions.create_index('token_hash', unique=True)
    await db.sessions.create_index('expires_at', expireAfterSeconds=0)
    await db.sandboxes.create_index('token_hash', unique=True)
    await db.users.create_index([('org_id', 1), ('email', 1)], unique=True)
    await db.enquiries.create_index([('org_id', 1), ('idempotency_key', 1)], unique=True)
    for collection in ['children', 'appointments', 'activities', 'announcements', 'requests', 'audit', 'enquiries', 'practice_videos', 'home_plans']:
        await db[collection].create_index([('org_id', 1), ('id', 1)], unique=True)
    await db.practice_videos.create_index([('org_id', 1), ('child_id', 1), ('published_at', -1)])
    await db.home_plans.create_index([('org_id', 1), ('child_id', 1), ('week_start', -1)])
    await db.invitations.create_index('token_hash', unique=True)
    await db.invitations.create_index('expires_at', expireAfterSeconds=0)
    await db.password_reset_tokens.create_index('token_hash', unique=True)
    await db.password_reset_tokens.create_index('expires_at', expireAfterSeconds=0)
    await db.mfa_challenges.create_index('token_hash', unique=True)
    await db.mfa_challenges.create_index('expires_at', expireAfterSeconds=0)
    await db.access_grants.create_index([('org_id', 1), ('user_id', 1), ('child_id', 1)])
    await db.consents.create_index([('org_id', 1), ('child_id', 1), ('purpose', 1), ('status', 1)])
    await db.notification_jobs.create_index([('org_id', 1), ('dedupe_key', 1)], unique=True)
    await db.backups.create_index([('org_id', 1), ('created_at', -1)])
    await db.media_jobs.create_index([('org_id', 1), ('resource_id', 1), ('created_at', -1)])
    try:
        init_storage()
    except Exception as exc:
        logging.getLogger('storage').warning('Storage init deferred: %s', exc)
    worker = asyncio.create_task(notification_worker())
    media = asyncio.create_task(media_worker())
    yield
    worker.cancel()
    media.cancel()
    client.close()


app = FastAPI(title='Moonlight Neurocare · Stage A', lifespan=lifespan)
app.add_middleware(CORSMiddleware, allow_origins=ALLOWED_ORIGINS, allow_credentials=True,
                   allow_methods=['GET', 'POST', 'PATCH', 'DELETE'], allow_headers=['Content-Type', 'X-CSRF-Token', 'Idempotency-Key'])


@app.middleware('http')
async def privacy_headers(request: Request, call_next):
    if request.method in {'POST', 'PATCH', 'PUT', 'DELETE'}:
        origin = request.headers.get('origin')
        if origin and origin not in ALLOWED_ORIGINS:
            logging.getLogger('origin-check').warning('Rejected untrusted request origin')
            return JSONResponse({'detail': 'Request origin is not permitted.'}, status_code=403)
    response = await call_next(request)
    if 'cache-control' not in response.headers:
        response.headers['Cache-Control'] = 'no-store'
    response.headers['X-Content-Type-Options'] = 'nosniff'
    response.headers['X-Robots-Tag'] = 'noindex, nofollow'
    response.headers['Referrer-Policy'] = 'same-origin'
    response.headers['Permissions-Policy'] = 'camera=(self), microphone=(self), geolocation=()'
    return response


@app.get('/api/health')
async def health():
    await db.command('ping')
    return {'status': 'ok', 'mode': 'demo', 'stage': 'A'}


app.include_router(public_router, prefix='/api')
app.include_router(auth_router, prefix='/api')
app.include_router(workspace_router, prefix='/api')
app.include_router(admin_router, prefix='/api')
app.include_router(practice_router, prefix='/api')
app.include_router(home_plans_router, prefix='/api')
app.include_router(access_router, prefix='/api')
app.include_router(consents_router, prefix='/api')
app.include_router(operations_router, prefix='/api')