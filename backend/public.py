import re
import os
import httpx
from datetime import datetime, timezone
from typing import Literal
from fastapi import APIRouter, Depends, Header, HTTPException, Response
from pydantic import Field, field_validator, EmailStr
from pymongo.errors import DuplicateKeyError
from config import db, Input, Payload, uid, now
from security import sandbox, rate_limit, digest
from seed import SETTINGS
from storage import get_object, APP_NAME

router = APIRouter()
SERVICES = ['Speech Therapy', 'Occupational Therapy', 'ABA Therapy', 'Sensory Integration Therapy', 'Yoga Therapy', 'Neurodevelopmental Therapy', 'Remedial Therapy', 'Music & Play Therapy', 'I am not sure']


class EnquiryInput(Input):
    guardian_name: str = Field(min_length=2, max_length=100)
    phone: str = Field(min_length=8, max_length=25)
    email: EmailStr | None = None
    service: str
    contact_time: Literal['Morning', 'Afternoon', 'Evening', 'Any time'] = 'Any time'
    contact_preference: Literal['Phone', 'Email'] = 'Phone'
    consent: bool
    source: str = Field(default='Website', max_length=100)
    country: str = Field(default='India', max_length=80)

    @field_validator('phone')
    @classmethod
    def phone_number(cls, value):
        compact = re.sub(r'[\s()-]', '', value)
        if not re.fullmatch(r'\+[1-9]\d{7,14}', compact):
            raise ValueError('Include a valid country code, for example +91.')
        return compact

    @field_validator('service')
    @classmethod
    def service_name(cls, value):
        if value not in SERVICES:
            raise ValueError('Choose a listed interest.')
        return value


@router.get('/public/settings', response_model=Payload)
async def settings(space=Depends(sandbox)):
    record = await db.settings.find_one({'org_id': space['org_id']}, {'_id': 0, 'org_id': 0})
    return record or SETTINGS


@router.get('/public/media/{path:path}')
async def media(path: str):
    if not path.startswith(APP_NAME + '/'):
        raise HTTPException(404, 'Not found.')
    try:
        data, content_type = get_object(path)
    except Exception:
        raise HTTPException(404, 'Not found.')
    return Response(content=data, media_type=content_type, headers={'Cache-Control': 'public, max-age=86400'})


async def _fetch_google_reviews(key: str):
    place_id = os.environ.get('GOOGLE_PLACES_PLACE_ID', '').strip()
    query = os.environ.get('GOOGLE_PLACES_QUERY', '').strip()
    maps_url = os.environ.get('GOOGLE_MAPS_URL', '').strip()
    async with httpx.AsyncClient(timeout=10.0) as http:
        if not place_id:
            if not query:
                return {'configured': True, 'reviews': [], 'googleMapsUri': maps_url}
            search = await http.post('https://places.googleapis.com/v1/places:searchText',
                                     headers={'Content-Type': 'application/json', 'X-Goog-Api-Key': key,
                                              'X-Goog-FieldMask': 'places.id'},
                                     json={'textQuery': query, 'pageSize': 1})
            search.raise_for_status()
            places = search.json().get('places', [])
            if not places:
                return {'configured': True, 'reviews': [], 'googleMapsUri': maps_url}
            place_id = places[0]['id']
        detail = await http.get(f'https://places.googleapis.com/v1/places/{place_id}',
                                headers={'X-Goog-Api-Key': key,
                                         'X-Goog-FieldMask': 'id,displayName,rating,userRatingCount,googleMapsUri,reviews'},
                                params={'languageCode': 'en'})
        detail.raise_for_status()
        p = detail.json()
    reviews = [{'rating': rv.get('rating'),
                'text': (rv.get('text') or {}).get('text'),
                'author': (rv.get('authorAttribution') or {}).get('displayName'),
                'authorUri': (rv.get('authorAttribution') or {}).get('uri'),
                'authorPhoto': (rv.get('authorAttribution') or {}).get('photoUri'),
                'relativeTime': rv.get('relativePublishTimeDescription'),
                'publishTime': rv.get('publishTime')}
               for rv in p.get('reviews', [])]
    return {'configured': True, 'rating': p.get('rating'), 'total': p.get('userRatingCount'),
            'name': (p.get('displayName') or {}).get('text'),
            'googleMapsUri': p.get('googleMapsUri') or maps_url, 'reviews': reviews}


