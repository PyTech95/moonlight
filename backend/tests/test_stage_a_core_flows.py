import os
import uuid
from datetime import datetime, timedelta, timezone

import pytest
import requests


BASE_URL = os.environ.get("REACT_APP_BACKEND_URL").rstrip("/")


@pytest.fixture
def client():
    session = requests.Session()
    session.headers.update({"Content-Type": "application/json"})
    return session


def get_csrf_and_user(session: requests.Session, role: str):
    # auth module + security module: demo sign-in and csrf/session behavior
    response = session.post(f"{BASE_URL}/api/auth/demo", json={"role": role})
    assert response.status_code == 200
    data = response.json()
    assert data["role"] == role
    assert isinstance(data.get("csrf"), str) and len(data["csrf"]) > 10
    return data["csrf"], data


def create_enquiry(session: requests.Session, idempotency_key: str, **overrides):
    # public module: enquiry creation, idempotency, validation
    payload = {
        "guardian_name": "FICTIONAL Parent",
        "phone": "+919900112233",
        "email": "fictional.parent@example.com",
        "service": "Speech Therapy",
        "contact_time": "Morning",
        "contact_preference": "Phone",
        "consent": True,
        "source": "Website",
        "country": "India",
    }
    payload.update(overrides)
    return session.post(
        f"{BASE_URL}/api/enquiries",
        json=payload,
        headers={"Idempotency-Key": idempotency_key},
    )


class TestPublicEnquiryFlow:
    # public module: mobile enquiry + consent and email preference validation
    def test_enquiry_validation_and_idempotency(self, client):
        warm = client.get(f"{BASE_URL}/api/public/settings")
        assert warm.status_code == 200

        missing_consent = create_enquiry(client, f"k-{uuid.uuid4().hex}", consent=False)
        assert missing_consent.status_code == 422
        assert "consent" in missing_consent.json()["detail"].lower()

        email_pref_without_email = create_enquiry(
            client,
            f"k-{uuid.uuid4().hex}",
            contact_preference="Email",
            email=None,
        )
        assert email_pref_without_email.status_code == 422
        assert "email" in email_pref_without_email.json()["detail"].lower()

        bad_phone = create_enquiry(client, f"k-{uuid.uuid4().hex}", phone="9900112233")
        assert bad_phone.status_code == 422
        assert "country code" in str(bad_phone.json()).lower()

        idem_key = f"idem-{uuid.uuid4().hex[:24]}"
        first = create_enquiry(client, idem_key)
        assert first.status_code == 201
        first_data = first.json()
        assert first_data["duplicate"] is False
        assert first_data["status"] == "Request received"

        second_same = create_enquiry(client, idem_key)
        assert second_same.status_code == 201
        second_data = second_same.json()
        assert second_data["duplicate"] is True
        assert second_data["id"] == first_data["id"]

        changed_payload_same_key = create_enquiry(client, idem_key, service="Occupational Therapy")
        assert changed_payload_same_key.status_code == 409

    def test_enquiry_persists_once_and_embeds_task_notification(self, client):
        client.get(f"{BASE_URL}/api/public/settings")
        idem_key = f"idem-{uuid.uuid4().hex[:24]}"
        create = create_enquiry(client, idem_key)
        assert create.status_code == 201
        enquiry_id = create.json()["id"]

        csrf, _ = get_csrf_and_user(client, "admin")
        admin_enquiries = client.get(f"{BASE_URL}/api/admin/enquiries")
        assert admin_enquiries.status_code == 200
        items = admin_enquiries.json()["items"]
        target = [x for x in items if x["id"] == enquiry_id]
        assert len(target) == 1
        record = target[0]
        assert record["task"]["status"] == "Open"
        assert "review" in record["task"]["title"].lower()
        assert record["notification"]["status"] == "Not Configured"
        assert record["notification"]["retryable"] is True

        stage_update = client.patch(
            f"{BASE_URL}/api/admin/enquiries/{enquiry_id}",
            json={"stage": "Contacted", "version": record["version"]},
            headers={"X-CSRF-Token": csrf},
        )
        assert stage_update.status_code == 200
        assert stage_update.json()["stage"] == "Contacted"


