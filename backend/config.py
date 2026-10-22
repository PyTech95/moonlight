import os
from pathlib import Path
from dotenv import load_dotenv
from motor.motor_asyncio import AsyncIOMotorClient
from pydantic import BaseModel, ConfigDict
from datetime import datetime, timezone
from uuid import uuid4

load_dotenv(Path(__file__).parent / '.env')
client = AsyncIOMotorClient(os.environ['MONGO_URL'])
db = client[os.environ['DB_NAME']]
WEB_ORIGIN = os.environ['WEB_ORIGIN']
# PREVIEW_PROXY_ORIGIN is optional outside Emergent; EXTRA_ALLOWED_ORIGINS is a comma-separated list
# (e.g. https://www.moonlightneurocare.com, or the mobile app's origin later).
ALLOWED_ORIGINS = list(dict.fromkeys(
    [WEB_ORIGIN, os.environ.get('PREVIEW_PROXY_ORIGIN') or WEB_ORIGIN]
    + [o.strip() for o in os.environ.get('EXTRA_ALLOWED_ORIGINS', '').split(',') if o.strip()]
))
APP_MODE = os.environ['APP_MODE']
if APP_MODE not in {'demo', 'production'}:
    raise RuntimeError('APP_MODE must be demo or production.')
IS_DEMO = APP_MODE == 'demo'
PRODUCTION_ORG_ID = os.environ.get('PRODUCTION_ORG_ID')
if APP_MODE == 'production' and not PRODUCTION_ORG_ID:
    raise RuntimeError('PRODUCTION_ORG_ID is required in production mode.')


def now():
    return datetime.now(timezone.utc).isoformat()


def uid():
    return str(uuid4())


class Payload(BaseModel):
    model_config = ConfigDict(extra='allow')


class Input(BaseModel):
    model_config = ConfigDict(extra='forbid', str_strip_whitespace=True)