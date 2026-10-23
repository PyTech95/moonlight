# Deploying Moonlight Neurocare on a VPS

One script sets up everything on a fresh Ubuntu server: the website, the API, MongoDB, the virus scanner, Nginx,
the free SSL certificate, scheduled jobs, nightly backups and the pages Google and AI assistants read.

## What you need

- **Server:** Ubuntu 24.04 (22.04 also works). 2 vCPU, 4 GB RAM, 40 GB disk or more. An India region keeps the site
  fast for Gurugram families. Under 4 GB RAM the script adds swap, but uploads and page refreshes get slow.
- **Domain:** DNS A records for `moonlightneurocare.com` and `www.moonlightneurocare.com` pointing at the server's
  IP. Set these first: the SSL certificate is issued only once the domain reaches the server.
- **Moving from Emergent?** Keep a copy of the old `DATA_ENCRYPTION_KEY` (Emergent → Manage Publishes → Secrets).
  Without it, Gmail/WhatsApp passwords and 2-step secrets saved there can't be read. They can also simply be
  entered again in the admin panel.

## 1. Run the setup script

Upload the zip to the server, unzip it, and from the project folder run:

```bash
sudo DOMAIN=moonlightneurocare.com EMAIL=you@example.com bash deploy/setup-vps.sh
```

It takes 10–15 minutes. It installs into `/opt/moonlight`, keeps data in `/var/lib/moonlight`, and finishes by
printing the API health line (`"mode":"production"`) and the next command. Options are explained at the top of the
script (`LOCAL_MONGO=no` to use MongoDB Atlas instead of a database on the server, `WWW_DOMAIN=none` if there is no
www record).

To bring an Emergent `.env` across, put it at `backend/.env` in the uploaded folder before the first run; the script
uses it instead of generating new keys. Check that `MONGO_URL` in it points to the database you want.

## 2. Create the first admin

```bash
cd /opt/moonlight/backend && sudo -u moonlight /opt/moonlight/venv/bin/python create_admin.py --email head@moonlightneurocare.com --name "Center Head"
```

It asks for a password. 2-step sign-in is set up at the first login (scan the QR code with Google Authenticator or
Microsoft Authenticator). Every other account (therapists, parents, schools) is invited from the admin panel. The
same login works on the website and in the mobile app.

## 3. First things in the admin panel

1. **Settings** → Gmail app password and WhatsApp details → **Send test** for each.
2. **Website content** → check every page, especially facts only the center can confirm: fees wording, session
   lengths, home-tutor details, approximate distances on the Areas list, and the unique introduction for each area
   that has its own page. Changes are live as soon as you press Save.
3. **Site images** → homepage slideshow, therapy photos, director and team photos. The default pictures are still
   hosted by Emergent; replace them (see the website image brief) so nothing depends on Emergent after the move.
4. **Accounts & consent** → invite each therapist (Therapist), front-desk (Reception) and accounts (Finance) person.
5. **Schedule** → Rooms & hours (rooms, opening days and hours), then Therapist hours for each therapist.
6. **Billing** → Packages & prices (session prices, packages), then Settings (invoice prefix, UPI ID, bank details).
7. **Children** → add each child (or **Enrol child** from an enquiry), give the parents app access, assign therapists,
   then book their weekly sessions from the child's page or the Schedule.

## 3b. Optional connections

