"""Production mode verification: real admin login, demo removed, enquiry+editor regression."""
import os
import time
import uuid
import pytest
import requests

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL').rstrip('/')
API = f"{BASE_URL}/api"
ORIGIN = os.environ.get('WEB_ORIGIN', BASE_URL)

ADMIN_EMAIL = "moonlightneurocare@gmail.com"
ADMIN_PW = "Vgkmqmdzl124#Care"


def new_session():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json", "Origin": ORIGIN, "Referer": ORIGIN + "/"})
    r = s.get(f"{API}/public/settings")
    assert r.status_code == 200, r.text
    return s


def login_admin():
    s = new_session()
    r = s.post(f"{API}/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PW})
    assert r.status_code == 200, f"admin login failed: {r.status_code} {r.text}"
    data = r.json()
    assert data["role"] == "admin", data
    assert data.get("demo") is False, data
    s.headers.update({"X-CSRF-Token": data["csrf"]})
    return s, data


# ---------- Health ----------
def test_health_mode_production():
    r = requests.get(f"{API}/health", headers={"Origin": ORIGIN})
    assert r.status_code == 200
    body = r.json()
    assert body.get("mode") == "production", body


# ---------- Admin login ----------
def test_real_admin_login_ok():
    s, data = login_admin()
    assert data["email"] == ADMIN_EMAIL
    me = s.get(f"{API}/auth/me")
    assert me.status_code == 200
    body = me.json()
    assert body["role"] == "admin"
    assert body["email"] == ADMIN_EMAIL
    assert body.get("demo") is False, body


def test_login_wrong_password_401():
    s = new_session()
    r = s.post(f"{API}/auth/login", json={"email": ADMIN_EMAIL, "password": "not-the-password"})
    assert r.status_code == 401


def test_login_unknown_email_401():
    s = new_session()
    r = s.post(f"{API}/auth/login", json={"email": f"nosuch-{uuid.uuid4().hex[:6]}@example.com", "password": "whatever123"})
    assert r.status_code == 401


# ---------- Demo removed ----------
def test_demo_endpoint_404():
    s = new_session()
    r = s.post(f"{API}/auth/demo", json={"role": "admin"})
    assert r.status_code == 404, f"expected 404, got {r.status_code}: {r.text[:200]}"


def test_auth_me_after_admin_login_not_demo():
    s, _ = login_admin()
    me = s.get(f"{API}/auth/me").json()
    assert me.get("demo") is False


# ---------- Enquiry regression ----------
def test_enquiry_submission_and_admin_visibility():
    s = new_session()
    idem = "test-idem-" + uuid.uuid4().hex  # >=16 chars
    payload = {
        "guardian_name": "TEST Regression Parent",
        "phone": "+919876543210",
        "email": f"test.regression+{uuid.uuid4().hex[:6]}@example.com",
        "service": "Speech Therapy",
        "contact_time": "Morning",
        "contact_preference": "Phone",
        "consent": True,
        "source": "TEST",
        "country": "India",
    }
    r = s.post(f"{API}/enquiries", json=payload, headers={"Idempotency-Key": idem})
    assert r.status_code == 201, f"{r.status_code} {r.text}"
    body = r.json()
    ref = body.get("reference")
    assert ref and ref.startswith("MN-"), body

    # Login as admin - same production org, admin can see it
    a, _ = login_admin()
    found = None
    for _ in range(6):
        lst = a.get(f"{API}/admin/enquiries")
        assert lst.status_code == 200, lst.text
        items = lst.json().get("items", lst.json()) if isinstance(lst.json(), dict) else lst.json()
        # normalize
        if isinstance(items, dict):
            items = items.get("items", [])
        for it in items:
            if it.get("reference") == ref:
                found = it
                break
        if found and (found.get("notification", {}).get("status") == "Sent"):
            break
        time.sleep(2)
    assert found, f"Enquiry {ref} not visible to admin in production org"
    notif = found.get("notification") or {}
    # Notification should be dispatched (Sent) or at least attempted; log for visibility
    assert notif.get("status") in ("Sent", "Queued", "Sending"), f"notification status: {notif}"


# ---------- Live editor regression ----------
def test_admin_edit_content_persists():
    s, _ = login_admin()
    unique = f"Regression title {uuid.uuid4().hex[:8]}"
    r = s.patch(f"{API}/admin/content", json={"key": "home-hero-title-1", "value": unique})
    assert r.status_code == 200, r.text
    assert r.json().get("content", {}).get("home-hero-title-1") == unique
    pub = s.get(f"{API}/public/settings")
    assert pub.status_code == 200
    assert pub.json().get("content", {}).get("home-hero-title-1") == unique


def test_patch_content_requires_auth():
    s = new_session()
    r = s.patch(f"{API}/admin/content", json={"key": "home-hero-title-1", "value": "x"})
    assert r.status_code in (401, 403)
