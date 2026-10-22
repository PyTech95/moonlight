import asyncio
from typing import Annotated, Literal

from fastapi import APIRouter, Depends, File, Form, HTTPException, Response, UploadFile
from pydantic import Field

from config import Input, Payload, db, now, uid
from school_access import child_access, iso_in, require_clinical, require_scope
from security import audit, authorize, principal
from storage import APP_NAME, get_object, put_object

router = APIRouter()
DOC_KINDS = {'support_plan': 'School support plan', 'assessment_summary': 'Parent-friendly assessment summary',
             'accommodations': 'Accommodation recommendations', 'review_report': 'Review report', 'transition_summary': 'Transition / handover summary'}
DOC_TYPES = {'application/pdf': 'pdf', 'image/png': 'png', 'image/jpeg': 'jpg',
             'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx'}
MAX_DOC_BYTES = 15 * 1024 * 1024


class SharingUpdate(Input):
    share_with_school: bool
    allow_download: bool
    school_access_days: int = Field(ge=1, le=365)


async def _read_file(file: UploadFile) -> tuple[bytes, str]:
    content_type = (file.content_type or '').split(';')[0]
    if content_type not in DOC_TYPES:
        raise HTTPException(422, 'Upload a PDF, Word (.docx), PNG or JPEG document.')
    data = await file.read(MAX_DOC_BYTES + 1)
    if not data or len(data) > MAX_DOC_BYTES:
        raise HTTPException(422, 'Documents must be between 1 byte and 15 MB.')
    return data, content_type


async def _store(p, child_id, doc_id, version, file) -> dict:
    data, content_type = await _read_file(file)
    path = f'{APP_NAME}/documents/{p["org_id"]}/{child_id}/{doc_id}/v{version}-{uid()}.{DOC_TYPES[content_type]}'
    try:
        await asyncio.to_thread(put_object, path, data, content_type)
    except Exception:
        raise HTTPException(503, 'Document storage is temporarily unavailable.')
    return {'version': version, 'path': path, 'filename': (file.filename or 'document')[:120], 'content_type': content_type, 'size': len(data),
            'uploaded_by_name': p['display_name'], 'at': now()}


@router.post('/team/children/{child_id}/documents', response_model=Payload, status_code=201)
async def upload_document(child_id: str, kind: Annotated[Literal['support_plan', 'assessment_summary', 'accommodations', 'review_report', 'transition_summary'], Form()],
                          title: Annotated[str, Form(min_length=3, max_length=160)], share_with_school: Annotated[bool, Form()],
                          allow_download: Annotated[bool, Form()], school_access_days: Annotated[int, Form(ge=1, le=365)],
                          file: UploadFile = File(...), p=Depends(principal)):
    await authorize(p, 'team:clinical')
    ctx = await child_access(p, child_id)
    await require_clinical(p, ctx)
    doc_id = uid()
    version = await _store(p, child_id, doc_id, 1, file)
    record = {'id': doc_id, 'org_id': p['org_id'], 'child_id': child_id, 'kind': kind, 'kind_label': DOC_KINDS[kind], 'title': title,
              'share_with_school': share_with_school, 'allow_download': allow_download, 'school_access_expires_at': iso_in(school_access_days),
              'versions': [version], 'current_version': 1, 'access_log': [], 'created_by_name': p['display_name'], 'created_at': now()}
    await db.shared_documents.insert_one(record.copy())
    await audit(p, 'documents:upload', doc_id)
    return {'id': doc_id, 'message': 'Document added.'}


@router.post('/team/documents/{doc_id}/versions', response_model=Payload)
async def add_version(doc_id: str, file: UploadFile = File(...), p=Depends(principal)):
    await authorize(p, 'team:clinical')
    doc = await db.shared_documents.find_one({'org_id': p['org_id'], 'id': doc_id}, {'_id': 0})
    if not doc:
        raise HTTPException(404, 'Record not found.')
    ctx = await child_access(p, doc['child_id'])
    await require_clinical(p, ctx)
    version = await _store(p, doc['child_id'], doc_id, doc['current_version'] + 1, file)
    await db.shared_documents.update_one({'id': doc_id, 'org_id': p['org_id'], 'current_version': doc['current_version']},
                                         {'$push': {'versions': version}, '$set': {'current_version': version['version']}})
    await audit(p, 'documents:new-version', doc_id)
    return {'message': f'Version {version["version"]} added. Earlier versions are kept.'}


