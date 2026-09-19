import json
import os
import uuid
from datetime import datetime, timezone, timedelta

from fastapi import APIRouter, Depends, HTTPException
from pydantic import Field

from config import APP_MODE, Input, Payload, db, now, uid
from security import audit, authorize, principal
from storage import APP_NAME, get_object, put_object
from vault import decrypt_bytes, encrypt_bytes


router = APIRouter()
BACKUP_COLLECTIONS = ['users', 'children', 'appointments', 'activities', 'announcements', 'requests', 'enquiries',
                      'practice_videos', 'home_plans', 'access_grants', 'consents', 'settings', 'audit']


class RetentionInput(Input):
    enabled: bool
    practice_video_days: int | None = Field(default=None, ge=30, le=3650)
    audit_days: int | None = Field(default=None, ge=90, le=3650)
    backup_days: int | None = Field(default=None, ge=7, le=3650)


class RestoreInput(Input):
    confirmation: str = Field(min_length=6, max_length=100)


@router.get('/admin/operations', response_model=Payload)
async def operations_overview(p=Depends(principal)):
    await authorize(p, 'operations:manage')
    settings = await db.settings.find_one({'org_id': p['org_id']}, {'_id': 0, 'retention': 1}) or {}
    backups = await db.backups.find({'org_id': p['org_id']}, {'_id': 0, 'storage_path': 0}).sort('created_at', -1).limit(20).to_list(20)
    pipeline = [{'$match': {'org_id': p['org_id'], 'is_deleted': {'$ne': True}}}, {'$group': {'_id': None, 'bytes': {'$sum': '$size_bytes'}, 'count': {'$sum': 1}}}]
    usage = await db.practice_videos.aggregate(pipeline).to_list(1)
    return {'retention': settings.get('retention', {'enabled': False}), 'backups': backups,
            'storage_usage': usage[0] if usage else {'bytes': 0, 'count': 0},
            'scanner': {'ffprobe': bool(os.path.exists('/usr/bin/ffprobe')), 'clamav': bool(os.path.exists('/usr/bin/clamscan'))},
            'targets': {'rpo_hours': 24, 'rto_hours': 4, 'approval_status': 'Proposed — center approval required'}}


@router.patch('/admin/operations/retention', response_model=Payload)
async def update_retention(data: RetentionInput, p=Depends(principal)):
    await authorize(p, 'operations:manage')
    retention = data.model_dump()
    retention.update({'approved': False, 'approval_status': 'Pending center/legal approval', 'updated_at': now(), 'updated_by': p['id']})
    await db.settings.update_one({'org_id': p['org_id']}, {'$set': {'retention': retention}, '$inc': {'version': 1}})
    await audit(p, 'operations:retention-update', 'organization')
    return retention


@router.post('/admin/backups', response_model=Payload, status_code=201)
async def create_backup(p=Depends(principal)):
    await authorize(p, 'operations:manage')
    payload = {'format_version': 1, 'org_id': p['org_id'], 'created_at': now(), 'collections': {}}
    counts = {}
    for name in BACKUP_COLLECTIONS:
        records = await db[name].find({'org_id': p['org_id']}, {'_id': 0}).to_list(100000)
        payload['collections'][name] = records
        counts[name] = len(records)
    raw = json.dumps(payload, default=str, separators=(',', ':')).encode()
    encrypted = encrypt_bytes(raw)
    backup_id = uid()
    path = f'{APP_NAME}/{p["org_id"]}/backups/{backup_id}.json.fernet'
    stored = put_object(path, encrypted, 'application/octet-stream')
    record = {'id': backup_id, 'org_id': p['org_id'], 'storage_path': stored['path'], 'size_bytes': stored.get('size', len(encrypted)),
              'counts': counts, 'format_version': 1, 'status': 'created', 'created_by': p['id'], 'created_at': now()}
    await db.backups.insert_one(record.copy())
    await audit(p, 'operations:backup-create', backup_id)
    return {key: value for key, value in record.items() if key not in {'org_id', 'storage_path'}}


@router.post('/admin/backups/{backup_id}/verify', response_model=Payload)
async def verify_backup(backup_id: str, p=Depends(principal)):
    await authorize(p, 'operations:manage')
    record = await db.backups.find_one({'org_id': p['org_id'], 'id': backup_id}, {'_id': 0})
    if not record:
        raise HTTPException(404, 'Backup not found.')
    try:
        encrypted, _ = get_object(record['storage_path'])
        payload = json.loads(decrypt_bytes(encrypted))
    except Exception:
        await db.backups.update_one({'id': backup_id, 'org_id': p['org_id']}, {'$set': {'status': 'verification_failed', 'verified_at': now()}})
        raise HTTPException(422, 'Backup verification failed.')
    valid = payload.get('org_id') == p['org_id'] and payload.get('format_version') == 1
    status = 'verified' if valid else 'verification_failed'
    await db.backups.update_one({'id': backup_id, 'org_id': p['org_id']}, {'$set': {'status': status, 'verified_at': now()}})
    await audit(p, 'operations:backup-verify', backup_id, 'allowed' if valid else 'failed')
    if not valid:
        raise HTTPException(422, 'Backup verification failed.')
    return {'message': 'Backup decrypted and collection manifest verified.', 'counts': record['counts'], 'status': status}


@router.post('/admin/backups/{backup_id}/restore', response_model=Payload)
async def restore_backup(backup_id: str, data: RestoreInput, p=Depends(principal)):
    await authorize(p, 'operations:manage')
    if APP_MODE != 'demo' and os.environ.get('ALLOW_RESTORE') != 'true':
        raise HTTPException(403, 'Production restore is disabled. Set ALLOW_RESTORE only during an approved recovery window.')
    if data.confirmation != backup_id[-6:]:
        raise HTTPException(422, 'Restore confirmation does not match.')
    record = await db.backups.find_one({'org_id': p['org_id'], 'id': backup_id, 'status': 'verified'}, {'_id': 0})
    if not record:
        raise HTTPException(404, 'Verify the backup before restoring it.')
    encrypted, _ = get_object(record['storage_path'])
    payload = json.loads(decrypt_bytes(encrypted))
    restored = {}
    for name, records in payload.get('collections', {}).items():
        if name not in BACKUP_COLLECTIONS:
            continue
        count = 0
        for item in records:
            item['org_id'] = p['org_id']
            key = {'org_id': p['org_id'], 'id': item['id']} if item.get('id') else {'org_id': p['org_id']}
            await db[name].replace_one(key, item, upsert=True)
            count += 1
        restored[name] = count
    await db.backups.update_one({'id': backup_id, 'org_id': p['org_id']}, {'$set': {'last_restored_at': now(), 'last_restored_by': p['id']}})
    await audit(p, 'operations:backup-restore', backup_id)
    return {'message': 'Backup restore completed with non-destructive upserts.', 'restored': restored}