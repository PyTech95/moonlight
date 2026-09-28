"""Tests for redesigned login, all-role passwords, and admin live editor content endpoint."""
import os
import uuid
import pytest
import requests

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL').rstrip('/')
API = f"{BASE_URL}/api"
DEMO_PW = "Moonlight@2026"
ORIGIN = os.environ.get('WEB_ORIGIN', BASE_URL)


def new_session():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json", "Origin": ORIGIN, "Referer": ORIGIN + "/"})
    # Bootstrap sandbox cookie by hitting a public endpoint
    r = s.get(f"{API}/public/settings")
    assert r.status_code == 200, r.text
    return s


def login_as(role):
    s = new_session()
    r = s.post(f"{API}/auth/login", json={"email": f"{role}@moonlight.demo", "password": DEMO_PW})
    assert r.status_code == 200, f"{role} login failed: {r.status_code} {r.text}"
    data = r.json()
    assert data["role"] == role, data
    assert data["email"] == f"{role}@moonlight.demo"
    assert "csrf" in data and data["csrf"]
    s.headers.update({"X-CSRF-Token": data["csrf"]})
    return s, data


# ---------- Auth: password login for all three demo roles ----------
@pytest.mark.parametrize("role", ["admin", "staff", "parent"])
def test_password_login_works(role):
    s, data = login_as(role)
    # /auth/me should return same user
    me = s.get(f"{API}/auth/me")
    assert me.status_code == 200
    body = me.json()
    assert body["role"] == role
    assert body["email"] == f"{role}@moonlight.demo"


def test_login_wrong_password_rejected():
    s = new_session()
    r = s.post(f"{API}/auth/login", json={"email": "admin@moonlight.demo", "password": "wrong-password-xyz"})
    assert r.status_code == 401


def test_demo_persona_login_admin():
    s = new_session()
    r = s.post(f"{API}/auth/demo", json={"role": "admin"})
    assert r.status_code == 200, r.text
    assert r.json()["role"] == "admin"


# ---------- Admin live editor content endpoint ----------
def test_patch_content_requires_auth():
    s = new_session()
    r = s.patch(f"{API}/admin/content", json={"key": "home-hero-title-1", "value": "hi"})
    assert r.status_code in (401, 403), r.status_code


def test_patch_content_requires_csrf():
    s, _ = login_as("admin")
    # remove CSRF header
    s.headers.pop("X-CSRF-Token", None)
    r = s.patch(f"{API}/admin/content", json={"key": "home-hero-title-1", "value": "hi"})
    assert r.status_code == 403, r.status_code


def test_patch_content_staff_forbidden():
    s, _ = login_as("staff")
    r = s.patch(f"{API}/admin/content", json={"key": "home-hero-title-1", "value": "no"})
    assert r.status_code == 403, r.status_code


def test_patch_content_parent_forbidden():
    s, _ = login_as("parent")
    r = s.patch(f"{API}/admin/content", json={"key": "home-hero-title-1", "value": "no"})
    assert r.status_code == 403, r.status_code


def test_patch_content_invalid_key():
    s, _ = login_as("admin")
    r = s.patch(f"{API}/admin/content", json={"key": "bad key!!", "value": "x"})
    assert r.status_code == 422


def test_admin_edit_content_persists_to_public_settings():
    s, _ = login_as("admin")
    unique = f"Hero title {uuid.uuid4().hex[:8]}"
    r = s.patch(f"{API}/admin/content", json={"key": "home-hero-title-1", "value": unique})
    assert r.status_code == 200, r.text
    body = r.json()
    assert body.get("content", {}).get("home-hero-title-1") == unique

    # Verify via public settings within same session (same sandbox)
    pub = s.get(f"{API}/public/settings")
    assert pub.status_code == 200
    assert pub.json().get("content", {}).get("home-hero-title-1") == unique


def test_admin_edit_multiple_keys():
    s, _ = login_as("admin")
    keys = ["therapies-title", "sports-title", "final-cta-title", "home-partnership-title", "home-care-0-title"]
    for i, k in enumerate(keys):
        val = f"V-{uuid.uuid4().hex[:6]}-{i}"
        r = s.patch(f"{API}/admin/content", json={"key": k, "value": val})
        assert r.status_code == 200, f"{k}: {r.text}"
        assert r.json()["content"][k] == val
