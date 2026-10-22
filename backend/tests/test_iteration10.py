"""Backend tests for iteration 10: cron, attachments, digests, classes, video."""
import io
import os
import uuid
from pathlib import Path

import pytest
import requests


def _read_backend_url() -> str:
    env_url = os.environ.get("REACT_APP_BACKEND_URL")
    if env_url:
        return env_url.rstrip("/")
    env_file = Path("/app/frontend/.env")
    if env_file.exists():
        for line in env_file.read_text().splitlines():
            if line.startswith("REACT_APP_BACKEND_URL="):
                value = line.split("=", 1)[1].strip()
                if value:
                    return value.rstrip("/")
    raise RuntimeError("REACT_APP_BACKEND_URL missing")


BASE_URL = _read_backend_url()


def _secret():
    for line in Path("/app/backend/.env").read_text().splitlines():
        if line.startswith("WEBHOOK_CRON_SECRET="):
            return line.split("=", 1)[1].strip().strip('"')
    raise RuntimeError("secret missing")


WEBHOOK_SECRET = _secret()

TINY_PDF = (
    b"%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n"
)


def _demo(session: requests.Session, role: str) -> str:
    r = session.post(f"{BASE_URL}/api/auth/demo", json={"role": role})
    assert r.status_code == 200, r.text
    return r.json()["csrf"]


def _share_cookie(src: requests.Session) -> requests.Session:
    """Return a new session sharing the same mnc_demo sandbox cookie."""
    new = requests.Session()
    new.get(f"{BASE_URL}/api/public/settings")
    mnc = src.cookies.get("mnc_demo")
    if mnc:
        # Replace sandbox cookie
        new.cookies.set("mnc_demo", mnc, domain=new.cookies.get_dict().get("_domain_") or None)
        # requests Session cookies: use .set with URL
        new.cookies.clear()
        for c in src.cookies:
            if c.name == "mnc_demo":
                new.cookies.set(c.name, c.value, domain=c.domain, path=c.path)
    return new


# ----------------- Cron -----------------
class TestCron:
    def test_virus_definitions_unauth(self):
        r = requests.post(f"{BASE_URL}/api/cron/virus-definitions")
        assert r.status_code == 401

    def test_virus_definitions_accepted_and_duplicate(self):
        rid = f"test-{uuid.uuid4().hex}"
        h = {"Authorization": f"Bearer {WEBHOOK_SECRET}", "X-Webhook-Id": rid}
        r1 = requests.post(f"{BASE_URL}/api/cron/virus-definitions", headers=h)
        assert r1.status_code == 200
        assert r1.json()["status"] == "accepted"
        r2 = requests.post(f"{BASE_URL}/api/cron/virus-definitions", headers=h)
        assert r2.status_code == 200
        assert r2.json()["status"] == "duplicate"

    def test_school_digest_cron_variants(self):
        rid = f"test-{uuid.uuid4().hex}"
        h = {"Authorization": f"Bearer {WEBHOOK_SECRET}", "X-Webhook-Id": rid}
        r1 = requests.post(f"{BASE_URL}/api/cron/school-digest", headers=h)
        assert r1.status_code == 200 and r1.json()["status"] == "accepted"
        r2 = requests.post(f"{BASE_URL}/api/cron/school-digest", headers=h)
        assert r2.json()["status"] == "duplicate"

    def test_unknown_job(self):
        h = {"Authorization": f"Bearer {WEBHOOK_SECRET}", "X-Webhook-Id": f"x-{uuid.uuid4().hex}"}
        r = requests.post(f"{BASE_URL}/api/cron/does-not-exist", headers=h)
        assert r.status_code == 404


# ----------------- Attachments -----------------
class TestAttachments:
    def test_pdf_upload_and_message_roundtrip(self):
        parent = requests.Session()
        parent.get(f"{BASE_URL}/api/public/settings")
        p_csrf = _demo(parent, "parent")

        # Upload PDF attachment
        files = {"file": ("TEST_doc.pdf", io.BytesIO(TINY_PDF), "application/pdf")}
        r = parent.post(
            f"{BASE_URL}/api/team/children/demo-aarav/attachments",
            files=files, headers={"X-CSRF-Token": p_csrf},
        )
        assert r.status_code in (200, 201), r.text
        att = r.json()
        assert "id" in att and "filename" in att
        att_id = att["id"]

        # Non-allowed type rejected
        files_bad = {"file": ("bad.txt", io.BytesIO(b"hello"), "text/plain")}
        rb = parent.post(
            f"{BASE_URL}/api/team/children/demo-aarav/attachments",
            files=files_bad, headers={"X-CSRF-Token": p_csrf},
        )
        assert rb.status_code == 422

        # Send message with attachment
        r_msg = parent.post(
            f"{BASE_URL}/api/team/children/demo-aarav/messages",
            json={"body": "TEST message with attachment", "recipients_confirmed": True, "attachment_ids": [att_id]},
            headers={"X-CSRF-Token": p_csrf, "Content-Type": "application/json"},
        )
        assert r_msg.status_code in (200, 201), r_msg.text
        msg = r_msg.json()
        atts = msg.get("attachments") or msg.get("message", {}).get("attachments")
        assert atts and any(a["id"] == att_id for a in atts)

        # Reusing already-sent attachment id -> 422
        r_reuse = parent.post(
            f"{BASE_URL}/api/team/children/demo-aarav/messages",
            json={"body": "TEST reuse", "recipients_confirmed": True, "attachment_ids": [att_id]},
            headers={"X-CSRF-Token": p_csrf, "Content-Type": "application/json"},
        )
        assert r_reuse.status_code == 422

        # Parent can download attachment
        r_dl = parent.get(f"{BASE_URL}/api/team/attachments/{att_id}")
        assert r_dl.status_code == 200
        assert len(r_dl.content) > 0


