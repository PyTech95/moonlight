import asyncio
import io
import json
import logging
import os
import subprocess
import tempfile
import uuid

from PIL import Image, ImageOps
from pymongo import ReturnDocument

from config import db, now, uid
from storage import APP_NAME, get_object, put_object


logger = logging.getLogger('media-worker')


def scan_path(path: str):
    result = subprocess.run(['/usr/bin/clamscan', '--no-summary', path], capture_output=True, text=True, timeout=120)
    if result.returncode == 1:
        raise ValueError('Malware scan rejected this file.')
    if result.returncode != 0:
        raise RuntimeError('Malware scanner is unavailable.')


def validate_and_normalize_image(data: bytes) -> tuple[bytes, int, int]:
    with tempfile.NamedTemporaryFile(suffix='.upload') as temp:
        temp.write(data)
        temp.flush()
        scan_path(temp.name)
    try:
        with Image.open(io.BytesIO(data)) as source:
            source.verify()
        with Image.open(io.BytesIO(data)) as source:
            image = ImageOps.exif_transpose(source).convert('RGB')
            image.thumbnail((2400, 2400))
            width, height = image.size
            output = io.BytesIO()
            image.save(output, format='WEBP', quality=85, method=6)
            return output.getvalue(), width, height
    except Exception as exc:
        raise ValueError('The uploaded image is not a valid supported image.') from exc


def validate_caption(data: bytes) -> str:
    if len(data) > 200 * 1024:
        raise ValueError('Caption file must be under 200 KB.')
    with tempfile.NamedTemporaryFile(suffix='.vtt') as temp:
        temp.write(data)
        temp.flush()
        scan_path(temp.name)
    try:
        text = data.decode('utf-8-sig')
    except UnicodeDecodeError as exc:
        raise ValueError('Caption file must use UTF-8 text.') from exc
    if not text.lstrip().startswith('WEBVTT'):
        raise ValueError('Upload captions in WebVTT format.')
    return text


def _probe(path: str) -> dict:
    result = subprocess.run(['/usr/bin/ffprobe', '-v', 'error', '-show_entries', 'format=duration,format_name:stream=codec_type,codec_name,width,height',
                             '-of', 'json', path], capture_output=True, text=True, timeout=60)
    if result.returncode != 0:
        raise ValueError('The uploaded file is not a valid video.')
    payload = json.loads(result.stdout)
    video_streams = [stream for stream in payload.get('streams', []) if stream.get('codec_type') == 'video']
    duration = float((payload.get('format') or {}).get('duration') or 0)
    if not video_streams or duration <= 0:
        raise ValueError('The uploaded file does not contain a playable video stream.')
    if duration > 600.5:
        raise ValueError('Video duration exceeds the 10-minute limit.')
    stream = video_streams[0]
    return {'duration_seconds': round(duration), 'codec': stream.get('codec_name'), 'width': stream.get('width'),
            'height': stream.get('height'), 'format': (payload.get('format') or {}).get('format_name')}


def process_video_bytes(data: bytes) -> tuple[bytes, bytes, dict]:
    with tempfile.TemporaryDirectory() as folder:
        source = os.path.join(folder, 'source.upload')
        output = os.path.join(folder, 'playback.mp4')
        thumbnail = os.path.join(folder, 'thumbnail.jpg')
        with open(source, 'wb') as handle:
            handle.write(data)
        scan_path(source)
        metadata = _probe(source)
        transcode = subprocess.run(['/usr/bin/ffmpeg', '-y', '-i', source, '-vf', "scale='min(1280,iw)':-2", '-c:v', 'libx264',
                                    '-preset', 'fast', '-crf', '28', '-c:a', 'aac', '-b:a', '96k', '-movflags', '+faststart', output],
                                   capture_output=True, timeout=600)
        if transcode.returncode != 0:
            raise RuntimeError('Video transcoding failed.')
        thumb = subprocess.run(['/usr/bin/ffmpeg', '-y', '-ss', '0', '-i', output, '-frames:v', '1', '-vf', 'scale=640:-2', thumbnail],
                               capture_output=True, timeout=120)
        if thumb.returncode != 0:
            raise RuntimeError('Video thumbnail generation failed.')
        with open(output, 'rb') as handle:
            playback = handle.read()
        with open(thumbnail, 'rb') as handle:
            poster = handle.read()
    return playback, poster, metadata


