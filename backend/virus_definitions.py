import glob
import logging
import os
import subprocess
import threading

from config import db, now

logger = logging.getLogger('virus-definitions')
DB_DIR = '/var/lib/clamav'
_lock = threading.Lock()


def definitions_ready() -> bool:
    return any(glob.glob(os.path.join(DB_DIR, pattern)) for pattern in ('main.c[vl]d', 'daily.c[vl]d'))


def refresh_definitions_sync() -> dict:
    """Download/refresh ClamAV signatures. Serialized so concurrent callers share one run."""
    with _lock:
        os.makedirs(DB_DIR, exist_ok=True)
        try:
            result = subprocess.run(['/usr/bin/freshclam', '--stdout', '--quiet', f'--datadir={DB_DIR}'], capture_output=True, text=True, timeout=600)
            ok = definitions_ready()
            error = '' if ok else (result.stdout + result.stderr)[-300:]
        except Exception as exc:
            ok, error = definitions_ready(), type(exc).__name__
        if not ok:
            logger.warning('Virus definition refresh failed: %s', error)
        return {'ready': ok, 'error': error}


def ensure_definitions_sync():
    if not definitions_ready():
        refresh_definitions_sync()


async def record_status(result: dict, trigger: str):
    await db.system_status.update_one({'id': 'virus_definitions'}, {'$set': {
        'id': 'virus_definitions', 'ready': result['ready'], 'last_error': result['error'], 'trigger': trigger, 'updated_at': now()}}, upsert=True)


async def refresh_and_record(trigger: str):
    import asyncio
    result = await asyncio.to_thread(refresh_definitions_sync)
    await record_status(result, trigger)
    return result
