import asyncio
import json
import uuid
from datetime import date
from typing import Annotated

from fastapi import APIRouter, Depends, File, Form, HTTPException, Response, UploadFile
from pydantic import Field

from config import APP_MODE, Input, Payload, db, now, uid
from consents import effective_consent
from security import ScopedRepo, audit, authorize, principal
from storage import APP_NAME, get_object, put_object
from media_processing import queue_video_processing, validate_caption


router = APIRouter()
MAX_VIDEO_BYTES = 120 * 1024 * 1024
VIDEO_TYPES = {
    'video/mp4': 'mp4',
    'video/webm': 'webm',
    'video/quicktime': 'mov',
}
THERAPIES = {
    'Speech Therapy', 'Occupational Therapy', 'ABA Therapy', 'Sensory Integration Therapy',
    'Yoga Therapy', 'Neurodevelopmental Therapy', 'Remedial Therapy', 'Music & Play Therapy'
}
SAFE_FIELDS = ['id', 'child_id', 'child_name', 'therapy', 'title', 'note', 'steps', 'session_date',
               'duration_seconds', 'therapist_name', 'created_at', 'published_at', 'version', 'processing_status',
               'processing_error', 'transcript']


def _parse_steps(value: str) -> list[str]:
    try:
        raw = json.loads(value)
    except (TypeError, json.JSONDecodeError):
        raise HTTPException(422, 'Add the home-practice steps again.')
    if not isinstance(raw, list):
        raise HTTPException(422, 'Steps must be a list.')
    steps = [str(step).strip() for step in raw if str(step).strip()]
    if not 1 <= len(steps) <= 4:
        raise HTTPException(422, 'Add between 1 and 4 short practice steps.')
    if any(len(step) > 240 for step in steps):
        raise HTTPException(422, 'Each practice step must be 240 characters or fewer.')
    return steps


def _validate_session_date(value: str) -> str:
    try:
        parsed = date.fromisoformat(value)
    except ValueError:
        raise HTTPException(422, 'Choose a valid session date.')
    if parsed > date.today():
        raise HTTPException(422, 'The session date cannot be in the future.')
    return parsed.isoformat()


def _safe(record: dict, p: dict) -> dict:
    clean = {key: record.get(key) for key in SAFE_FIELDS}
    read_by = record.get('read_by', [])
    clean['viewed'] = p['id'] in read_by
    clean['family_viewed'] = bool(read_by)
    clean['thumbnail_ready'] = bool(record.get('thumbnail_path'))
    clean['captions_available'] = bool(record.get('caption_path'))
    return clean


