import asyncio
import hmac
import os

from fastapi import APIRouter, BackgroundTasks, HTTPException, Request

from config import db, now
from digests import generate_all_digests
from virus_definitions import refresh_and_record

router = APIRouter()
JOBS = {'virus-definitions': lambda: refresh_and_record('cron'), 'school-digest': generate_all_digests}


async def _authorized(request: Request):
    secret = os.environ['WEBHOOK_CRON_SECRET']
    header = request.headers.get('Authorization', '')
    if not header.startswith('Bearer ') or not hmac.compare_digest(header[7:], secret):
        raise HTTPException(401, 'Unauthorized')


@router.post('/cron/{job}')
async def cron(job: str, request: Request, background: BackgroundTasks):
    # Cron endpoints must ack 2xx immediately; enqueue/background the actual work.
    await _authorized(request)
    if job not in JOBS:
        raise HTTPException(404, 'Unknown job')
    try:
        envelope = await request.json() if await request.body() else {}
    except Exception:
        raise HTTPException(400, 'Invalid body')
    run_id = request.headers.get('X-Webhook-Id') or (envelope or {}).get('run_id') or now()
    result = await db.cron_runs.update_one({'id': f'{job}:{run_id}'}, {'$setOnInsert': {'id': f'{job}:{run_id}', 'job': job, 'received_at': now()}}, upsert=True)
    if result.upserted_id is None:
        return {'status': 'duplicate'}
    background.add_task(_run, job, run_id)
    return {'status': 'accepted'}


async def _run(job: str, run_id: str):
    try:
        await JOBS[job]()
        status = 'completed'
    except Exception as exc:
        status = f'failed:{type(exc).__name__}'
    await db.cron_runs.update_one({'id': f'{job}:{run_id}'}, {'$set': {'status': status, 'finished_at': now()}})


async def startup_definitions():
    await asyncio.sleep(5)
    await refresh_and_record('startup')