| Service | Where to get it | Where it goes |
| --- | --- | --- |
| Online payments | [Razorpay](https://dashboard.razorpay.com) → Account & Settings → API Keys (start with Test mode keys) | Billing → Settings → Online payments → Test connection |
| Razorpay webhook (recommended) | Razorpay → Webhooks → add `https://moonlightneurocare.com/api/billing/razorpay/webhook`, event `payment_link.paid`, set a secret | Same secret in Billing → Settings |
| Video sessions | [Daily.co](https://dashboard.daily.co) → Developers → API key; your domain, e.g. `moonlight.daily.co` | Settings → Online video sessions → Test connection |
| WhatsApp sign-in codes | Meta WhatsApp Manager → Message templates → new **Authentication** template with a copy-code button; wait for approval | Settings → WhatsApp → Sign-in code template (name and language) |

Without these the app still works: families pay at the desk (recorded in Billing), online classes show “video not
connected”, and sign-in codes go by email.

## 4. Google, Bing and AI assistants

- [Google Search Console](https://search.google.com/search-console): add `moonlightneurocare.com` (Domain property),
  then submit `https://moonlightneurocare.com/sitemap.xml`.
- [Bing Webmaster Tools](https://www.bing.com/webmasters): import from Search Console. ChatGPT search uses Bing's index.
- Google Business Profile: same name, address and phone as the website footer; website link to the home page.
- The pages Google and AI assistants read are refreshed about a minute after each save in the admin panel, and once
  every night. Admin → Website content shows when that last happened, with a **Refresh now** button.

## Updating the site later

Upload the new code and run the same command again. It reinstalls dependencies, rebuilds the website (visitors are
switched over in one step), restarts the API and refreshes the Google pages. `backend/.env`, `frontend/.env`, the
database, uploaded files and the Nginx/SSL setup are left alone.

## What runs where

| Part | Where |
| --- | --- |
| Website files | `/opt/moonlight/frontend/build`, served by Nginx (`/etc/nginx/sites-available/moonlight`) |
| API | systemd service `moonlight-api` on 127.0.0.1:8001, one worker. Logs: `journalctl -u moonlight-api -f` |
| Database | MongoDB 8.0 on 127.0.0.1 (service `mongod`), database `moonlight` |
| Uploaded files | `/var/lib/moonlight/storage` (or S3 if `STORAGE_BACKEND=s3`) |
| Settings | `/opt/moonlight/backend/.env` (only root and the app can read it) |
| Scheduled jobs | `/etc/cron.d/moonlight`: session reminders + package expiry 18:00, virus definitions 03:15, school digest Saturday 09:00, Google pages 03:45, backup 03:00 (IST) |
| Backups | `/var/backups/moonlight`: database dump every night (14 kept) + copy of uploaded files |
| Logs | `/var/log/moonlight/` (cron, prerender, backup) |

Backups on the same server are lost with the server. Also turn on your VPS provider's snapshots, or copy
`/var/backups/moonlight` off the server (for example with rclone to Google Drive or S3). Test one restore:
`mongorestore --gzip --archive=/var/backups/moonlight/db-YYYY-MM-DD.archive.gz --drop`.

## Settings (`backend/.env`)

| Variable | Value |
| --- | --- |
| `APP_MODE` | `production`. `demo` gives every visitor a temporary copy of the site, for training only |
| `PRODUCTION_ORG_ID` | Fixed id, e.g. `moonlight-gurugram`. Never change it after launch |
| `MONGO_URL` / `DB_NAME` | `mongodb://127.0.0.1:27017` / `moonlight` on the VPS, or an Atlas connection string |
| `WEB_ORIGIN` | `https://moonlightneurocare.com` |
| `EXTRA_ALLOWED_ORIGINS` | `https://www.moonlightneurocare.com` |
| `DATA_ENCRYPTION_KEY` | Generated on first setup. Keep a copy somewhere safe and never change it |
| `WEBHOOK_CRON_SECRET` | Generated on first setup; used by the scheduled jobs |
| `STORAGE_BACKEND` | `local` (default on the VPS) or `s3` (AWS S3, Cloudflare R2, DigitalOcean Spaces; fill the `S3_*` lines) |
| `MALWARE_SCAN` | `required`: every upload is virus-scanned, and refused with a clear message if the scanner isn't ready |
| `PRERENDER_COMMAND` | Set by the script: refreshes the Google/AI pages after content changes |

`frontend/.env`: `REACT_APP_BACKEND_URL` and `REACT_APP_SITE_URL`, both `https://moonlightneurocare.com`. A change
here needs the setup command to be run again (the website is rebuilt).

After editing `backend/.env`: `sudo systemctl restart moonlight-api`.

## Android app

The app opens `https://moonlightneurocare.com/login` in a branded shell, so it works as soon as the site is live
on the VPS and every change to the site appears in the app without an update. It is built on GitHub Actions; see
[mobile/README.md](mobile/README.md). Keep the signing key in `android-signing/` safe: Google Play needs the same key
for every update.

## If something is wrong

| Symptom | Check |
| --- | --- |
| Site shows "502 Bad Gateway" | `sudo systemctl status moonlight-api` and `journalctl -u moonlight-api -n 50` |
| Uploads refused: "virus scanner is not ready" | First virus definition download still running: `systemctl status clamav-freshclam`. Wait a few minutes |
| Google pages not refreshing | Admin → Website content → status line; `/var/log/moonlight/prerender.log` |
| SSL not issued | DNS must point at the server: `dig +short moonlightneurocare.com`, then `sudo certbot --nginx -d moonlightneurocare.com -d www.moonlightneurocare.com` |
| Emails/WhatsApp not sent | Admin → Settings → Send test shows the exact error |

## Recovering enquiries lost in demo mode (only when moving the old Emergent database)

If the old Emergent database is copied over, run against it:

```bash
cd /opt/moonlight/backend
sudo -u moonlight /opt/moonlight/venv/bin/python recover_enquiries.py            # dry run → recovered_enquiries.csv (review, then delete it)
sudo -u moonlight /opt/moonlight/venv/bin/python recover_enquiries.py --apply    # copies real-looking ones into the admin inbox; safe to re-run
```

## Staying on Emergent instead

Load this code into the Emergent project, set `APP_MODE=production`, `PRODUCTION_ORG_ID`, `WEB_ORIGIN`,
`PREVIEW_PROXY_ORIGIN` and `STORAGE_BACKEND=emergent` in Manage Publishes → Secrets, keep `EMERGENT_LLM_KEY`,
`DATA_ENCRYPTION_KEY` and `WEBHOOK_CRON_SECRET`, then publish. Emergent can't run the Google-pages refresh, so
crawlers see the app shell there; the VPS setup above is the one that is SEO and GEO ready.