@router.get('/public/reviews', response_model=Payload)
async def reviews():
    key = os.environ.get('GOOGLE_PLACES_API_KEY', '').strip()
    maps_url = os.environ.get('GOOGLE_MAPS_URL', '').strip()
    if not key:
        return {'configured': False, 'reviews': [], 'googleMapsUri': maps_url}
    ts = datetime.now(timezone.utc)
    cached = await db.review_cache.find_one({'_id': 'google'})
    if cached:
        fetched = cached['fetched_at']
        if fetched.tzinfo is None:
            fetched = fetched.replace(tzinfo=timezone.utc)
        if (ts - fetched).total_seconds() < 21600:
            return cached['data']
    try:
        data = await _fetch_google_reviews(key)
    except Exception:
        if cached:
            return cached['data']
        return {'configured': True, 'error': True, 'reviews': [], 'googleMapsUri': maps_url}
    await db.review_cache.replace_one({'_id': 'google'}, {'_id': 'google', 'data': data, 'fetched_at': ts}, upsert=True)
    return data


@router.post('/enquiries', response_model=Payload, status_code=201)
async def enquiry(data: EnquiryInput, space=Depends(sandbox), idempotency_key: str = Header(..., max_length=80)):
    if not data.consent:
        raise HTTPException(422, 'Please consent to being contacted about this request.')
    if data.contact_preference == 'Email' and not data.email:
        raise HTTPException(422, 'An email address is needed for email contact.')
    if len(idempotency_key) < 16:
        raise HTTPException(422, 'A valid request identifier is required.')
    fingerprint = digest(data.model_dump_json())
    existing = await db.enquiries.find_one({'org_id': space['org_id'], 'idempotency_key': idempotency_key}, {'_id': 0})
    if existing:
        if existing['fingerprint'] != fingerprint:
            raise HTTPException(409, 'This request identifier was already used. Start a new request.')
        return {'id': existing['id'], 'reference': existing['reference'], 'status': 'Request received', 'duplicate': True}
    await rate_limit('enquiry:' + space['org_id'], 10)
    record_id = uid()
    # Enquiry + one admissions task + outbox intent commit atomically in ONE Mongo document.
    record = {**data.model_dump(), 'id': record_id, 'org_id': space['org_id'], 'idempotency_key': idempotency_key,
              'fingerprint': fingerprint, 'reference': 'MN-' + record_id[:8].upper(), 'stage': 'New', 'version': 1,
              'created_at': now(), 'consent_record': {'version': 'contact-v1', 'scope': 'Assessment enquiry contact only', 'signed_at': now(), 'signer': data.guardian_name},
              'task': {'id': uid(), 'title': 'Review assessment enquiry', 'status': 'Open'},
              'notification': {'id': uid(), 'channel': data.contact_preference, 'status': 'Not Configured', 'retryable': True, 'attempts': 0}, 'synthetic_environment': True}
    try:
        await db.enquiries.insert_one(record.copy())
    except DuplicateKeyError:
        existing = await db.enquiries.find_one({'org_id': space['org_id'], 'idempotency_key': idempotency_key}, {'_id': 0})
        if existing['fingerprint'] != fingerprint:
            raise HTTPException(409, 'Request identifier conflict.')
        return {'id': existing['id'], 'reference': existing['reference'], 'status': 'Request received', 'duplicate': True}
    return {'id': record_id, 'reference': record['reference'], 'status': 'Request received', 'duplicate': False}