async def queue_video_processing(record: dict):
    job = {'id': uid(), 'org_id': record['org_id'], 'kind': 'practice_video', 'resource_id': record['id'],
           'status': 'pending', 'attempts': 0, 'created_at': now(), 'updated_at': now()}
    await db.media_jobs.insert_one(job)


async def process_video_job(job: dict):
    record = await db.practice_videos.find_one({'org_id': job['org_id'], 'id': job['resource_id'], 'is_deleted': {'$ne': True}}, {'_id': 0})
    if not record:
        await db.media_jobs.update_one({'id': job['id']}, {'$set': {'status': 'cancelled', 'updated_at': now()}})
        return
    try:
        source, _ = await asyncio.to_thread(get_object, record['original_storage_path'])
        playback, poster, metadata = await asyncio.to_thread(process_video_bytes, source)
        base = f'{APP_NAME}/{record["org_id"]}/practice/{record["therapist_id"]}/{record["id"]}'
        video_object, image_object = await asyncio.gather(
            asyncio.to_thread(put_object, base + '/playback.mp4', playback, 'video/mp4'),
            asyncio.to_thread(put_object, base + '/thumbnail.jpg', poster, 'image/jpeg'),
        )
        changes = {'processing_status': 'ready', 'processing_error': '', 'playback_path': video_object['path'],
                   'thumbnail_path': image_object['path'], 'content_type': 'video/mp4', 'duration_seconds': metadata['duration_seconds'],
                   'validated_media': metadata, 'processed_at': now(), 'published_at': now(), 'updated_at': now()}
        await db.practice_videos.update_one({'org_id': record['org_id'], 'id': record['id']}, {'$set': changes})
        await db.media_jobs.update_one({'id': job['id']}, {'$set': {'status': 'completed', 'completed_at': now(), 'updated_at': now()}})
    except ValueError as exc:
        await db.practice_videos.update_one({'org_id': record['org_id'], 'id': record['id']}, {'$set': {'processing_status': 'rejected', 'processing_error': str(exc), 'updated_at': now()}})
        await db.media_jobs.update_one({'id': job['id']}, {'$set': {'status': 'rejected', 'last_error': str(exc), 'updated_at': now()}})
    except Exception as exc:
        attempts = job.get('attempts', 1)
        status = 'failed' if attempts >= 3 else 'pending'
        await db.practice_videos.update_one({'org_id': record['org_id'], 'id': record['id']}, {'$set': {'processing_status': 'failed' if status == 'failed' else 'processing', 'processing_error': 'Media processing could not be completed.', 'updated_at': now()}})
        await db.media_jobs.update_one({'id': job['id']}, {'$set': {'status': status, 'last_error': type(exc).__name__, 'updated_at': now()}})
        logger.warning('Media job failed id=%s error=%s', job['id'], type(exc).__name__)


async def media_worker():
    while True:
        try:
            job = await db.media_jobs.find_one_and_update({'status': 'pending', 'attempts': {'$lt': 3}},
                {'$set': {'status': 'processing', 'updated_at': now()}, '$inc': {'attempts': 1}}, sort=[('created_at', 1)],
                return_document=ReturnDocument.AFTER)
            if job:
                await process_video_job(job)
            else:
                await asyncio.sleep(2)
        except asyncio.CancelledError:
            raise
        except Exception as exc:
            logger.warning('Media worker cycle failed: %s', type(exc).__name__)
            await asyncio.sleep(3)