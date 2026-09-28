from datetime import date, timedelta
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException
from pydantic import Field

from config import Input, Payload, db, now, uid
from security import ScopedRepo, audit, authorize, principal


router = APIRouter()
CATEGORY = Literal['sleep', 'food', 'activity', 'routine', 'communication']
STATUS = Literal['draft', 'published']
SAFE_FIELDS = ['id', 'child_id', 'child_name', 'week_start', 'week_end', 'title', 'note',
               'why_this_helps', 'items', 'status', 'author_name', 'created_at', 'published_at',
               'updated_at', 'version']


class PlanItemInput(Input):
    id: str = Field(default='', max_length=100)
    text: str = Field(min_length=2, max_length=240)
    category: CATEGORY


class HomePlanInput(Input):
    child_id: str = Field(min_length=1, max_length=100)
    week_start: str = Field(max_length=10)
    title: str = Field(min_length=3, max_length=120)
    note: str = Field(min_length=5, max_length=1200)
    why_this_helps: str = Field(min_length=5, max_length=1200)
    items: list[PlanItemInput] = Field(min_length=1, max_length=6)
    status: STATUS


class HomePlanUpdate(HomePlanInput):
    version: int = Field(ge=1)


class PlanResponseInput(Input):
    completed_item_ids: list[str] = Field(default_factory=list, max_length=6)
    comment: str = Field(default='', max_length=600)


def _week_range(value: str) -> tuple[str, str]:
    try:
        start = date.fromisoformat(value)
    except ValueError:
        raise HTTPException(422, 'Choose a valid week start date.')
    if start > date.today() + timedelta(days=60):
        raise HTTPException(422, 'The home plan cannot start more than 60 days ahead.')
    return start.isoformat(), (start + timedelta(days=6)).isoformat()


def _items(values: list[PlanItemInput], existing_ids: set[str] | None = None) -> list[dict]:
    result = []
    for item in values:
        item_id = item.id if existing_ids and item.id in existing_ids else uid()
        result.append({'id': item_id, 'text': item.text.strip(), 'category': item.category})
    return result


def serialize_plan(record: dict, p: dict) -> dict:
    clean = {key: record.get(key) for key in SAFE_FIELDS}
    read_by = record.get('read_by', [])
    responses = record.get('responses', [])
    mine = next((response for response in responses if response.get('user_id') == p['id']), None)
    clean['viewed'] = p['id'] in read_by
    clean['family_viewed'] = bool(read_by)
    if p['role'] == 'parent':
        clean['completed_item_ids'] = (mine or {}).get('completed_item_ids', [])
        clean['parent_comment'] = (mine or {}).get('comment', '')
        clean['response_updated_at'] = (mine or {}).get('updated_at', '')
    else:
        latest = max(responses, key=lambda x: x.get('updated_at', ''), default={})
        count = len(latest.get('completed_item_ids', []))
        clean['family_completed_count'] = count
        clean['family_completion_percent'] = round((count / len(record.get('items', []))) * 100) if record.get('items') else 0
        clean['parent_comment'] = latest.get('comment', '')
        clean['response_updated_at'] = latest.get('updated_at', '')
    return clean


async def _owned_plan(video_id: str, p: dict, permission: str) -> dict:
    await authorize(p, permission)
    record = await ScopedRepo(p).one('home_plans', 'home_plans:read', video_id)
    if p['role'] == 'staff' and record.get('author_id') != p['id']:
        raise HTTPException(403, 'Only the team member who created this plan can change it.')
    return record


async def _check_duplicate(org_id: str, child_id: str, week_start: str, exclude_id: str = ''):
    query = {'org_id': org_id, 'child_id': child_id, 'week_start': week_start,
             'status': {'$ne': 'withdrawn'}, 'is_deleted': {'$ne': True}}
    if exclude_id:
        query['id'] = {'$ne': exclude_id}
    if await db.home_plans.find_one(query, {'_id': 0, 'id': 1}):
        raise HTTPException(409, 'This child already has a home plan for that week.')


@router.post('/home-plans', response_model=Payload, status_code=201)
async def create_home_plan(data: HomePlanInput, p=Depends(principal)):
    await authorize(p, 'home_plans:create')
    child = await ScopedRepo(p).one('children', 'children:read', data.child_id)
    week_start, week_end = _week_range(data.week_start)
    await _check_duplicate(p['org_id'], child['id'], week_start)
    timestamp = now()
    record = {
        'id': uid(), 'org_id': p['org_id'], 'child_id': child['id'], 'child_name': child['name'],
        'week_start': week_start, 'week_end': week_end, 'title': data.title, 'note': data.note,
        'why_this_helps': data.why_this_helps, 'items': _items(data.items), 'status': data.status,
        'author_id': p['id'], 'author_name': p['display_name'], 'read_by': [], 'responses': [],
        'created_at': timestamp, 'published_at': timestamp if data.status == 'published' else '',
        'updated_at': timestamp, 'version': 1, 'is_deleted': False, 'synthetic_environment': True,
    }
    await db.home_plans.insert_one(record.copy())
    await audit(p, 'home_plans:create', record['id'])
    return serialize_plan(record, p)


