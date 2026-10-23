"""Billing: price list, session packages, invoices (Indian financial-year numbering), payments recorded at the desk,
Razorpay payment links with callback + webhook, invoice PDFs and the parent's view.

All money is stored as integer paise. The API takes and returns paise ("*_paise" fields)."""
import hashlib
import hmac
import json
import logging
import os
from datetime import date, datetime, timedelta, timezone
from typing import Literal

import httpx
from fastapi import APIRouter, Depends, HTTPException, Query, Request
from fastapi.responses import RedirectResponse, Response
from pydantic import Field, field_validator
from pymongo import ReturnDocument

from center import IST, center_wide, notify_family, parse_iso, today_ist
from config import WEB_ORIGIN, Input, Payload, db, now, uid
from security import audit, authorize, principal
from vault import decrypt_secret, encrypt_secret

router = APIRouter()
logger = logging.getLogger('billing')
DEFAULT_SETTINGS = {'invoice_prefix': 'MNC', 'gstin': '', 'tax_percent': 0, 'tax_label': 'GST', 'payment_terms_days': 7, 'footer_note': '',
                    'upi_id': '', 'bank_details': '', 'charge_no_show': False, 'legal_name': ''}
METHODS = {'cash': 'Cash', 'upi': 'UPI', 'bank': 'Bank transfer', 'card': 'Card', 'cheque': 'Cheque', 'razorpay': 'Online (Razorpay)'}
OPEN = ['issued', 'partly_paid']


def rupees(paise: int) -> str:
    value = paise / 100
    whole, frac = divmod(round(value * 100), 100)
    s = str(whole)
    if len(s) > 3:  # Indian digit grouping: 1,23,45,678
        head, tail = s[:-3], s[-3:]
        groups = []
        while len(head) > 2:
            groups.insert(0, head[-2:])
            head = head[:-2]
        s = ','.join(([head] if head else []) + groups) + ',' + tail
    return f'{s}.{frac:02d}' if frac else s


def fy_label(day: date) -> str:
    start = day.year if day.month >= 4 else day.year - 1
    return f'{start}-{str(start + 1)[-2:]}'


# ---------- inputs ----------

class FeeInput(Input):
    name: str = Field(min_length=2, max_length=100)
    service: str = Field(default='', max_length=80)
    unit: Literal['session', 'assessment', 'item'] = 'session'
    amount_paise: int = Field(ge=0, le=100_000_000)
    active: bool = True


class PlanInput(Input):
    name: str = Field(min_length=2, max_length=100)
    service: str = Field(min_length=2, max_length=80)
    sessions: int = Field(ge=1, le=200)
    amount_paise: int = Field(ge=0, le=100_000_000)
    validity_days: int = Field(ge=7, le=730)
    active: bool = True


class LineInput(Input):
    description: str = Field(min_length=2, max_length=200)
    qty: float = Field(gt=0, le=1000)
    rate_paise: int = Field(ge=0, le=100_000_000)
    kind: Literal['session', 'package', 'fee', 'custom'] = 'custom'
    session_ids: list[str] = Field(default_factory=list, max_length=200)
    plan_id: str = Field(default='', max_length=100)
    package_start: str = Field(default='', max_length=10)


class InvoiceInput(Input):
    child_id: str = Field(min_length=1, max_length=100)
    items: list[LineInput] = Field(min_length=1, max_length=60)
    discount_paise: int = Field(default=0, ge=0, le=100_000_000)
    tax_percent: float = Field(default=0, ge=0, le=28)
    due_days: int = Field(default=7, ge=0, le=120)
    notes: str = Field(default='', max_length=800)
    issue: bool = True
    notify: bool = True


class InvoiceUpdateInput(InvoiceInput):
    version: int = Field(ge=1)


class PaymentInput(Input):
    amount_paise: int = Field(gt=0, le=100_000_000)
    method: Literal['cash', 'upi', 'bank', 'card', 'cheque']
    reference: str = Field(default='', max_length=120)
    received_on: str = Field(min_length=10, max_length=10)
    notify: bool = True

    @field_validator('received_on')
    @classmethod
    def date_ok(cls, value):
        day = date.fromisoformat(value)
        if day > today_ist():
            raise ValueError('The payment date cannot be in the future.')
        return value


class VoidInput(Input):
    reason: str = Field(min_length=3, max_length=300)


class BillingSettingsInput(Input):
    invoice_prefix: str = Field(min_length=1, max_length=12, pattern=r'^[A-Za-z0-9-]+$')
    legal_name: str = Field(default='', max_length=120)
    gstin: str = Field(default='', max_length=15)
    tax_percent: float = Field(default=0, ge=0, le=28)
    tax_label: str = Field(default='GST', max_length=20)
    payment_terms_days: int = Field(default=7, ge=0, le=120)
    footer_note: str = Field(default='', max_length=500)
    upi_id: str = Field(default='', max_length=80)
    bank_details: str = Field(default='', max_length=400)
    charge_no_show: bool = False


class RazorpayInput(Input):
    enabled: bool
    key_id: str = Field(default='', max_length=60)
    key_secret: str = Field(default='', max_length=120)
    webhook_secret: str = Field(default='', max_length=120)


class PackageInput(Input):
    child_id: str = Field(min_length=1, max_length=100)
    plan_id: str = Field(min_length=1, max_length=100)
    start_date: str = Field(min_length=10, max_length=10)
    discount_paise: int = Field(default=0, ge=0, le=100_000_000)
    issue: bool = True
    notify: bool = True


# ---------- helpers ----------

async def billing_settings(org_id: str) -> dict:
    doc = await db.settings.find_one({'org_id': org_id}, {'_id': 0, 'billing': 1}) or {}
    return {**DEFAULT_SETTINGS, **(doc.get('billing') or {})}


async def razorpay_keys(org_id: str) -> dict | None:
    doc = await db.settings.find_one({'org_id': org_id}, {'_id': 0, 'razorpay': 1}) or {}
    cfg = doc.get('razorpay') or {}
    if not (cfg.get('enabled') and cfg.get('key_id') and cfg.get('key_secret')):
        return None
    return {'key_id': cfg['key_id'], 'key_secret': decrypt_secret(cfg['key_secret']),
            'webhook_secret': decrypt_secret(cfg['webhook_secret']) if cfg.get('webhook_secret') else ''}


async def _read(p: dict):
    await authorize(p, 'billing:read')
    if not center_wide(p):
        raise HTTPException(403, 'Only administration and finance can see billing.')


async def _write(p: dict):
    await authorize(p, 'billing:update')
    if not center_wide(p):
        raise HTTPException(403, 'Only administration and finance can change billing.')


async def _child(org_id: str, child_id: str) -> dict:
    child = await db.children.find_one({'org_id': org_id, 'id': child_id}, {'_id': 0})
    if not child:
        raise HTTPException(404, 'Child not found.')
    return child


def _bill_to(child: dict) -> dict:
    contacts = child.get('contacts') or []
    primary = next((c for c in contacts if c.get('primary')), contacts[0] if contacts else {})
    return {'name': primary.get('name') or f"Family of {child['name']}", 'phone': primary.get('phone', ''), 'email': primary.get('email', '')}