@router.post('/practice-videos', response_model=Payload, status_code=201)
async def create_practice_video(
    child_id: Annotated[str, Form(min_length=1, max_length=100)],
    therapy: Annotated[str, Form(min_length=2, max_length=100)],
    title: Annotated[str, Form(min_length=3, max_length=120)],
    note: Annotated[str, Form(min_length=5, max_length=1200)],
    steps: Annotated[str, Form(max_length=1200)],
    session_date: Annotated[str, Form(max_length=10)],
    duration_seconds: Annotated[int, Form(ge=1, le=600)],
    consent_confirmed: Annotated[bool, Form()],
    file: UploadFile = File(...),
    captions: UploadFile = File(None),
    transcript: str = Form('', max_length=10000),
    p=Depends(principal),
):
    await authorize(p, 'practice_videos:create')
    child = await ScopedRepo(p).one('children', 'children:read', child_id)
    if therapy not in THERAPIES:
        raise HTTPException(422, 'Choose a listed therapy.')
    if not consent_confirmed:
        raise HTTPException(422, 'Confirm guardian consent before publishing a child video.')
    if APP_MODE == 'production' and not await effective_consent(p['org_id'], child_id, 'private_video_sharing'):
        raise HTTPException(422, 'Active private-video sharing consent is required for this child.')
    content_type = (file.content_type or '').split(';', 1)[0].lower()
    if content_type not in VIDEO_TYPES:
        raise HTTPException(422, 'Upload an MP4, WebM or MOV video.')
    video_data = await file.read(MAX_VIDEO_BYTES + 1)
    await file.close()
    if not video_data:
        raise HTTPException(422, 'The selected video is empty.')
    if len(video_data) > MAX_VIDEO_BYTES:
        raise HTTPException(422, 'Video must be under 120 MB. Record a shorter or lower-quality guide.')
    settings = await db.settings.find_one({'org_id': p['org_id']}, {'_id': 0, 'media_quota_bytes': 1}) or {}
    quota = settings.get('media_quota_bytes', 2 * 1024 * 1024 * 1024)
    usage = await db.practice_videos.aggregate([{'$match': {'org_id': p['org_id'], 'is_deleted': {'$ne': True}}}, {'$group': {'_id': None, 'bytes': {'$sum': '$size_bytes'}}}]).to_list(1)
    if (usage[0].get('bytes', 0) if usage else 0) + len(video_data) > quota:
        raise HTTPException(422, 'The center media quota has been reached. Remove expired media or increase the approved quota.')
    clean_steps = _parse_steps(steps)
    clean_date = _validate_session_date(session_date)
    path = f'{APP_NAME}/{p["org_id"]}/quarantine/practice/{p["id"]}/{uuid.uuid4()}.{VIDEO_TYPES[content_type]}'
    try:
        stored = await asyncio.to_thread(put_object, path, video_data, content_type)
    except Exception:
        raise HTTPException(400, 'The video could not be stored. Please try again.')
    caption_path = ''
    if captions is not None:
        caption_data = await captions.read(200 * 1024 + 1)
        await captions.close()
        try:
            clean_caption = await asyncio.to_thread(validate_caption, caption_data)
            caption_object = await asyncio.to_thread(put_object, f'{APP_NAME}/{p["org_id"]}/practice-captions/{uuid.uuid4()}.vtt', clean_caption.encode(), 'text/vtt')
            caption_path = caption_object['path']
        except ValueError as exc:
            raise HTTPException(422, str(exc))
    timestamp = now()
    record = {
        'id': uid(), 'org_id': p['org_id'], 'child_id': child['id'], 'child_name': child['name'],
        'therapy': therapy, 'title': title.strip(), 'note': note.strip(), 'steps': clean_steps,
        'session_date': clean_date, 'duration_seconds': duration_seconds, 'therapist_id': p['id'],
        'therapist_name': p['display_name'], 'original_storage_path': stored['path'], 'declared_content_type': content_type,
        'size_bytes': stored.get('size', len(video_data)), 'original_filename': (file.filename or 'practice-video')[:180],
        'caption_path': caption_path, 'transcript': transcript.strip(), 'processing_status': 'processing', 'processing_error': '',
        'consent': {'confirmed': True, 'confirmed_by': p['id'], 'confirmed_at': timestamp, 'scope': 'Home-practice guidance sharing'},
        'read_by': [], 'created_at': timestamp, 'published_at': timestamp, 'version': 1,
        'is_deleted': False, 'synthetic_environment': True,
    }
    await db.practice_videos.insert_one(record.copy())
    await queue_video_processing(record)
    await audit(p, 'practice_videos:create', record['id'])
    return _safe(record, p)


class PracticeVideoUpdate(Input):
    therapy: str = Field(min_length=2, max_length=100)
    title: str = Field(min_length=3, max_length=120)
    note: str = Field(min_length=5, max_length=1200)
    steps: list[str] = Field(min_length=1, max_length=4)
    session_date: str = Field(max_length=10)
    version: int = Field(ge=1)


@router.patch('/practice-videos/{video_id}', response_model=Payload)
async def update_practice_video(video_id: str, data: PracticeVideoUpdate, p=Depends(principal)):
    await authorize(p, 'practice_videos:update')
    record = await ScopedRepo(p).one('practice_videos', 'practice_videos:read', video_id)
    if p['role'] == 'staff' and record.get('therapist_id') != p['id']:
        raise HTTPException(403, 'Only the therapist who published this guide can edit it.')
    if data.therapy not in THERAPIES:
        raise HTTPException(422, 'Choose a listed therapy.')
    clean_steps = [step.strip() for step in data.steps if step.strip()]
    if not 1 <= len(clean_steps) <= 4 or any(len(step) > 240 for step in clean_steps):
        raise HTTPException(422, 'Add 1 to 4 steps, each under 240 characters.')
    changes = {'therapy': data.therapy, 'title': data.title, 'note': data.note, 'steps': clean_steps,
               'session_date': _validate_session_date(data.session_date), 'updated_at': now()}
    result = await db.practice_videos.update_one(
        {'org_id': p['org_id'], 'id': video_id, 'version': data.version, 'is_deleted': {'$ne': True}},
        {'$set': changes, '$inc': {'version': 1}},
    )
    if not result.matched_count:
        raise HTTPException(409, 'This guide changed. Refresh before trying again.')
    await audit(p, 'practice_videos:update', video_id)
    return _safe({**record, **changes, 'version': data.version + 1}, p)


