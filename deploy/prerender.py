"""Save real HTML for every public page, plus sitemap.xml, robots.txt and llms.txt.

Search engines and AI assistants (ChatGPT, Claude, Perplexity) read this HTML directly; the React app then takes
over in the browser as usual. The route list comes from the website itself (window.__MOONLIGHT_ROUTES__), so new
therapies or area pages added in the admin panel are included automatically.

    python prerender.py --site https://moonlightneurocare.com --build /opt/moonlight/frontend/build

--site    where the live (or local) website is reachable from this machine
--public  the public address written into sitemap/canonical files (defaults to --site)
Needs: pip install playwright && python -m playwright install --with-deps chromium
Exit code 0 = all pages written. Existing files are only replaced after a page renders successfully.
"""
import argparse
import json
import os
import sys
import tempfile
import time
from datetime import date
from pathlib import Path
from xml.sax.saxutils import escape

from playwright.sync_api import sync_playwright

MARKER = 'data-prerendered="true"'
CLEANUP_JS = """
() => {
  // Show content that waits for scroll animations, drop transient UI, and mark the snapshot.
  document.querySelectorAll('[style]').forEach((el) => {
    const s = el.getAttribute('style') || '';
    if (/opacity:\\s*0/.test(s) || /translate/.test(s)) { el.style.opacity = ''; el.style.transform = ''; }
  });
  document.querySelectorAll('[data-sonner-toaster], [role=dialog]').forEach((el) => el.remove());
  document.documentElement.setAttribute('data-prerendered', 'true');
  return '<!doctype html>' + document.documentElement.outerHTML;
}
"""


def atomic_write(path: Path, text: str):
    path.parent.mkdir(parents=True, exist_ok=True)
    fd, tmp = tempfile.mkstemp(dir=path.parent, prefix='.prerender-')
    with os.fdopen(fd, 'w', encoding='utf-8') as handle:
        handle.write(text)
    os.chmod(tmp, 0o644)
    os.replace(tmp, path)


def target_file(build: Path, route: str) -> Path:
    clean = route.strip('/')
    return build / 'index.html' if not clean else build / clean / 'index.html'


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--site', required=True)
    parser.add_argument('--public', default='')
    parser.add_argument('--build', required=True)
    parser.add_argument('--timeout', type=int, default=30)
    args = parser.parse_args()
    site = args.site.rstrip('/')
    public = (args.public or args.site).rstrip('/')
    build = Path(args.build).resolve()
    index = build / 'index.html'
    shell = build / '_app.html'
    # Keep an untouched copy of the app shell: the web server serves it for any page that is not prerendered.
    if index.exists() and MARKER not in index.read_text(encoding='utf-8'):
        atomic_write(shell, index.read_text(encoding='utf-8'))
    if not shell.exists():
        sys.exit('build/_app.html is missing: run "yarn build" first.')

    started = time.time()
    written, failed = 0, []
    with sync_playwright() as p:
        browser = p.chromium.launch()
        page = browser.new_page(viewport={'width': 1280, 'height': 900}, user_agent='MoonlightPrerender/1.0')
        page.goto(site + '/', wait_until='domcontentloaded', timeout=args.timeout * 1000)
        page.wait_for_function('window.__CONTENT_READY__ && window.__MOONLIGHT_ROUTES__', timeout=args.timeout * 1000)
        routes = page.evaluate('window.__MOONLIGHT_ROUTES__')
        content = page.evaluate("""() => ({
            name: document.querySelector('.brand img')?.alt || 'Moonlight Neurocare',
            ld: [...document.querySelectorAll('script[type="application/ld+json"]')].map(s => s.textContent),
        })""")
        indexable = [r for r in routes if r.get('index', True)]
        for route in indexable:
            path = route['path']
            try:
                page.goto(site + path, wait_until='networkidle', timeout=args.timeout * 1000)
                page.wait_for_function('window.__CONTENT_READY__ === true', timeout=args.timeout * 1000)
                page.wait_for_timeout(250)
                html = page.evaluate(CLEANUP_JS)
                if public != site:
                    html = html.replace(site, public)
                if 'not-found-title' in html:
                    raise RuntimeError('rendered the not-found page')
                atomic_write(target_file(build, path), html)
                written += 1
            except Exception as exc:  # keep going; report at the end
                failed.append(f'{path}: {exc}')
        browser.close()

    today = date.today().isoformat()
    urls = '\n'.join(
        f'  <url><loc>{escape(public + r["path"])}</loc><lastmod>{today}</lastmod><priority>{r.get("priority", 0.5):.1f}</priority></url>'
        for r in indexable
    )
    atomic_write(build / 'sitemap.xml', f'<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n{urls}\n</urlset>\n')
    private = ['/portal/', '/login', '/security-setup', '/accept-invite', '/forgot-password', '/reset-password']
    atomic_write(build / 'robots.txt', 'User-agent: *\nAllow: /\n' + ''.join(f'Disallow: {p}\n' for p in private) + f'\nSitemap: {public}/sitemap.xml\n')

    # llms.txt: a short plain-text guide to the site for AI assistants.
    clinic = {}
    for raw in content['ld']:
        try:
            for node in json.loads(raw).get('@graph', []):
                if 'MedicalClinic' in (node.get('@type') or []):
                    clinic = node
        except ValueError:
            pass
    address = clinic.get('address', {})
    lines = [
        f"# {clinic.get('name', content['name'])}",
        '',
        f"> {clinic.get('description', 'Child development therapy and family support in Gurugram, India.')}",
        '',
        f"- Address: {address.get('streetAddress', '')}, {address.get('addressLocality', '')}, Haryana {address.get('postalCode', '')}, India",
    ]
    if clinic.get('telephone'):
        lines.append(f"- Phone / WhatsApp: {clinic['telephone']}")
    if clinic.get('email'):
        lines.append(f"- Email: {clinic['email']}")
    lines += ['', '## Services']
    lines += [f"- [{s['name']}]({s['url']})" for s in clinic.get('availableService', [])]
    def name(r):
        return r.get('name') or r['path'].split('/')[-1].replace('-', ' ').title()
    lines += [f'- [Home tutor & special educator at home]({public}/home-tutor-gurugram)', '', '## Areas served (Gurugram zones)']
    lines += [f"- [{name(r)}]({public}{r['path']})" for r in indexable if r['path'].startswith('/areas/')]
    lines += ['', '## Neighbourhood pages']
    lines += [f"- [{name(r)}, Gurugram]({public}{r['path']})" for r in indexable if r.get('kind') == 'area']
    lines += ['', '## Key pages', f'- [Book an assessment]({public}/book-assessment)', f'- [Contact & directions]({public}/contact)', f'- [FAQs]({public}/faqs)', f'- [All areas served]({public}/locations)']
    atomic_write(build / 'llms.txt', '\n'.join(lines) + '\n')

    print(f'Prerendered {written}/{len(indexable)} pages in {time.time() - started:.0f}s; sitemap has {len(indexable)} URLs.')
    for item in failed:
        print('FAILED', item)
    sys.exit(1 if failed else 0)


if __name__ == '__main__':
    main()