def _totals(items: list[dict], discount: int, tax_percent: float) -> dict:
    subtotal = sum(i['amount_paise'] for i in items)
    discount = min(discount, subtotal)
    taxable = subtotal - discount
    tax = round(taxable * tax_percent / 100)
    return {'subtotal_paise': subtotal, 'discount_paise': discount, 'tax_percent': tax_percent, 'tax_paise': tax, 'total_paise': taxable + tax}


def _status(invoice: dict) -> str:
    if invoice['status'] in ('draft', 'void'):
        return invoice['status']
    if invoice['amount_paid_paise'] >= invoice['total_paise']:
        return 'paid'
    return 'partly_paid' if invoice['amount_paid_paise'] > 0 else 'issued'


def chargeable(attendance: str, settings: dict) -> bool:
    return attendance == 'Present' or (attendance == 'Absent' and settings.get('charge_no_show'))


async def _next_number(org_id: str, issue_day: date) -> str:
    settings = await billing_settings(org_id)
    fy = fy_label(issue_day)
    counter = await db.counters.find_one_and_update({'_id': f'{org_id}:invoice:{fy}'}, {'$inc': {'seq': 1}}, upsert=True, return_document=ReturnDocument.AFTER)
    return f"{settings['invoice_prefix']}/{fy}/{counter['seq']:04d}"


async def _session_rate(org_id: str, service: str) -> int:
    fee = await db.fee_items.find_one({'org_id': org_id, 'active': True, 'unit': 'session', 'service': service}, {'_id': 0, 'amount_paise': 1})
    return fee['amount_paise'] if fee else 0


async def _invoice(org_id: str, invoice_id: str) -> dict:
    invoice = await db.invoices.find_one({'org_id': org_id, 'id': invoice_id}, {'_id': 0})
    if not invoice:
        raise HTTPException(404, 'Invoice not found.')
    return invoice


# ---------- attendance → packages / unbilled sessions (called from scheduling) ----------

async def on_attendance_change(p: dict, session: dict, before: str, after: str):
    settings = await billing_settings(p['org_id'])
    was, now_charge = chargeable(before, settings), chargeable(after, settings)
    state = (session.get('billing') or {}).get('status', 'unbilled')
    if now_charge and not was and state not in ('package', 'invoiced'):
        session_day = parse_iso(session['starts_at']).astimezone(IST).date().isoformat()
        package = await db.child_packages.find_one_and_update(
            {'org_id': p['org_id'], 'child_id': session['child_id'], 'status': 'active', 'service': session['service'],
             'expires_on': {'$gte': session_day}, 'starts_on': {'$lte': session_day}, 'sessions_left': {'$gt': 0}},
            {'$inc': {'sessions_used': 1, 'sessions_left': -1}, '$push': {'usage': {'appointment_id': session['id'], 'starts_at': session['starts_at'], 'at': now()}}},
            sort=[('expires_on', 1)], return_document=ReturnDocument.AFTER)
        if package:
            if package['sessions_left'] <= 0:
                await db.child_packages.update_one({'org_id': p['org_id'], 'id': package['id']}, {'$set': {'status': 'used'}})
            billing = {'status': 'package', 'package_id': package['id'], 'package_name': package['name'],
                       'remaining': package['sessions_left']}
        else:
            billing = {'status': 'unbilled'}
        await db.appointments.update_one({'org_id': p['org_id'], 'id': session['id']}, {'$set': {'billing': billing}})
    elif was and not now_charge and state == 'package':
        package_id = session['billing']['package_id']
        await db.child_packages.update_one({'org_id': p['org_id'], 'id': package_id},
                                           {'$inc': {'sessions_used': -1, 'sessions_left': 1}, '$pull': {'usage': {'appointment_id': session['id']}}, '$set': {'status': 'active'}})
        await db.child_packages.update_one({'org_id': p['org_id'], 'id': package_id, 'status': 'active', 'expires_on': {'$lt': today_ist().isoformat()}},
                                           {'$set': {'status': 'expired'}})
        await db.appointments.update_one({'org_id': p['org_id'], 'id': session['id']}, {'$set': {'billing': {'status': 'unbilled'}}})


async def unbilled_sessions(org_id: str, child_id: str | None = None) -> list[dict]:
    settings = await billing_settings(org_id)
    attendance = ['Present', 'Absent'] if settings['charge_no_show'] else ['Present']
    query = {'org_id': org_id, 'status': {'$ne': 'Cancelled'}, 'attendance': {'$in': attendance},
             '$or': [{'billing.status': 'unbilled'}, {'billing': {'$exists': False}}]}
    if child_id:
        query['child_id'] = child_id
    sessions = await db.appointments.find(query, {'_id': 0, 'id': 1, 'child_id': 1, 'child_name': 1, 'service': 1, 'starts_at': 1, 'attendance': 1,
                                                  'therapist_name': 1, 'staff_label': 1, 'duration_minutes': 1}).sort('starts_at', 1).to_list(2000)
    rates = {}
    for s in sessions:
        if s['service'] not in rates:
            rates[s['service']] = await _session_rate(org_id, s['service'])
        s['rate_paise'] = rates[s['service']]
    return sessions


async def child_balances(org_id: str, child_ids: list[str]) -> dict:
    result = {}
    async for inv in db.invoices.find({'org_id': org_id, 'child_id': {'$in': child_ids}, 'status': {'$in': OPEN}}, {'_id': 0, 'child_id': 1, 'balance_paise': 1}):
        result[inv['child_id']] = result.get(inv['child_id'], 0) + inv['balance_paise']
    return result


async def child_billing_summary(org_id: str, child_id: str) -> dict:
    packages = await db.child_packages.find({'org_id': org_id, 'child_id': child_id, 'status': 'active'},
                                            {'_id': 0, 'id': 1, 'name': 1, 'service': 1, 'sessions_total': 1, 'sessions_used': 1, 'sessions_left': 1, 'expires_on': 1}).to_list(20)
    invoices = await db.invoices.find({'org_id': org_id, 'child_id': child_id, 'status': {'$ne': 'void'}},
                                      {'_id': 0, 'id': 1, 'number': 1, 'status': 1, 'total_paise': 1, 'balance_paise': 1, 'issue_date': 1}).sort('created_at', -1).to_list(5)
    return {'balance_paise': (await child_balances(org_id, [child_id])).get(child_id, 0), 'packages': packages, 'invoices': invoices,
            'unbilled': len(await unbilled_sessions(org_id, child_id))}


# ---------- invoice building ----------

