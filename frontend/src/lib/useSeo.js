import { useEffect } from 'react';

function upsert(selector, create) {
  let el = document.head.querySelector(selector);
  if (!el) { el = create(); document.head.appendChild(el); }
  return el;
}
function meta(attr, key, content) {
  const el = upsert(`meta[${attr}="${key}"]`, () => {
    const m = document.createElement('meta'); m.setAttribute(attr, key); return m;
  });
  el.setAttribute('content', content || '');
}

export function useSeo({ title, description, canonical, robots = 'index, follow', image, jsonLd }) {
  const ldString = jsonLd ? JSON.stringify(jsonLd) : '';
  useEffect(() => {
    if (title) document.title = title;
    if (description) meta('name', 'description', description);
    meta('name', 'robots', robots);
    if (title) meta('property', 'og:title', title);
    if (description) meta('property', 'og:description', description);
    meta('property', 'og:type', 'website');
    if (image) meta('property', 'og:image', image);
    if (canonical) {
      meta('property', 'og:url', canonical);
      const link = upsert('link[rel="canonical"]', () => {
        const l = document.createElement('link'); l.setAttribute('rel', 'canonical'); return l;
      });
      link.setAttribute('href', canonical);
    }
    if (ldString) {
      const s = upsert('script#seo-jsonld', () => {
        const el = document.createElement('script'); el.id = 'seo-jsonld'; el.type = 'application/ld+json'; return el;
      });
      s.textContent = ldString;
    }
    return () => {
      const s = document.getElementById('seo-jsonld');
      if (s) s.remove();
      const c = document.head.querySelector('link[rel="canonical"]');
      if (c) c.remove();
    };
  }, [title, description, canonical, robots, image, ldString]);
}
