import argparse
import asyncio

from config import client, db, now


MIGRATION_ID = '001_phase0_identity_defaults'


async def up():
    if await db.schema_migrations.find_one({'id': MIGRATION_ID}):
        return
    await db.users.update_many({'security_version': {'$exists': False}}, {'$set': {'security_version': 1}})
    await db.users.update_many({'access_profile': {'$exists': False}, 'role': 'parent'}, {'$set': {'access_profile': 'guardian', 'mfa_required': False, 'mfa_enabled': False}})
    await db.users.update_many({'access_profile': {'$exists': False}, 'role': 'staff'}, {'$set': {'access_profile': 'clinical', 'mfa_required': False, 'mfa_enabled': False}})
    await db.users.update_many({'access_profile': {'$exists': False}, 'role': 'admin'}, {'$set': {'access_profile': 'administrator', 'mfa_required': False, 'mfa_enabled': False}})
    await db.practice_videos.update_many({'processing_status': {'$exists': False}}, {'$set': {'processing_status': 'ready', 'media_legacy_verified': False}})
    await db.settings.update_many({'retention': {'$exists': False}}, {'$set': {'retention': {'enabled': False, 'approval_status': 'Pending center/legal approval'}}})
    await db.schema_migrations.insert_one({'id': MIGRATION_ID, 'applied_at': now()})


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