async def _build_items(p: dict, child: dict, lines: list[LineInput], invoice_id: str) -> tuple[list[dict], list[str], list[dict]]:
    """Validate lines; returns (items, session ids to mark invoiced, packages to create)."""
    items, session_ids, packages = [], [], []
    open_sessions = {s['id']: s for s in await unbilled_sessions(p['org_id'], child['id'])}
    current = await db.appointments.find({'org_id': p['org_id'], 'billing.invoice_id': invoice_id}, {'_id': 0, 'id': 1}).to_list(500) if invoice_id else []
    open_sessions.update({s['id']: s for s in current})
    for line in lines:
        item = {'description': line.description, 'qty': line.qty, 'rate_paise': line.rate_paise, 'amount_paise': round(line.qty * line.rate_paise),
                'kind': line.kind, 'session_ids': [], 'plan_id': ''}
        if line.kind == 'session':
            missing = [s for s in line.session_ids if s not in open_sessions]
            if missing or not line.session_ids:
                raise HTTPException(409, 'Some sessions on this invoice are already billed or not marked as attended. Reload and try again.')
            if line.qty != len(line.session_ids):
                raise HTTPException(422, 'The quantity must match the number of sessions selected.')
            item['session_ids'] = line.session_ids
            session_ids += line.session_ids
        if line.kind == 'package':
            plan = await db.package_plans.find_one({'org_id': p['org_id'], 'id': line.plan_id}, {'_id': 0})
            if not plan:
                raise HTTPException(422, 'Choose a package from the list.')
            start = line.package_start or today_ist().isoformat()
            item['plan_id'] = plan['id']
            item['package_start'] = start
            packages.append({'plan': plan, 'start': start})
        items.append(item)
    if len(session_ids) != len(set(session_ids)):
        raise HTTPException(422, 'A session appears twice on this invoice.')
    return items, session_ids, packages


async def _activate(p: dict, invoice: dict, child: dict, packages: list[dict]):
    for pk in packages:
        plan, start = pk['plan'], date.fromisoformat(pk['start'])
        await db.child_packages.insert_one({
            'id': uid(), 'org_id': p['org_id'], 'child_id': child['id'], 'child_name': child['name'], 'plan_id': plan['id'], 'name': plan['name'],
            'service': plan['service'], 'sessions_total': plan['sessions'], 'sessions_used': 0, 'sessions_left': plan['sessions'], 'amount_paise': plan['amount_paise'],
            'starts_on': start.isoformat(), 'expires_on': (start + timedelta(days=plan['validity_days'])).isoformat(), 'status': 'active',
            'invoice_id': invoice['id'], 'usage': [], 'created_at': now(), 'created_by': p['id']})


async def _issue(p: dict, invoice: dict, child: dict, notify: bool) -> dict:
    issue_day = today_ist()
    number = await _next_number(p['org_id'], issue_day)
    due = issue_day + timedelta(days=invoice.get('due_days', 7))
    await db.invoices.update_one({'org_id': p['org_id'], 'id': invoice['id']}, {'$set': {
        'number': number, 'status': 'issued' if invoice['total_paise'] > 0 else 'paid', 'issue_date': issue_day.isoformat(),
        'due_date': due.isoformat(), 'issued_at': now(), 'issued_by': p['id'], 'updated_at': now()}, '$inc': {'version': 1}})
    pending = [{'plan': await db.package_plans.find_one({'org_id': p['org_id'], 'id': i['plan_id']}, {'_id': 0}), 'start': i.get('package_start') or issue_day.isoformat()}
               for i in invoice['items'] if i['kind'] == 'package']
    await _activate(p, invoice, child, [pk for pk in pending if pk['plan']])
    issued = await _invoice(p['org_id'], invoice['id'])
    if notify and issued['total_paise'] > 0:
        await _send_invoice_notice(p['org_id'], issued, child)
    return issued


async def _send_invoice_notice(org_id: str, invoice: dict, child: dict, link: str = ''):
    lines = '\n'.join(f"• {i['description']}: ₹{rupees(i['amount_paise'])}" for i in invoice['items'])
    settings = await billing_settings(org_id)
    pay = []
    if link:
        pay.append(f'Pay online: {link}')
    if settings.get('upi_id'):
        pay.append(f"UPI: {settings['upi_id']}")
    body = (f"Hello,\n\nInvoice {invoice['number']} for {child['name']} is ready.\n\n{lines}\n\nTotal: ₹{rupees(invoice['total_paise'])}\n"
            f"Due by: {invoice.get('due_date', '')}\n\n" + ('\n'.join(pay) + '\n\n' if pay else '') +
            'You can see and download it in the parent portal or the Moonlight app (Payments).')
    await notify_family(org_id, child, f"Invoice {invoice['number']} · ₹{rupees(invoice['balance_paise'])} due", body, f"invoice:{invoice['id']}:{invoice['balance_paise']}")


# ---------- settings ----------

@router.get('/billing/settings', response_model=Payload)
async def get_settings(p=Depends(principal)):
    await _read(p)
    doc = await db.settings.find_one({'org_id': p['org_id']}, {'_id': 0, 'razorpay': 1}) or {}
    rp = doc.get('razorpay') or {}
    return {'settings': await billing_settings(p['org_id']), 'methods': METHODS,
            'razorpay': {'enabled': bool(rp.get('enabled')), 'key_id': rp.get('key_id', ''), 'secret_set': bool(rp.get('key_secret')),
                         'webhook_secret_set': bool(rp.get('webhook_secret')), 'webhook_url': f'{WEB_ORIGIN}/api/billing/razorpay/webhook'}}


@router.patch('/billing/settings', response_model=Payload)
async def update_settings(data: BillingSettingsInput, p=Depends(principal)):
    await _write(p)
    await db.settings.update_one({'org_id': p['org_id']}, {'$set': {'billing': {**data.model_dump(), 'invoice_prefix': data.invoice_prefix.upper(),
                                                                                 'gstin': data.gstin.upper()}}, '$inc': {'version': 1}})
    await audit(p, 'billing:settings', 'organization')
    return await get_settings(p)


@router.patch('/billing/razorpay', response_model=Payload)
async def update_razorpay(data: RazorpayInput, p=Depends(principal)):
    await _write(p)
    doc = await db.settings.find_one({'org_id': p['org_id']}, {'_id': 0, 'razorpay': 1}) or {}
    cfg = dict(doc.get('razorpay') or {})
    cfg.update({'enabled': data.enabled, 'key_id': data.key_id.strip()})
    if data.key_secret.strip():
        cfg['key_secret'] = encrypt_secret(data.key_secret.strip())
    if data.webhook_secret.strip():
        cfg['webhook_secret'] = encrypt_secret(data.webhook_secret.strip())
    if data.enabled and not (cfg.get('key_id') and cfg.get('key_secret')):
        raise HTTPException(422, 'Add the Key ID and Key Secret from the Razorpay dashboard first.')
    await db.settings.update_one({'org_id': p['org_id']}, {'$set': {'razorpay': cfg}, '$inc': {'version': 1}})
    await audit(p, 'billing:razorpay', 'organization')
    return await get_settings(p)


@router.post('/billing/razorpay/test', response_model=Payload)
async def test_razorpay(p=Depends(principal)):
    await _write(p)
    keys = await razorpay_keys(p['org_id'])
    if not keys:
        raise HTTPException(422, 'Turn on Razorpay and add the Key ID and Key Secret first.')
    async with httpx.AsyncClient(timeout=12) as http:
        response = await http.get('https://api.razorpay.com/v1/payment_links/?count=1', auth=(keys['key_id'], keys['key_secret']))
    if response.status_code == 401:
        raise HTTPException(400, 'Razorpay rejected the keys. Copy the Key ID and Key Secret again (Dashboard → Account & Settings → API Keys).')
    if response.status_code >= 400:
        raise HTTPException(400, f'Razorpay answered {response.status_code}. Payment Links may not be enabled on this account yet.')
    mode = 'test mode' if keys['key_id'].startswith('rzp_test_') else 'live mode'
    return {'message': f'Connected to Razorpay ({mode}). Families can now pay invoices online.'}