@router.patch('/team/documents/{doc_id}', response_model=Payload)
async def update_sharing(doc_id: str, data: SharingUpdate, p=Depends(principal)):
    await authorize(p, 'team:clinical')
    doc = await db.shared_documents.find_one({'org_id': p['org_id'], 'id': doc_id}, {'_id': 0})
    if not doc:
        raise HTTPException(404, 'Record not found.')
    ctx = await child_access(p, doc['child_id'])
    await require_clinical(p, ctx)
    await db.shared_documents.update_one({'id': doc_id, 'org_id': p['org_id']}, {'$set': {'share_with_school': data.share_with_school, 'allow_download': data.allow_download,
                                                                                         'school_access_expires_at': iso_in(data.school_access_days)}})
    await audit(p, 'documents:sharing-update', doc_id)
    return {'message': 'Document sharing updated.'}


@router.get('/team/documents/{doc_id}/file')
async def document_file(doc_id: str, download: bool = False, p=Depends(principal)):
    await authorize(p, 'team:read')
    doc = await db.shared_documents.find_one({'org_id': p['org_id'], 'id': doc_id}, {'_id': 0})
    if not doc:
        raise HTTPException(404, 'Record not found.')
    ctx = await child_access(p, doc['child_id'])
    await require_scope(p, ctx, 'documents')
    if ctx['kind'] == 'school' and (not doc.get('share_with_school') or doc['school_access_expires_at'] <= now()):
        await audit(p, 'documents:view', doc_id, 'not_visible')
        raise HTTPException(404, 'Record not found.')
    if download:
        await require_scope(p, ctx, 'download')
        if ctx['kind'] == 'school' and not doc.get('allow_download'):
            raise HTTPException(403, 'Downloading this document has not been permitted.')
    current = doc['versions'][-1]
    try:
        data, _ = await asyncio.to_thread(get_object, current['path'])
    except Exception:
        raise HTTPException(404, 'Document file not found.')
    action = 'download' if download else 'view'
    await db.shared_documents.update_one({'id': doc_id, 'org_id': p['org_id']}, {'$push': {'access_log': {'at': now(), 'user_name': p['display_name'], 'label': ctx['label'], 'action': action, 'version': current['version']}}})
    await audit(p, f'documents:{action}', doc_id)
    disposition = f'attachment; filename="{current["filename"]}"' if download else 'inline'
    return Response(content=data, media_type=current['content_type'], headers={'Cache-Control': 'private, no-store', 'Content-Disposition': disposition})


@router.get('/team/children/{child_id}/videos/{video_id}/media')
async def school_video(child_id: str, video_id: str, p=Depends(principal)):
    await authorize(p, 'team:read')
    ctx = await child_access(p, child_id)
    await require_scope(p, ctx, 'videos')
    if ctx['kind'] != 'school' or video_id not in ctx['link'].get('approved_video_ids', []):
        await audit(p, 'school:video', video_id, 'forbidden')
        raise HTTPException(404, 'Record not found.')
    record = await db.practice_videos.find_one({'org_id': p['org_id'], 'child_id': child_id, 'id': video_id, 'is_deleted': {'$ne': True}, 'processing_status': 'ready'}, {'_id': 0})
    if not record:
        raise HTTPException(404, 'Record not found.')
    try:
        data, stored_type = await asyncio.to_thread(get_object, record.get('playback_path') or record['storage_path'])
    except Exception:
        raise HTTPException(404, 'Video file not found.')
    await audit(p, 'school:video', video_id)
    return Response(content=data, media_type=record.get('content_type') or stored_type, headers={'Cache-Control': 'private, no-store', 'Content-Disposition': 'inline'})
