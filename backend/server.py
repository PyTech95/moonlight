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


@asynccontextmanager
async def lifespan(app):
    await db.sessions.create_index('token_hash', unique=True)
    await db.sessions.create_index('expires_at', expireAfterSeconds=0)
    await db.sandboxes.create_index('token_hash', unique=True)
    await db.users.create_index([('org_id', 1), ('email', 1)], unique=True)
    await db.enquiries.create_index([('org_id', 1), ('idempotency_key', 1)], unique=True)
    for collection in ['children', 'appointments', 'activities', 'announcements', 'requests', 'audit', 'enquiries']:
        await db[collection].create_index([('org_id', 1), ('id', 1)], unique=True)
    try:
        init_storage()
    except Exception as exc:
        logging.getLogger('storage').warning('Storage init deferred: %s', exc)
    yield
    client.close()


app = FastAPI(title='Moonlight Neurocare · Stage A', lifespan=lifespan)
app.add_middleware(CORSMiddleware, allow_origins=ALLOWED_ORIGINS, allow_credentials=True,
                   allow_methods=['GET', 'POST', 'PATCH'], allow_headers=['Content-Type', 'X-CSRF-Token', 'Idempotency-Key'])


@app.middleware('http')
async def privacy_headers(request: Request, call_next):
    if request.method in {'POST', 'PATCH', 'PUT', 'DELETE'}:
        origin = request.headers.get('origin')
        if origin and origin not in ALLOWED_ORIGINS:
            logging.getLogger('origin-check').warning('Rejected untrusted request origin')
            return JSONResponse({'detail': 'Request origin is not permitted.'}, status_code=403)
    response = await call_next(request)
    response.headers['Cache-Control'] = 'no-store'
    response.headers['X-Content-Type-Options'] = 'nosniff'
    response.headers['X-Robots-Tag'] = 'noindex, nofollow'
    response.headers['Referrer-Policy'] = 'same-origin'
    response.headers['Permissions-Policy'] = 'camera=(), microphone=(), geolocation=()'
    return response


@app.get('/api/health')
async def health():
    await db.command('ping')
    return {'status': 'ok', 'mode': 'demo', 'stage': 'A'}


app.include_router(public_router, prefix='/api')
app.include_router(auth_router, prefix='/api')
app.include_router(workspace_router, prefix='/api')
app.include_router(admin_router, prefix='/api')