# ---------- price list and package plans ----------

@router.get('/billing/catalog', response_model=Payload)
async def catalog(p=Depends(principal)):
    await _read(p)
    fees = await db.fee_items.find({'org_id': p['org_id']}, {'_id': 0}).sort('name', 1).to_list(300)
    plans = await db.package_plans.find({'org_id': p['org_id']}, {'_id': 0}).sort('name', 1).to_list(300)
    from scheduling import service_names
    return {'fees': fees, 'plans': plans, 'services': await service_names(p['org_id'])}


@router.post('/billing/fees', response_model=Payload, status_code=201)
async def create_fee(data: FeeInput, p=Depends(principal)):
    await _write(p)
    record = {'id': uid(), 'org_id': p['org_id'], **data.model_dump(), 'created_at': now()}
    await db.fee_items.insert_one(record.copy())
    await audit(p, 'billing:fee-create', record['id'])
    return {k: v for k, v in record.items() if k != 'org_id'}


@router.patch('/billing/fees/{fee_id}', response_model=Payload)
async def update_fee(fee_id: str, data: FeeInput, p=Depends(principal)):
    await _write(p)
    result = await db.fee_items.update_one({'org_id': p['org_id'], 'id': fee_id}, {'$set': {**data.model_dump(), 'updated_at': now()}})
    if not result.matched_count:
        raise HTTPException(404, 'Price not found.')
    await audit(p, 'billing:fee-update', fee_id)
    return await db.fee_items.find_one({'org_id': p['org_id'], 'id': fee_id}, {'_id': 0, 'org_id': 0})


@router.post('/billing/plans', response_model=Payload, status_code=201)
async def create_plan(data: PlanInput, p=Depends(principal)):
    await _write(p)
    record = {'id': uid(), 'org_id': p['org_id'], **data.model_dump(), 'created_at': now()}
    await db.package_plans.insert_one(record.copy())
    await audit(p, 'billing:plan-create', record['id'])
    return {k: v for k, v in record.items() if k != 'org_id'}


@router.patch('/billing/plans/{plan_id}', response_model=Payload)
async def update_plan(plan_id: str, data: PlanInput, p=Depends(principal)):
    await _write(p)
    result = await db.package_plans.update_one({'org_id': p['org_id'], 'id': plan_id}, {'$set': {**data.model_dump(), 'updated_at': now()}})
    if not result.matched_count:
        raise HTTPException(404, 'Package not found.')
    await audit(p, 'billing:plan-update', plan_id)
    return await db.package_plans.find_one({'org_id': p['org_id'], 'id': plan_id}, {'_id': 0, 'org_id': 0})


# ---------- overview, lists ----------

@router.get('/billing/overview', response_model=Payload)
async def overview(p=Depends(principal)):
    await _read(p)
    org = p['org_id']
    today = today_ist()
    month_start = today.replace(day=1).isoformat()
    collected = 0
    recent = []
    async for inv in db.invoices.find({'org_id': org, 'payments.received_on': {'$gte': month_start}}, {'_id': 0, 'payments': 1, 'number': 1, 'child_name': 1, 'id': 1}):
        for pay in inv.get('payments', []):
            if pay['received_on'] >= month_start and not pay.get('reversed'):
                collected += pay['amount_paise']
                recent.append({**pay, 'invoice_number': inv['number'], 'invoice_id': inv['id'], 'child_name': inv['child_name']})
    outstanding, overdue = 0, 0
    async for inv in db.invoices.find({'org_id': org, 'status': {'$in': OPEN}}, {'_id': 0, 'balance_paise': 1, 'due_date': 1}):
        outstanding += inv['balance_paise']
        overdue += 1 if inv.get('due_date', '') < today.isoformat() else 0
    soon = (today + timedelta(days=14)).isoformat()
    expiring = await db.child_packages.find({'org_id': org, 'status': 'active', 'expires_on': {'$lte': soon}},
                                            {'_id': 0, 'id': 1, 'child_name': 1, 'name': 1, 'expires_on': 1, 'sessions_total': 1, 'sessions_used': 1}).sort('expires_on', 1).to_list(50)
    low = await db.child_packages.find({'org_id': org, 'status': 'active', 'sessions_left': {'$lte': 2}},
                                       {'_id': 0, 'id': 1, 'child_name': 1, 'name': 1, 'expires_on': 1, 'sessions_total': 1, 'sessions_used': 1}).to_list(50)
    unbilled = await unbilled_sessions(org)
    by_child = {}
    for s in unbilled:
        entry = by_child.setdefault(s['child_id'], {'child_id': s['child_id'], 'child_name': s['child_name'], 'sessions': 0, 'amount_paise': 0})
        entry['sessions'] += 1
        entry['amount_paise'] += s['rate_paise']
    return {'collected_month_paise': collected, 'outstanding_paise': outstanding, 'overdue_count': overdue, 'expiring_packages': expiring,
            'low_packages': low, 'unbilled': sorted(by_child.values(), key=lambda x: x['child_name']), 'recent_payments': sorted(recent, key=lambda x: x['received_on'], reverse=True)[:10],
            'razorpay_ready': bool(await razorpay_keys(org)), 'month': today.strftime('%B %Y')}


@router.get('/billing/invoices', response_model=Payload)
async def list_invoices(status: str = Query('', max_length=20), child_id: str = Query('', max_length=100), q: str = Query('', max_length=80), p=Depends(principal)):
    await _read(p)
    query = {'org_id': p['org_id']}
    if status == 'open':
        query['status'] = {'$in': OPEN}
    elif status:
        query['status'] = status
    if child_id:
        query['child_id'] = child_id
    items = await db.invoices.find(query, {'_id': 0, 'org_id': 0}).sort('created_at', -1).to_list(500)
    if q:
        needle = q.lower()
        items = [i for i in items if needle in f"{i.get('number', '')} {i['child_name']} {i['bill_to']['name']}".lower()]
    return {'items': items}


@router.get('/billing/invoices/{invoice_id}', response_model=Payload)
async def get_invoice(invoice_id: str, p=Depends(principal)):
    await _read(p)
    invoice = await _invoice(p['org_id'], invoice_id)
    invoice.pop('org_id', None)
    invoice['packages'] = await db.child_packages.find({'org_id': p['org_id'], 'invoice_id': invoice_id}, {'_id': 0, 'org_id': 0}).to_list(20)
    return invoice


@router.get('/billing/children/{child_id}', response_model=Payload)
async def child_billing(child_id: str, p=Depends(principal)):
    await _read(p)
    child = await _child(p['org_id'], child_id)
    return {'child': {'id': child['id'], 'name': child['name'], 'bill_to': _bill_to(child)}, 'unbilled': await unbilled_sessions(p['org_id'], child_id),
            'packages': await db.child_packages.find({'org_id': p['org_id'], 'child_id': child_id}, {'_id': 0, 'org_id': 0}).sort('created_at', -1).to_list(50),
            'invoices': await db.invoices.find({'org_id': p['org_id'], 'child_id': child_id}, {'_id': 0, 'org_id': 0}).sort('created_at', -1).to_list(100),
            'summary': await child_billing_summary(p['org_id'], child_id)}


