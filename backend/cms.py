"""Website content management (CMS).

Every public text has a default in the frontend (frontend/src/lib/siteContent.js). Admins save overrides here:
  - values:       {"home.hero.title1": "…", "about.sections": [{"title": "…", "body": "…"}], …}
  - collections:  therapies, sports, faqs, areas (whole lists; when unset the frontend defaults are used)
Saving a value to null restores the default. Every change is written to site_content_history.
Images for content are uploaded to the public media prefix and served by /api/public/media.
"""
import asyncio
import json
import logging
import re
import uuid
from typing import Any

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from pydantic import Field

from config import Input, Payload, db, now, uid
from media_processing import validate_and_normalize_image
from security import audit, authorize, principal, sandbox
from storage import APP_NAME, put_object

router = APIRouter()
logger = logging.getLogger('cms')

KEY = re.compile(r'^[a-z0-9]+(?:[._-][a-z0-9]+)*$')
SLUG = re.compile(r'^[a-z0-9]+(?:-[a-z0-9]+)*$')
COLLECTIONS = {'therapies': 'slug', 'sports': 'slug', 'faqs': None, 'areas': 'slug'}
MAX_VALUES_BYTES = 1_500_000
MAX_COLLECTION_BYTES = 1_500_000
IMAGE_MIME = {'image/jpeg', 'image/png', 'image/webp', 'image/gif'}
_rebuild_hooks = []  # functions called after every content change (the prerender scheduler registers here)


def on_content_change(func):
    _rebuild_hooks.append(func)
    return func


def _notify_change(org_id: str):
    for hook in _rebuild_hooks:
        try:
            hook(org_id)
        except Exception:
            logger.exception('Content change hook failed')


def _check(value: Any, depth: int = 0, where: str = 'value'):
    """Allow plain JSON content only: strings, numbers, booleans, lists and small objects."""
    if depth > 4:
        raise HTTPException(422, f'{where} is nested too deeply.')
    if value is None or isinstance(value, (bool, int, float)):
        return
    if isinstance(value, str):
        if len(value) > 20000:
            raise HTTPException(422, f'{where} is longer than 20,000 characters.')
        return
    if isinstance(value, list):
        if len(value) > 400:
            raise HTTPException(422, f'{where} has more than 400 items.')
        for i, item in enumerate(value):
            _check(item, depth + 1, f'{where}[{i}]')
        return
    if isinstance(value, dict):
        if len(value) > 60:
            raise HTTPException(422, f'{where} has too many fields.')
        for k, v in value.items():
            if not isinstance(k, str) or not re.fullmatch(r'[A-Za-z0-9_]{1,60}', k):
                raise HTTPException(422, f'{where} has an invalid field name.')
            _check(v, depth + 1, f'{where}.{k}')
        return
    raise HTTPException(422, f'{where} has an unsupported type.')


def _enc(key: str) -> str:
    return key.replace('.', ':')  # MongoDB treats dots in field names as nested paths


def _dec(key: str) -> str:
    return key.replace(':', '.')


async def _doc(org_id: str) -> dict:
    doc = await db.site_content.find_one({'org_id': org_id}, {'_id': 0})
    return doc or {'org_id': org_id, 'values': {}, 'collections': {}, 'version': 0, 'updated_at': None}


def _public(doc: dict) -> dict:
    return {'values': {_dec(k): v for k, v in (doc.get('values') or {}).items()},
            'collections': doc.get('collections') or {},
            'version': doc.get('version', 0), 'updated_at': doc.get('updated_at')}


@router.get('/public/content', response_model=Payload)
async def public_content(space=Depends(sandbox)):
    return _public(await _doc(space['org_id']))


@router.get('/admin/content', response_model=Payload)
async def admin_content(p=Depends(principal)):
    await authorize(p, 'content:read')
    doc = await _doc(p['org_id'])
    history = await db.site_content_history.find({'org_id': p['org_id']}, {'_id': 0, 'old': 0, 'new': 0}) \
        .sort('at', -1).limit(60).to_list(60)
    return {**_public(doc), 'history': history}


async def _save(p: dict, version: int, mutate, history: list):
    """Read-modify-write with an optimistic version check, so two editors never overwrite each other silently."""
    doc = await _doc(p['org_id'])
    if doc.get('version', 0) != version:
        raise HTTPException(409, 'Someone else changed the website content. Reload and try again.')
    values, collections = dict(doc.get('values') or {}), dict(doc.get('collections') or {})
    mutate(values, collections)
    if len(json.dumps(values, default=str)) > MAX_VALUES_BYTES:
        raise HTTPException(422, 'The website content is too large to save.')
    new = {'org_id': p['org_id'], 'values': values, 'collections': collections, 'version': version + 1,
           'updated_at': now(), 'updated_by': p.get('display_name', '')}
    result = await db.site_content.replace_one({'org_id': p['org_id'], 'version': version}, new, upsert=version == 0)
    if not result.matched_count and not result.upserted_id:
        raise HTTPException(409, 'Someone else changed the website content. Reload and try again.')
    if history:
        await db.site_content_history.insert_many(history)
    await audit(p, 'content:edit', ','.join(h['key'] for h in history)[:300])
    _notify_change(p['org_id'])
    return _public(new)


