import logging
import httpx
from vault import decrypt_secret

logger = logging.getLogger('whatsapp')


async def send_whatsapp_template(cfg, body_values, to=None, template_name=None, language=None, button_text=None):
    """Send an approved WhatsApp template via the Meta Cloud API (Graph API).

    Defaults send the center's enquiry alert to wa_recipient. For one-time codes pass the parent's number, the
    authentication template name and button_text=code (Meta's copy-code button repeats the code)."""
    version = cfg.get('wa_api_version') or 'v26.0'
    phone_id = cfg['wa_phone_number_id']
    url = f'https://graph.facebook.com/{version}/{phone_id}/messages'
    to = ''.join(ch for ch in str(to or cfg['wa_recipient']) if ch.isdigit())
    template = {
        'name': template_name or cfg['wa_template_name'],
        'language': {'code': language or cfg.get('wa_template_language') or 'en_US'},
    }
    components = []
    if body_values:
        components.append({'type': 'body', 'parameters': [{'type': 'text', 'text': str(v)} for v in body_values]})
    if button_text:
        components.append({'type': 'button', 'sub_type': 'url', 'index': '0', 'parameters': [{'type': 'text', 'text': str(button_text)}]})
    if components:
        template['components'] = components
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