# ---------- creating and changing invoices ----------

@router.post('/billing/invoices', response_model=Payload, status_code=201)
async def create_invoice(data: InvoiceInput, p=Depends(principal)):
    await _write(p)
    child = await _child(p['org_id'], data.child_id)
    invoice_id = uid()
    items, session_ids, _ = await _build_items(p, child, data.items, '')
    record = {'id': invoice_id, 'org_id': p['org_id'], 'number': '', 'child_id': child['id'], 'child_name': child['name'], 'bill_to': _bill_to(child),
              'items': items, **_totals(items, data.discount_paise, data.tax_percent), 'amount_paid_paise': 0, 'status': 'draft', 'due_days': data.due_days,
              'notes': data.notes, 'payments': [], 'created_by': p['id'], 'created_by_name': p['display_name'], 'created_at': now(), 'updated_at': now(), 'version': 1}
    record['balance_paise'] = record['total_paise']
    await db.invoices.insert_one(record.copy())
    if session_ids:
        await db.appointments.update_many({'org_id': p['org_id'], 'id': {'$in': session_ids}},
                                          {'$set': {'billing': {'status': 'invoiced', 'invoice_id': invoice_id}}})
    await audit(p, 'billing:invoice-create', invoice_id)
    if data.issue:
        await _issue(p, record, child, data.notify)
    return await get_invoice(invoice_id, p)


@router.patch('/billing/invoices/{invoice_id}', response_model=Payload)
async def update_invoice(invoice_id: str, data: InvoiceUpdateInput, p=Depends(principal)):
    await _write(p)
    invoice = await _invoice(p['org_id'], invoice_id)
    if invoice['status'] != 'draft':
        raise HTTPException(409, 'Only draft invoices can be edited. Void it and create a new one instead.')
    child = await _child(p['org_id'], invoice['child_id'])
    items, session_ids, _ = await _build_items(p, child, data.items, invoice_id)
    totals = _totals(items, data.discount_paise, data.tax_percent)
    result = await db.invoices.update_one({'org_id': p['org_id'], 'id': invoice_id, 'version': data.version}, {'$set': {
        'items': items, **totals, 'balance_paise': totals['total_paise'], 'due_days': data.due_days, 'notes': data.notes, 'updated_at': now()}, '$inc': {'version': 1}})
    if not result.matched_count:
        raise HTTPException(409, 'This invoice changed. Reload and try again.')
    await db.appointments.update_many({'org_id': p['org_id'], 'billing.invoice_id': invoice_id, 'id': {'$nin': session_ids}}, {'$set': {'billing': {'status': 'unbilled'}}})
    if session_ids:
        await db.appointments.update_many({'org_id': p['org_id'], 'id': {'$in': session_ids}}, {'$set': {'billing': {'status': 'invoiced', 'invoice_id': invoice_id}}})
    if data.issue:
        await _issue(p, await _invoice(p['org_id'], invoice_id), child, data.notify)
    await audit(p, 'billing:invoice-update', invoice_id)
    return await get_invoice(invoice_id, p)


@router.post('/billing/invoices/{invoice_id}/issue', response_model=Payload)
async def issue_invoice(invoice_id: str, p=Depends(principal)):
    await _write(p)
    invoice = await _invoice(p['org_id'], invoice_id)
    if invoice['status'] != 'draft':
        raise HTTPException(409, 'This invoice is already issued.')
    await _issue(p, invoice, await _child(p['org_id'], invoice['child_id']), True)
    await audit(p, 'billing:invoice-issue', invoice_id)
    return await get_invoice(invoice_id, p)


async def _release(org_id: str, invoice_id: str):
    await db.appointments.update_many({'org_id': org_id, 'billing.invoice_id': invoice_id}, {'$set': {'billing': {'status': 'unbilled'}}})


@router.delete('/billing/invoices/{invoice_id}', response_model=Payload)
async def delete_draft(invoice_id: str, p=Depends(principal)):
    await _write(p)
    invoice = await _invoice(p['org_id'], invoice_id)
    if invoice['status'] != 'draft':
        raise HTTPException(409, 'Issued invoices are kept for your records. Void it instead.')
    await _release(p['org_id'], invoice_id)
    await db.invoices.delete_one({'org_id': p['org_id'], 'id': invoice_id})
    await audit(p, 'billing:invoice-delete', invoice_id)
    return {'message': 'Draft deleted. Its sessions are back in the unbilled list.'}


@router.post('/billing/invoices/{invoice_id}/void', response_model=Payload)
async def void_invoice(invoice_id: str, data: VoidInput, p=Depends(principal)):
    await _write(p)
    invoice = await _invoice(p['org_id'], invoice_id)
    if invoice['status'] in ('void', 'draft'):
        raise HTTPException(409, 'Only issued invoices can be voided.')
    if invoice['amount_paid_paise'] > 0:
        raise HTTPException(409, 'This invoice has payments recorded. Refund them outside the system and reverse each payment first.')
    used = await db.child_packages.count_documents({'org_id': p['org_id'], 'invoice_id': invoice_id, 'sessions_used': {'$gt': 0}})
    if used:
        raise HTTPException(409, 'A package on this invoice has already been used. Cancel the package first or keep the invoice.')
    await db.child_packages.update_many({'org_id': p['org_id'], 'invoice_id': invoice_id}, {'$set': {'status': 'cancelled', 'cancelled_at': now()}})
    await _release(p['org_id'], invoice_id)
    await db.invoices.update_one({'org_id': p['org_id'], 'id': invoice_id}, {'$set': {'status': 'void', 'balance_paise': 0, 'void_reason': data.reason,
                                                                                      'voided_at': now(), 'voided_by': p['id']}, '$inc': {'version': 1}})
    await audit(p, 'billing:invoice-void', invoice_id)
    return {'message': f"Invoice {invoice['number']} voided. The number stays in the series for your records."}


async def _apply_payment(org_id: str, invoice: dict, payment: dict) -> dict:
    if any(x.get('gateway_payment_id') and x.get('gateway_payment_id') == payment.get('gateway_payment_id') for x in invoice.get('payments', [])):
        return invoice  # already recorded (callback and webhook both arrive)
    paid = invoice['amount_paid_paise'] + payment['amount_paise']
    updated = {**invoice, 'amount_paid_paise': paid}
    status = _status(updated)
    await db.invoices.update_one({'org_id': org_id, 'id': invoice['id']}, {'$push': {'payments': payment}, '$set': {
        'amount_paid_paise': paid, 'balance_paise': max(invoice['total_paise'] - paid, 0), 'status': status, 'updated_at': now(),
        **({'paid_at': now()} if status == 'paid' else {})}, '$inc': {'version': 1}})
    return await _invoice(org_id, invoice['id'])


