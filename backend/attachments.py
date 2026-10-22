import asyncio
import tempfile

from fastapi import APIRouter, Depends, File, HTTPException, Response, UploadFile

from config import Payload, db, now, uid
from media_processing import scan_path
from school_access import child_access, require_scope
from security import audit, authorize, principal
from storage import APP_NAME, get_object, put_object

router = APIRouter()
MAX_BYTES = 10 * 1024 * 1024
SIGNATURES = {'application/pdf': (b'%PDF', 'pdf'), 'image/png': (b'\x89PNG', 'png'), 'image/jpeg': (b'\xff\xd8\xff', 'jpg')}


def _scan(data: bytes):
    with tempfile.NamedTemporaryFile(suffix='.upload') as temp:
        temp.write(data)
        temp.flush()
        scan_path(temp.name)


@router.post('/team/children/{child_id}/attachments', response_model=Payload, status_code=201)
async def stage_attachment(child_id: str, file: UploadFile = File(...), p=Depends(principal)):
    await authorize(p, 'team:message')
    ctx = await child_access(p, child_id)
    await require_scope(p, ctx, 'messages')
    data = await file.read(MAX_BYTES + 1)
    if not data or len(data) > MAX_BYTES:
        raise HTTPException(422, 'Attachments must be PDF, JPG or PNG and no larger than 10 MB.')
    kind = next((t for t, (magic, _) in SIGNATURES.items() if data.startswith(magic)), None)
    if not kind:
        raise HTTPException(422, 'Attachments must be PDF, JPG or PNG and no larger than 10 MB.')
    try:
        await asyncio.to_thread(_scan, data)
    except ValueError:
        await audit(p, 'team:attachment', child_id, 'malware_rejected')
        raise HTTPException(422, 'This file was rejected by the malware scan.')
    except Exception:
        raise HTTPException(503, 'The malware scanner is updating. Please try again in a minute.')
    att_id = uid()
    path = f'{APP_NAME}/team-attachments/{p["org_id"]}/{child_id}/{att_id}.{SIGNATURES[kind][1]}'
    try:
        await asyncio.to_thread(put_object, path, data, kind)
    except Exception:
        raise HTTPException(503, 'File storage is temporarily unavailable.')
    record = {'id': att_id, 'org_id': p['org_id'], 'child_id': child_id, 'owner_id': p['id'], 'filename': (file.filename or 'attachment')[:120],
              'content_type': kind, 'size': len(data), 'path': path, 'status': 'staged', 'created_at': now()}
    await db.team_attachments.insert_one(record.copy())
    await audit(p, 'team:attachment-stage', att_id)
    return {k: record[k] for k in ['id', 'filename', 'content_type', 'size']}


async def claim_attachments(p: dict, child_id: str, ids: list[str], message_id: str) -> list[dict]:
    if not ids:
        return []
    items = await db.team_attachments.find({'org_id': p['org_id'], 'child_id': child_id, 'owner_id': p['id'], 'status': 'staged', 'id': {'$in': ids}}, {'_id': 0}).to_list(10)
    if len(items) != len(set(ids)):
        raise HTTPException(422, 'One or more attachments are no longer available. Upload them again.')
    await db.team_attachments.update_many({'org_id': p['org_id'], 'id': {'$in': ids}}, {'$set': {'status': 'sent', 'message_id': message_id}})
    return [{k: i[k] for k in ['id', 'filename', 'content_type', 'size']} for i in items]


@router.get('/team/attachments/{attachment_id}')
async def download(attachment_id: str, p=Depends(principal)):
    await authorize(p, 'team:read')
    att = await db.team_attachments.find_one({'org_id': p['org_id'], 'id': attachment_id, 'status': 'sent'}, {'_id': 0})
    if not att:
        raise HTTPException(404, 'Record not found.')
    ctx = await child_access(p, att['child_id'])
    await require_scope(p, ctx, 'messages')
    message = await db.team_messages.find_one({'org_id': p['org_id'], 'id': att['message_id']}, {'_id': 0, 'author_id': 1, 'recipients': 1})
    allowed = message and (ctx['kind'] == 'coordinator' or message['author_id'] == p['id'] or any(r['id'] == p['id'] for r in message['recipients']))
    if not allowed:
        await audit(p, 'team:attachment-download', attachment_id, 'forbidden')
        raise HTTPException(404, 'Record not found.')
    try:
        data, _ = await asyncio.to_thread(get_object, att['path'])
    except Exception:
        raise HTTPException(404, 'File not found.')
    await audit(p, 'team:attachment-download', attachment_id)
    return Response(content=data, media_type=att['content_type'], headers={'Cache-Control': 'private, no-store', 'Content-Disposition': f'inline; filename="{att["filename"]}"'})