class TestSandboxIsolationAndAuth:
    # auth module + tenant isolation across browser sandboxes
    def test_separate_sandboxes_do_not_share_enquiries_or_settings(self):
        session_a = requests.Session()
        session_a.headers.update({"Content-Type": "application/json"})
        session_b = requests.Session()
        session_b.headers.update({"Content-Type": "application/json"})

        assert session_a.get(f"{BASE_URL}/api/public/settings").status_code == 200
        assert session_b.get(f"{BASE_URL}/api/public/settings").status_code == 200

        key = f"idem-{uuid.uuid4().hex[:24]}"
        created = create_enquiry(session_a, key)
        assert created.status_code == 201
        created_id = created.json()["id"]

        csrf_admin_a, _ = get_csrf_and_user(session_a, "admin")
        list_a = session_a.get(f"{BASE_URL}/api/admin/enquiries")
        assert list_a.status_code == 200
        assert any(e["id"] == created_id for e in list_a.json()["items"])

        csrf_admin_b, _ = get_csrf_and_user(session_b, "admin")
        list_b = session_b.get(f"{BASE_URL}/api/admin/enquiries")
        assert list_b.status_code == 200
        assert not any(e["id"] == created_id for e in list_b.json()["items"])

        settings_b = session_b.get(f"{BASE_URL}/api/admin/settings")
        assert settings_b.status_code == 200
        v_b = settings_b.json()["version"]
        update_b = session_b.patch(
            f"{BASE_URL}/api/admin/settings",
            json={
                "email": "sandbox-b@example.com",
                "phone": "+91 9999999991",
                "secondary_phone": "+91 9999999992",
                "address": "Sandbox B testing address for demo visibility checks in Gurugram city",
                "version": v_b,
            },
            headers={"X-CSRF-Token": csrf_admin_b},
        )
        assert update_b.status_code == 200

        public_b = session_b.get(f"{BASE_URL}/api/public/settings")
        assert public_b.status_code == 200
        assert public_b.json()["email"] == "sandbox-b@example.com"

        public_a = session_a.get(f"{BASE_URL}/api/public/settings")
        assert public_a.status_code == 200
        assert public_a.json()["email"] != "sandbox-b@example.com"

    def test_demo_role_switch_revokes_previous_session_and_login_error_generic(self, client):
        client.get(f"{BASE_URL}/api/public/settings")

        parent = client.post(f"{BASE_URL}/api/auth/demo", json={"role": "parent"})
        assert parent.status_code == 200
        parent_cookie = client.cookies.get("mnc_session")
        assert parent_cookie

        admin = client.post(f"{BASE_URL}/api/auth/demo", json={"role": "admin"})
        assert admin.status_code == 200
        assert client.cookies.get("mnc_session") != parent_cookie

        old_session_client = requests.Session()
        old_session_client.headers.update({"Content-Type": "application/json"})
        old_session_client.cookies.set("mnc_session", parent_cookie)
        old_auth_me = old_session_client.get(f"{BASE_URL}/api/auth/me")
        assert old_auth_me.status_code == 401

        invalid_login = client.post(
            f"{BASE_URL}/api/auth/login",
            json={"email": "invalid@example.com", "password": "wrong-pass"},
        )
        assert invalid_login.status_code == 401
        assert "email or password" in invalid_login.json()["detail"].lower()

    def test_csrf_required_for_authenticated_write_and_foreign_origin_rejected(self, client):
        client.get(f"{BASE_URL}/api/public/settings")
        csrf, _ = get_csrf_and_user(client, "admin")

        settings = client.get(f"{BASE_URL}/api/admin/settings")
        assert settings.status_code == 200
        version = settings.json()["version"]

        no_csrf = client.patch(
            f"{BASE_URL}/api/admin/settings",
            json={
                "email": "csrf-check@example.com",
                "phone": "+91 9999999911",
                "secondary_phone": "+91 9999999912",
                "address": "CSRF validation sample address for secure write checks in Gurugram",
                "version": version,
            },
        )
        assert no_csrf.status_code == 403

        foreign_origin = client.patch(
            f"{BASE_URL}/api/admin/settings",
            json={
                "email": "origin-check@example.com",
                "phone": "+91 9999999921",
                "secondary_phone": "+91 9999999922",
                "address": "Foreign origin validation sample address for secure write checks",
                "version": version,
            },
            headers={"X-CSRF-Token": csrf, "Origin": "https://evil.example.com"},
        )
        assert foreign_origin.status_code == 403