@router.post('/billing/invoices/{invoice_id}/payments', response_model=Payload, status_code=201)
async def record_payment(invoice_id: str, data: PaymentInput, p=Depends(principal)):
    await _write(p)
    invoice = await _invoice(p['org_id'], invoice_id)
    if invoice['status'] not in OPEN:
        raise HTTPException(409, 'Payments can be recorded on issued, unpaid invoices only.')
    if data.amount_paise > invoice['balance_paise']:
        raise HTTPException(422, f"That is more than the balance of ₹{rupees(invoice['balance_paise'])}.")
    payment = {'id': uid(), 'amount_paise': data.amount_paise, 'method': data.method, 'method_label': METHODS[data.method], 'reference': data.reference,
               'received_on': data.received_on, 'recorded_by': p['id'], 'recorded_by_name': p['display_name'], 'recorded_at': now()}
    updated = await _apply_payment(p['org_id'], invoice, payment)
    if data.notify:
        child = await db.children.find_one({'org_id': p['org_id'], 'id': invoice['child_id']}, {'_id': 0})
        if child:
            await notify_family(p['org_id'], child, f"Payment received · {invoice['number']}",
                                f"Hello,\n\nThank you. We received ₹{rupees(data.amount_paise)} ({METHODS[data.method]}) on {data.received_on} for invoice {invoice['number']}.\n"
                                f"Balance now: ₹{rupees(updated['balance_paise'])}.", f"payment:{payment['id']}")
    await audit(p, 'billing:payment', invoice_id)
    return updated


@router.post('/billing/invoices/{invoice_id}/payments/{payment_id}/reverse', response_model=Payload)
async def reverse_payment(invoice_id: str, payment_id: str, data: VoidInput, p=Depends(principal)):
    await _write(p)
    invoice = await _invoice(p['org_id'], invoice_id)
    payment = next((x for x in invoice.get('payments', []) if x['id'] == payment_id and not x.get('reversed')), None)
    if not payment:
        raise HTTPException(404, 'Payment not found.')
    paid = invoice['amount_paid_paise'] - payment['amount_paise']
    status = _status({**invoice, 'amount_paid_paise': paid})
    await db.invoices.update_one({'org_id': p['org_id'], 'id': invoice_id, 'payments.id': payment_id}, {'$set': {
        'payments.$.reversed': True, 'payments.$.reverse_reason': data.reason, 'payments.$.reversed_at': now(), 'amount_paid_paise': paid,
        'balance_paise': invoice['total_paise'] - paid, 'status': status}, '$inc': {'version': 1}})
    await audit(p, 'billing:payment-reverse', invoice_id)
    return await _invoice(p['org_id'], invoice_id)


# ---------- packages ----------

@router.post('/billing/packages', response_model=Payload, status_code=201)
async def sell_package(data: PackageInput, p=Depends(principal)):
    """Sell a package = an invoice with one package line; the package starts when the invoice is issued."""
    await _write(p)
    plan = await db.package_plans.find_one({'org_id': p['org_id'], 'id': data.plan_id, 'active': True}, {'_id': 0})
    if not plan:
        raise HTTPException(422, 'Choose an active package.')
    line = LineInput(description=f"{plan['name']} ({plan['sessions']} × {plan['service']}, valid {plan['validity_days']} days)", qty=1,
                     rate_paise=plan['amount_paise'], kind='package', plan_id=plan['id'], package_start=data.start_date)
    settings = await billing_settings(p['org_id'])
    return await create_invoice(InvoiceInput(child_id=data.child_id, items=[line], discount_paise=data.discount_paise, tax_percent=settings['tax_percent'],
                                             due_days=settings['payment_terms_days'], issue=data.issue, notify=data.notify), p)


@router.post('/billing/packages/{package_id}/cancel', response_model=Payload)
async def cancel_package(package_id: str, data: VoidInput, p=Depends(principal)):
    await _write(p)
    result = await db.child_packages.update_one({'org_id': p['org_id'], 'id': package_id, 'status': {'$in': ['active', 'expired']}},
                                                {'$set': {'status': 'cancelled', 'cancelled_at': now(), 'cancel_reason': data.reason}})
    if not result.matched_count:
        raise HTTPException(404, 'Active package not found.')
    await audit(p, 'billing:package-cancel', package_id)
    return {'message': 'Package cancelled. Sessions already used stay recorded against it.'}


async def expire_packages() -> int:
    result = await db.child_packages.update_many({'status': 'active', 'expires_on': {'$lt': today_ist().isoformat()}}, {'$set': {'status': 'expired'}})
    return result.modified_count


# ---------- Razorpay ----------

async def _rzp(keys: dict, method: str, path: str, payload: dict | None = None) -> dict:
    async with httpx.AsyncClient(timeout=15) as http:
        response = await http.request(method, f'https://api.razorpay.com/v1/{path}', auth=(keys['key_id'], keys['key_secret']), json=payload)
    if response.status_code >= 400:
        try:
            message = response.json().get('error', {}).get('description', '')
        except ValueError:
            message = ''
        logger.warning('Razorpay %s %s -> %s %s', method, path, response.status_code, message)
        raise HTTPException(502, f'Razorpay could not create the payment link. {message}'.strip())
    return response.json()


async def payment_link(org_id: str, invoice: dict, child: dict, actor: dict) -> dict:
    keys = await razorpay_keys(org_id)
    if not keys:
        raise HTTPException(503, 'Online payment is not switched on yet. Please pay at the center by cash, UPI or bank transfer.')
    if invoice['status'] not in OPEN or invoice['balance_paise'] < 100:
        raise HTTPException(409, 'Nothing is due on this invoice.')
    existing = invoice.get('payment_link') or {}
    if existing.get('id') and existing.get('status') in ('created', 'partially_paid') and existing.get('amount_paise') == invoice['balance_paise']:
        return existing
    if existing.get('id') and existing.get('status') in ('created', 'partially_paid'):
        try:
            await _rzp(keys, 'POST', f"payment_links/{existing['id']}/cancel")
        except HTTPException:
            pass
    contact = invoice['bill_to']
    body = {'amount': invoice['balance_paise'], 'currency': 'INR', 'accept_partial': False, 'upi_link': False,
            'description': f"{invoice['number']} · {child['name']} · Moonlight Neurocare"[:2048],
            'reference_id': f"{invoice['number']}-{uid()[:6]}"[:40], 'reminder_enable': True, 'notify': {'sms': False, 'email': False},
            'callback_url': f'{WEB_ORIGIN}/api/billing/razorpay/callback', 'callback_method': 'get',
            'notes': {'invoice_id': invoice['id'], 'org_id': org_id}}
    customer = {k: v for k, v in {'name': contact.get('name', '')[:50], 'email': contact.get('email', ''), 'contact': contact.get('phone', '')}.items() if v}
    if customer:
        body['customer'] = customer
    link = await _rzp(keys, 'POST', 'payment_links', body)
    record = {'id': link['id'], 'short_url': link['short_url'], 'status': link.get('status', 'created'), 'amount_paise': invoice['balance_paise'],
              'created_at': now(), 'created_by': actor.get('id', '')}
    await db.invoices.update_one({'org_id': org_id, 'id': invoice['id']}, {'$set': {'payment_link': record}})
    return record


