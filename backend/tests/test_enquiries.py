"""Tests for POST /api/enquiries center-inbox notification & validation."""
import os
import time
import uuid
import pytest
import requests

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL').rstrip('/')
API = f"{BASE_URL}/api"
ORIGIN = "https://moonlight-web-1.cluster-5.preview.emergentcf.cloud"
DEMO_PW = "Moonlight@2026"


def new_session():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json", "Origin": ORIGIN, "Referer": ORIGIN + "/"})
    r = s.get(f"{API}/public/settings")
    assert r.status_code == 200, r.text
    return s


def valid_payload(**overrides):
    payload = {
        "guardian_name": "TEST Parent",
        "phone": "+919876543210",
        "email": "test.parent@example.com",
        "service": "Speech Therapy",
        "contact_time": "Morning",
        "contact_preference": "Phone",
        "consent": True,
        "source": "TEST",
        "country": "India",
    }
    payload.update(overrides)
    return payload


def idem_key():
    return "TEST-" + uuid.uuid4().hex  # >16 chars


# ---------- Happy path ----------
def test_enquiry_success_returns_reference_and_notifies():
    s = new_session()
    key = idem_key()
    r = s.post(f"{API}/enquiries", json=valid_payload(), headers={"Idempotency-Key": key})
    assert r.status_code == 201, r.text
    data = r.json()
    assert data["duplicate"] is False
    assert data["status"] == "Request received"
    ref = data["reference"]
    assert ref.startswith("MN-") and len(ref) == 11, ref
    assert isinstance(data["id"], str) and data["id"]

    # Login as admin in SAME sandbox to fetch and verify notification.status
    login = s.post(f"{API}/auth/login",
                   json={"email": "admin@moonlight.demo", "password": DEMO_PW})
    assert login.status_code == 200, login.text
    s.headers.update({"X-CSRF-Token": login.json()["csrf"]})

    # background task dispatch; poll for up to ~10s
    status = None
    for _ in range(10):
        time.sleep(1)
        listing = s.get(f"{API}/admin/enquiries")
        assert listing.status_code == 200, listing.text
        items = listing.json().get("items") or listing.json().get("enquiries") or listing.json()
        if isinstance(items, dict) and "items" in items:
            items = items["items"]
        found = next((it for it in items if it.get("reference") == ref), None)
        assert found, f"enquiry {ref} not visible to admin"
        status = (found.get("notification") or {}).get("status")
        if status == "Sent":
            break
    assert status == "Sent", f"notification.status expected 'Sent', got {status!r}"


# ---------- Idempotency ----------
def test_enquiry_idempotent_same_key_same_body():
    s = new_session()
    key = idem_key()
    body = valid_payload(guardian_name="TEST Idempo")
    r1 = s.post(f"{API}/enquiries", json=body, headers={"Idempotency-Key": key})
    assert r1.status_code == 201
    r2 = s.post(f"{API}/enquiries", json=body, headers={"Idempotency-Key": key})
    assert r2.status_code == 201, r2.text
    d1, d2 = r1.json(), r2.json()
    assert d2["reference"] == d1["reference"]
    assert d2["duplicate"] is True


# ---------- Validation ----------
def test_enquiry_consent_false_rejected():
    s = new_session()
    r = s.post(f"{API}/enquiries", json=valid_payload(consent=False),
               headers={"Idempotency-Key": idem_key()})
    assert r.status_code == 422, r.text


def test_enquiry_email_pref_without_email_rejected():
    s = new_session()
    body = valid_payload(contact_preference="Email")
    body.pop("email", None)
    r = s.post(f"{API}/enquiries", json=body, headers={"Idempotency-Key": idem_key()})
    assert r.status_code == 422, r.text


def test_enquiry_invalid_service_rejected():
    s = new_session()
    r = s.post(f"{API}/enquiries", json=valid_payload(service="Nonexistent Therapy"),
               headers={"Idempotency-Key": idem_key()})
    assert r.status_code == 422, r.text


def test_enquiry_short_idempotency_key_rejected():
    s = new_session()
    r = s.post(f"{API}/enquiries", json=valid_payload(),
               headers={"Idempotency-Key": "short-key"})
    assert r.status_code == 422, r.text


# ---------- Regression: admin list visibility ----------
def test_enquiry_visible_in_admin_list_same_sandbox():
    s = new_session()
    key = idem_key()
    r = s.post(f"{API}/enquiries", json=valid_payload(guardian_name="TEST Regression"),
               headers={"Idempotency-Key": key})
    assert r.status_code == 201
    ref = r.json()["reference"]

    login = s.post(f"{API}/auth/login",
                   json={"email": "admin@moonlight.demo", "password": DEMO_PW})
    assert login.status_code == 200
    s.headers.update({"X-CSRF-Token": login.json()["csrf"]})

    listing = s.get(f"{API}/admin/enquiries")
    assert listing.status_code == 200
    payload = listing.json()
    items = payload.get("items") if isinstance(payload, dict) else payload
    if items is None and isinstance(payload, dict):
        items = payload.get("enquiries", [])
    assert any(it.get("reference") == ref for it in items), f"reference {ref} missing in admin list"
