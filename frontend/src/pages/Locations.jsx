import { useParams, Link, Navigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { MapPin, Phone, ArrowRight, ArrowUpRight, Check, Navigation, ChevronRight, GraduationCap } from 'lucide-react';
import { Reveal, SectionHeading, FinalCTA, FAQList } from '../components/PublicSections';
import { NotFound } from './Information';
import { useContent, Lines } from '../lib/cms';
import { useOrganization } from '../lib/context';
import { useSeo, siteGraph, breadcrumbLd, faqLd, SITE_URL } from '../lib/useSeo';

const EASE = [0.22, 1, 0.36, 1];
const kmLabel = (area) => (area.home ? 'Our center' : area.km !== '' && area.km != null ? `≈ ${area.km} km from our center` : '');
const directionsUrl = (area) =>
  `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent('Moonlight Neurocare Sector 37C Gurugram')}` +
  (area && !area.home ? `&origin=${encodeURIComponent(area.name + ' Gurugram')}` : '');

const Crumbs = ({ items }) => (
  <nav className="loc-crumbs" aria-label="Breadcrumb">
    <ol>
      {items.map((it, i) => (
        <li key={it.path}>
          {i > 0 && <ChevronRight size={13} />}
          {i < items.length - 1 ? <Link to={it.path}>{it.name}</Link> : <span aria-current="page">{it.name}</span>}
        </li>
      ))}
    </ol>
  </nav>
);

// A chip for any area: own page → area page; otherwise → its zone page.
const AreaChip = ({ area, therapy }) => (
  <Link
    className={`loc-chip ${area.page ? '' : 'loc-chip-quiet'}`}
    data-testid={`area-chip-${area.slug}`}
    to={area.page ? (therapy ? `/locations/${area.slug}/${therapy.slug}` : `/locations/${area.slug}`) : `/areas/${area.zone}#${area.slug}`}
  >
    <MapPin size={13} /> {area.name}
  </Link>
);

const PhoneButton = ({ label }) => {
  const { organization: org } = useOrganization();
  if (!org?.phone) return null;
  return (
    <a className="button outlined" href={`tel:${org.phone.replaceAll(' ', '')}`}>
      <Phone size={15} /> {label || org.phone}
    </a>
  );
};

/* ---------------- Directory: /locations ---------------- */
function Hub() {
  const content = useContent();
  const { t, zones, areas, pageAreas, therapies } = content;
  const { organization: org } = useOrganization();
  useSeo({
    title: t('seo.locations.title'),
    description: t('seo.locations.description'),
    path: '/locations',
    jsonLd: siteGraph(content, { org, extra: [breadcrumbLd([{ name: 'Home', path: '/' }, { name: 'Areas we serve', path: '/locations' }])] }),
  });
  return (
    <div className="loc-page">
      <section className="loc-hero">
        <div className="container">
          <Reveal>
            <span className="eyebrow">
              <MapPin size={14} /> {t('locations.eyebrow')}
            </span>
          </Reveal>
          <Reveal delay={0.05} as="h1" className="loc-h1">
            <Lines text={t('locations.title')} />
          </Reveal>
          <Reveal delay={0.1}>
            <p className="loc-lead">
              {t('locations.text')} {areas.length} sectors and neighbourhoods in {zones.length} zones.
            </p>
          </Reveal>
          <Reveal delay={0.15}>
            <div className="loc-cta-row">
              <Link className="button primary" to="/book-assessment" data-testid="loc-book-btn">
                {t('global.book_label')} <ArrowUpRight size={16} />
              </Link>
              <PhoneButton />
            </div>
          </Reveal>
        </div>
      </section>
      <section className="section-pad">
        <div className="container">
          <Reveal>
            <SectionHeading eyebrow="ZONES" title={t('locations.zones_title')} />
          </Reveal>
          <div className="loc-zone-list">
            {zones.map((zone) => {
              const inZone = areas.filter((a) => a.zone === zone.slug);
              return (
                <article className="loc-zone" key={zone.slug} id={zone.slug} data-testid={`zone-${zone.slug}`}>
                  <div className="loc-zone-head">
                    <div>
                      <h2>
                        <Link to={`/areas/${zone.slug}`}>{zone.name}</Link>
                      </h2>
                      <span className="loc-area-meta">≈ {zone.range} from Sector 37C · {inZone.length} areas</span>
                    </div>
                    <Link className="text-link" to={`/areas/${zone.slug}`}>
                      Zone page <ArrowUpRight size={15} />
                    </Link>
                  </div>
                  <p>{zone.blurb}</p>
                  <div className="loc-chips">
                    {inZone.map((area) => (
                      <AreaChip key={area.slug} area={area} />
                    ))}
                  </div>
                </article>
              );
            })}
          </div>
        </div>
      </section>
      <section className="section-pad loc-therapy-band">
        <div className="container">
          <Reveal>
            <SectionHeading eyebrow="OUR THERAPIES" title="Available to families in every area." />
          </Reveal>
          <div className="loc-chips">
            {therapies.map((th) => (
              <Link key={th.slug} className="loc-chip" to={`/therapies/${th.slug}`}>
                {th.title}
              </Link>
            ))}
            <Link className="loc-chip" to="/home-tutor-gurugram">
              <GraduationCap size={13} /> Home tutor
            </Link>
          </div>
          <p className="loc-note">{pageAreas.length} areas have their own page; every other sector is listed on its zone page.</p>
        </div>
      </section>
      <FinalCTA />
    </div>
  );
}

/* ---------------- Zone: /areas/:zone ---------------- */
function Zone({ zone }) {
  const content = useContent();
  const { t, areas, zones } = content;
  const { organization: org } = useOrganization();
  const path = `/areas/${zone.slug}`;
  const inZone = areas.filter((a) => a.zone === zone.slug);
  const own = inZone.filter((a) => a.page);
  const listed = inZone.filter((a) => !a.page);
  const faqs = [
    { q: `Do you support families in ${zone.name}?`, a: `Yes. Families from ${zone.name} (${inZone.slice(0, 6).map((a) => a.name).join(', ')} and nearby) visit our Sector 37C center, about ${zone.range} away, and our home tutors and therapists visit many of these areas.` },
    { q: 'Do you offer home visits here?', a: t('area.home_visit_text', { area: zone.name }) },
    { q: 'How do we get started?', a: `Book an assessment online${org?.phone ? ` or call ${org.phone}` : ''}. The team will call you back to understand your child’s needs and plan the next step.` },
  ];
  useSeo({
    title: `Child Therapy & Home Tutors in ${zone.name}, Gurugram | ${t('global.name')}`,
    description: `Speech, occupational and sensory therapy plus home tutors for families in ${zone.name}: ${inZone.slice(0, 8).map((a) => a.name).join(', ')}. ≈ ${zone.range} from our Sector 37C center.`.slice(0, 160),
    path,
    jsonLd: siteGraph(content, {
      org,
      extra: [faqLd(faqs), breadcrumbLd([{ name: 'Home', path: '/' }, { name: 'Areas', path: '/locations' }, { name: zone.name, path }])],
    }),
  });
  return (
    <div className="loc-page">
      <section className="loc-hero">
        <div className="container">
          <Crumbs items={[{ name: 'Areas', path: '/locations' }, { name: zone.name, path }]} />
          <Reveal>
            <span className="eyebrow">
              <MapPin size={14} /> {zone.name.toUpperCase()} · ≈ {zone.range}
            </span>
          </Reveal>
          <Reveal delay={0.05} as="h1" className="loc-h1">
            Child therapy & home tutors in {zone.name}, Gurugram.
          </Reveal>
          <Reveal delay={0.1}>
            <p className="loc-lead">{zone.blurb}</p>
          </Reveal>
          <Reveal delay={0.15}>
            <div className="loc-cta-row">
              <Link className="button primary" to="/book-assessment">
                {t('global.book_label')} <ArrowUpRight size={16} />
              </Link>
              <PhoneButton />
            </div>
          </Reveal>
        </div>
      </section>
      {own.length > 0 && (
        <section className="section-pad">
          <div className="container">
            <Reveal>
              <SectionHeading eyebrow="AREA PAGES" title={`Neighbourhoods in ${zone.name}`} />
            </Reveal>
            <div className="loc-area-grid">
              {own.map((a, i) => (
                <motion.div key={a.slug} initial={{ opacity: 0, y: 24 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, margin: '-40px' }} transition={{ duration: 0.5, delay: Math.min(i * 0.04, 0.3), ease: EASE }}>
                  <Link className="loc-area-card" to={`/locations/${a.slug}`} data-testid={`area-card-${a.slug}`}>
                    <span className="loc-area-icon">
                      <MapPin size={18} />
                    </span>
                    <h3>
                      {a.name}
                      {a.home && <em> · our center</em>}
                    </h3>
                    <p>{a.blurb}</p>
                    <span className="loc-area-meta">
                      {kmLabel(a)} <ArrowRight size={14} />
                    </span>
                  </Link>
                </motion.div>
              ))}
            </div>
          </div>
        </section>
      )}
      {listed.length > 0 && (
        <section className="section-pad loc-therapy-band">
          <div className="container">
            <Reveal>
              <SectionHeading eyebrow="ALSO SERVING" title={`Every sector in ${zone.name}`} />
            </Reveal>
            <ul className="loc-sector-list">
              {listed.map((a) => (
                <li key={a.slug} id={a.slug}>
                  <MapPin size={13} /> {a.name}
                </li>
              ))}
            </ul>
          </div>
        </section>
      )}
      <section className="section-pad">
        <div className="container">
          <Reveal>
            <SectionHeading eyebrow="QUESTIONS FROM FAMILIES" title={`Families in ${zone.name} ask`} />
          </Reveal>
          <FAQList faqs={faqs} prefix="zone-faq" />
          <div className="loc-chips" style={{ marginTop: 28 }}>
            {zones
              .filter((z) => z.slug !== zone.slug)
              .map((z) => (
                <Link key={z.slug} className="loc-chip" to={`/areas/${z.slug}`}>
                  {z.name}
                </Link>
              ))}
          </div>
        </div>
      </section>
      <FinalCTA />
    </div>
  );
}

/* ---------------- Area: /locations/:area ---------------- */
function Area({ area }) {
  const content = useContent();
  const { t, items, therapies, zones, pageAreas } = content;
  const { organization: org } = useOrganization();
  const zone = zones.find((z) => z.slug === area.zone);
  const path = `/locations/${area.slug}`;
  const faqs = [
    { q: `Do you offer child therapy near ${area.name}?`, a: `Yes. Families from ${area.name}${area.near.length ? ` and nearby (${area.near.join(', ')})` : ''} visit our Sector 37C center${area.home ? ', right here in the neighbourhood' : kmLabel(area) ? `, ${kmLabel(area).replace('≈', 'about').replace(' from our center', ' away')}` : ''}.` },
    { q: `Can a home tutor or therapist visit us in ${area.name}?`, a: t('area.home_visit_text', { area: area.name }) },
    { q: 'How do we get started?', a: `Book an assessment online${org?.phone ? ` or call ${org.phone}` : ''}. We’ll understand your child’s needs and plan supportive next steps together — there’s no obligation.` },
  ];
  useSeo({
    title: `Child Therapy in ${area.name}, Gurugram | ${t('global.name')}`,
    description: `Speech, occupational, ABA and sensory therapy plus home tutors for children near ${area.name}, Gurugram. ${area.blurb}`.slice(0, 160),
    path,
    jsonLd: siteGraph(content, {
      org,
      extra: [
        faqLd(faqs),
        breadcrumbLd([{ name: 'Home', path: '/' }, { name: 'Areas', path: '/locations' }, ...(zone ? [{ name: zone.name, path: `/areas/${zone.slug}` }] : []), { name: area.name, path }]),
      ],
    }),
  });
  const neighbours = pageAreas.filter((a) => a.slug !== area.slug && a.zone === area.zone);
  return (
    <div className="loc-page">
      <section className="loc-hero">
        <div className="container">
          <Crumbs items={[{ name: 'Areas', path: '/locations' }, ...(zone ? [{ name: zone.name, path: `/areas/${zone.slug}` }] : []), { name: area.name, path }]} />
          <Reveal>
            <span className="eyebrow">
              <MapPin size={14} /> {area.name.toUpperCase()} · GURUGRAM
            </span>
          </Reveal>
          <Reveal delay={0.05} as="h1" className="loc-h1">
            {t('area.title', { area: area.name })}
          </Reveal>
          <Reveal delay={0.1}>
            <p className="loc-lead">
              {t('area.lead', { area: area.name })} {area.blurb} {kmLabel(area) && !area.home ? `Our Sector 37C center is ${kmLabel(area).replace(' from our center', ' away')}.` : ''}
            </p>
          </Reveal>
          <Reveal delay={0.15}>
            <div className="loc-cta-row">
              <Link className="button primary" to="/book-assessment">
                {t('global.book_label')} <ArrowUpRight size={16} />
              </Link>
              <a className="button outlined" href={directionsUrl(area)} target="_blank" rel="noreferrer">
                <Navigation size={15} /> Get directions
              </a>
            </div>
          </Reveal>
        </div>
      </section>
      {(area.intro || area.travel) && (
        <section className="section-pad">
          <div className="container loc-two-col">
            {area.intro && (
              <div className="loc-prose" data-testid="area-intro">
                <h2>About families in {area.name}</h2>
                {area.intro.split('\n').filter(Boolean).map((p, i) => (
                  <p key={i}>{p}</p>
                ))}
              </div>
            )}
            {area.travel && (
              <aside className="loc-visit-card">
                <h3>
                  <Navigation size={16} /> Getting here from {area.name}
                </h3>
                {area.travel.split('\n').filter(Boolean).map((p, i) => (
                  <p key={i}>{p}</p>
                ))}
              </aside>
            )}
          </div>
        </section>
      )}
      <section className="section-pad">
        <div className="container">
          <Reveal>
            <SectionHeading eyebrow={`THERAPIES NEAR ${area.name.toUpperCase()}`} title={t('area.therapies_title', { area: area.name })} description="Tap a therapy to see how it works and how families from your area get started." />
          </Reveal>
          <div className="loc-area-grid">
            {therapies.map((th, i) => {
              const Icon = th.Icon;
              return (
                <motion.div key={th.slug} initial={{ opacity: 0, y: 24 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, margin: '-40px' }} transition={{ duration: 0.5, delay: Math.min(i * 0.05, 0.3), ease: EASE }}>
                  <Link className="loc-area-card" to={`/locations/${area.slug}/${th.slug}`} data-testid={`area-therapy-${th.slug}`}>
                    <span className={`loc-area-icon tone-${th.color}`}>
                      <Icon size={18} />
                    </span>
                    <h3>
                      {th.title} in {area.name}
                    </h3>
                    <p>{th.short}</p>
                    <span className="loc-area-meta">
                      Learn more <ArrowRight size={14} />
                    </span>
                  </Link>
                </motion.div>
              );
            })}
          </div>
        </div>
      </section>
      <section className="section-pad loc-why">
        <div className="container">
          <div className="loc-home-visit" data-testid="area-home-visit">
            <GraduationCap size={28} strokeWidth={1.5} />
            <div>
              <h2>{t('area.home_visit_title', { area: area.name })}</h2>
              <p>{t('area.home_visit_text', { area: area.name })}</p>
            </div>
            <Link className="button primary" to="/home-tutor-gurugram">
              Home tutor & visits <ArrowUpRight size={16} />
            </Link>
          </div>
          <Reveal>
            <SectionHeading eyebrow="WHY MOONLIGHT" title={`Why families near ${area.name} choose Moonlight.`} />
          </Reveal>
          <div className="loc-why-grid">
            {items('area.why').map(({ title, body }, i) => (
              <Reveal key={title + i} delay={i * 0.06}>
                <div className="loc-why-card">
                  <h4>{title}</h4>
                  <p>{body}</p>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>
      <section className="section-pad">
        <div className="container">
          <Reveal>
            <SectionHeading eyebrow="QUESTIONS FROM FAMILIES" title={`Families in ${area.name} ask`} />
          </Reveal>
          <FAQList faqs={faqs} prefix="area-faq" />
        </div>
      </section>
      <section className="section-pad loc-therapy-band">
        <div className="container">
          <Reveal>
            <SectionHeading eyebrow="NEARBY" title={zone ? `More areas in ${zone.name}` : 'Other areas we serve'} link={zone ? { to: `/areas/${zone.slug}`, label: 'All sectors in this zone' } : undefined} />
          </Reveal>
          <div className="loc-chips">
            {(neighbours.length ? neighbours : pageAreas.filter((a) => a.slug !== area.slug)).map((a) => (
              <AreaChip key={a.slug} area={a} />
            ))}
          </div>
        </div>
      </section>
      <FinalCTA />
    </div>
  );
}

/* ---------------- Area × Therapy: /locations/:area/:therapy ---------------- */
function TherapyArea({ area, therapy }) {
  const content = useContent();
  const { t, therapies, pageAreas } = content;
  const { organization: org } = useOrganization();
  const Icon = therapy.Icon;
  const path = `/locations/${area.slug}/${therapy.slug}`;
  // Only combinations the admin chose (with real local content) are offered to Google; the rest stay reachable for visitors.
  const indexable = area.index_therapies.includes(therapy.slug);
  const faqs = [
    { q: `Do you offer ${therapy.title.toLowerCase()} near ${area.name}?`, a: `Yes. Families from ${area.name} visit our Sector 37C center for ${therapy.title.toLowerCase()}${kmLabel(area) && !area.home ? `, ${kmLabel(area).replace('≈', 'about').replace(' from our center', ' away')}` : ''}.` },
    { q: `How do we get started from ${area.name}?`, a: `Book an assessment online${org?.phone ? ` or call ${org.phone}` : ''}. We'll understand your child's needs and, together, plan supportive next steps — there's no obligation.` },
    { q: 'What ages do you support?', a: `We work with children across the early years and school age. ${therapy.audience}` },
  ];
  useSeo({
    title: `${therapy.title} in ${area.name}, Gurugram | ${t('global.name')}`,
    description: `${therapy.title} for children near ${area.name}, Gurugram, at our Sector 37C center. ${therapy.short}`.slice(0, 160),
    path,
    robots: indexable ? 'index, follow, max-image-preview:large' : 'noindex, follow',
    jsonLd: siteGraph(content, {
      org,
      extra: [
        { '@type': 'MedicalTherapy', name: therapy.title, description: therapy.intro, provider: { '@id': `${SITE_URL}/#clinic` }, url: SITE_URL + path },
        breadcrumbLd([{ name: 'Home', path: '/' }, { name: 'Areas', path: '/locations' }, { name: area.name, path: `/locations/${area.slug}` }, { name: therapy.title, path }]),
        faqLd(faqs),
      ],
    }),
  });
  return (
    <div className="loc-page">
      <section className="loc-hero">
        <div className="container">
          <Crumbs items={[{ name: 'Areas', path: '/locations' }, { name: area.name, path: `/locations/${area.slug}` }, { name: therapy.title, path }]} />
          <Reveal>
            <span className={`eyebrow tone-${therapy.color}`}>
              <Icon size={14} /> {therapy.title.toUpperCase()} · {area.name.toUpperCase()}
            </span>
          </Reveal>
          <Reveal delay={0.05} as="h1" className="loc-h1">
            {therapy.title} in {area.name}, Gurugram.
          </Reveal>
          <Reveal delay={0.1}>
            <p className="loc-lead">{therapy.intro}</p>
          </Reveal>
          <Reveal delay={0.15}>
            <div className="loc-cta-row">
              <Link className="button primary" to={`/book-assessment?service=${encodeURIComponent(therapy.title)}`} data-testid="loc-book-btn">
                {t('global.book_label')} <ArrowUpRight size={16} />
              </Link>
              <PhoneButton />
            </div>
          </Reveal>
        </div>
      </section>
      <section className="section-pad">
        <div className="container loc-two-col">
          <Reveal>
            <div className="loc-prose">
              <h2>How {therapy.title.toLowerCase()} helps children</h2>
              <p>{therapy.short} We start by understanding your child — their strengths, preferences and the everyday moments that matter to your family.</p>
              <ul className="loc-goals">
                {(therapy.goals || []).map((g) => (
                  <li key={g}>
                    <Check size={16} /> {g}
                  </li>
                ))}
              </ul>
              <p className="loc-note">{therapy.audience}</p>
            </div>
          </Reveal>
          <Reveal delay={0.1}>
            <aside className="loc-visit-card">
              <h3>
                <Navigation size={16} /> Getting here from {area.name}
              </h3>
              <p>
                {t('global.name')}, {t('global.street')}, {t('global.city')}.
              </p>
              {kmLabel(area) && <p className="loc-visit-km">{area.home ? 'In your neighbourhood' : kmLabel(area)}</p>}
              {area.near.length > 0 && <p className="loc-visit-near">Also serving nearby: {area.near.join(' · ')}</p>}
              <a className="button primary full" href={directionsUrl(area)} target="_blank" rel="noreferrer" data-testid="loc-directions">
                Get directions <ArrowUpRight size={15} />
              </a>
            </aside>
          </Reveal>
        </div>
      </section>
      <section className="section-pad">
        <div className="container">
          <Reveal>
            <SectionHeading eyebrow="QUESTIONS FROM FAMILIES" title={`${therapy.title} near ${area.name} — your questions.`} />
          </Reveal>
          <FAQList faqs={faqs} prefix="loc-faq" />
        </div>
      </section>
      <section className="section-pad loc-therapy-band">
        <div className="container">
          <Reveal>
            <SectionHeading eyebrow="MORE SUPPORT" title={`Other therapies in ${area.name}`} />
          </Reveal>
          <div className="loc-chips">
            {therapies
              .filter((th) => th.slug !== therapy.slug)
              .map((th) => (
                <Link key={th.slug} className="loc-chip" to={`/locations/${area.slug}/${th.slug}`} data-testid={`other-therapy-${th.slug}`}>
                  {th.title}
                </Link>
              ))}
          </div>
          <div className="loc-subhead">{therapy.title} in nearby areas</div>
          <div className="loc-chips">
            {pageAreas
              .filter((a) => a.slug !== area.slug && a.zone === area.zone)
              .map((a) => (
                <AreaChip key={a.slug} area={a} therapy={therapy} />
              ))}
          </div>
        </div>
      </section>
      <FinalCTA service={therapy.title} />
    </div>
  );
}

export default function Locations() {
  const { area: areaSlug, therapy: therapySlug } = useParams();
  const { areas, therapies } = useContent();
  if (!areaSlug) return <Hub />;
  const area = areas.find((a) => a.slug === areaSlug);
  if (!area) return <NotFound />;
  if (!area.page) return <Navigate to={`/areas/${area.zone}#${area.slug}`} replace />;
  if (!therapySlug) return <Area key={area.slug} area={area} />;
  const therapy = therapies.find((s) => s.slug === therapySlug);
  if (!therapy) return <NotFound />;
  return <TherapyArea key={area.slug + therapy.slug} area={area} therapy={therapy} />;
}

export function ZonePage() {
  const { zone: zoneSlug } = useParams();
  const { zones } = useContent();
  const zone = zones.find((z) => z.slug === zoneSlug);
  if (!zone) return <NotFound />;
  return <Zone key={zone.slug} zone={zone} />;
}

/* Homepage section */
export const AreasWeServe = () => {
  const { t, zones, pageAreas } = useContent();
  return (
    <section className="areas-band section-pad">
      <div className="container">
        <Reveal>
          <SectionHeading id="areas" eyebrow={t('home.areas.eyebrow')} title={t('home.areas.title')} description={t('home.areas.text')} link={{ to: '/locations', label: t('home.areas.link') }} />
        </Reveal>
        <Reveal delay={0.08}>
          <div className="loc-chips">
            {zones.map((z) => (
              <Link key={z.slug} className="loc-chip loc-chip-zone" data-testid={`home-zone-${z.slug}`} to={`/areas/${z.slug}`}>
                <MapPin size={13} /> {z.name}
              </Link>
            ))}
          </div>
          <div className="loc-chips" style={{ marginTop: 12 }}>
            {pageAreas.map((a) => (
              <Link key={a.slug} className="loc-chip" data-testid={`home-area-${a.slug}`} to={`/locations/${a.slug}`}>
                {a.name}
              </Link>
            ))}
          </div>
        </Reveal>
      </div>
    </section>
  );
};
