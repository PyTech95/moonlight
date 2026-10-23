"""Create (or reset) the sign-ins Google Play reviewers use to check the app.

A parent account and a therapist account, both linked only to one demo child ("Demo Child (app review)") that
holds no real information. Neither can see any real family. Run from the backend folder with the production
.env in place:

    python create_review_account.py

The password (the same for both) is asked for interactively, or read from REVIEW_PASSWORD. Use the same emails
and password in Play Console > App content > Sign in details. --reset sets a new password; --remove deletes both
accounts and the demo child once the app no longer needs review.
"""
import argparse
import asyncio
import getpass
import os
import sys
from datetime import date

import bcrypt

from center import add_care_link, age_label, initials
from config import APP_MODE, PRODUCTION_ORG_ID, client, db, now, uid
from create_admin import password_problem

DEMO_CHILD = 'Demo Child (app review)'


def read_password() -> str:
    value = os.environ.get('REVIEW_PASSWORD', '')
    if value:
        return value
    first = getpass.getpass('Password for the review account: ')
    if first != getpass.getpass('Repeat password: '):
        sys.exit('Passwords do not match.')
    return first


async def _account(org: str, email: str, name: str, role: str, profile: str, hashed: str, reset: bool) -> dict:
    user = await db.users.find_one({'org_id': org, 'email': email}, {'_id': 0})
    if user and not reset:
        sys.exit(f'{email} already exists. Re-run with --reset to set a new password.')
    if user:
        await db.users.update_one({'org_id': org, 'id': user['id']},
                                  {'$set': {'password_hash': hashed, 'active': True, 'mfa_required': False, 'password_changed_at': now()},
                                   '$inc': {'security_version': 1}})
        await db.sessions.delete_many({'org_id': org, 'user_id': user['id']})
        return user
    user = {'id': uid(), 'org_id': org, 'email': email, 'display_name': name, 'role': role, 'roles': [role], 'access_profile': profile,
            'password_hash': hashed, 'active': True, 'security_version': 1, 'mfa_required': False, 'mfa_enabled': False, 'phone': '',
            'demo_review': True, 'created_at': now(), 'created_by': 'create_review_account.py'}
    await db.users.insert_one(user.copy())
    return user


async def main(args) -> None:
    if APP_MODE != 'production':
        sys.exit('Set APP_MODE=production in backend/.env first.')
    org = PRODUCTION_ORG_ID
    emails = [args.email.strip().lower(), args.therapist_email.strip().lower()]
    if args.remove:
        for email in emails:
            user = await db.users.find_one({'org_id': org, 'email': email, 'demo_review': True}, {'_id': 0})
            if user:
                await db.access_grants.delete_many({'org_id': org, 'user_id': user['id']})
                await db.sessions.delete_many({'org_id': org, 'user_id': user['id']})
                await db.users.delete_one({'org_id': org, 'id': user['id']})
        await db.children.delete_many({'org_id': org, 'demo_review': True})
        print('Review accounts and the demo child removed.')
        return
    password = read_password()
    problem = password_problem(password)
    if problem:
        sys.exit(problem)
    hashed = bcrypt.hashpw(password.encode(), bcrypt.gensalt()).decode()
    user = await _account(org, emails[0], 'Google Play Review', 'parent', 'guardian', hashed, args.reset)
    therapist = await _account(org, emails[1], 'Review Therapist', 'staff', 'clinical', hashed, args.reset)
    child = await db.children.find_one({'org_id': org, 'demo_review': True}, {'_id': 0, 'id': 1})
    if not child:
        dob = date(date.today().year - 6, 6, 15).isoformat()
        child = {'id': uid(), 'org_id': org, 'name': DEMO_CHILD, 'initials': initials(DEMO_CHILD), 'date_of_birth': dob, 'age_label': age_label(dob),
                 'gender': '', 'school': '', 'concerns': ['Speech Therapy'], 'communication': '', 'home_address': '',
                 'admin_notes': 'Demo record for Google Play app review. Not a real child; remove with create_review_account.py --remove.',
                 'contacts': [{'name': 'Google Play Review', 'relation': 'Parent', 'phone': '+910000000000', 'email': emails[0], 'primary': True}],
                 'status': 'active', 'guardian_ids': [], 'staff_ids': [], 'goals': [], 'demo_review': True,
                 'shared_summary': 'This is a demo record so the app can be reviewed. Families see their own child here.',
                 'enquiry_id': '', 'created_at': now(), 'created_by': 'create_review_account.py', 'updated_at': now(), 'version': 1}
        await db.children.insert_one(child.copy())
    await add_care_link(org, child['id'], user['id'], 'guardian', 'review_account_script')
    await add_care_link(org, child['id'], therapist['id'], 'clinical', 'review_account_script')
    await db.audit.insert_one({'id': uid(), 'org_id': org, 'actor_id': user['id'], 'action': 'accounts:review-account',
                               'resource_id': user['id'], 'result': 'allowed', 'created_at': now()})
    print(f'Review sign-ins ready: {emails[0]} (parent) and {emails[1]} (therapist), both linked only to "{DEMO_CHILD}".')


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description='Create the Google Play review sign-in (a parent with a demo child).')
    parser.add_argument('--email', default='google-review@moonlightneurocare.com')
    parser.add_argument('--therapist-email', default='google-review-therapist@moonlightneurocare.com')
    parser.add_argument('--reset', action='store_true')
    parser.add_argument('--remove', action='store_true')
    try:
        asyncio.run(main(parser.parse_args()))
    finally:
        client.close()
