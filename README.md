# Moonlight Neurocare

Website + secure portal (parents, therapists, schools, center admin) for Moonlight Neurocare, Sector 37C, Gurugram.
React frontend (`frontend/`), FastAPI backend (`backend/`), MongoDB. Every word and image on the public website is
edited from Admin → Website content.

- How to deploy on a VPS: [DEPLOY.md](DEPLOY.md) (`sudo DOMAIN=moonlightneurocare.com EMAIL=… bash deploy/setup-vps.sh`)
- Phase 0 (go-live fixes): [PHASE0_CHANGES.md](PHASE0_CHANGES.md)
- Phases 1–3 (website control, SEO & GEO, areas, home tutor, VPS): [PHASE1-3_CHANGES.md](PHASE1-3_CHANGES.md)
- Phase 4 (children, scheduling, billing, OTP sign-in, video): [PHASE4_CHANGES.md](PHASE4_CHANGES.md)
- Android app: [mobile/README.md](mobile/README.md)
- Product notes from the original build: `memory/PRD.md`

## Where things are

| Path | What |
| --- | --- |
| `frontend/src/lib/siteContent.js` | Every editable page field and its original text (the admin editor is generated from this) |
| `frontend/src/lib/areas.js` | Zones and the default list of Gurugram areas |
| `backend/cms.py` | Website content API (values, lists, history, images) |
| `backend/site_build.py`, `deploy/prerender.py` | Saved HTML, sitemap, robots.txt and llms.txt for Google and AI assistants |
| `deploy/` | VPS setup, backup and scheduled-job scripts |
| `backend/children_admin.py`, `scheduling.py`, `billing.py` | Child records, sessions and clash checks, invoices and payments |
| `frontend/src/pages/AdminChildren.jsx`, `Billing.jsx`, `components/ops/ScheduleBoard.jsx` | The matching admin screens |
| `mobile/` | Android app (Capacitor) and its GitHub Actions build |
