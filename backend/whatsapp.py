import logging
import httpx
from vault import decrypt_secret

logger = logging.getLogger('whatsapp')


async def send_whatsapp_template(cfg, body_values):
    """Send an approved WhatsApp template via the Meta Cloud API (Graph API)."""
    version = cfg.get('wa_api_version') or 'v26.0'
    phone_id = cfg['wa_phone_number_id']
    url = f'https://graph.facebook.com/{version}/{phone_id}/messages'
    to = ''.join(ch for ch in str(cfg['wa_recipient']) if ch.isdigit())
    template = {
        'name': cfg['wa_template_name'],
        'language': {'code': cfg.get('wa_template_language') or 'en_US'},
    }
    if body_values:
        template['components'] = [{
            'type': 'body',
            'parameters': [{'type': 'text', 'text': str(v)} for v in body_values],
        }]
    payload = {
        'messaging_product': 'whatsapp',
        'recipient_type': 'individual',
        'to': to,
        'type': 'template',
        'template': template,
    }
    headers = {'Authorization': f"Bearer {decrypt_secret(cfg['wa_access_token'])}", 'Content-Type': 'application/json'}
    async with httpx.AsyncClient(timeout=15.0) as http:
        resp = await http.post(url, headers=headers, json=payload)
    if resp.is_error:
        try:
            detail = resp.json()
        except Exception:
            detail = {'text': resp.text[:300]}
        raise RuntimeError(f'WhatsApp API {resp.status_code}: {detail}')
    return resp.json()
