# Moonlight Neurocare · Stage A — PRD / Working Notes

## What this app is
Full-stack demo app for a child neurocare center (Gurugram). Public marketing site
(Home, Therapies/Services, Sports, Areas/Locations, Resources/Information, Contact) +
assessment enquiry + a passwordless per-browser **demo portal** with Parent, Care team
(staff), and Admin roles. React (CRA/craco) + FastAPI + MongoDB. Runs strictly in
`APP_MODE=demo`; production is deliberately gated.

## History
- 2026-06: User submitted a "Moonlight Deployment Plan"; no code was present (only starter).
- 2026-06: User uploaded `moonlight-main (3).zip`. Wired the real code into `/app`.

## Deploy-readiness work done (2026-06)
- Replaced starter with real Moonlight code (backend modules: server, config, auth,
  public, workspace, admin, security, seed, storage; full frontend src/pages/components).
- Created `backend/.env`:
  - `MONGO_URL`, `DB_NAME` (platform defaults)
  - `WEB_ORIGIN=https://moonlight-secure.preview.emergentagent.com`
  - `PREVIEW_PROXY_ORIGIN=https://moonlight-secure.cluster-5.preview.emergentcf.cloud`
    (the origin the preview proxy rewrites browser requests to — required for the
    server's origin-check middleware to accept POST/PATCH).
  - `APP_MODE=demo`
- Fixed `requirements.txt`: removed the explicit `litellm` wheel-URL line that caused a
  pip resolver conflict (litellm still resolves transitively via `emergentintegrations`,
  both are preinstalled in the base image; app imports neither).
- Installed backend (pip) + frontend (yarn) deps; restarted via supervisor.
- Verified: `/api/health` ok, demo login (all 3 roles), enquiry lifecycle, session
  persistence + logout. Testing agent: 7/7 backend, 100% critical frontend, no bugs
  (`/app/test_reports/iteration_3.json`).

## DEPLOYMENT (user action)
Deploy = click **Publish** in the top toolbar (Emergent one-click). Platform provisions
MongoDB Atlas, HTTPS, and injects `MONGO_URL`/`DB_NAME`/`REACT_APP_BACKEND_URL`.

### CRITICAL post-deploy step (Manage Publishes → Secrets)
This app uses custom origin vars (NOT the platform's `CORS_ORIGINS`). After the first
deploy, set in the Secrets tab:
- `WEB_ORIGIN` = the deployed frontend origin (e.g. `https://<app>.emergent.host`)
- `PREVIEW_PROXY_ORIGIN` = the deployed proxy origin (if the deploy proxy rewrites
  Origin; if unsure, set it equal to `WEB_ORIGIN`)
- `APP_MODE` = `demo`
Then redeploy. Without correct origins, POST /enquiries and /auth/* will 403.

## Therapy images (2026-06)
- Added a distinct image per therapy in `frontend/src/lib/content.js` (`image` field on
  each `services` entry), rendered by `ServiceGrid` in `PublicSections.jsx` with new
  `.service-photo` styling in `App.css` (photo banner + colored icon chip overlap).
  Shows on Home therapies section and the /therapies page.

## Backlog / future phases (from docs, NOT built — Stage A gated)
- Real auth (MFA, invitations/recovery), payments, email, WhatsApp, video, Instagram,
  private storage (needs EMERGENT_LLM_KEY / provider creds), transactional DB, backups.
- Image upload in Admin Settings intentionally deferred (storage unconfigured in Stage A).
