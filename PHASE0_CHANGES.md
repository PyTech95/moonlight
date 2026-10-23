# Phase 0 — go-live fixes (22 Oct 2026)

Roadmap steps 1–5 and 8 are done in code. Step 6 (Gmail/WhatsApp credentials) and step 7 (verified center
details) need information from the center. Git history in this folder shows every change commit by commit.

## Fixed

| Problem | Fix |
| --- | --- |
| Admin uploads (home images, photos, contact details) only visible in the admin's own browser | Production mode now works end to end: one real center database, no visitor sandboxes |
| Website enquiries never reached the admin inbox; no email/WhatsApp alert | Same fix. Enquiries rate-limited per visitor, not per center, so one spammer can't block every family |
| Enquiries already lost in demo mode | `backend/recover_enquiries.py`: dry run → CSV → `--apply` (skips tests, safe to re-run) |
| No way to create the first real admin | `backend/create_admin.py` (validates the email the same way login does; 2-step required) |
| **Staff/admin first login hung forever** (bug in the original code: the login reply was mistaken for a 2-step challenge) | Login keys off `challenge_token`; new staff/admin go straight to 2-step setup |
| 2-step setup page: no QR code, no way back to the workspace, unstyled | QR code, "Continue to your workspace", styled page; portal redirects there until 2-step is done |
| Login page showed 6 public demo buttons including "admin" | One clear login with Parent / Therapist / School / Center admin cards; demo buttons only when `APP_MODE=demo` |
| Image upload crashed with error 500 when ClamAV missing; froze for minutes while definitions downloaded | Clear 503 messages; definitions download in the background; `MALWARE_SCAN=required/optional/off` |
| Uploads only worked on Emergent | `STORAGE_BACKEND=emergent / s3 / local` (S3 covers AWS, Cloudflare R2, DigitalOcean Spaces) |
| "Stage A preview", "draft", "pending verification", "fictional", "demonstration" text across site and portal | Removed or reworded; meta description and no-JavaScript text now describe the real center |
| Policy pages described a demo | Plain-language privacy, terms, safeguarding, complaints, cancellation, consent text |
| Sitemap/robots pointed to `moonlight-deploy.preview.emergentagent.com` | Real domain via `REACT_APP_SITE_URL`; private pages blocked in robots.txt |
| Canonical links built from the API address | Built from `REACT_APP_SITE_URL` |
| 682 KB logo on every page | 11 KB WebP logo; favicon and app icons |
| No app groundwork | Web app manifest + icons (start page `/login`) for the single mobile app |
| Admin "Integrations" page said everything was "Not configured" | Shows real email/WhatsApp status with links to Settings |
| Portal avatars showed fixed letters (AF, CT, AD) | Initials from the account name |
| `/api/health` always said "demo" | Reports the real mode |
| Code written as 3,000-character single lines | Formatted with Prettier (separate commit, no behaviour change) |
| Only a heavy Emergent requirements list | `requirements-server.txt` (lean list, verified in a clean environment) |

## Tested

- Production mode, end to end (23/23 checks): first admin → 2-step setup → admin uploads a home image and changes
  the phone → a new visitor sees both → visitor enquiry lands in the admin inbox → lost demo enquiry recovered
  once, test entry skipped → per-visitor rate limit → clear message when the virus scanner is missing → second
  sign-in with authenticator code.
- Demo mode still works (7/7): demo logins for parent, staff, admin, school, teacher.
- Project's own backend suite: 34 passed, 3 failed. The 3 are the known broken test fixtures in
  `test_practice_videos.py` noted in the project's PRD.
- Browser: production build compiles cleanly; login, 2-step setup, admin overview, site images, integrations,
  visitor home page on a phone all checked with screenshots.

## Needs the center (before launch)

- Review the policy text (`frontend/src/pages/Information.jsx`), preferably with a lawyer (DPDP Rules 2025).
- Director's verified qualifications (`frontend/src/lib/content.js`), real photos, opening hours, fee wording.
- Gmail app password and Meta WhatsApp credentials (Admin → Settings → Send test).

## Not in Phase 0 (next phases)

Editing all page text from admin (Phase 1 CMS), server-rendered pages for Google/AI search (Phase 2), all
Gurugram sectors + home tutor page (Phase 3), add-child / scheduling / payments / parent OTP login (Phase 4),
Play Store and App Store apps (Phase 5).
