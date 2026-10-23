# Phases 1–3: website control, SEO & GEO, areas & home tutor, VPS (22 Oct 2026)

Roadmap phases 1 (admin controls the whole website), 2 (SEO & GEO) and 3 (locations & home tutor) are done in code,
plus a one-command VPS setup. Phase 0 is in [PHASE0_CHANGES.md](PHASE0_CHANGES.md). Every change is a separate
git commit in this folder.

## 1. The admin panel controls the whole website

Admin → **Website content** (new). Nothing on the public site is hard-coded any more.

| What | Detail |
| --- | --- |
| 17 page groups, 272 fields | Header, footer & contact · Home · Shared sections · Therapies · Sports · Home tutor · Areas · About · Our approach · For parents · Fees · Visiting the center · Resources · Families visiting India · Dubai to Gurugram · Contact, booking & first visit · Policies |
| Every field type | Headings, paragraphs, bullet lists, step/fact lists, images, icons, colours, on/off switches, numbers |
| Google text per page | Each page's Google title and description is its own field |
| 4 lists | Therapies (8), Sports (6), FAQs (5), Areas (215): add, edit, reorder, delete. A new therapy or area page appears on the site, in the sitemap and in Google's pages automatically |
| Safe editing | "Unsaved / Edited / Default" badge on every field, **Reset** to the original text, warning before leaving with unsaved changes, two admins can't overwrite each other (version check), full change history |
| Live immediately | Saved text and images show to every visitor at once (the Phase 0 fix makes this work for real visitors) |
| Images | Upload straight from any image field; virus-scanned like other uploads. Homepage slideshow, therapy, director and team photos stay in **Site images** |
| Enquiry form | Its "interested in" options follow the therapy list, plus Home tutor, Therapy home visit and Indoor sports |

## 2. SEO & GEO (Google and AI assistants)

| Before | Now |
| --- | --- |
| Crawlers and AI bots saw only "needs JavaScript" | Every public page is saved as real HTML (81 pages), refreshed ~1 minute after each admin save and nightly |
| One description on every page | Own title, description and canonical link per page, all editable |
| No structured data beyond basics | Schema.org: MedicalClinic + LocalBusiness (address, phone, hours, map, area served), WebSite, MedicalTherapy per therapy, Service for home tutoring, FAQPage, BreadcrumbList |
| Hand-written sitemap | `sitemap.xml` generated from the live content (81 URLs); `robots.txt` blocks portal/login pages |
| Nothing for AI assistants | `llms.txt`: plain-text summary of the center, services, areas and key pages |
| Thin template pages for every area × therapy (doorway-page risk) | Area × therapy pages stay reachable but are kept out of Google unless the admin ticks that therapy for that area (Sector 37C: speech, OT, ABA, sensory to start) |
| 256 KB JavaScript (gzipped) for every visitor, portal included | 215 KB: portal code now loads only for people who sign in |

## 3. Areas and the home tutor page

- **Areas:** 8 zones and 215 Gurugram sectors and localities within about 20 km of Sector 37C (Around our center,
  New Gurugram, Dwarka Expressway, Old Gurugram, Central Gurugram & Sohna Road, DLF & Golf Course Road, Golf Course
  Extension & SPR, Nearby towns). 30 areas have their own page, including all 16 original area URLs, so no existing
  links break. Every other sector is listed on its zone page and on `/locations`. The admin decides
  which areas get their own page, their introduction, directions, nearby places and approximate distance.
- **Home tutor page** at `/home-tutor-gurugram`, in the main menu and on the home page: special educator at home,
  who it's for, what it works on, how it differs from regular tuition, step-by-step process, school support,
  areas covered, parents' FAQs (also as Google FAQ data), and a booking button that tags the enquiry
  "Home Tutor (Special Educator)". Every word is editable.

## 4. Logins

One login page for everyone (done in Phase 0, unchanged): Parent, Therapist, School and Center admin cards; admin
signs in on the website and, later, in the same mobile app. 2-step sign-in for staff and admin.

## 5. VPS

- `deploy/setup-vps.sh`: one command sets up Nginx, SSL, the API service, MongoDB 8.0, ClamAV, nightly backups,
  scheduled jobs and the Google pages; re-run it to update. See [DEPLOY.md](DEPLOY.md).
- Nginx configuration tested on Ubuntu 24.04: saved HTML for public pages, app shell for portal pages, one-year
  caching for scripts, gzip, www → main domain redirect.
- MongoDB driver upgraded (motor 3.7.1 / pymongo 4.13.2) so it supports MongoDB 8.0, which Ubuntu 24.04 and new
  Atlas clusters use.
- `frontend/yarn.lock` added so the server installs exactly the tested versions. Emergent's in-browser editing
  tools removed from the build (they only work inside Emergent and were optional).

## Tested

- Website content API: 16/16 checks (edit, reset, lists, history, version conflicts, image upload, visitors can't
  edit, private files stay private).
- Production flow 23/23 and demo mode 7/7 (Phase 0 checks) after all changes and the driver upgrade.
- Project's own backend suite: 34 passed, 3 failed (the same known broken fixtures in `test_practice_videos.py`).
- Browser, production build: admin edits the home headline → a new visitor sees it at once → Google's copy of the
  page updates on its own about 30 seconds later; no page errors. 81/81 pages saved; crawler view checked
  (full text, schema, canonical).
- Nginx config from the setup script validated and served against the real build.

## Needs from the center

- Check facts in Website content: fees wording, session lengths, home-tutor details, approximate distances
  (marked "check on Google Maps"), and write a short unique introduction for each area with its own page.
- Real photos for the home tutor page and areas (optional but helps).
- Gmail app password and WhatsApp details (Admin → Settings).
- Policy texts reviewed by the center (they are plain-language drafts).

## Not in these phases

- Phase 4, real operations: add a child from the admin panel, therapist scheduling, invoices/online payments,
  OTP sign-in for parents.
- Phase 5: the single mobile app (Android + iOS) for parents, therapists, schools and admin.
- Anything from the WhatsApp concept note, once it arrives.