async def sync_payment_link(org_id: str, link_id: str) -> dict | None:
    """Ask Razorpay for the link's state and record any captured payments once."""
    keys = await razorpay_keys(org_id)
    invoice = await db.invoices.find_one({'org_id': org_id, 'payment_link.id': link_id}, {'_id': 0})
    if not keys or not invoice:
        return None
    link = await _rzp(keys, 'GET', f'payment_links/{link_id}')
    await db.invoices.update_one({'org_id': org_id, 'id': invoice['id']}, {'$set': {'payment_link.status': link.get('status', '')}})
    for pay in link.get('payments') or []:
        if pay.get('status') not in ('captured', 'authorized'):
            continue
        invoice = await _invoice(org_id, invoice['id'])
        if invoice['status'] not in OPEN:
            break
        received = datetime.fromtimestamp(int(pay.get('created_at') or datetime.now(timezone.utc).timestamp()), IST).date().isoformat()
        invoice = await _apply_payment(org_id, invoice, {
            'id': uid(), 'amount_paise': min(int(pay['amount']), invoice['balance_paise']), 'method': 'razorpay', 'method_label': METHODS['razorpay'],
            'reference': f"{pay.get('method', '').upper()} {pay['payment_id']}".strip(), 'gateway_payment_id': pay['payment_id'], 'received_on': received,
            'recorded_by': 'razorpay', 'recorded_by_name': 'Razorpay', 'recorded_at': now()})
    return await _invoice(org_id, invoice['id'])


@router.post('/billing/invoices/{invoice_id}/payment-link', response_model=Payload)
async def admin_payment_link(invoice_id: str, p=Depends(principal)):
    await _write(p)
    invoice = await _invoice(p['org_id'], invoice_id)
    child = await _child(p['org_id'], invoice['child_id'])
    link = await payment_link(p['org_id'], invoice, child, p)
    await _send_invoice_notice(p['org_id'], await _invoice(p['org_id'], invoice_id), child, link['short_url'])
    await audit(p, 'billing:payment-link', invoice_id)
    return {'payment_link': link, 'message': 'Payment link created and sent to the family by email.'}


@router.post('/billing/invoices/{invoice_id}/payment-link/refresh', response_model=Payload)
async def refresh_link(invoice_id: str, p=Depends(principal)):
    await _write(p)
    invoice = await _invoice(p['org_id'], invoice_id)
    if not (invoice.get('payment_link') or {}).get('id'):
        raise HTTPException(404, 'This invoice has no online payment link.')
    updated = await sync_payment_link(p['org_id'], invoice['payment_link']['id'])
    return updated or invoice


@router.get('/billing/razorpay/callback')
async def razorpay_callback(razorpay_payment_link_id: str = Query('', max_length=60)):
    """Razorpay sends the payer's browser here. We trust only what the Razorpay API itself reports."""
    invoice = await db.invoices.find_one({'payment_link.id': razorpay_payment_link_id}, {'_id': 0, 'org_id': 1, 'id': 1}) if razorpay_payment_link_id else None
    status = 'unknown'
    if invoice:
        try:
            updated = await sync_payment_link(invoice['org_id'], razorpay_payment_link_id)
            status = 'paid' if updated and updated['status'] == 'paid' else (updated or {}).get('status', 'unknown')
        except HTTPException:
            status = 'pending'
    return RedirectResponse(f'{WEB_ORIGIN}/payment-complete?status={status}', status_code=303)


@router.post('/billing/razorpay/webhook')
async def razorpay_webhook(request: Request):
    body = await request.body()
    try:
        event = json.loads(body)
        entity = event['payload']['payment_link']['entity']
        org_id = (entity.get('notes') or {}).get('org_id', '')
    except (ValueError, KeyError, TypeError):
        return {'status': 'ignored'}
    keys = await razorpay_keys(org_id) if org_id else None
    if not keys or not keys['webhook_secret']:
        return {'status': 'ignored'}
    expected = hmac.new(keys['webhook_secret'].encode(), body, hashlib.sha256).hexdigest()
    if not hmac.compare_digest(expected, request.headers.get('x-razorpay-signature', '')):
        raise HTTPException(400, 'Invalid signature.')
    if event.get('event', '').startswith('payment_link.'):
        try:
            await sync_payment_link(org_id, entity['id'])
        except HTTPException:
            logger.warning('Webhook sync failed for %s', entity.get('id'))
    return {'status': 'ok'}


# ---------- PDF ----------

