"""Object storage for uploads (site images, practice videos, documents, backups).

Choose a backend with STORAGE_BACKEND:
  emergent  Emergent Object Storage (needs EMERGENT_LLM_KEY; only works on Emergent hosting)
  s3        Any S3-compatible bucket: AWS S3, Cloudflare R2, DigitalOcean Spaces, MinIO
            S3_BUCKET, S3_REGION (default ap-south-1), optional S3_ENDPOINT_URL,
            AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY
  local     A folder on the server's own disk: STORAGE_DIR (default ./storage-data). Back it up!

Default: emergent when EMERGENT_LLM_KEY is set, otherwise local.
Every function keeps the original signatures, so callers do not change.
"""
import json
import logging
import mimetypes
import os
from pathlib import Path

import requests

APP_NAME = 'moonlight'
MIME_TYPES = {'jpg': 'image/jpeg', 'jpeg': 'image/jpeg', 'png': 'image/png', 'gif': 'image/gif', 'webp': 'image/webp'}
EMERGENT_KEY = os.environ.get('EMERGENT_LLM_KEY')
BACKEND = (os.environ.get('STORAGE_BACKEND') or ('emergent' if EMERGENT_KEY else 'local')).strip().lower()
if BACKEND not in {'emergent', 's3', 'local'}:
    raise RuntimeError('STORAGE_BACKEND must be emergent, s3 or local.')

logger = logging.getLogger('storage')


# ---------------------------------------------------------------- Emergent
STORAGE_BASE = (os.environ.get('INTEGRATION_PROXY_URL') or '').strip() or 'https://integrations.emergentagent.com'
STORAGE_URL = STORAGE_BASE.rstrip('/') + '/objstore/api/v1/storage'
_storage_key = None


def _emergent_init(force: bool = False):
    global _storage_key
    if _storage_key and not force:
        return _storage_key
    if not EMERGENT_KEY:
        raise RuntimeError('EMERGENT_LLM_KEY is not set, so Emergent storage cannot be used. Set STORAGE_BACKEND=s3 or local.')
    resp = requests.post(f'{STORAGE_URL}/init', json={'emergent_key': EMERGENT_KEY}, timeout=30)
    resp.raise_for_status()
    _storage_key = resp.json()['storage_key']
    return _storage_key


def _emergent_put(path: str, data: bytes, content_type: str) -> dict:
    key = _emergent_init()
    resp = requests.put(f'{STORAGE_URL}/objects/{path}', headers={'X-Storage-Key': key, 'Content-Type': content_type}, data=data, timeout=120)
    if resp.status_code == 404:
        key = _emergent_init(force=True)
        resp = requests.put(f'{STORAGE_URL}/objects/{path}', headers={'X-Storage-Key': key, 'Content-Type': content_type}, data=data, timeout=120)
    resp.raise_for_status()
    return resp.json()


def _emergent_get(path: str):
    key = _emergent_init()
    resp = requests.get(f'{STORAGE_URL}/objects/{path}', headers={'X-Storage-Key': key}, timeout=60)
    if resp.status_code == 404:
        key = _emergent_init(force=True)
        resp = requests.get(f'{STORAGE_URL}/objects/{path}', headers={'X-Storage-Key': key}, timeout=60)
    resp.raise_for_status()
    return resp.content, resp.headers.get('Content-Type', 'application/octet-stream')


# ---------------------------------------------------------------- S3-compatible
_s3 = None


def _s3_client():
    global _s3
    if _s3 is None:
        import boto3  # already in requirements.txt
        _s3 = boto3.client('s3', region_name=os.environ.get('S3_REGION', 'ap-south-1'),
                           endpoint_url=os.environ.get('S3_ENDPOINT_URL') or None)
    return _s3


def _bucket() -> str:
    bucket = os.environ.get('S3_BUCKET', '').strip()
    if not bucket:
        raise RuntimeError('S3_BUCKET is not set.')
    return bucket


def _s3_put(path: str, data: bytes, content_type: str) -> dict:
    _s3_client().put_object(Bucket=_bucket(), Key=path, Body=data, ContentType=content_type)
    return {'path': path, 'size': len(data)}


def _s3_get(path: str):
    obj = _s3_client().get_object(Bucket=_bucket(), Key=path)
    return obj['Body'].read(), obj.get('ContentType') or 'application/octet-stream'


# ---------------------------------------------------------------- Local disk
LOCAL_ROOT = Path(os.environ.get('STORAGE_DIR') or Path(__file__).parent / 'storage-data').resolve()


def _local_file(path: str) -> Path:
    target = (LOCAL_ROOT / path).resolve()
    if LOCAL_ROOT not in target.parents:
        raise ValueError('Invalid storage path.')
    return target


def _local_put(path: str, data: bytes, content_type: str) -> dict:
    target = _local_file(path)
    target.parent.mkdir(parents=True, exist_ok=True)
    temp = target.with_name(target.name + '.part')
    temp.write_bytes(data)
    temp.replace(target)
    target.with_name(target.name + '.meta.json').write_text(json.dumps({'content_type': content_type}))
    return {'path': path, 'size': len(data)}


def _local_get(path: str):
    target = _local_file(path)
    if not target.is_file():
        raise FileNotFoundError(path)
    meta = target.with_name(target.name + '.meta.json')
    content_type = json.loads(meta.read_text()).get('content_type') if meta.exists() else None
    return target.read_bytes(), content_type or mimetypes.guess_type(target.name)[0] or 'application/octet-stream'


# ---------------------------------------------------------------- Public API
def init_storage(force: bool = False):
    if BACKEND == 'emergent':
        return _emergent_init(force)
    if BACKEND == 'local':
        LOCAL_ROOT.mkdir(parents=True, exist_ok=True)
    logger.info('Storage backend: %s', BACKEND)
    return BACKEND


def put_object(path: str, data: bytes, content_type: str) -> dict:
    return {'emergent': _emergent_put, 's3': _s3_put, 'local': _local_put}[BACKEND](path, data, content_type)


def get_object(path: str):
    return {'emergent': _emergent_get, 's3': _s3_get, 'local': _local_get}[BACKEND](path)
