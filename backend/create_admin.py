"""Create (or reset) a center administrator for production.

Run from the backend folder with the production .env in place:

    python create_admin.py --email head@moonlightneurocare.com --name "Center Head"

The password is asked for interactively, or read from the ADMIN_PASSWORD environment variable
for automated setups. Administrators must set up 2-step verification (authenticator app) at
their first sign-in; pass --no-mfa only for a temporary test account.

Use --reset-password to set a new password for an existing account (this signs it out everywhere).
"""
import argparse
import asyncio
import getpass
import os
import sys

import bcrypt

from config import APP_MODE, PRODUCTION_ORG_ID, client, db, now, uid
from seed import SETTINGS


def password_problem(value: str) -> str:
    if len(value) < 12 or len(value) > 72:
        return 'Use 12 to 72 characters.'
    if not any(c.islower() for c in value) or not any(c.isupper() for c in value) or not any(c.isdigit() for c in value):
        return 'Use uppercase, lowercase and a number.'
    return ''


def read_password() -> str:
    value = os.environ.get('ADMIN_PASSWORD', '')
    if value:
        return value
    first = getpass.getpass('New admin password: ')
    second = getpass.getpass('Repeat password: ')
    if first != second:
        sys.exit('Passwords do not match.')
    return first


async def main(args) -> None:
    if APP_MODE != 'production':
        sys.exit('Set APP_MODE=production and PRODUCTION_ORG_ID in backend/.env before creating the real admin.')
    org_id = PRODUCTION_ORG_ID
    email = args.email.strip().lower()
    password = read_password()
    problem = password_problem(password)
    if problem:
        sys.exit(problem)

    # The center's public settings document must exist before the admin can edit it.
    await db.settings.update_one(
        {'org_id': org_id},
        {'$setOnInsert': {'org_id': org_id, **SETTINGS, 'verification_status': 'Published', 'created_at': now()}},
        upsert=True,
    )

    password_hash = bcrypt.hashpw(password.encode(), bcrypt.gensalt()).decode()
    existing = await db.users.find_one({'org_id': org_id, 'email': email}, {'_id': 0})
    if existing:
        if not args.reset_password:
            sys.exit(f'An account already exists for {email}. Re-run with --reset-password to set a new password.')
        await db.users.update_one(
            {'org_id': org_id, 'id': existing['id']},
            {'$set': {'password_hash': password_hash, 'active': True, 'password_changed_at': now()}, '$inc': {'security_version': 1}},
        )
        await db.sessions.delete_many({'org_id': org_id, 'user_id': existing['id']})
        print(f'Password reset for {email}. All of their sessions were signed out.')
        return

    user = {
        'id': uid(), 'org_id': org_id, 'email': email, 'display_name': args.name.strip(),
        'role': 'admin', 'roles': ['admin'], 'access_profile': 'administrator',
        'password_hash': password_hash, 'active': True, 'security_version': 1,
        'mfa_required': not args.no_mfa, 'mfa_enabled': False,
        'created_at': now(), 'created_by': 'create_admin.py',
    }
    await db.users.insert_one(user.copy())
    await db.audit.insert_one({'id': uid(), 'org_id': org_id, 'actor_id': user['id'], 'action': 'accounts:bootstrap-admin',
                               'resource_id': user['id'], 'result': 'allowed', 'created_at': now()})
    print(f'Admin created: {email} (organization {org_id}).')
    print('Next: sign in at /login.' + ('' if args.no_mfa else ' You will be asked to set up an authenticator app first.'))


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description='Create or reset a Moonlight Neurocare administrator.')
    parser.add_argument('--email', required=True)
    parser.add_argument('--name', default='Center administrator')
    parser.add_argument('--reset-password', action='store_true')
    parser.add_argument('--no-mfa', action='store_true', help='Do not require 2-step verification (testing only).')
    try:
        asyncio.run(main(parser.parse_args()))
    finally:
        client.close()