@router.patch('/home-plans/{plan_id}', response_model=Payload)
async def update_home_plan(plan_id: str, data: HomePlanUpdate, p=Depends(principal)):
    record = await _owned_plan(plan_id, p, 'home_plans:update')
    child = await ScopedRepo(p).one('children', 'children:read', data.child_id)
    week_start, week_end = _week_range(data.week_start)
    await _check_duplicate(p['org_id'], data.child_id, week_start, plan_id)
    item_ids = {item['id'] for item in record.get('items', [])}
    items = _items(data.items, item_ids)
    valid_ids = {item['id'] for item in items}
    responses = [{**response, 'completed_item_ids': [item_id for item_id in response.get('completed_item_ids', []) if item_id in valid_ids]}
                 for response in record.get('responses', [])]
    timestamp = now()
    changes = {'child_id': data.child_id, 'child_name': child['name'], 'week_start': week_start, 'week_end': week_end,
               'title': data.title, 'note': data.note, 'why_this_helps': data.why_this_helps,
               'items': items, 'status': data.status, 'responses': responses, 'updated_at': timestamp}
    if data.status == 'published' and record.get('status') != 'published':
        changes.update({'published_at': timestamp, 'read_by': []})
    result = await db.home_plans.update_one(
        {'org_id': p['org_id'], 'id': plan_id, 'version': data.version, 'is_deleted': {'$ne': True}},
        {'$set': changes, '$inc': {'version': 1}},
    )
    if not result.matched_count:
        raise HTTPException(409, 'This weekly plan changed. Refresh before trying again.')
    await audit(p, 'home_plans:update', plan_id)
    return serialize_plan({**record, **changes, 'version': data.version + 1}, p)


@router.post('/home-plans/{plan_id}/withdraw', response_model=Payload)
async def withdraw_home_plan(plan_id: str, p=Depends(principal)):
    record = await _owned_plan(plan_id, p, 'home_plans:withdraw')
    if record.get('status') == 'withdrawn':
        return {'message': 'Weekly plan is already withdrawn.'}
    await db.home_plans.update_one({'org_id': p['org_id'], 'id': plan_id},
                                   {'$set': {'status': 'withdrawn', 'withdrawn_at': now(), 'updated_at': now()}, '$inc': {'version': 1}})
    await audit(p, 'home_plans:withdraw', plan_id)
    return {'message': 'Weekly plan withdrawn from the family portal.'}


@router.post('/home-plans/{plan_id}/viewed', response_model=Payload)
async def mark_home_plan_viewed(plan_id: str, p=Depends(principal)):
    await authorize(p, 'home_plans:view')
    await ScopedRepo(p).one('home_plans', 'home_plans:read', plan_id)
    await db.home_plans.update_one({'org_id': p['org_id'], 'id': plan_id, 'status': 'published'},
                                   {'$addToSet': {'read_by': p['id']}, '$set': {f'viewed_at.{p["id"]}': now()}})
    await audit(p, 'home_plans:view', plan_id)
    return {'message': 'Weekly plan marked as viewed.'}


@router.patch('/home-plans/{plan_id}/response', response_model=Payload)
async def update_home_plan_response(plan_id: str, data: PlanResponseInput, p=Depends(principal)):
    await authorize(p, 'home_plans:respond')
    record = await ScopedRepo(p).one('home_plans', 'home_plans:read', plan_id)
    valid_ids = {item['id'] for item in record.get('items', [])}
    completed = list(dict.fromkeys(data.completed_item_ids))
    if any(item_id not in valid_ids for item_id in completed):
        raise HTTPException(422, 'One of the selected home-plan items is no longer available.')
    response = {'user_id': p['id'], 'completed_item_ids': completed, 'comment': data.comment.strip(), 'updated_at': now()}
    responses = [item for item in record.get('responses', []) if item.get('user_id') != p['id']] + [response]
    await db.home_plans.update_one({'org_id': p['org_id'], 'id': plan_id, 'status': 'published'},
                                   {'$set': {'responses': responses}, '$addToSet': {'read_by': p['id']}})
    await audit(p, 'home_plans:respond', plan_id)
    return serialize_plan({**record, 'responses': responses, 'read_by': list(set(record.get('read_by', [])) | {p['id']})}, p)