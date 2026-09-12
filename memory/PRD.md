# Moonlight — PRD / Working Notes

## Original request (2026-06)
User submitted "Moonlight — Deployment Plan (Hardened)": a DevOps plan to deploy a
full-stack app (React + FastAPI + MongoDB) to a managed host (Render/Railway) with
Atlas, Docker, CI, secret hardening. Referenced `moonlight-main.zip`.

## Environment reality (verified 2026-06)
- **No `moonlight-main.zip` was uploaded** to the session.
- `/app` (project `moonlight-secure`) contains ONLY the default Emergent starter:
  FastAPI "Hello World" + one `/api/status` CRUD endpoint + untouched React boilerplate.
- **There is no actual "Moonlight" application** — nothing custom to deploy yet.

## Deployment on Emergent (authoritative)
- Deploy = one-click **Publish** button. Platform auto-handles Docker, MongoDB Atlas,
  HTTPS, env injection (`MONGO_URL`, `DB_NAME`, `REACT_APP_BACKEND_URL`, `CORS_ORIGINS`),
  rolling updates, rollback. No manual Dockerfile/compose/Render/Railway needed.
- External hosting = Save to GitHub (paid) then self-manage everywhere.

## Work done (2026-06)
- Phase 0 scan: no committed secrets, no `.env` tracked in git — clean.
- Phase 1 hardening of `backend/server.py`:
  - Fixed invalid CORS config (`allow_origins=["*"]` + `allow_credentials=True`);
    credentials now only enabled for explicit (non-wildcard) origins from `CORS_ORIGINS`.
  - Added `GET /api/health` (API + DB ping) for uptime checks.
- Smoke-tested via external URL: `/api/`, `/api/health`, POST+GET `/api/status` all pass.
- Left `.gitignore` unchanged for `.env` (platform relies on it for rollback snapshots;
  GitHub export strips env vars automatically).

## Backlog / next
- P0: Define what "Moonlight" actually is, or upload existing code, before any real build/deploy.
- Deployment itself is a user action (Publish button) — not agent-executable.
