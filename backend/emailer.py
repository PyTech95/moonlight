import asyncio
import smtplib
import ssl
import logging
from email.message import EmailMessage

logger = logging.getLogger('emailer')


def _send_sync(cfg, subject, body, reply_to=None):
    message = EmailMessage()
    message['From'] = cfg['smtp_username']
    message['To'] = cfg['notify_email']
    if reply_to:
        message['Reply-To'] = reply_to
    message['Subject'] = subject
    message.set_content(body)
    context = ssl.create_default_context()
    host = cfg.get('smtp_host') or 'smtp.gmail.com'
    port = int(cfg.get('smtp_port') or 587)
    with smtplib.SMTP(host, port, timeout=30) as smtp:
        smtp.ehlo()
        smtp.starttls(context=context)
        smtp.ehlo()
        smtp.login(cfg['smtp_username'], cfg['smtp_app_password'])
        smtp.send_message(message)


async def send_email(cfg, subject, body, reply_to=None):
    """Send a plain-text email via SMTP without blocking the event loop."""
    await asyncio.to_thread(_send_sync, cfg, subject, body, reply_to)