def _pdf(invoice: dict, org: dict, settings: dict) -> bytes:
    from fpdf import FPDF
    pdf = FPDF(format='A4')
    pdf.set_auto_page_break(True, 18)
    pdf.add_page()
    font_dir = '/usr/share/fonts/truetype/dejavu'
    if os.path.exists(f'{font_dir}/DejaVuSans.ttf'):
        pdf.add_font('Body', '', f'{font_dir}/DejaVuSans.ttf')
        pdf.add_font('Body', 'B', f'{font_dir}/DejaVuSans-Bold.ttf')
        family, cur = 'Body', '₹'
    else:
        family, cur = 'Helvetica', 'Rs. '

    def text(value):
        return value if family == 'Body' else str(value).encode('latin-1', 'replace').decode('latin-1')

    teal = (23, 107, 101)
    pdf.set_text_color(*teal)
    pdf.set_font(family, 'B', 18)
    pdf.cell(0, 9, text(settings.get('legal_name') or org.get('name') or 'Moonlight Neurocare'), new_x='LMARGIN', new_y='NEXT')
    pdf.set_text_color(70, 80, 80)
    pdf.set_font(family, '', 9)
    pdf.multi_cell(110, 4.5, text(org.get('address', '')), new_x='LMARGIN', new_y='NEXT')
    pdf.cell(0, 4.5, text(' · '.join(x for x in [org.get('phone', ''), org.get('email', '')] if x)), new_x='LMARGIN', new_y='NEXT')
    if settings.get('gstin'):
        pdf.cell(0, 4.5, text(f"GSTIN: {settings['gstin']}"), new_x='LMARGIN', new_y='NEXT')
    pdf.set_xy(130, 12)
    pdf.set_font(family, 'B', 14)
    pdf.set_text_color(30, 50, 50)
    status_word = {'paid': 'RECEIPT', 'void': 'VOID'}.get(invoice['status'], 'INVOICE')
    pdf.cell(65, 8, status_word, align='R', new_x='LMARGIN', new_y='NEXT')
    pdf.set_font(family, '', 9)
    for label, value in [('No.', invoice.get('number') or 'Draft'), ('Date', invoice.get('issue_date', '')), ('Due', invoice.get('due_date', ''))]:
        pdf.set_x(130)
        pdf.cell(65, 5, text(f'{label}  {value}'), align='R', new_x='LMARGIN', new_y='NEXT')
    pdf.set_y(max(pdf.get_y(), 48) + 4)
    pdf.set_font(family, 'B', 10)
    pdf.cell(0, 5, 'Bill to', new_x='LMARGIN', new_y='NEXT')
    pdf.set_font(family, '', 10)
    bill = invoice['bill_to']
    pdf.cell(0, 5, text(f"{bill.get('name', '')}  (for {invoice['child_name']})"), new_x='LMARGIN', new_y='NEXT')
    pdf.cell(0, 5, text(' · '.join(x for x in [bill.get('phone', ''), bill.get('email', '')] if x)), new_x='LMARGIN', new_y='NEXT')
    pdf.ln(4)
    pdf.set_fill_color(234, 242, 238)
    pdf.set_font(family, 'B', 9)
    widths = [100, 18, 32, 35]
    for head, w, align in zip(['Description', 'Qty', 'Rate', 'Amount'], widths, ['L', 'R', 'R', 'R']):
        pdf.cell(w, 7, head, border=0, align=align, fill=True)
    pdf.ln()
    pdf.set_font(family, '', 9)
    for item in invoice['items']:
        qty = f"{item['qty']:g}"
        y = pdf.get_y()
        pdf.multi_cell(widths[0], 5.5, text(item['description']), new_x='RIGHT', new_y='TOP')
        height = max(pdf.get_y() - y, 5.5)
        pdf.set_xy(10 + widths[0], y)
        pdf.cell(widths[1], 5.5, qty, align='R')
        pdf.cell(widths[2], 5.5, text(f"{cur}{rupees(item['rate_paise'])}"), align='R')
        pdf.cell(widths[3], 5.5, text(f"{cur}{rupees(item['amount_paise'])}"), align='R')
        pdf.set_y(y + max(height, 5.5) + 1)
    pdf.ln(2)

    def total_row(label, paise, bold=False):
        pdf.set_font(family, 'B' if bold else '', 10 if bold else 9)
        pdf.cell(sum(widths[:3]), 6, text(label), align='R')
        pdf.cell(widths[3], 6, text(f'{cur}{rupees(paise)}'), align='R', new_x='LMARGIN', new_y='NEXT')

    total_row('Subtotal', invoice['subtotal_paise'])
    if invoice['discount_paise']:
        total_row('Discount (less)', invoice['discount_paise'])
    if invoice['tax_paise']:
        total_row(f"{settings.get('tax_label') or 'Tax'} {invoice['tax_percent']:g}%", invoice['tax_paise'])
    total_row('Total', invoice['total_paise'], True)
    if invoice['amount_paid_paise']:
        total_row('Paid', invoice['amount_paid_paise'])
        total_row('Balance due', invoice['balance_paise'], True)
    payments = [x for x in invoice.get('payments', []) if not x.get('reversed')]
    if payments:
        pdf.ln(3)
        pdf.set_font(family, 'B', 9)
        pdf.cell(0, 5, 'Payments received', new_x='LMARGIN', new_y='NEXT')
        pdf.set_font(family, '', 9)
        for pay in payments:
            pdf.cell(0, 5, text(f"{pay['received_on']}  ·  {pay['method_label']}  ·  {cur}{rupees(pay['amount_paise'])}  {pay.get('reference', '')}"), new_x='LMARGIN', new_y='NEXT')
    notes = [invoice.get('notes', '')]
    if invoice['status'] in OPEN:
        if settings.get('upi_id'):
            notes.append(f"Pay by UPI: {settings['upi_id']}")
        if settings.get('bank_details'):
            notes.append(f"Bank transfer: {settings['bank_details']}")
    if settings.get('footer_note'):
        notes.append(settings['footer_note'])
    notes = [n for n in notes if n]
    if notes:
        pdf.ln(4)
        pdf.set_font(family, '', 8.5)
        pdf.set_text_color(90, 100, 100)
        pdf.multi_cell(0, 4.5, text('\n'.join(notes)))
    if invoice['status'] == 'void':
        pdf.set_text_color(200, 60, 60)
        pdf.set_font(family, 'B', 11)
        pdf.ln(3)
        pdf.cell(0, 6, text(f"Voided: {invoice.get('void_reason', '')}"))
    return bytes(pdf.output())


async def _pdf_response(org_id: str, invoice: dict) -> Response:
    org = await db.settings.find_one({'org_id': org_id}, {'_id': 0, 'name': 1, 'address': 1, 'phone': 1, 'email': 1}) or {}
    data = _pdf(invoice, org, await billing_settings(org_id))
    name = (invoice.get('number') or 'draft').replace('/', '-')
    return Response(data, media_type='application/pdf', headers={'Content-Disposition': f'inline; filename="Moonlight-{name}.pdf"', 'Cache-Control': 'private, no-store'})


@router.get('/billing/invoices/{invoice_id}/pdf')
async def invoice_pdf(invoice_id: str, p=Depends(principal)):
    invoice = await _invoice(p['org_id'], invoice_id)
    if p['role'] == 'parent':
        await authorize(p, 'billing:own')
        child = await db.children.find_one({'org_id': p['org_id'], 'id': invoice['child_id'], 'guardian_ids': p['id']}, {'_id': 0, 'id': 1})
        if not child or invoice['status'] in ('draft',):
            raise HTTPException(404, 'Invoice not found.')
    else:
        await _read(p)
    await audit(p, 'billing:invoice-pdf', invoice_id)
    return await _pdf_response(p['org_id'], invoice)


# ---------- the family's view ----------

@router.get('/billing/my', response_model=Payload)
async def my_billing(p=Depends(principal)):
    await authorize(p, 'billing:own')
    children = await db.children.find({'org_id': p['org_id'], 'guardian_ids': p['id']}, {'_id': 0, 'id': 1, 'name': 1}).to_list(20)
    ids = [c['id'] for c in children]
    invoices = await db.invoices.find({'org_id': p['org_id'], 'child_id': {'$in': ids}, 'status': {'$nin': ['draft']}},
                                      {'_id': 0, 'org_id': 0, 'created_by': 0, 'payments.recorded_by': 0}).sort('created_at', -1).to_list(200)
    packages = await db.child_packages.find({'org_id': p['org_id'], 'child_id': {'$in': ids}, 'status': {'$in': ['active', 'used', 'expired']}},
                                            {'_id': 0, 'org_id': 0, 'usage': 0, 'created_by': 0}).sort('created_at', -1).to_list(50)
    settings = await billing_settings(p['org_id'])
    return {'children': children, 'invoices': invoices, 'packages': packages, 'balance_paise': sum(i['balance_paise'] for i in invoices if i['status'] in OPEN),
            'online_payments': bool(await razorpay_keys(p['org_id'])), 'upi_id': settings.get('upi_id', ''), 'bank_details': settings.get('bank_details', '')}


@router.post('/billing/my/invoices/{invoice_id}/pay', response_model=Payload)
async def my_pay(invoice_id: str, p=Depends(principal)):
    await authorize(p, 'billing:own')
    invoice = await _invoice(p['org_id'], invoice_id)
    child = await db.children.find_one({'org_id': p['org_id'], 'id': invoice['child_id'], 'guardian_ids': p['id']}, {'_id': 0})
    if not child:
        raise HTTPException(404, 'Invoice not found.')
    link = await payment_link(p['org_id'], invoice, child, p)
    await audit(p, 'billing:pay-online', invoice_id)
    return {'url': link['short_url']}
