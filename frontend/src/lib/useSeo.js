import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { imageUrl } from './cms';

// Public site address used for canonical links, share cards and schema.
// Set REACT_APP_SITE_URL=https://moonlightneurocare.com for production builds.
export const SITE_URL = (process.env.REACT_APP_SITE_URL || (typeof window !== 'undefined' ? window.location.origin : '')).replace(/\/$/, '');
const absolute = (url) => (!url ? '' : /^https?:\/\//.test(url) ? url : SITE_URL + (url.startsWith('/') ? url : `/${url}`));

function upsert(selector, create) {
  let el = document.head.querySelector(selector);
  if (!el) {
    el = create();
    document.head.appendChild(el);
  }
  return el;
}
function meta(attr, key, content) {
  const el = upsert(`meta[${attr}="${key}"]`, () => {
    const m = document.createElement('meta');
    m.setAttribute(attr, key);
    return m;
  });
  el.setAttribute('content', content || '');
}

export function useSeo({ title, description, path, robots = 'index, follow, max-image-preview:large', image, jsonLd, type = 'website' }) {
  const { pathname } = useLocation();
  const canonical = SITE_URL + (path ?? pathname);
  const ldString = jsonLd ? JSON.stringify(jsonLd) : '';
  const shareImage = absolute(image) || `${SITE_URL}/icon-512.png`;
  useEffect(() => {
    if (title) document.title = title;
    if (description) meta('name', 'description', description);
    meta('name', 'robots', robots);
    meta('property', 'og:title', title);
    meta('property', 'og:description', description);
    meta('property', 'og:type', type);
    meta('property', 'og:url', canonical);
    meta('property', 'og:image', shareImage);
    meta('property', 'og:locale', 'en_IN');
    meta('name', 'twitter:card', 'summary_large_image');
    const link = upsert('link[rel="canonical"]', () => {
      const l = document.createElement('link');
      l.setAttribute('rel', 'canonical');
      return l;
    });
    link.setAttribute('href', canonical);
    const existing = document.getElementById('seo-jsonld');
    if (ldString) {
      const s = existing || document.createElement('script');
      s.id = 'seo-jsonld';
      s.type = 'application/ld+json';
      s.textContent = ldString;
      if (!existing) document.head.appendChild(s);
    } else if (existing) existing.remove();
  }, [title, description, canonical, robots, shareImage, ldString, type]);
}

export const breadcrumbLd = (items) => ({
  '@type': 'BreadcrumbList',
  itemListElement: items.map((it, i) => ({ '@type': 'ListItem', position: i + 1, name: it.name, item: SITE_URL + it.path })),
});
export const faqLd = (faqs) => ({
  '@type': 'FAQPage',
  mainEntity: faqs.map(({ q, a }) => ({ '@type': 'Question', name: q, acceptedAnswer: { '@type': 'Answer', text: a } })),
});

// The clinic itself, described once and referenced by every page (@id). Built from the CMS so admin edits flow into Google.
export const clinicLd = (content, org) => {
  const { t, list, img, therapies, pageAreas, zones } = content;
  const lat = parseFloat(t('global.geo_lat'));
  const lng = parseFloat(t('global.geo_lng'));
  const director = t('director.name');
  return {
    '@type': ['MedicalClinic', 'LocalBusiness'],
    '@id': `${SITE_URL}/#clinic`,
    name: t('global.name'),
    url: `${SITE_URL}/`,
    logo: `${SITE_URL}/icon-512.png`,
    image: absolute(img('home.hero.default_image')) || `${SITE_URL}/icon-512.png`,
    description: t('seo.home.description'),
    telephone: org?.phone || undefined,
    email: org?.email || undefined,
    priceRange: '₹₹',
    medicalSpecialty: ['Pediatric', 'Physiotherapy', 'SpeechPathology'],
    address: {
      '@type': 'PostalAddress',
      streetAddress: t('global.street'),
      addressLocality: t('global.city'),
      addressRegion: 'Haryana',
      postalCode: t('global.postal_code'),
      addressCountry: 'IN',
    },
    ...(Number.isFinite(lat) && Number.isFinite(lng) ? { geo: { '@type': 'GeoCoordinates', latitude: lat, longitude: lng } } : {}),
    ...(t('global.hours_schema') ? { openingHours: t('global.hours_schema') } : {}),
    ...(t('global.map_url') ? { hasMap: t('global.map_url') } : {}),
    ...(list('global.social').length ? { sameAs: list('global.social') } : {}),
    areaServed: [
      { '@type': 'City', name: 'Gurugram' },
      ...zones.map((zone) => ({ '@type': 'Place', name: `${zone.name}, Gurugram` })),
      ...pageAreas.slice(0, 40).map((area) => ({ '@type': 'Place', name: `${area.name}, Gurugram` })),
    ],
    availableService: therapies.map((therapy) => ({
      '@type': 'MedicalTherapy',
      name: therapy.title,
      url: `${SITE_URL}/therapies/${therapy.slug}`,
    })),
    ...(director
      ? { employee: { '@type': 'Person', name: `${director} ${t('director.suffix')}`.trim(), jobTitle: t('director.role'), knowsAbout: list('director.focus') } }
      : {}),
  };
};

export const siteGraph = (content, { org, extra = [] } = {}) => ({
  '@context': 'https://schema.org',
  '@graph': [
    clinicLd(content, org),
    { '@type': 'WebSite', '@id': `${SITE_URL}/#website`, url: `${SITE_URL}/`, name: content.t('global.name'), publisher: { '@id': `${SITE_URL}/#clinic` } },
    ...extra,
  ],
});

export { imageUrl };