class ValuesInput(Input):
    values: dict[str, Any] = Field(min_length=1, max_length=200)
    version: int = Field(ge=0)


@router.patch('/admin/content', response_model=Payload)
async def save_values(data: ValuesInput, p=Depends(principal)):
    await authorize(p, 'content:edit')
    doc = await _doc(p['org_id'])
    clean, history = {}, []
    for key, value in data.values.items():
        if not KEY.fullmatch(key) or len(key) > 120:
            raise HTTPException(422, f'Invalid content key: {key[:60]}')
        _check(value, where=key)
        if isinstance(value, str):
            value = value.strip()
        clean[key] = value
        history.append({'id': uid(), 'org_id': p['org_id'], 'kind': 'value', 'key': key,
                        'old': (doc.get('values') or {}).get(_enc(key)), 'new': value, 'reset': value is None,
                        'actor_id': p['id'], 'actor_name': p.get('display_name', ''), 'at': now()})

    def mutate(values, _collections):
        for key, value in clean.items():
            if value is None:
                values.pop(_enc(key), None)
            else:
                values[_enc(key)] = value
    return await _save(p, data.version, mutate, history)


class CollectionInput(Input):
    items: list[dict[str, Any]] | None = Field(default=None, max_length=400)
    version: int = Field(ge=0)


@router.put('/admin/content/collections/{name}', response_model=Payload)
async def save_collection(name: str, data: CollectionInput, p=Depends(principal)):
    await authorize(p, 'content:edit')
    if name not in COLLECTIONS:
        raise HTTPException(404, 'Unknown content list.')
    items = data.items
    if items is not None:
        _check(items, where=name)
        if len(json.dumps(items)) > MAX_COLLECTION_BYTES:
            raise HTTPException(422, 'This list is too large.')
        slug_field = COLLECTIONS[name]
        if slug_field:
            slugs = [str(item.get(slug_field, '')) for item in items]
            bad = [s for s in slugs if not SLUG.fullmatch(s)]
            if bad:
                raise HTTPException(422, f'Each item needs a URL name of lowercase letters, numbers and hyphens ("{bad[0]}").')
            if len(set(slugs)) != len(slugs):
                raise HTTPException(422, 'Two items use the same URL name.')
    doc = await _doc(p['org_id'])
    history = [{'id': uid(), 'org_id': p['org_id'], 'kind': 'collection', 'key': name,
                'old': (doc.get('collections') or {}).get(name), 'new': items, 'reset': items is None,
                'actor_id': p['id'], 'actor_name': p.get('display_name', ''), 'at': now()}]

    def mutate(_values, collections):
        if items is None:
            collections.pop(name, None)
        else:
            collections[name] = items
    return await _save(p, data.version, mutate, history)


@router.post('/admin/content/image', response_model=Payload)
async def upload_content_image(file: UploadFile = File(...), p=Depends(principal)):
    await authorize(p, 'content:edit')
    if file.content_type not in IMAGE_MIME:
        raise HTTPException(422, 'Please upload a JPG, PNG, WEBP or GIF image.')
    data = await file.read(8 * 1024 * 1024 + 1)
    await file.close()
    if len(data) > 8 * 1024 * 1024:
        raise HTTPException(422, 'Image must be under 8 MB.')
    try:
        normalized, width, height = await asyncio.to_thread(validate_and_normalize_image, data)
    except ValueError as exc:
        raise HTTPException(422, str(exc))
    except RuntimeError as exc:
        raise HTTPException(503, str(exc) or 'The virus scanner is not ready. Please try again in a few minutes.')
    try:
        stored = await asyncio.to_thread(put_object, f'{APP_NAME}/{p["org_id"]}/public/{uuid.uuid4()}.webp', normalized, 'image/webp')
    except Exception:
        logger.exception('Content image upload failed')
        raise HTTPException(503, 'The image could not be saved to storage. Check the server storage settings and try again.')
    await audit(p, 'content:image', stored['path'])
    return {'path': stored['path'], 'width': width, 'height': height}


@router.get('/admin/content/history/{entry_id}', response_model=Payload)
async def history_entry(entry_id: str, p=Depends(principal)):
    await authorize(p, 'content:read')
    entry = await db.site_content_history.find_one({'org_id': p['org_id'], 'id': entry_id}, {'_id': 0})
    if not entry:
        raise HTTPException(404, 'Not found.')
    return entry
