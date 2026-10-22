import os
import uuid
from datetime import date, timedelta
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

    raise RuntimeError("REACT_APP_BACKEND_URL is required for backend API tests.")


BASE_URL = _read_backend_url()


@pytest.fixture
def session():
    client = requests.Session()
    client.headers.update({"Content-Type": "application/json"})
    return client


def warm_sandbox(client: requests.Session):
    response = client.get(f"{BASE_URL}/api/public/settings")
    assert response.status_code == 200


def start_demo(client: requests.Session, role: str) -> str:
    # auth/security modules: demo sign-in and csrf token for write requests
    response = client.post(f"{BASE_URL}/api/auth/demo", json={"role": role})
    assert response.status_code == 200
    payload = response.json()
    assert payload["role"] == role
    csrf = payload.get("csrf")
    assert isinstance(csrf, str) and len(csrf) > 10
    return csrf


def workspace(client: requests.Session, role: str) -> dict:
    # workspace module: role-scoped data + unread counters
    response = client.get(f"{BASE_URL}/api/workspace/{role}")
    assert response.status_code == 200
    return response.json()


def monday_offset(days: int = 0) -> str:
    today = date.today()
    monday = today - timedelta(days=today.weekday()) + timedelta(days=days)
    return monday.isoformat()


def plan_payload(child_id: str, week_start: str, *, suffix: str = "", items=None, status: str = "draft") -> dict:
    return {
        "child_id": child_id,
        "week_start": week_start,
        "title": f"TEST Weekly focus {suffix or uuid.uuid4().hex[:6]}",
        "note": "TEST Reduce sugar after 7 pm and keep bedtime routine consistent.",
        "why_this_helps": "TEST Better sleep and less evening dysregulation support daytime learning.",
        "items": items
        or [
            {"text": "No sugary drinks after 7 pm", "category": "food"},
            {"text": "Ten-minute calming routine before bed", "category": "sleep"},
        ],
        "status": status,
    }


