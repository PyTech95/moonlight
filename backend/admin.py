from typing import Literal
from fastapi import APIRouter, Depends, Query, HTTPException, UploadFile, File, Form
from pydantic import Field, EmailStr
from config import db, Input, Payload, uid
from security import principal, ScopedRepo, authorize, audit
from storage import put_object, APP_NAME
import uuid

router = APIRouter()
STAGES = ['New', 'Contacted', 'Assessment Requested', 'Assessment Scheduled', 'Assessed', 'Plan Proposed', 'Enrolled', 'Waitlisted', 'Closed']


@router.get('/admin/enquiries', response_model=Payload)
async def enquiries(offset: int = Query(0, ge=0), limit: int = Query(50, ge=1, le=100), p=Depends(principal)):
    records = await ScopedRepo(p).list('enquiries', 'enquiries:read', offset=offset, limit=limit)
    return {'items': records, 'offset': offset, 'limit': limit}


class StageInput(Input):
    stage: Literal['New', 'Contacted', 'Assessment Requested', 'Assessment Scheduled', 'Assessed', 'Plan Proposed', 'Enrolled', 'Waitlisted', 'Closed']
    version: int = Field(ge=1)


@router.patch('/admin/enquiries/{enquiry_id}', response_model=Payload)
async def update_enquiry(enquiry_id: str, data: StageInput, p=Depends(principal)):
    return await ScopedRepo(p).update('enquiries', 'enquiries:update', enquiry_id, {'stage': data.stage}, data.version)


@router.get('/admin/settings', response_model=Payload)
async def get_settings(p=Depends(principal)):
    await authorize(p, 'settings:read')
    await audit(p, 'settings:read', 'organization')
    return await db.settings.find_one({'org_id': p['org_id']}, {'_id': 0, 'org_id': 0})


class SettingsInput(Input):
    email: EmailStr
    phone: str = Field(min_length=8, max_length=25)
    secondary_phone: str = Field(min_length=8, max_length=25)
    address: str = Field(min_length=20, max_length=500)
    version: int = Field(ge=1)


@router.patch('/admin/settings', response_model=Payload)
async def update_settings(data: SettingsInput, p=Depends(principal)):
    await authorize(p, 'settings:update')
    changes = data.model_dump(exclude={'version'})
    changes['verification_status'] = 'Pending center verification'
    result = await db.settings.update_one({'org_id': p['org_id'], 'version': data.version}, {'$set': changes, '$inc': {'version': 1}})
    if not result.matched_count:
        raise HTTPException(409, 'Settings changed. Refresh before saving.')
    await audit(p, 'settings:update', 'organization')
    return await db.settings.find_one({'org_id': p['org_id']}, {'_id': 0, 'org_id': 0})


@router.get('/admin/audit', response_model=Payload)
async def audit_log(p=Depends(principal)):
    return {'items': await ScopedRepo(p).list('audit', 'audit:read', limit=100)}


@router.post('/admin/children/{child_id}/revoke-guardian', response_model=Payload)
async def revoke(child_id: str, p=Depends(principal)):
    await authorize(p, 'access:revoke')
    await ScopedRepo(p).one('children', 'children:read', child_id)
    await db.children.update_one({'org_id': p['org_id'], 'id': child_id}, {'$set': {'guardian_ids': []}, '$inc': {'version': 1}})
    await audit(p, 'access:revoke', child_id)
    return {'message': 'Guardian access revoked. Existing sessions will lose child access immediately.'}


MEDIA_MIME = {'image/jpeg', 'image/png', 'image/webp', 'image/gif'}


async def _return_settings(org_id):
    return await db.settings.find_one({'org_id': org_id}, {'_id': 0, 'org_id': 0})


@router.post('/admin/media', response_model=Payload)
async def upload_media(slot: str = Form(...), name: str = Form(''), role: str = Form(''), file: UploadFile = File(None), p=Depends(principal)):
    await authorize(p, 'settings:update')
    if slot not in {'hero', 'director', 'team_photo', 'team'}:
        raise HTTPException(422, 'Unknown image slot.')
    path = ''
    if file is not None:
        if file.content_type not in MEDIA_MIME:
            raise HTTPException(422, 'Please upload a JPG, PNG, WEBP or GIF image.')
        data = await file.read()
        if len(data) > 6 * 1024 * 1024:
            raise HTTPException(422, 'Image must be under 6 MB.')
        ext = (file.filename or 'img.png').rsplit('.', 1)[-1].lower()
        result = put_object(f'{APP_NAME}/{p["org_id"]}/{uuid.uuid4()}.{ext}', data, file.content_type)
        path = result['path']
    if slot == 'team':
        if not name.strip() or not role.strip():
            raise HTTPException(422, 'A name and role are required for a team member.')
        member = {'id': uid(), 'name': name.strip()[:80], 'role': role.strip()[:80], 'photo': path}
        await db.settings.update_one({'org_id': p['org_id']}, {'$push': {'team': member}, '$inc': {'version': 1}})
    elif slot == 'hero':
        if not path:
            raise HTTPException(422, 'Please choose an image to upload.')
        await db.settings.update_one({'org_id': p['org_id']}, {'$push': {'hero_images': path}, '$inc': {'version': 1}})
    else:
        if not path:
            raise HTTPException(422, 'Please choose an image to upload.')
        field = 'director_photo' if slot == 'director' else slot
        await db.settings.update_one({'org_id': p['org_id']}, {'$set': {field: path}, '$inc': {'version': 1}})
    await audit(p, 'settings:update', f'media:{slot}')
    return await _return_settings(p['org_id'])


class MediaRemoveInput(Input):
    slot: Literal['hero', 'team', 'director', 'team_photo']
    value: str = Field(default='', max_length=400)


@router.post('/admin/media/remove', response_model=Payload)
async def remove_media(data: MediaRemoveInput, p=Depends(principal)):
    await authorize(p, 'settings:update')
    if data.slot == 'hero':
        await db.settings.update_one({'org_id': p['org_id']}, {'$pull': {'hero_images': data.value}, '$inc': {'version': 1}})
    elif data.slot == 'team':
        await db.settings.update_one({'org_id': p['org_id']}, {'$pull': {'team': {'id': data.value}}, '$inc': {'version': 1}})
    else:
        field = 'director_photo' if data.slot == 'director' else data.slot
        await db.settings.update_one({'org_id': p['org_id']}, {'$set': {field: ''}, '$inc': {'version': 1}})
    await audit(p, 'settings:update', f'media-remove:{data.slot}')
    return await _return_settings(p['org_id'])