"""Re-run the prerender (static HTML for Google/AI) after website content changes.

Set PRERENDER_COMMAND in backend/.env, e.g.
  PRERENDER_COMMAND=/opt/moonlight/venv/bin/python /opt/moonlight/deploy/prerender.py --site https://moonlightneurocare.com --build /opt/moonlight/frontend/build
Changes are batched: the command runs PRERENDER_DELAY seconds (default 45) after the last edit, never twice at once.
Without PRERENDER_COMMAND nothing runs (the site still works; only crawlers see older HTML until the next build).
"""
import logging
import os
import shlex
import subprocess
import threading
import time

from fastapi import APIRouter, Depends

import cms
from config import IS_DEMO, Payload, now
from security import audit, authorize, principal

router = APIRouter()
logger = logging.getLogger('site-build')
COMMAND = os.environ.get('PRERENDER_COMMAND', '').strip()
DELAY = float(os.environ.get('PRERENDER_DELAY', '45'))
_state = {'status': 'idle' if COMMAND else 'not_configured', 'last_started': None, 'last_finished': None,
          'last_result': '', 'pending': False}
_lock = threading.Lock()
_timer = None


def _run():
    global _timer
    with _lock:
        _timer = None
        if _state['status'] == 'running':
            _state['pending'] = True
            return
        _state.update(status='running', last_started=now(), pending=False)
    try:
        result = subprocess.run(shlex.split(COMMAND), capture_output=True, text=True, timeout=1800)
        output = (result.stdout + result.stderr).strip().splitlines()
        _state['last_result'] = ('OK: ' if result.returncode == 0 else 'Problem: ') + (output[0] if output else f'exit {result.returncode}')
        if result.returncode:
            logger.warning('Prerender finished with problems: %s', '\n'.join(output[-10:]))
    except Exception as exc:
        _state['last_result'] = f'Problem: {type(exc).__name__}'
        logger.exception('Prerender failed')
    finally:
        _state.update(status='idle', last_finished=now())
        if _state['pending']:
            schedule()


def schedule(_org_id: str = ''):
    """Debounce: restart the countdown on every change."""
    global _timer
    if not COMMAND or IS_DEMO:
        return
    with _lock:
        if _timer:
            _timer.cancel()
        _timer = threading.Timer(DELAY, _run)
        _timer.daemon = True
        _timer.start()
        _state['scheduled_for'] = time.time() + DELAY


cms.on_content_change(schedule)


@router.get('/admin/site/build', response_model=Payload)
async def build_status(p=Depends(principal)):
    await authorize(p, 'content:read')
    return {k: v for k, v in _state.items()}


@router.post('/admin/site/build', response_model=Payload)
async def rebuild_now(p=Depends(principal)):
    await authorize(p, 'content:edit')
    if not COMMAND:
        return {**_state, 'message': 'Search-engine pages are not set up on this server (PRERENDER_COMMAND).'}
    threading.Thread(target=_run, daemon=True).start()
    await audit(p, 'content:rebuild', 'site')
    return {**_state, 'message': 'Refreshing search-engine pages now. This takes a few minutes.'}