@router.delete('/practice-videos/{video_id}', response_model=Payload)
async def remove_practice_video(video_id: str, p=Depends(principal)):
    await authorize(p, 'practice_videos:delete')
    record = await ScopedRepo(p).one('practice_videos', 'practice_videos:read', video_id)
    if p['role'] == 'staff' and record.get('therapist_id') != p['id']:
        raise HTTPException(403, 'Only the therapist who published this guide can remove it.')
    await db.practice_videos.update_one({'org_id': p['org_id'], 'id': video_id},
                                        {'$set': {'is_deleted': True, 'deleted_at': now(), 'deleted_by': p['id']}, '$inc': {'version': 1}})
    await audit(p, 'practice_videos:delete', video_id)
    return {'message': 'Home-practice video removed from the family portal.'}


@router.post('/practice-videos/{video_id}/retry', response_model=Payload)
async def retry_practice_video(video_id: str, p=Depends(principal)):
    await authorize(p, 'practice_videos:update')
    record = await ScopedRepo(p).one('practice_videos', 'practice_videos:read', video_id)
    if p['role'] == 'staff' and record.get('therapist_id') != p['id']:
        raise HTTPException(403, 'Only the therapist who uploaded this guide can retry it.')
    if record.get('processing_status') not in {'failed', 'rejected'}:
        raise HTTPException(422, 'Only failed or rejected processing can be retried.')
    await db.practice_videos.update_one({'org_id': p['org_id'], 'id': video_id}, {'$set': {'processing_status': 'processing', 'processing_error': '', 'updated_at': now()}})
    await queue_video_processing(record)
    await audit(p, 'practice_videos:retry', video_id)
    return {'message': 'Video processing queued again.'}


@router.post('/practice-videos/{video_id}/viewed', response_model=Payload)
async def mark_practice_video_viewed(video_id: str, p=Depends(principal)):
    await authorize(p, 'practice_videos:view')
    await ScopedRepo(p).one('practice_videos', 'practice_videos:read', video_id)
    await db.practice_videos.update_one({'org_id': p['org_id'], 'id': video_id, 'is_deleted': {'$ne': True}},
                                        {'$addToSet': {'read_by': p['id']}, '$set': {f'viewed_at.{p["id"]}': now()}})
    await audit(p, 'practice_videos:view', video_id)
    return {'message': 'Practice video marked as viewed.'}


@router.get('/practice-videos/{video_id}/media')
async def practice_video_media(video_id: str, p=Depends(principal)):
    record = await ScopedRepo(p).one('practice_videos', 'practice_videos:read', video_id)
    if record.get('sharing_suspended'):
        raise HTTPException(403, 'Video sharing is suspended because consent changed.')
    if record.get('processing_status', 'ready') != 'ready':
        raise HTTPException(409, 'Video processing is not complete.')
    try:
        data, stored_type = await asyncio.to_thread(get_object, record.get('playback_path') or record['storage_path'])
    except Exception:
        raise HTTPException(404, 'Video file not found.')
    content_type = record.get('content_type') or stored_type
    return Response(content=data, media_type=content_type,
                    headers={'Cache-Control': 'private, no-store', 'Content-Disposition': 'inline', 'Content-Length': str(len(data))})


@router.get('/practice-videos/{video_id}/thumbnail')
async def practice_video_thumbnail(video_id: str, p=Depends(principal)):
    record = await ScopedRepo(p).one('practice_videos', 'practice_videos:read', video_id)
    if record.get('processing_status') != 'ready' or not record.get('thumbnail_path'):
        raise HTTPException(404, 'Video thumbnail not available.')
    data, _ = await asyncio.to_thread(get_object, record['thumbnail_path'])
    return Response(content=data, media_type='image/jpeg', headers={'Cache-Control': 'private, max-age=300'})


@router.get('/practice-videos/{video_id}/captions')
async def practice_video_captions(video_id: str, p=Depends(principal)):
    record = await ScopedRepo(p).one('practice_videos', 'practice_videos:read', video_id)
    if not record.get('caption_path'):
        raise HTTPException(404, 'Captions are not available for this video.')
    data, _ = await asyncio.to_thread(get_object, record['caption_path'])
    return Response(content=data, media_type='text/vtt', headers={'Cache-Control': 'private, no-store'})