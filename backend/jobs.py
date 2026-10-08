import asyncio
import logging
from datetime import datetime, timezone, timedelta

from pymongo import ReturnDocument

from config import db, now, uid
from emailer import send_email
from vault import decrypt_secret, encrypt_secret


logger = logging.getLogger('notification-worker')


async def enqueue_email(org_id: str, to_email: str, subject: str, body: str, dedupe_key: str) -> dict:
    existing = await db.notification_jobs.find_one({'org_id': org_id, 'dedupe_key': dedupe_key}, {'_id': 0})
    if existing:
        return existing
    record = {
        'id': uid(), 'org_id': org_id, 'kind': 'email', 'to_email': to_email.lower(),
        'subject': subject, 'body_encrypted': encrypt_secret(body), 'dedupe_key': dedupe_key,
        'status': 'pending', 'attempts': 0, 'next_attempt_at': datetime.now(timezone.utc),
        'created_at': now(), 'updated_at': now(),
    }
    try:
        await db.notification_jobs.insert_one(record.copy())
    except Exception:
        return await db.notification_jobs.find_one({'org_id': org_id, 'dedupe_key': dedupe_key}, {'_id': 0})
    return record


async def process_email_job(job: dict):
    settings = await db.settings.find_one({'org_id': job['org_id']}, {'_id': 0})
    if not settings or not settings.get('smtp_username') or not settings.get('smtp_app_password'):
        await db.notification_jobs.update_one({'id': job['id']}, {'$set': {'status': 'not_configured', 'updated_at': now(), 'last_error': 'SMTP is not configured.'}})
        return
    try:
        await send_email(settings, job['subject'], decrypt_secret(job['body_encrypted']), to_email=job['to_email'])
        await db.notification_jobs.update_one({'id': job['id']}, {'$set': {'status': 'sent', 'sent_at': now(), 'updated_at': now(), 'last_error': ''}})
    except Exception as exc:
        attempts = job.get('attempts', 1)
        status = 'failed' if attempts >= 3 else 'pending'
        next_attempt = datetime.now(timezone.utc) + timedelta(minutes=min(30, attempts * 5))
        await db.notification_jobs.update_one({'id': job['id']}, {'$set': {'status': status, 'next_attempt_at': next_attempt, 'updated_at': now(), 'last_error': type(exc).__name__}})
        logger.warning('Email job failed id=%s error=%s', job['id'], type(exc).__name__)


async def notification_worker():
    while True:
        try:
            job = await db.notification_jobs.find_one_and_update(
                {'status': 'pending', 'next_attempt_at': {'$lte': datetime.now(timezone.utc)}, 'attempts': {'$lt': 3}},
                {'$set': {'status': 'processing', 'updated_at': now()}, '$inc': {'attempts': 1}},
                sort=[('created_at', 1)], return_document=ReturnDocument.AFTER,
            )
            if job:
                await process_email_job(job)
            else:
                await asyncio.sleep(2)
        except asyncio.CancelledError:
            raise
        except Exception as exc:
            logger.warning('Notification worker cycle failed: %s', type(exc).__name__)
            await asyncio.sleep(3)