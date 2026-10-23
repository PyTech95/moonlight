"""Recover assessment enquiries that real visitors submitted while the site ran in demo mode.

In demo mode every browser got its own temporary "sandbox" organization, so each visitor's
enquiry was saved under that visitor's sandbox and never reached the admin inbox. The records
are still in MongoDB. This script finds them and copies them into the production organization.

Run from the backend folder with the production .env (APP_MODE=production, PRODUCTION_ORG_ID):

    python recover_enquiries.py                 # dry run: writes recovered_enquiries.csv for review
    python recover_enquiries.py --apply         # copies real-looking enquiries into the admin inbox
    python recover_enquiries.py --apply --include-tests   # also copies ones that look like tests

Safe to re-run: an enquiry already copied is skipped. No email/WhatsApp alerts are sent.
The CSV contains families' names and phone numbers: delete it after review.
"""
import argparse
import asyncio
import csv
import re
import sys

from config import PRODUCTION_ORG_ID, client, db, now, uid

TEST_NAME = re.compile(r'\b(test|testing|demo|fictional|dummy|sample|asdf|qwerty)\b', re.I)
TEST_PHONES = {'+910000000000', '+911111111111', '+919999999999', '+911234567890'}
FIELDS = ['created_at', 'reference', 'guardian_name', 'phone', 'email', 'service', 'contact_preference',
          'contact_time', 'country', 'source', 'looks_like_test', 'already_recovered', 'sandbox_org_id', 'enquiry_id']


def looks_like_test(e: dict) -> bool:
    email = (e.get('email') or '').lower()
    return bool(TEST_NAME.search(e.get('guardian_name') or '')) or e.get('phone') in TEST_PHONES \
        or email.endswith(('.invalid', 'example.com', 'test.com'))


async def main(args) -> None:
    if not PRODUCTION_ORG_ID:
        sys.exit('Set PRODUCTION_ORG_ID (and APP_MODE=production) in backend/.env first.')
    sandbox_orgs = [o for o in await db.sandboxes.distinct('org_id') if o != PRODUCTION_ORG_ID]
    found = await db.enquiries.find({'org_id': {'$in': sandbox_orgs}}, {'_id': 0}).sort('created_at', 1).to_list(100000)
    rows, copied = [], 0
    for e in found:
        already = bool(await db.enquiries.find_one({'org_id': PRODUCTION_ORG_ID, 'recovered_from.enquiry_id': e['id']}, {'_id': 1}))
        is_test = looks_like_test(e)
        rows.append({**{k: e.get(k, '') for k in FIELDS}, 'looks_like_test': is_test, 'already_recovered': already,
                     'sandbox_org_id': e['org_id'], 'enquiry_id': e['id']})
        if args.apply and not already and (args.include_tests or not is_test):
            record = {**e, 'id': uid(), 'org_id': PRODUCTION_ORG_ID, 'idempotency_key': f"recovered:{e['id']}",
                      'stage': 'New', 'version': 1, 'synthetic_environment': False,
                      'recovered_from': {'sandbox_org_id': e['org_id'], 'enquiry_id': e['id'], 'recovered_at': now()}}
            await db.enquiries.insert_one(record)
            copied += 1
    with open(args.csv, 'w', newline='', encoding='utf-8') as handle:
        writer = csv.DictWriter(handle, fieldnames=FIELDS)
        writer.writeheader()
        writer.writerows(rows)
    tests = sum(r['looks_like_test'] for r in rows)
    print(f'Found {len(rows)} enquiries in {len(sandbox_orgs)} visitor sandboxes ({tests} look like tests). Review: {args.csv}')
    print(f'Copied {copied} into the admin inbox.' if args.apply else 'Dry run only. Re-run with --apply to copy them into the admin inbox.')


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description='Recover enquiries saved in demo sandboxes.')
    parser.add_argument('--apply', action='store_true')
    parser.add_argument('--include-tests', action='store_true')
    parser.add_argument('--csv', default='recovered_enquiries.csv')
    try:
        asyncio.run(main(parser.parse_args()))
    finally:
        client.close()
