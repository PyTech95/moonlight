import io
import json
import os
import uuid
from pathlib import Path
from datetime import date

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


def tiny_webm_bytes() -> bytes:
    # Minimal byte payload for multipart upload checks (backend validates type/size, not codec integrity).
    return b"\x1a\x45\xdf\xa3\x93B\x82\x88mock-webm-content-for-testing-only"


def tiny_png_bytes() -> bytes:
    # Valid 1x1 PNG for admin/public media regression checks.
    return (
        b"\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x00\x01\x00\x00\x00\x01"
        b"\x08\x02\x00\x00\x00\x90wS\xde\x00\x00\x00\x0cIDAT\x08\x99c``\x00\x00\x00\x04\x00\x01"
        b"\x0b\xe7\x02\x9d\x00\x00\x00\x00IEND\xaeB`\x82"
    )


@pytest.fixture
def session():
    return requests.Session()


def start_demo(session: requests.Session, role: str) -> str:
    # auth/security module: start persona session and return csrf token for write calls
    response = session.post(f"{BASE_URL}/api/auth/demo", json={"role": role})
    assert response.status_code == 200
    payload = response.json()
    assert payload["role"] == role
    csrf = payload.get("csrf")
    assert isinstance(csrf, str) and len(csrf) > 10
    return csrf


def workspace(session: requests.Session, role: str):
    # workspace module: role-scoped workspace payload
    response = session.get(f"{BASE_URL}/api/workspace/{role}")
    assert response.status_code == 200
    return response.json()


def create_practice_video(session: requests.Session, csrf: str, child_id: str, *, title: str | None = None):
    # practice module: multipart upload and metadata persistence
    form = {
        "child_id": child_id,
        "therapy": "Occupational Therapy",
        "title": title or f"TEST Home guide {uuid.uuid4().hex[:8]}",
        "note": "TEST Keep practice playful and stop if the child is tired.",
        "steps": json.dumps(["Roll the ball", "Pause for breath", "Repeat 3 times"]),
        "session_date": date.today().isoformat(),
        "duration_seconds": "20",
        "consent_confirmed": "true",
    }
    files = {
        "file": ("test-video.webm", io.BytesIO(tiny_webm_bytes()), "video/webm"),
    }
    response = session.post(
        f"{BASE_URL}/api/practice-videos",
        data=form,
        files=files,
        headers={"X-CSRF-Token": csrf},
    )
    return response


