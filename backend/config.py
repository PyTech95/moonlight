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
ALLOWED_ORIGINS = [WEB_ORIGIN, os.environ['PREVIEW_PROXY_ORIGIN']]
APP_MODE = os.environ['APP_MODE']
if APP_MODE not in {'demo', 'production'}:
    raise RuntimeError('APP_MODE must be demo or production.')
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