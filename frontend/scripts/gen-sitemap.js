/* Regenerate public/sitemap.xml + robots.txt.  Run: node scripts/gen-sitemap.js
   The site address comes from REACT_APP_SITE_URL (env or frontend/.env), default https://moonlightneurocare.com.
   Keep the slug lists below in sync with lib/locations.js and lib/content.js until the CMS generates them. */
const fs = require('fs');
const path = require('path');

const envFile = path.join(__dirname, '..', '.env');
const env = fs.existsSync(envFile) ? fs.readFileSync(envFile, 'utf8') : '';
const BASE = (process.env.REACT_APP_SITE_URL || env.match(/^REACT_APP_SITE_URL=(.+)$/m)?.[1] || 'https://moonlightneurocare.com')
  .trim()
  .replace(/\/$/, '');

const therapies = ['speech-therapy', 'occupational-therapy', 'aba-therapy', 'sensory-integration-therapy', 'yoga-therapy', 'neurodevelopmental-therapy', 'remedial-therapy', 'music-play-therapy'];
const sports = ['roller-skating', 'soft-climbing', 'trampoline-bounce', 'balance-agility', 'ball-games', 'movement-play'];
const areas = ['sector-37c', 'sector-14', 'sector-45', 'sector-56', 'dlf-phase-1', 'dlf-phase-2', 'dlf-phase-3', 'dlf-phase-4', 'dlf-phase-5', 'sushant-lok', 'golf-course-road', 'sohna-road', 'palam-vihar', 'mg-road', 'cyber-city', 'new-gurugram'];
const infoPages = ['about', 'our-approach', 'for-parents', 'fees', 'center', 'resources', 'contact', 'faqs', 'what-to-expect', 'international/families-visiting-india', 'international/dubai-to-gurugram'];

const urls = [];
const add = (loc, priority, changefreq) => urls.push({ loc: BASE + loc, priority, changefreq });

add('/', '1.0', 'weekly');
add('/therapies', '0.9', 'monthly');
therapies.forEach((t) => add(`/therapies/${t}`, '0.8', 'monthly'));
add('/sports', '0.7', 'monthly');
sports.forEach((s) => add(`/sports/${s}`, '0.6', 'monthly'));
add('/book-assessment', '0.9', 'monthly');
infoPages.forEach((p) => add(`/${p}`, '0.6', 'monthly'));
add('/locations', '0.9', 'weekly');
areas.forEach((a) => {
  add(`/locations/${a}`, '0.8', 'monthly');
  therapies.forEach((t) => add(`/locations/${a}/${t}`, '0.7', 'monthly'));
});

const today = new Date().toISOString().slice(0, 10);
const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n` +
  urls.map((u) => `  <url><loc>${u.loc}</loc><lastmod>${today}</lastmod><changefreq>${u.changefreq}</changefreq><priority>${u.priority}</priority></url>`).join('\n') +
  `\n</urlset>\n`;

const privatePaths = ['/portal/', '/login', '/security-setup', '/accept-invite', '/forgot-password', '/reset-password'];
const robots = `User-agent: *\nAllow: /\n${privatePaths.map((p) => `Disallow: ${p}`).join('\n')}\n\nSitemap: ${BASE}/sitemap.xml\n`;

fs.writeFileSync(path.join(__dirname, '..', 'public', 'sitemap.xml'), xml);
fs.writeFileSync(path.join(__dirname, '..', 'public', 'robots.txt'), robots);
console.log(`Wrote ${urls.length} URLs to sitemap.xml (base: ${BASE})`);
