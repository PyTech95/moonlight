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
  - `WEB_ORIGIN=https://launch-pad-416.preview.emergentagent.com`
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

## Private home-practice videos (2026-09-13, iteration 6)
- **Staff and Admin workflow**: Added Home practice workspaces where a therapist/admin can
  select an authorized child and therapy, add the completed session date, title, family note,
  and 1–4 short steps, then either record in the browser or upload an MP4/WebM/MOV guide.
  Guides are capped at 10 minutes and 120 MB; the form explicitly confirms guardian sharing
  consent and reminds staff not to record a full therapy session.
- **Parent delivery and notification**: The Parent portal now has a dedicated Practice videos
  route, unread badges in the sidebar/top bar/mobile navigation, a New filter, dated therapy
  cards, secure playback, therapist attribution, and automatic read-state updates. The Today
  page also shows a new-practice counter.
- **Private storage and authorization**: `backend/practice.py` stores video bytes in Emergent
  Object Storage and only stores the canonical path server-side in MongoDB. Media is served
  through authenticated, tenant- and child-scoped endpoints; public media routes now allow
  only files referenced by public site settings, preventing guessed private practice paths.
  Storage uses soft deletion because the provider has no object-delete API.
- **Data model**: `practice_videos` records contain `id`, `org_id`, `child_id`, therapy/title/
  note/steps, session and publish dates, duration, therapist metadata, private storage metadata,
  consent evidence, `read_by`, version, and soft-delete fields. Mongo `_id` and storage paths
  are never returned in workspace payloads.
- **API routes**: `POST /api/practice-videos`, `PATCH/DELETE /api/practice-videos/{id}`,
  `POST /api/practice-videos/{id}/viewed`, and `GET /api/practice-videos/{id}/media`.
- **Verification**: Testing agent iteration 6 passed the full staff→parent flow, upload/edit/
  watch/delete, unread→read behavior, private scoping, media privacy, desktop/mobile layouts,
  and portal regressions. Post-test fixes removed an invalid option-rendering warning and made
  middleware preserve route cache policies. Final self-test: 11/11 backend regressions passed,
  frontend production build passed, and Staff/Admin practice workspaces loaded with clean
  browser consoles. The preview gateway intentionally applies a stricter `no-store` policy.
- **User verification pending**: Try the complete flow with a short non-sensitive demo video
  before enabling this for real families. The app remains `APP_MODE=demo` and warns against
  uploading real child information.

## WhatsApp enquiry alerts (2026-06, iteration 5)
- Admin-configurable via Admin → Settings (mirrors email alerts). Meta WhatsApp Cloud
  API (Graph API v26.0): `backend/whatsapp.py`, admin `PATCH /api/admin/whatsapp` +
  `POST /api/admin/whatsapp/test`, and `public._notify_new_enquiry` now sends WhatsApp
  alongside email on each new enquiry. Access token stored server-side, never returned
  (get_settings → `wa_token_set` flag; public settings strips all `wa_*`). UI form in
  `AdminSettings.jsx`. Admin must supply Phone Number ID, permanent access token, and an
  APPROVED template whose body has 3 vars in order: family name, phone, interest.
  Test-endpoint failures return HTTP 400 (not 5xx) so Cloudflare passes the JSON toast
  through. NOTE: real WhatsApp DELIVERY not verified (no Meta creds) — path tested with
  dummy creds (clean error). Verified end-to-end in iteration_5.

## Sizing tweak (2026-06)
- Increased ~70%: therapy card image height (158→269px), footer section padding
  (top 60→102px, footer-grid bottom 45→76px, footer-bottom padding 22→37px), and
  secondary text (`.small` 12→20px, `.eyebrow` 10→17px, `.editorial-label` 10→17px,
  `.footer-note`/`.footer-bottom` 9→15px) in `App.css`.

## Admin-configurable features (2026-06, iteration 4)
- **Enquiry email alerts (Gmail SMTP), configurable in Admin → Settings**:
  `backend/emailer.py` (smtplib + asyncio.to_thread), admin endpoints
  `PATCH /api/admin/notifications`, `POST /api/admin/notifications/test` (12s cap),
  and `public.py` fires `_notify_new_enquiry` on each new enquiry. App password stored
  server-side, never returned (get_settings sanitized → `smtp_password_set` flag only);
  public settings strips all notify/smtp fields. UI in `AdminSettings.jsx` (email-alert
  form with save + send-test). Requires a Gmail App Password entered by the admin.
  NOTE: real email DELIVERY not verified (no real Gmail creds) — implementation tested,
  test-send returns clean error with dummy creds.
- **Per-therapy photo upload, Admin → Site images**: object storage enabled via
  `EMERGENT_LLM_KEY` in backend/.env. `admin.py` upload/remove `slot=therapy&slug=<slug>`
  stores `settings.therapy_images[slug]`; `ServiceGrid` overrides the default stock image
  with the uploaded one on Home/Therapies. Verified end-to-end.
- Sports cards already render one photo each (`SportsGrid`); confirmed all 6 load.

## Therapy images (2026-06)
- Added a distinct image per therapy in `frontend/src/lib/content.js` (`image` field on
  each `services` entry), rendered by `ServiceGrid` in `PublicSections.jsx` with new
  `.service-photo` styling in `App.css` (photo banner + colored icon chip overlap).
  Shows on Home therapies section and the /therapies page.

## Prioritized backlog / future phases (Stage A remains gated)
- **P0 — User verification**: Center team reviews the new Staff/Admin→Parent practice-video
  workflow using only synthetic content and confirms the consent wording, maximum duration,
  and step format.
- **P1 — Production readiness**: Real invited-account auth (MFA and recovery), formal consent
  policy/versioning, video retention/expiry controls, storage quota monitoring, malware/media
  validation, audit export, backups, and privacy/legal acceptance before real child data.
- **P1 — Operational integrations**: Enter real Gmail App Password and Meta WhatsApp Cloud API
  credentials in Admin Settings if enquiry alerts are required; delivery cannot be verified
  until the center supplies valid provider credentials.
- **P2 — Optional engagement**: Parent completion/feedback per video and optional email or
  WhatsApp “new practice guide” links. Payments, Instagram, and live teletherapy remain unbuilt.

## 2026-09-19 · Deploy fix + new pages + header responsive
- Recovered lost gitignored env files: recreated backend/.env (MONGO_URL, DB_NAME, WEB_ORIGIN, PREVIEW_PROXY_ORIGIN, APP_MODE=demo, generated DATA_ENCRYPTION_KEY) and frontend/.env (REACT_APP_BACKEND_URL). This unblocked deploy (pull_source) and fixed backend crash-loop.
- New public pages: /online-classes (OnlineClasses.jsx) and /therapy-at-home (TherapyAtHome.jsx). Informational, reuse existing components + Book-an-assessment modal. Added to main nav (PublicLayout links) and cross-linked.
- Header logo enlarged (icon img + .brand-wordmark, header-scoped so footer/portal/login logos unchanged).
- Removed the "Contact information could not load / Try again" banner from PublicLayout (org loads fine via GET /api/public/settings; banner was a transient false alarm).
- Fixed header horizontal overflow: header/utility container widened to min(1580px, 100%-56px); responsive nav — full 9-link horizontal nav >1280px, collapses to hamburger <=1280px, compaction <=1360px. Verified by frontend testing agent across 1920/1440/1280/1024/768/390 (no overflow, all functional).
