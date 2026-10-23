import argparse
import asyncio

from config import client, db, now


MIGRATION_ID = '001_phase0_identity_defaults'


async def up():
    await up_001()
    await up_002()


async def up_001():
    if await db.schema_migrations.find_one({'id': MIGRATION_ID}):
        return
    await db.users.update_many({'security_version': {'$exists': False}}, {'$set': {'security_version': 1}})
    await db.users.update_many({'access_profile': {'$exists': False}, 'role': 'parent'}, {'$set': {'access_profile': 'guardian', 'mfa_required': False, 'mfa_enabled': False}})
    await db.users.update_many({'access_profile': {'$exists': False}, 'role': 'staff'}, {'$set': {'access_profile': 'clinical', 'mfa_required': False, 'mfa_enabled': False}})
    await db.users.update_many({'access_profile': {'$exists': False}, 'role': 'admin'}, {'$set': {'access_profile': 'administrator', 'mfa_required': False, 'mfa_enabled': False}})
    await db.practice_videos.update_many({'processing_status': {'$exists': False}}, {'$set': {'processing_status': 'ready', 'media_legacy_verified': False}})
    await db.settings.update_many({'retention': {'$exists': False}}, {'$set': {'retention': {'enabled': False, 'approval_status': 'Pending center/legal approval'}}})
    await db.schema_migrations.insert_one({'id': MIGRATION_ID, 'applied_at': now()})


MIGRATION_002 = '002_phase4_session_end_times'


async def up_002():
    """Sessions get an explicit end time so clash checks are one range query."""
    if await db.schema_migrations.find_one({'id': MIGRATION_002}):
        return
    from datetime import datetime, timedelta, timezone
    async for a in db.appointments.find({'ends_at': {'$exists': False}}, {'_id': 1, 'starts_at': 1, 'duration_minutes': 1}):
        try:
            start = datetime.fromisoformat(a['starts_at'])
            start = start if start.tzinfo else start.replace(tzinfo=timezone.utc)
        except (KeyError, ValueError):
            continue
        end = start + timedelta(minutes=int(a.get('duration_minutes') or 45))
        await db.appointments.update_one({'_id': a['_id']}, {'$set': {
            'starts_at': start.astimezone(timezone.utc).replace(microsecond=0).isoformat(),
            'ends_at': end.astimezone(timezone.utc).replace(microsecond=0).isoformat()}})
    await db.schema_migrations.insert_one({'id': MIGRATION_002, 'applied_at': now()})


async def down():
    if not await db.schema_migrations.find_one({'id': MIGRATION_ID}):
        return
    await db.users.update_many({}, {'$unset': {'security_version': '', 'access_profile': '', 'mfa_required': '', 'mfa_enabled': ''}})
    await db.practice_videos.update_many({'media_legacy_verified': False}, {'$unset': {'processing_status': '', 'media_legacy_verified': ''}})
    await db.settings.update_many({'retention.approval_status': 'Pending center/legal approval'}, {'$unset': {'retention': ''}})
    await db.schema_migrations.delete_one({'id': MIGRATION_ID})


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('direction', choices=['up', 'down'])
    args = parser.parse_args()
    asyncio.run(up() if args.direction == 'up' else down())
    client.close()