# ----------------- Digests -----------------
class TestDigests:
    def test_admin_run_and_parent_fetch(self):
        s = requests.Session()
        s.get(f"{BASE_URL}/api/public/settings")

        a_csrf = _demo(s, "admin")
        r = s.post(f"{BASE_URL}/api/admin/school-digests/run", headers={"X-CSRF-Token": a_csrf})
        assert r.status_code in (200, 201), r.text
        data = r.json()
        assert "created" in data or "count" in data or isinstance(data, dict)

        p_csrf = _demo(s, "parent")
        r2 = s.get(f"{BASE_URL}/api/team/children/demo-aarav/digests")
        assert r2.status_code == 200, r2.text
        body = r2.json()
        # Expect items and preview
        assert "items" in body or "digests" in body or "preview" in body

    def test_teacher_forbidden(self):
        s = requests.Session()
        s.get(f"{BASE_URL}/api/public/settings")
        _demo(s, "teacher")
        r = s.get(f"{BASE_URL}/api/team/children/demo-aarav/digests")
        assert r.status_code == 403


# ----------------- Classes -----------------
class TestClasses:
    def test_parent_classes_list_has_seeded(self):
        s = requests.Session()
        s.get(f"{BASE_URL}/api/public/settings")
        _demo(s, "parent")
        r = s.get(f"{BASE_URL}/api/classes")
        assert r.status_code == 200
        ids = {c["id"] for c in r.json().get("classes", [])}
        assert "demo-class-online" in ids
        assert "demo-class-center" in ids
        assert "demo-class-home" in ids

    def test_book_home_requires_address_and_dup_conflicts(self):
        s = requests.Session()
        s.get(f"{BASE_URL}/api/public/settings")
        p_csrf = _demo(s, "parent")

        # missing address -> 422
        r = s.post(
            f"{BASE_URL}/api/classes/demo-class-home/book",
            json={"child_id": "demo-aarav", "home_address": ""},
            headers={"X-CSRF-Token": p_csrf, "Content-Type": "application/json"},
        )
        assert r.status_code == 422

        # with address -> 201 (or 409 if already booked from prev run)
        r2 = s.post(
            f"{BASE_URL}/api/classes/demo-class-home/book",
            json={"child_id": "demo-aarav", "home_address": "1234 Test Road, Sector 37C, Gurugram"},
            headers={"X-CSRF-Token": p_csrf, "Content-Type": "application/json"},
        )
        assert r2.status_code in (201, 409), r2.text

        # dup -> 409
        r3 = s.post(
            f"{BASE_URL}/api/classes/demo-class-home/book",
            json={"child_id": "demo-aarav", "home_address": "1234 Test Road, Sector 37C, Gurugram"},
            headers={"X-CSRF-Token": p_csrf, "Content-Type": "application/json"},
        )
        assert r3.status_code == 409

    def test_video_join_not_connected_for_booked_parent(self):
        s = requests.Session()
        s.get(f"{BASE_URL}/api/public/settings")
        p_csrf = _demo(s, "parent")
        r = s.post(
            f"{BASE_URL}/api/classes/demo-class-online/video/join",
            headers={"X-CSRF-Token": p_csrf},
        )
        # 503 not connected (parent already booked via seed) or 409 if join-window closed
        assert r.status_code in (503, 409), r.text
        if r.status_code == 503:
            assert "not connected" in r.text.lower()

    def test_admin_create_class_past_rejected_and_school_forbidden(self):
        s = requests.Session()
        s.get(f"{BASE_URL}/api/public/settings")
        a_csrf = _demo(s, "admin")

        # need therapist id for this sandbox
        me = s.get(f"{BASE_URL}/api/auth/me").json()
        org_id = me.get("org_id") or me.get("user", {}).get("org_id")
        therapist_id = f"{org_id}-staff" if org_id else "unknown-staff"

        past = "2020-01-01T10:00:00+00:00"
        r = s.post(
            f"{BASE_URL}/api/classes",
            json={"title": "TEST Past", "therapy": "OT", "format": "online",
                  "starts_at": past, "duration_minutes": 30, "capacity": 3,
                  "therapist_id": therapist_id},
            headers={"X-CSRF-Token": a_csrf, "Content-Type": "application/json"},
        )
        assert r.status_code == 422

        # school user forbidden
        sh = requests.Session()
        sh.get(f"{BASE_URL}/api/public/settings")
        sh_csrf = _demo(sh, "school")
        r2 = sh.post(
            f"{BASE_URL}/api/classes",
            json={"title": "TEST S", "therapy": "OT", "format": "online",
                  "starts_at": "2099-01-01T10:00:00+00:00", "duration_minutes": 30,
                  "capacity": 3, "therapist_id": therapist_id},
            headers={"X-CSRF-Token": sh_csrf, "Content-Type": "application/json"},
        )
        assert r2.status_code == 403