class TestWorkspacePermissionsAndFlows:
    # workspace/admin modules: role scoping, requests/attendance/versioning and guardian revoke behavior
    def test_parent_staff_admin_scoping_and_revoke_guardian_persists(self):
        parent_sess = requests.Session()
        parent_sess.headers.update({"Content-Type": "application/json"})
        parent_sess.get(f"{BASE_URL}/api/public/settings")
        parent_csrf, _ = get_csrf_and_user(parent_sess, "parent")

        parent_ws = parent_sess.get(f"{BASE_URL}/api/workspace/parent")
        assert parent_ws.status_code == 200
        children = parent_ws.json()["children"]
        assert [c["id"] for c in children] == ["demo-aarav"]

        parent_forbidden_admin_ws = parent_sess.get(f"{BASE_URL}/api/workspace/admin")
        assert parent_forbidden_admin_ws.status_code == 403
        parent_forbidden_admin_enq = parent_sess.get(f"{BASE_URL}/api/admin/enquiries")
        assert parent_forbidden_admin_enq.status_code == 403

        parent_child_404 = parent_sess.get(f"{BASE_URL}/api/children/demo-meera")
        assert parent_child_404.status_code == 404

        staff_sess = requests.Session()
        staff_sess.headers.update({"Content-Type": "application/json"})
        staff_sess.get(f"{BASE_URL}/api/public/settings")
        staff_csrf, _ = get_csrf_and_user(staff_sess, "staff")

        staff_ws = staff_sess.get(f"{BASE_URL}/api/workspace/staff")
        assert staff_ws.status_code == 200
        staff_child_ids = sorted([c["id"] for c in staff_ws.json()["children"]])
        assert staff_child_ids == ["demo-aarav", "demo-meera"]

        admin_csrf, _ = get_csrf_and_user(parent_sess, "admin")
        admin_ws = parent_sess.get(f"{BASE_URL}/api/workspace/admin")
        assert admin_ws.status_code == 200
        assert "stats" in admin_ws.json()

        admin_child = parent_sess.get(f"{BASE_URL}/api/children/demo-aarav")
        assert admin_child.status_code == 200
        admin_child_data = admin_child.json()
        assert "communication" not in admin_child_data
        assert "goals" not in admin_child_data
        assert "shared_summary" not in admin_child_data

        unknown_child = parent_sess.get(f"{BASE_URL}/api/children/does-not-exist")
        assert unknown_child.status_code == 404

        revoke = parent_sess.post(
            f"{BASE_URL}/api/admin/children/demo-aarav/revoke-guardian",
            headers={"X-CSRF-Token": admin_csrf},
        )
        assert revoke.status_code == 200

        parent_again = parent_sess.post(f"{BASE_URL}/api/auth/demo", json={"role": "parent"})
        assert parent_again.status_code == 200

        parent_ws_after_revoke = parent_sess.get(f"{BASE_URL}/api/workspace/parent")
        assert parent_ws_after_revoke.status_code == 200
        after_data = parent_ws_after_revoke.json()
        assert after_data["children"] == []
        assert after_data["activities"] == []
        assert after_data["appointments"] == []

        _ = parent_csrf
        _ = staff_csrf

    def test_parent_activity_request_and_staff_attendance_versioning(self):
        parent_sess = requests.Session()
        parent_sess.headers.update({"Content-Type": "application/json"})
        parent_sess.get(f"{BASE_URL}/api/public/settings")
        parent_csrf, _ = get_csrf_and_user(parent_sess, "parent")

        ws_parent = parent_sess.get(f"{BASE_URL}/api/workspace/parent")
        assert ws_parent.status_code == 200
        ws_data = ws_parent.json()
        activity = ws_data["activities"][0]
        appointment = ws_data["appointments"][0]

        first_activity_update = parent_sess.patch(
            f"{BASE_URL}/api/activities/{activity['id']}",
            json={"status": "Tried it", "feedback": "We tried it and it helped.", "version": activity["version"]},
            headers={"X-CSRF-Token": parent_csrf},
        )
        assert first_activity_update.status_code == 200
        assert first_activity_update.json()["status"] == "Tried it"

        stale_update = parent_sess.patch(
            f"{BASE_URL}/api/activities/{activity['id']}",
            json={"status": "Need an adaptation", "feedback": "Need easier steps", "version": activity["version"]},
            headers={"X-CSRF-Token": parent_csrf},
        )
        assert stale_update.status_code == 409

        yesterday = (datetime.now(timezone.utc).date() - timedelta(days=1)).isoformat()
        past_date = parent_sess.post(
            f"{BASE_URL}/api/appointment-requests",
            json={
                "appointment_id": appointment["id"],
                "kind": "Reschedule",
                "preferred_date": yesterday,
                "reason": "FICTIONAL schedule clash",
            },
            headers={"X-CSRF-Token": parent_csrf},
        )
        assert past_date.status_code == 422

        today = datetime.now(timezone.utc).date().isoformat()
        request_ok = parent_sess.post(
            f"{BASE_URL}/api/appointment-requests",
            json={
                "appointment_id": appointment["id"],
                "kind": "Reschedule",
                "preferred_date": today,
                "reason": "FICTIONAL request to move this timing",
            },
            headers={"X-CSRF-Token": parent_csrf},
        )
        assert request_ok.status_code == 201
        req_data = request_ok.json()
        assert req_data["status"] == "Pending"

        duplicate_pending = parent_sess.post(
            f"{BASE_URL}/api/appointment-requests",
            json={
                "appointment_id": appointment["id"],
                "kind": "Reschedule",
                "preferred_date": today,
                "reason": "FICTIONAL duplicate",
            },
            headers={"X-CSRF-Token": parent_csrf},
        )
        assert duplicate_pending.status_code == 409

        parent_after_req = parent_sess.get(f"{BASE_URL}/api/workspace/parent")
        assert parent_after_req.status_code == 200
        pending_ids = [r["id"] for r in parent_after_req.json()["requests"]]
        assert req_data["id"] in pending_ids

        unchanged_appointment = [a for a in parent_after_req.json()["appointments"] if a["id"] == appointment["id"]][0]
        assert unchanged_appointment["status"] == "Confirmed"

        get_csrf_and_user(parent_sess, "admin")
        admin_ws = parent_sess.get(f"{BASE_URL}/api/workspace/admin")
        assert admin_ws.status_code == 200
        assert any(r["id"] == req_data["id"] for r in admin_ws.json()["requests"])

        staff_sess = requests.Session()
        staff_sess.headers.update({"Content-Type": "application/json"})
        staff_sess.get(f"{BASE_URL}/api/public/settings")
        staff_csrf, _ = get_csrf_and_user(staff_sess, "staff")
        ws_staff = staff_sess.get(f"{BASE_URL}/api/workspace/staff")
        assert ws_staff.status_code == 200
        staff_appt = ws_staff.json()["appointments"][0]

        mark_present = staff_sess.patch(
            f"{BASE_URL}/api/appointments/{staff_appt['id']}/attendance",
            json={"attendance": "Present", "version": staff_appt["version"]},
            headers={"X-CSRF-Token": staff_csrf},
        )
        assert mark_present.status_code == 200
        assert mark_present.json()["attendance"] == "Present"

        stale_attendance = staff_sess.patch(
            f"{BASE_URL}/api/appointments/{staff_appt['id']}/attendance",
            json={"attendance": "Absent", "version": staff_appt["version"]},
            headers={"X-CSRF-Token": staff_csrf},
        )
        assert stale_attendance.status_code == 409

        no_financial_mutation = staff_sess.get(f"{BASE_URL}/api/workspace/staff")
        assert no_financial_mutation.status_code == 200
        updated = [a for a in no_financial_mutation.json()["appointments"] if a["id"] == staff_appt["id"]][0]
        assert "credit" not in updated
        assert updated["attendance"] == "Present"