class TestPracticeVideoBackend:
    # practice/workspace/public modules: upload, scoping, viewed idempotency, permissions, privacy

    def test_upload_workspace_scoping_and_viewed_idempotency(self, session):
        session.get(f"{BASE_URL}/api/public/settings")

        staff_csrf = start_demo(session, "staff")
        staff_ws = workspace(session, "staff")
        child_id = staff_ws["children"][0]["id"]

        created = create_practice_video(session, staff_csrf, child_id)
        assert created.status_code == 201
        created_data = created.json()
        assert created_data["child_id"] == child_id
        assert created_data["therapy"] == "Occupational Therapy"
        assert created_data["duration_seconds"] == 20
        assert created_data["version"] == 1
        assert created_data["viewed"] is False
        assert "storage_path" not in created_data
        video_id = created_data["id"]

        parent_csrf = start_demo(session, "parent")
        parent_ws_before = workspace(session, "parent")
        video_parent_before = [v for v in parent_ws_before["practice_videos"] if v["id"] == video_id][0]
        unread_before = parent_ws_before["practice_unread"]
        assert video_parent_before["viewed"] is False

        viewed_first = session.post(
            f"{BASE_URL}/api/practice-videos/{video_id}/viewed",
            headers={"X-CSRF-Token": parent_csrf},
        )
        assert viewed_first.status_code == 200

        viewed_second = session.post(
            f"{BASE_URL}/api/practice-videos/{video_id}/viewed",
            headers={"X-CSRF-Token": parent_csrf},
        )
        assert viewed_second.status_code == 200

        parent_ws_after = workspace(session, "parent")
        video_parent_after = [v for v in parent_ws_after["practice_videos"] if v["id"] == video_id][0]
        assert video_parent_after["viewed"] is True
        assert parent_ws_after["practice_unread"] == max(0, unread_before - 1)

        _ = start_demo(session, "staff")
        staff_ws_after = workspace(session, "staff")
        video_staff_after = [v for v in staff_ws_after["practice_videos"] if v["id"] == video_id][0]
        assert video_staff_after["family_viewed"] is True
        assert video_staff_after["version"] == created_data["version"]

    def test_media_access_is_authenticated_and_child_scoped(self):
        staff_parent_session = requests.Session()
        staff_parent_session.get(f"{BASE_URL}/api/public/settings")

        staff_csrf = start_demo(staff_parent_session, "staff")
        staff_ws = workspace(staff_parent_session, "staff")
        child_id = staff_ws["children"][0]["id"]
        created = create_practice_video(staff_parent_session, staff_csrf, child_id)
        assert created.status_code == 201
        video_id = created.json()["id"]

        _ = start_demo(staff_parent_session, "parent")
        parent_media = staff_parent_session.get(f"{BASE_URL}/api/practice-videos/{video_id}/media")
        assert parent_media.status_code == 200
        assert "no-store" in parent_media.headers.get("cache-control", "")
        assert parent_media.headers.get("content-type", "").startswith("video/")
        assert len(parent_media.content) > 0

        no_auth_session = requests.Session()
        unauth_media = no_auth_session.get(f"{BASE_URL}/api/practice-videos/{video_id}/media")
        assert unauth_media.status_code == 401

        other_sandbox = requests.Session()
        other_sandbox.get(f"{BASE_URL}/api/public/settings")
        _ = start_demo(other_sandbox, "parent")
        foreign_media = other_sandbox.get(f"{BASE_URL}/api/practice-videos/{video_id}/media")
        assert foreign_media.status_code == 404

    def test_patch_delete_permissions_and_soft_removal(self, session):
        session.get(f"{BASE_URL}/api/public/settings")

        staff_csrf = start_demo(session, "staff")
        staff_ws = workspace(session, "staff")
        child_id = staff_ws["children"][0]["id"]

        created = create_practice_video(session, staff_csrf, child_id, title="TEST Editable guide")
        assert created.status_code == 201
        created_data = created.json()
        video_id = created_data["id"]

        parent_csrf = start_demo(session, "parent")
        parent_patch = session.patch(
            f"{BASE_URL}/api/practice-videos/{video_id}",
            json={
                "therapy": "Occupational Therapy",
                "title": "Parent cannot edit",
                "note": "TEST parent note attempt",
                "steps": ["Step 1"],
                "session_date": date.today().isoformat(),
                "version": created_data["version"],
            },
            headers={"X-CSRF-Token": parent_csrf},
        )
        assert parent_patch.status_code == 403

        parent_delete = session.delete(
            f"{BASE_URL}/api/practice-videos/{video_id}",
            headers={"X-CSRF-Token": parent_csrf},
        )
        assert parent_delete.status_code == 403

        staff_csrf = start_demo(session, "staff")
        staff_patch = session.patch(
            f"{BASE_URL}/api/practice-videos/{video_id}",
            json={
                "therapy": "Occupational Therapy",
                "title": "TEST Updated guide title",
                "note": "TEST updated family note",
                "steps": ["First", "Second"],
                "session_date": date.today().isoformat(),
                "version": created_data["version"],
            },
            headers={"X-CSRF-Token": staff_csrf},
        )
        assert staff_patch.status_code == 200
        patched_data = staff_patch.json()
        assert patched_data["title"] == "TEST Updated guide title"
        assert patched_data["steps"] == ["First", "Second"]
        assert patched_data["version"] == created_data["version"] + 1

        staff_delete = session.delete(
            f"{BASE_URL}/api/practice-videos/{video_id}",
            headers={"X-CSRF-Token": staff_csrf},
        )
        assert staff_delete.status_code == 200

        parent_csrf = start_demo(session, "parent")
        _ = parent_csrf
        parent_ws_after_delete = workspace(session, "parent")
        assert all(v["id"] != video_id for v in parent_ws_after_delete["practice_videos"])

    def test_public_media_allows_configured_paths_and_rejects_guessed_private_paths(self, session):
        session.get(f"{BASE_URL}/api/public/settings")
        admin_csrf = start_demo(session, "admin")

        settings = session.get(f"{BASE_URL}/api/public/settings")
        assert settings.status_code == 200
        data = settings.json()

        configured_paths = []
        configured_paths.extend([p for p in data.get("hero_images", []) if p])
        configured_paths.extend([data.get("director_photo"), data.get("team_photo")])
        configured_paths.extend([m.get("photo") for m in data.get("team", []) if m.get("photo")])
        configured_paths.extend(list((data.get("therapy_images") or {}).values()))
        configured_paths = [p for p in configured_paths if p]

        if not configured_paths:
            upload = session.post(
                f"{BASE_URL}/api/admin/media",
                data={"slot": "hero"},
                files={"file": ("tiny.png", io.BytesIO(tiny_png_bytes()), "image/png")},
                headers={"X-CSRF-Token": admin_csrf},
            )
            assert upload.status_code == 200
            public_after_upload = session.get(f"{BASE_URL}/api/public/settings")
            assert public_after_upload.status_code == 200
            configured_paths = [p for p in public_after_upload.json().get("hero_images", []) if p]
            assert configured_paths

        ok = session.get(f"{BASE_URL}/api/public/media/{configured_paths[0]}")
        assert ok.status_code == 200
        cache_policy = ok.headers.get("cache-control", "")
        assert cache_policy == "public, max-age=86400" or "no-store" in cache_policy
        assert ok.headers.get("content-type", "").startswith("image/")
        assert len(ok.content) > 0
        prefix = configured_paths[0].split("/", 1)[0]

        guessed_private = session.get(
            f"{BASE_URL}/api/public/media/{prefix}/sandbox/practice/guessed-private-video.webm"
        )
        assert guessed_private.status_code == 404
