import { useEffect } from 'react';
import { useContent } from './cms';
import { INFO_PATHS, POLICY_IDS } from './siteContent';

// Every public URL, generated from the CMS. `index: false` = reachable but kept out of Google and the sitemap.
// The prerender script and sitemap read this list from window.__MOONLIGHT_ROUTES__, so admin changes
// (new therapy, new area page) appear in Google without a developer.
export const publicRoutes = (content) => {
  const { therapies, sports, zones, pageAreas } = content;
  const routes = [
    { path: '/', priority: 1.0 },
    { path: '/therapies', priority: 0.9 },
    ...therapies.map((t) => ({ path: `/therapies/${t.slug}`, priority: 0.8 })),
    { path: '/home-tutor-gurugram', priority: 0.9 },
    { path: '/sports', priority: 0.6 },
    ...sports.map((s) => ({ path: `/sports/${s.slug}`, priority: 0.5 })),
    { path: '/book-assessment', priority: 0.8 },
    ...Object.keys(INFO_PATHS).map((path) => ({ path, priority: 0.5 })),
    { path: '/contact', priority: 0.8 },
    { path: '/faqs', priority: 0.6 },
    { path: '/what-to-expect', priority: 0.5 },
    { path: '/locations', priority: 0.9 },
    ...zones.map((z) => ({ path: `/areas/${z.slug}`, priority: 0.8, name: z.name, kind: 'zone' })),
    ...pageAreas.map((a) => ({ path: `/locations/${a.slug}`, priority: a.home ? 0.8 : 0.7, name: a.name, kind: 'area' })),
    ...pageAreas.flatMap((a) =>
      therapies.map((t) => ({ path: `/locations/${a.slug}/${t.slug}`, priority: 0.5, index: (a.index_therapies || []).includes(t.slug) })),
    ),
    ...POLICY_IDS.map((id) => ({ path: `/policies/${id}`, priority: 0.2 })),
  ];
  return routes.map((r) => ({ index: true, ...r }));
};

export const RouteManifest = () => {
  const content = useContent();
  useEffect(() => {
    if (content.ready) window.__MOONLIGHT_ROUTES__ = publicRoutes(content);
  }, [content]);
  return null;
};
