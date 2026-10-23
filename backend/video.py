"""Daily.co video rooms for online classes and 1:1 online sessions.

Keys come from Admin → Settings → Video (stored encrypted); DAILY_API_KEY / DAILY_DOMAIN in .env still work as a fallback.
"""
import os
from datetime import datetime, timedelta, timezone

import httpx
from fastapi import HTTPException

from config import db, uid
from vault import decrypt_secret


async def daily_config(org_id: str) -> tuple[str, str] | None:
    settings = await db.settings.find_one({'org_id': org_id}, {'_id': 0, 'daily_api_key': 1, 'daily_domain': 1}) or {}
    key = decrypt_secret(settings['daily_api_key']) if settings.get('daily_api_key') else os.environ.get('DAILY_API_KEY', '')
    domain = settings.get('daily_domain') or os.environ.get('DAILY_DOMAIN', '')
    if not key or not domain:
        return None
    if not domain.startswith('http'):
        domain = f'https://{domain}'
    return key, domain.rstrip('/')


async def video_connected(org_id: str) -> bool:
    return bool(await daily_config(org_id))


async def daily_call(key: str, path: str, payload: dict | None = None, method: str = 'POST') -> dict:
    async with httpx.AsyncClient(timeout=10) as client:
        response = await client.request(method, f'https://api.daily.co/v1/{path}', headers={'Authorization': f'Bearer {key}'}, json=payload)
    if response.status_code >= 400 and not (path == 'rooms' and 'already exists' in response.text):
        raise HTTPException(502, 'The video provider could not open the room. Please try again.')
    return response.json()


async def join_room(org_id: str, existing_room: str | None, ends: datetime, user: dict, is_owner: bool, max_participants: int) -> tuple[str, dict]:
    """Create the room once (private, expires after the session) and return (room name, join details)."""
    config = await daily_config(org_id)
    if not config:
        raise HTTPException(503, 'In-app video calling is not connected yet. The center needs to add its Daily.co key in Settings.')
    key, domain = config
    room_exp = int((ends + timedelta(minutes=15)).timestamp())
    room = existing_room or f'mnc-{uid()[:18]}'
    if not existing_room:
        await daily_call(key, 'rooms', {'name': room, 'privacy': 'private', 'properties': {
            'geo': 'ap-south-1', 'max_participants': max_participants, 'exp': room_exp, 'eject_at_room_exp': True,
            'enable_prejoin_ui': True, 'enable_chat': False, 'enable_screenshare': True, 'enable_knocking': False}})
    current = datetime.now(timezone.utc)
    exp = min(int((current + timedelta(minutes=90)).timestamp()), room_exp)
    token = await daily_call(key, 'meeting-tokens', {'properties': {
        'room_name': room, 'user_id': user['id'], 'user_name': user['display_name'], 'is_owner': is_owner, 'exp': exp,
        'eject_at_token_exp': True, 'enable_screenshare': is_owner, 'enable_recording': False}})
    return room, {'room_url': f'{domain}/{room}', 'token': token['token'], 'expires_at': exp}


async def test_connection(org_id: str) -> dict:
    config = await daily_config(org_id)
    if not config:
        raise HTTPException(422, 'Add the Daily.co API key and domain first, then save.')
    key, domain = config
    async with httpx.AsyncClient(timeout=10) as client:
        response = await client.get('https://api.daily.co/v1/', headers={'Authorization': f'Bearer {key}'})
    if response.status_code == 401:
        raise HTTPException(400, 'Daily.co rejected the API key. Copy it again from the Daily dashboard → Developers.')
    if response.status_code >= 400:
        raise HTTPException(400, f'Daily.co answered {response.status_code}. Try again in a minute.')
    return {'message': f'Connected to Daily.co ({domain}). Online sessions can now open video rooms.'}
