# Moonlight Neurocare — Verified Current-State Inventory

Verified on 2026-09-13 before Phase 0 production-readiness changes.

## Baseline verification

- Backend: `pytest -q` completed with **22 passed** against the external preview API.
- Frontend: `yarn build` completed successfully.
- The earlier “15/15” statement accurately described the home-plan plus practice-video subset,
  but the repository currently contains **22 passing backend tests** across all suites.
- No test suite uses mocked application APIs. Tests use synthetic demo data and the real preview API.
- The app is intentionally blocked from production by `config.py`; `APP_MODE != demo` raises at startup.

## Implemented and verified

### Architecture
- React frontend, FastAPI backend, MongoDB via Motor, Emergent Object Storage.
- Explicit `/api` routing, environment-provided origins and MongoDB connection.
- Parent, Staff and Admin portals with role checks, CSRF, HttpOnly secure cookies and tenant scoping.
- Child-level filtering through guardian and staff assignments.

### Public website and enquiries
- Home, About, Therapies, Sports, Contact/assessment and supporting information pages.
- Eight therapy categories with stock fallbacks and admin image overrides.
- Assessment enquiry validation, references, idempotency/duplicate protection and admin visibility.
- Gmail SMTP and Meta WhatsApp enquiry configuration/test controls; secrets are hidden from API output.

### Parent and care workspaces
- Parent profile, shared goals, schedules, classroom updates, activities and practice history.
- Staff schedule, assigned caseload and attendance updates.
- Weekly Home Plans: 1–6 items, drafts, publication, editing, withdrawal, categories, family-facing
  notes/rationale, completion, comments, read state and notification counts.
- Private practice video: browser recording/file upload, MP4/WebM/MOV allowlist, 10-minute and
  120 MB declared limits, 1–4 steps, guardian-sharing checkbox, private playback and read state.
- Admin settings, enquiries, image/team management, Home Plans/videos and audit view.

### Existing safeguards
- Tenant/child query scoping, role permission map, immediate child loss after guardian-array removal.
- CSRF on unsafe authenticated requests, origin allowlist, secure HttpOnly cookies and rate limits.
- Public media allowlist and authenticated private-video retrieval.
- MongoDB `_id` and storage paths excluded from parent/staff workspace payloads.
- Audit events for many reads, writes and denied access attempts.

## Partially implemented

- Email/password login exists, but demo users have random unusable passwords and there is no invite flow.
- Sessions are server-stored and revocable, but users cannot list/revoke their own sessions.
- Guardian access supports arrays and therefore multiple guardians/children structurally, but there is no
  verified relationship workflow or invitation evidence.
- Enquiry contact consent is recorded, and video publication has one confirmation checkbox, but there is
  no versioned, purpose-specific consent register or withdrawal workflow.
- File extension/MIME and byte-size checks exist; actual media type, real duration, malware scanning,
  quarantine, transcoding, thumbnails, processing status, quotas and expiry are missing.
- MongoDB TTL is used for sessions, but backup/restore rehearsal and retention/deletion jobs are missing.
- Audit records exist but do not yet include correlation IDs, before/after metadata or every privileged event.
- SMTP/WhatsApp secrets are hidden from responses but stored as plaintext in MongoDB settings.
- Public content has responsive layouts, but English/Hindi infrastructure and clinical translation review
  status are absent.

## Missing before production data

- Single-use invitations, password recovery, MFA and account/session administration.
- Verified access grants and separate clinical/reception/finance/administrator permission profiles.
- Purpose-specific consent records and effective withdrawal checks.
- Media quarantine and server-side validation/processing lifecycle.
- Configurable retention, storage usage/quotas, deletion jobs and derived-file lifecycle.
- Automated encrypted backups, restore verification, documented RPO/RTO and rollback procedure.
- Production/demo tenant separation and production organization resolution.
- Privacy-aware correlation IDs and structured operational error events.

## Unverified or external dependencies

- Real Gmail and WhatsApp delivery cannot be verified until valid center credentials are configured.
- Provider-side encryption at rest must be confirmed in infrastructure documentation; the app can add
  envelope encryption for its own sensitive configuration.
- Emergent Object Storage exposes put/get but no confirmed delete/list lifecycle API in the current adapter.
- Local `mongodump`/`mongorestore` are installed. FFmpeg/FFprobe and ClamAV are not currently installed.
- Production legal retention periods, consent wording and recovery targets require center/legal approval.

## Phase status

- **Phase 0:** In progress after this inventory.
- **Phase 1:** Backlog — assessments, care plans, support passport, templates, messaging, scheduling.
- **Phase 2:** Backlog — billing, packages, sports operations, school sharing, reports.
- **Phase 3:** Backlog — academy, live events, public content/SEO, multilingual and optional PWA.