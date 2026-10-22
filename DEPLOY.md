# Deploying Moonlight Neurocare (production)

The live site must run with `APP_MODE=production`. In demo mode every visitor gets a temporary copy of the
site, so admin changes and enquiries never reach real people. Pick **A** (stay on Emergent) or **B** (own server).

## Settings (both options)

Copy `backend/.env.example` to `backend/.env` and fill it in. The ones that matter most:

| Variable | Value |
| --- | --- |
| `APP_MODE` | `production` |
| `PRODUCTION_ORG_ID` | A fixed id, e.g. `moonlight-gurugram`. Never change it after launch |
| `WEB_ORIGIN` | `https://moonlightneurocare.com` |
| `EXTRA_ALLOWED_ORIGINS` | `https://www.moonlightneurocare.com` |
| `DATA_ENCRYPTION_KEY` | Keep the existing key if there is one. If it's lost, saved Gmail/WhatsApp passwords and 2-step secrets can't be read |
| `WEBHOOK_CRON_SECRET` | Long random string, used by the two scheduled jobs |
| `STORAGE_BACKEND` | `emergent` on Emergent; `s3` (recommended) or `local` on your own server |
| `MALWARE_SCAN` | `required` (default). Install ClamAV, or uploads are refused with a clear message |

Frontend: copy `frontend/.env.example` to `frontend/.env`:
`REACT_APP_BACKEND_URL=https://moonlightneurocare.com` and `REACT_APP_SITE_URL=https://moonlightneurocare.com`.

## A. Stay on Emergent

1. Load this code into the Emergent project (replace the old code).
2. Manage Publishes → Secrets: set `APP_MODE=production`, `PRODUCTION_ORG_ID`, `WEB_ORIGIN`,
   `PREVIEW_PROXY_ORIGIN` (same as `WEB_ORIGIN` if unsure), `STORAGE_BACKEND=emergent`; keep `EMERGENT_LLM_KEY`,
   `DATA_ENCRYPTION_KEY` and `WEBHOOK_CRON_SECRET`.
3. Publish.
4. Run steps 5–7 of option B against the deployment's database (its `MONGO_URL` / `DB_NAME`).

## B. Own server (Ubuntu VPS)

```bash
# 1. System packages
sudo apt update && sudo apt install -y python3-venv nginx clamav clamav-freshclam ffmpeg certbot python3-certbot-nginx
sudo systemctl enable --now clamav-freshclam      # keeps virus definitions current

# 2. Backend
cd /opt/moonlight/backend
python3 -m venv /opt/moonlight/venv
/opt/moonlight/venv/bin/pip install -r requirements-server.txt   # lean list; requirements.txt is Emergent's image
cp .env.example .env && nano .env

# 3. Frontend
cd /opt/moonlight/frontend
cp .env.example .env
yarn install && node scripts/gen-sitemap.js && yarn build      # output: frontend/build
```

4. Run the API as a service (`/etc/systemd/system/moonlight.service`). Use **one** worker: background jobs run inside the process.

```ini
[Unit]
Description=Moonlight API
After=network.target
[Service]
WorkingDirectory=/opt/moonlight/backend
ExecStart=/opt/moonlight/venv/bin/uvicorn server:app --host 127.0.0.1 --port 8001 --workers 1
Restart=always
User=www-data
[Install]
WantedBy=multi-user.target
```

Nginx (`/etc/nginx/sites-available/moonlight`). The site and API share one domain, which also suits the mobile app:

```nginx
server {
  server_name moonlightneurocare.com www.moonlightneurocare.com;
  root /opt/moonlight/frontend/build;
  client_max_body_size 130m;                 # practice videos up to 120 MB
  location /api/ {
    proxy_pass http://127.0.0.1:8001;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_read_timeout 300s;
  }
  location / { try_files $uri /index.html; }
}
```

Then `sudo certbot --nginx -d moonlightneurocare.com -d www.moonlightneurocare.com`.

5. **Create the first admin** (asks for a password; 2-step setup happens at first sign-in):

```bash
cd /opt/moonlight/backend && /opt/moonlight/venv/bin/python create_admin.py --email head@moonlightneurocare.com --name "Center Head"
```

Every other account (therapists, parents, schools) is invited from the admin panel.

6. **Recover enquiries lost in demo mode.** Run this only against the database the old live site used:

```bash
python recover_enquiries.py            # dry run → recovered_enquiries.csv (review it, then delete it)
python recover_enquiries.py --apply    # copies real-looking ones into the admin inbox; safe to re-run
```

7. In the admin panel: Settings → enter the Gmail app password and WhatsApp details → **Send test** for each.
   Settings saved earlier in a demo copy do not carry over.

8. Scheduled jobs (`crontab -e`):

```cron
CRON_TZ=Asia/Kolkata
15 3 * * * curl -fsS -X POST -H "Authorization: Bearer <WEBHOOK_CRON_SECRET>" https://moonlightneurocare.com/api/cron/virus-definitions
0 9 * * 6  curl -fsS -X POST -H "Authorization: Bearer <WEBHOOK_CRON_SECRET>" https://moonlightneurocare.com/api/cron/school-digest
```

9. Backups: enable automated backups on the database (e.g. MongoDB Atlas) and the storage bucket. Test one restore.

## After launch

- Google Search Console: add the domain and submit `https://moonlightneurocare.com/sitemap.xml`.
- Check `https://moonlightneurocare.com/api/health` returns `"mode": "production"`.
- A staging copy with `APP_MODE=demo` can keep the demo logins for training; never point it at the live database.
