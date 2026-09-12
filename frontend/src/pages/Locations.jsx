import { useParams, Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { MapPin, Phone, ArrowRight, ArrowUpRight, Check, Navigation, ChevronRight } from 'lucide-react';
import { Reveal, SectionHeading, FinalCTA } from '../components/PublicSections';
import { NotFound } from './Information';
import { SERVICE_AREAS, THERAPIES, findArea, findTherapy, CENTER, SITE_ORIGIN, HERO_IMAGE, directionsUrl } from '../lib/locations';
import { useSeo } from '../lib/useSeo';

const EASE = [0.22, 1, 0.36, 1];
const canonicalFor = (path) => SITE_ORIGIN + path;

const businessLd = (area) => ({
  '@type': 'MedicalBusiness',
  '@id': SITE_ORIGIN + '/#business',
  name: CENTER.name,
  url: SITE_ORIGIN,
  telephone: CENTER.phone,
  image: HERO_IMAGE,
  priceRange: '₹₹',
  address: { '@type': 'PostalAddress', streetAddress: CENTER.landmark, addressLocality: CENTER.city, addressRegion: CENTER.region, postalCode: CENTER.postalCode, addressCountry: CENTER.country },
  areaServed: (area ? [area] : SERVICE_AREAS).map((a) => ({ '@type': 'Place', name: `${a.name}, ${CENTER.city}` })),
});
const breadcrumbLd = (items) => ({
  '@type': 'BreadcrumbList',
  itemListElement: items.map((it, i) => ({ '@type': 'ListItem', position: i + 1, name: it.name, item: canonicalFor(it.path) })),
});
const faqLd = (faqs) => ({ '@type': 'FAQPage', mainEntity: faqs.map((f) => ({ '@type': 'Question', name: f.q, acceptedAnswer: { '@type': 'Answer', text: f.a } })) });

const Crumbs = ({ items }) => <nav className="loc-crumbs" aria-label="Breadcrumb"><ol>{items.map((it, i) => <li key={it.path}>{i > 0 && <ChevronRight size={13} />}{i < items.length - 1 ? <Link to={it.path}>{it.name}</Link> : <span aria-current="page">{it.name}</span>}</li>)}</ol></nav>;

const AreaChips = ({ areas, therapy }) => <div className="loc-chips">{areas.map((a) => <Link key={a.slug} className="loc-chip" data-testid={`area-chip-${a.slug}`} to={therapy ? `/locations/${a.slug}/${therapy.slug}` : `/locations/${a.slug}`}><MapPin size={13} /> {a.name}</Link>)}</div>;

/* ---------------- Hub: /locations ---------------- */
function Hub() {
  const path = '/locations';
  useSeo({
    title: 'Child Therapy Across Gurugram — Speech, Occupational & More | Moonlight Neurocare',
    description: `Speech, occupational, ABA, sensory and more child-development therapies for families across Gurugram — from ${CENTER.sector} to DLF, Golf Course Road, Sohna Road & beyond. Book an assessment.`,
    canonical: canonicalFor(path), image: HERO_IMAGE,
    jsonLd: { '@context': 'https://schema.org', '@graph': [businessLd(null), breadcrumbLd([{ name: 'Home', path: '/' }, { name: 'Areas we serve', path }])] },
  });
  return <div className="loc-page">
    <section className="loc-hero"><div className="container">
      <Reveal><span className="eyebrow"><MapPin size={14} /> AREAS WE SERVE · GURUGRAM</span></Reveal>
      <Reveal delay={0.05} as="h1" className="loc-h1">Child development therapy for families<br />across Gurugram.</Reveal>
      <Reveal delay={0.1}><p className="loc-lead">From our sensory-friendly center in {CENTER.sector}, we support children and families from every corner of Gurugram — {SERVICE_AREAS.length} neighbourhoods within easy reach. Choose your area to see the therapies available near you.</p></Reveal>
      <Reveal delay={0.15}><div className="loc-cta-row"><Link className="button primary" to="/book-assessment" data-testid="loc-book-btn">Book an assessment <ArrowUpRight size={16} /></Link><a className="button outlined" href={`tel:${CENTER.phone}`}><Phone size={15} /> {CENTER.phone}</a></div></Reveal>
    </div></section>
    <section className="section-pad"><div className="container">
      <Reveal><SectionHeading eyebrow="CHOOSE YOUR NEIGHBOURHOOD" title="Neighbourhoods we serve near Sector 37C." description="Every area page lists the full range of therapies, travel guidance and how to get started." /></Reveal>
      <div className="loc-area-grid">{SERVICE_AREAS.map((a, i) => <motion.div key={a.slug} initial={{ opacity: 0, y: 24 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, margin: '-40px' }} transition={{ duration: .5, delay: Math.min(i * 0.04, 0.3), ease: EASE }}>
        <Link className="loc-area-card" to={`/locations/${a.slug}`} data-testid={`area-card-${a.slug}`}>
          <span className="loc-area-icon"><MapPin size={18} /></span>
          <h3>{a.name}{a.home && <em> · our center</em>}</h3>
          <p>{a.blurb}</p>
          <span className="loc-area-meta">{a.home ? 'You are here' : `≈ ${a.km} km from our center`} <ArrowRight size={14} /></span>
        </Link></motion.div>)}</div>
    </div></section>
    <section className="section-pad loc-therapy-band"><div className="container">
      <Reveal><SectionHeading eyebrow="OUR THERAPIES" title="Therapies available in every area." /></Reveal>
      <div className="loc-chips">{THERAPIES.map((t) => <Link key={t.slug} className="loc-chip" to={`/therapies/${t.slug}`}>{t.title}</Link>)}</div>
    </div></section>
    <FinalCTA />
  </div>;
}

/* ---------------- Area: /locations/:area ---------------- */
function Area({ area }) {
  const path = `/locations/${area.slug}`;
  useSeo({
    title: `Child Therapy in ${area.name}, Gurugram | Moonlight Neurocare`,
    description: `Speech, occupational, ABA, sensory & play therapy for children near ${area.name}, Gurugram. Moonlight Neurocare's ${CENTER.sector} center is ${area.home ? 'right here' : `≈ ${area.km} km away`}. Book a family assessment.`,
    canonical: canonicalFor(path), image: HERO_IMAGE,
    jsonLd: { '@context': 'https://schema.org', '@graph': [businessLd(area), breadcrumbLd([{ name: 'Home', path: '/' }, { name: 'Areas we serve', path: '/locations' }, { name: area.name, path }]) ] },
  });
  return <div className="loc-page">
    <section className="loc-hero"><div className="container">
      <Crumbs items={[{ name: 'Areas', path: '/locations' }, { name: area.name, path }]} />
      <Reveal><span className="eyebrow"><MapPin size={14} /> {area.name.toUpperCase()} · GURUGRAM</span></Reveal>
      <Reveal delay={0.05} as="h1" className="loc-h1">Child development therapy in {area.name}, Gurugram.</Reveal>
      <Reveal delay={0.1}><p className="loc-lead">Families in {area.name} choose Moonlight Neurocare for warm, child-first therapy. {area.blurb} Our sensory-friendly center in {CENTER.sector} is {area.home ? 'right in your neighbourhood' : `just ≈ ${area.km} km away`}, with support across speech, occupation, sensory needs and more.</p></Reveal>
      <Reveal delay={0.15}><div className="loc-cta-row"><Link className="button primary" to="/book-assessment">Book an assessment <ArrowUpRight size={16} /></Link><a className="button outlined" href={directionsUrl(area)} target="_blank" rel="noreferrer"><Navigation size={15} /> Get directions</a></div></Reveal>
    </div></section>
    <section className="section-pad"><div className="container">
      <Reveal><SectionHeading eyebrow={`THERAPIES NEAR ${area.name.toUpperCase()}`} title={`How we support children in ${area.name}.`} description="Tap a therapy to see how it works and how families from your area get started." /></Reveal>
      <div className="loc-area-grid">{THERAPIES.map((t, i) => { const Icon = t.icon; return <motion.div key={t.slug} initial={{ opacity: 0, y: 24 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, margin: '-40px' }} transition={{ duration: .5, delay: Math.min(i * 0.05, 0.3), ease: EASE }}>
        <Link className="loc-area-card" to={`/locations/${area.slug}/${t.slug}`} data-testid={`area-therapy-${t.slug}`}>
          <span className={`loc-area-icon tone-${t.color}`}><Icon size={18} /></span>
          <h3>{t.title} in {area.name}</h3>
          <p>{t.short}</p>
          <span className="loc-area-meta">Learn more <ArrowRight size={14} /></span>
        </Link></motion.div>; })}</div>
    </div></section>
    <section className="section-pad loc-therapy-band"><div className="container">
      <Reveal><SectionHeading eyebrow="NEARBY" title="Other areas we serve" /></Reveal>
      <AreaChips areas={SERVICE_AREAS.filter((a) => a.slug !== area.slug)} />
    </div></section>
    <FinalCTA />
  </div>;
}

/* ---------------- Area × Therapy: /locations/:area/:therapy ---------------- */
function TherapyArea({ area, therapy }) {
  const Icon = therapy.icon;
  const path = `/locations/${area.slug}/${therapy.slug}`;
  const title = `${therapy.title} in ${area.name}, Gurugram | Moonlight Neurocare`;
  const description = `Looking for ${therapy.title.toLowerCase()} near ${area.name}, Gurugram? Moonlight Neurocare offers child-first ${therapy.title.toLowerCase()} at our ${CENTER.sector} center, ${area.home ? 'right in ' + area.name : `≈ ${area.km} km from ${area.name}`}. Book a family-friendly assessment today.`;
  const faqs = [
    { q: `Do you offer ${therapy.title.toLowerCase()} near ${area.name}?`, a: `Yes. Families from ${area.name} and nearby (${area.near.join(', ')}) visit our ${CENTER.sector} center, ${area.home ? 'right in the neighbourhood' : `about ${area.km} km away`}, for ${therapy.title.toLowerCase()}.` },
    { q: `How do we get started from ${area.name}?`, a: `Book an assessment online or call ${CENTER.phone}. We'll understand your child's needs and, together, plan supportive next steps — there's no obligation.` },
    { q: `What ages do you support?`, a: `We work with children across the early years and school age. ${therapy.audience}` },
    { q: `Where exactly is the center?`, a: `We're in ${CENTER.landmark}, ${CENTER.city} — an easy drive from ${area.name}. Use the "Get directions" button for turn-by-turn navigation.` },
  ];
  useSeo({
    title, description, canonical: canonicalFor(path), image: HERO_IMAGE,
    jsonLd: { '@context': 'https://schema.org', '@graph': [
      businessLd(area),
      { '@type': 'Service', serviceType: therapy.title, provider: { '@id': SITE_ORIGIN + '/#business' }, areaServed: { '@type': 'Place', name: `${area.name}, ${CENTER.city}` }, description: therapy.intro },
      breadcrumbLd([{ name: 'Home', path: '/' }, { name: 'Areas', path: '/locations' }, { name: area.name, path: `/locations/${area.slug}` }, { name: therapy.title, path }]),
      faqLd(faqs),
    ] },
  });
  const others = THERAPIES.filter((t) => t.slug !== therapy.slug);
  return <div className="loc-page">
    <section className="loc-hero"><div className="container">
      <Crumbs items={[{ name: 'Areas', path: '/locations' }, { name: area.name, path: `/locations/${area.slug}` }, { name: therapy.title, path }]} />
      <Reveal><span className={`eyebrow tone-${therapy.color}`}><Icon size={14} /> {therapy.title.toUpperCase()} · {area.name.toUpperCase()}</span></Reveal>
      <Reveal delay={0.05} as="h1" className="loc-h1">{therapy.title} in {area.name}, Gurugram.</Reveal>
      <Reveal delay={0.1}><p className="loc-lead">{therapy.intro} For families near {area.name}, our sensory-friendly center in {CENTER.sector} is {area.home ? 'right here in your neighbourhood' : `just ≈ ${area.km} km away`} — warm, unhurried and child-led.</p></Reveal>
      <Reveal delay={0.15}><div className="loc-cta-row"><Link className="button primary" to="/book-assessment" data-testid="loc-book-btn">Book an assessment <ArrowUpRight size={16} /></Link><a className="button outlined" href={`tel:${CENTER.phone}`}><Phone size={15} /> Call {CENTER.phone}</a></div></Reveal>
    </div></section>

    <section className="section-pad"><div className="container loc-two-col">
      <Reveal><div className="loc-prose">
        <h2>How {therapy.title.toLowerCase()} helps children in {area.name}</h2>
        <p>{therapy.short} At Moonlight Neurocare we start by understanding your child — their strengths, preferences and the everyday moments that matter to your family in {area.name}.</p>
        <ul className="loc-goals">{therapy.goals.map((g) => <li key={g}><Check size={16} /> {g}</li>)}</ul>
        <p className="loc-note">{therapy.audience}</p>
      </div></Reveal>
      <Reveal delay={0.1}><aside className="loc-visit-card">
        <h3><Navigation size={16} /> Getting here from {area.name}</h3>
        <p>{CENTER.name}, {CENTER.landmark}, {CENTER.city}.</p>
        <p className="loc-visit-km">{area.home ? 'In your neighbourhood' : `≈ ${area.km} km · ${area.name} → ${CENTER.sector}`}</p>
        <p className="loc-visit-near">Also serving nearby: {area.near.join(' · ')}</p>
        <a className="button primary full" href={directionsUrl(area)} target="_blank" rel="noreferrer" data-testid="loc-directions">Get directions <ArrowUpRight size={15} /></a>
        <a className="button outlined full" href={`tel:${CENTER.phone}`}><Phone size={14} /> {CENTER.phone}</a>
      </aside></Reveal>
    </div></section>

    <section className="section-pad loc-why"><div className="container">
      <Reveal><SectionHeading eyebrow="WHY MOONLIGHT" title={`Why families near ${area.name} choose Moonlight.`} /></Reveal>
      <div className="loc-why-grid">
        {[['Child-first & unhurried', 'Sessions move at your child’s pace — no pressure, plenty of play and connection.'],
          ['A calm sensory center', 'Bright, purpose-built therapy rooms and a sensory gym designed to feel safe and welcoming.'],
          ['Families involved', `We partner with parents from ${area.name} at every step, with clear guidance you can use at home.`]].map(([h, b], i) => <Reveal key={h} delay={i * 0.06}><div className="loc-why-card"><h4>{h}</h4><p>{b}</p></div></Reveal>)}
      </div>
    </div></section>

    <section className="section-pad"><div className="container">
      <Reveal><SectionHeading eyebrow="QUESTIONS FROM FAMILIES" title={`${therapy.title} near ${area.name} — your questions.`} /></Reveal>
      <div className="loc-faq">{faqs.map((f) => <Reveal key={f.q}><details className="loc-faq-item"><summary>{f.q}</summary><p>{f.a}</p></details></Reveal>)}</div>
    </div></section>

    <section className="section-pad loc-therapy-band"><div className="container">
      <Reveal><SectionHeading eyebrow="MORE SUPPORT" title={`Other therapies in ${area.name}`} /></Reveal>
      <div className="loc-chips">{others.map((t) => <Link key={t.slug} className="loc-chip" to={`/locations/${area.slug}/${t.slug}`} data-testid={`other-therapy-${t.slug}`}>{t.title}</Link>)}</div>
      <Reveal><div className="loc-subhead">{therapy.title} in nearby areas</div></Reveal>
      <AreaChips areas={SERVICE_AREAS.filter((a) => a.slug !== area.slug)} therapy={therapy} />
    </div></section>
    <FinalCTA />
  </div>;
}

export default function Locations() {
  const { area: areaSlug, therapy: therapySlug } = useParams();
  if (!areaSlug) return <Hub />;
  const area = findArea(areaSlug);
  if (!area) return <NotFound />;
  if (!therapySlug) return <Area area={area} />;
  const therapy = findTherapy(therapySlug);
  if (!therapy) return <NotFound />;
  return <TherapyArea area={area} therapy={therapy} />;
}

/* Homepage section */
export const AreasWeServe = () => <section className="areas-band section-pad"><div className="container">
  <Reveal><SectionHeading id="areas" eyebrow="SERVING GURUGRAM" title="Care within reach, across Gurugram." description={`Families visit our ${CENTER.sector} center from all over the city. Find child-development therapy near your neighbourhood.`} link={{ to: '/locations', label: 'See all areas' }} /></Reveal>
  <Reveal delay={0.08}><div className="loc-chips">{SERVICE_AREAS.map((a) => <Link key={a.slug} className="loc-chip" data-testid={`home-area-${a.slug}`} to={`/locations/${a.slug}`}><MapPin size={13} /> {a.name}</Link>)}</div></Reveal>
</div></section>;