class TestHomePlansBackend:
    # home_plans/workspace/security modules: CRUD, visibility, validation, permissions, unread behavior

    def test_create_and_duplicate_conflict_then_withdraw_allows_recreate(self, session):
        warm_sandbox(session)
        staff_csrf = start_demo(session, "staff")
        staff_data = workspace(session, "staff")
        child_id = staff_data["children"][0]["id"]
        week_start = monday_offset(0)

        first = session.post(
            f"{BASE_URL}/api/home-plans",
            json=plan_payload(child_id, week_start, suffix="dup", status="published"),
            headers={"X-CSRF-Token": staff_csrf},
        )
        assert first.status_code == 201
        first_data = first.json()
        assert first_data["status"] == "published"
        assert first_data["week_start"] == week_start
        assert len(first_data["items"]) == 2
        plan_id = first_data["id"]

        second = session.post(
            f"{BASE_URL}/api/home-plans",
            json=plan_payload(child_id, week_start, suffix="dup2", status="draft"),
            headers={"X-CSRF-Token": staff_csrf},
        )
        assert second.status_code == 409

        withdrawn = session.post(
            f"{BASE_URL}/api/home-plans/{plan_id}/withdraw",
            headers={"X-CSRF-Token": staff_csrf},
        )
        assert withdrawn.status_code == 200

        third = session.post(
            f"{BASE_URL}/api/home-plans",
            json=plan_payload(child_id, week_start, suffix="recreate", status="published"),
            headers={"X-CSRF-Token": staff_csrf},
        )
        assert third.status_code == 201

    @pytest.mark.parametrize(
        "payload_mutator, expected_text",
        [
            (lambda p: p.update({"items": []}), "items"),
            (lambda p: p.update({"items": [{"text": f"Task {i}", "category": "activity"} for i in range(7)]}), "items"),
            (lambda p: p["items"][0].update({"category": "invalid"}), "category"),
            (lambda p: p.update({"week_start": (date.today() + timedelta(days=61)).isoformat()}), "60 days"),
            (lambda p: p.update({"title": "x" * 121}), "title"),
            (lambda p: p.update({"why_this_helps": "x" * 1201}), "why_this_helps"),
        ],
    )
    def test_create_validation_cases(self, session, payload_mutator, expected_text):
        warm_sandbox(session)
        staff_csrf = start_demo(session, "staff")
        child_id = workspace(session, "staff")["children"][0]["id"]
        payload = plan_payload(child_id, monday_offset(7), suffix="validation")
        payload_mutator(payload)

        response = session.post(
            f"{BASE_URL}/api/home-plans",
            json=payload,
            headers={"X-CSRF-Token": staff_csrf},
        )
        assert response.status_code == 422
        assert expected_text.lower() in str(response.json()).lower()

    def test_draft_visibility_parent_sanitization_and_unread_totals(self, session):
        warm_sandbox(session)
        staff_csrf = start_demo(session, "staff")
        child_id = workspace(session, "staff")["children"][0]["id"]

        draft = session.post(
            f"{BASE_URL}/api/home-plans",
            json=plan_payload(child_id, monday_offset(14), suffix="draft", status="draft"),
            headers={"X-CSRF-Token": staff_csrf},
        )
        assert draft.status_code == 201
        draft_id = draft.json()["id"]

        published = session.post(
            f"{BASE_URL}/api/home-plans",
            json=plan_payload(child_id, monday_offset(21), suffix="pub", status="published"),
            headers={"X-CSRF-Token": staff_csrf},
        )
        assert published.status_code == 201
        published_id = published.json()["id"]

        admin_csrf = start_demo(session, "admin")
        _ = admin_csrf
        admin_ws = workspace(session, "admin")
        admin_plan_ids = [p["id"] for p in admin_ws["home_plans"]]
        assert draft_id in admin_plan_ids
        assert published_id in admin_plan_ids

        start_demo(session, "parent")
        parent_ws = workspace(session, "parent")
        parent_plan_ids = [p["id"] for p in parent_ws["home_plans"]]
        assert published_id in parent_plan_ids
        assert draft_id not in parent_plan_ids
        assert parent_ws["practice_unread"] == parent_ws["plan_unread"] + parent_ws["video_unread"]

        parent_plan = [p for p in parent_ws["home_plans"] if p["id"] == published_id][0]
        forbidden_fields = {"_id", "author_id", "read_by", "responses", "org_id", "viewed_at"}
        assert forbidden_fields.isdisjoint(set(parent_plan.keys()))

    def test_viewed_parent_only_idempotent_and_no_version_change(self, session):
        warm_sandbox(session)
        staff_csrf = start_demo(session, "staff")
        child_id = workspace(session, "staff")["children"][0]["id"]

        created = session.post(
            f"{BASE_URL}/api/home-plans",
            json=plan_payload(child_id, monday_offset(28), suffix="viewed", status="published"),
            headers={"X-CSRF-Token": staff_csrf},
        )
        assert created.status_code == 201
        created_data = created.json()
        plan_id = created_data["id"]
        before_version = created_data["version"]

        staff_forbidden = session.post(
            f"{BASE_URL}/api/home-plans/{plan_id}/viewed",
            headers={"X-CSRF-Token": staff_csrf},
        )
        assert staff_forbidden.status_code == 403

        parent_csrf = start_demo(session, "parent")
        first = session.post(
            f"{BASE_URL}/api/home-plans/{plan_id}/viewed",
            headers={"X-CSRF-Token": parent_csrf},
        )
        assert first.status_code == 200

        second = session.post(
            f"{BASE_URL}/api/home-plans/{plan_id}/viewed",
            headers={"X-CSRF-Token": parent_csrf},
        )
        assert second.status_code == 200

        parent_ws = workspace(session, "parent")
        parent_plan = [p for p in parent_ws["home_plans"] if p["id"] == plan_id][0]
        assert parent_plan["viewed"] is True

        start_demo(session, "staff")
        staff_ws_after = workspace(session, "staff")
        staff_plan_after = [p for p in staff_ws_after["home_plans"] if p["id"] == plan_id][0]
        assert staff_plan_after["version"] == before_version

    def test_parent_response_validates_ids_and_staff_sees_completion_summary(self, session):
        warm_sandbox(session)
        staff_csrf = start_demo(session, "staff")
        child_id = workspace(session, "staff")["children"][0]["id"]

        created = session.post(
            f"{BASE_URL}/api/home-plans",
            json=plan_payload(child_id, monday_offset(35), suffix="response", status="published"),
            headers={"X-CSRF-Token": staff_csrf},
        )
        assert created.status_code == 201
        plan = created.json()
        plan_id = plan["id"]
        valid_item_ids = [item["id"] for item in plan["items"]]

        parent_csrf = start_demo(session, "parent")
        response_ok = session.patch(
            f"{BASE_URL}/api/home-plans/{plan_id}/response",
            json={
                "completed_item_ids": [valid_item_ids[0]],
                "comment": "TEST We reduced sugar and bedtime was calmer.",
            },
            headers={"X-CSRF-Token": parent_csrf},
        )
        assert response_ok.status_code == 200
        data = response_ok.json()
        assert data["completed_item_ids"] == [valid_item_ids[0]]
        assert data["parent_comment"].startswith("TEST")

        invalid = session.patch(
            f"{BASE_URL}/api/home-plans/{plan_id}/response",
            json={"completed_item_ids": ["bad-id"], "comment": ""},
            headers={"X-CSRF-Token": parent_csrf},
        )
        assert invalid.status_code == 422

        start_demo(session, "staff")
        staff_ws = workspace(session, "staff")
        staff_plan = [p for p in staff_ws["home_plans"] if p["id"] == plan_id][0]
        assert staff_plan["family_completed_count"] == 1
        assert staff_plan["family_completion_percent"] == 50
        assert "reduced sugar" in staff_plan["parent_comment"].lower()

    def test_edit_publish_permissions_and_withdraw_parent_visibility(self, session):
        warm_sandbox(session)
        staff_csrf = start_demo(session, "staff")
        child_id = workspace(session, "staff")["children"][0]["id"]

        created = session.post(
            f"{BASE_URL}/api/home-plans",
            json=plan_payload(child_id, monday_offset(42), suffix="perm", status="draft"),
            headers={"X-CSRF-Token": staff_csrf},
        )
        assert created.status_code == 201
        plan = created.json()
        plan_id = plan["id"]

        parent_csrf = start_demo(session, "parent")
        parent_create = session.post(
            f"{BASE_URL}/api/home-plans",
            json=plan_payload(child_id, monday_offset(49), suffix="no-parent", status="draft"),
            headers={"X-CSRF-Token": parent_csrf},
        )
        assert parent_create.status_code == 403

        parent_patch = session.patch(
            f"{BASE_URL}/api/home-plans/{plan_id}",
            json={**plan_payload(child_id, monday_offset(42), suffix="parent-edit", status="published"), "version": plan["version"]},
            headers={"X-CSRF-Token": parent_csrf},
        )
        assert parent_patch.status_code == 403

        parent_withdraw = session.post(
            f"{BASE_URL}/api/home-plans/{plan_id}/withdraw",
            headers={"X-CSRF-Token": parent_csrf},
        )
        assert parent_withdraw.status_code == 403

        admin_csrf = start_demo(session, "admin")
        admin_publish = session.patch(
            f"{BASE_URL}/api/home-plans/{plan_id}",
            json={
                **plan_payload(child_id, monday_offset(42), suffix="admin-publish", status="published"),
                "items": plan["items"],
                "version": plan["version"],
            },
            headers={"X-CSRF-Token": admin_csrf},
        )
        assert admin_publish.status_code == 200
        published_data = admin_publish.json()
        assert published_data["status"] == "published"

        admin_owned = session.post(
            f"{BASE_URL}/api/home-plans",
            json=plan_payload(child_id, monday_offset(56), suffix="admin-owned", status="draft"),
            headers={"X-CSRF-Token": admin_csrf},
        )
        assert admin_owned.status_code == 201
        admin_owned_plan = admin_owned.json()

        staff_csrf = start_demo(session, "staff")
        staff_forbidden = session.patch(
            f"{BASE_URL}/api/home-plans/{admin_owned_plan['id']}",
            json={
                **plan_payload(child_id, monday_offset(56), suffix="staff-non-owner", status="draft"),
                "items": admin_owned_plan["items"],
                "version": admin_owned_plan["version"],
            },
            headers={"X-CSRF-Token": staff_csrf},
        )
        assert staff_forbidden.status_code == 403

        admin_csrf = start_demo(session, "admin")
        withdrawn = session.post(
            f"{BASE_URL}/api/home-plans/{plan_id}/withdraw",
            headers={"X-CSRF-Token": admin_csrf},
        )
        assert withdrawn.status_code == 200

        start_demo(session, "parent")
        parent_ws = workspace(session, "parent")
        assert all(item["id"] != plan_id for item in parent_ws["home_plans"])

        start_demo(session, "admin")
        admin_ws = workspace(session, "admin")
        withdrawn_plan = [p for p in admin_ws["home_plans"] if p["id"] == plan_id][0]
        assert withdrawn_plan["status"] == "withdrawn"
