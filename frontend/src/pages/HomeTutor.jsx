import { Link } from 'react-router-dom';
import { ArrowUpRight, Check, MapPin, GraduationCap, School, Phone } from 'lucide-react';
import { useOrganization, useBooking } from '../lib/context';
import { useContent, Lines } from '../lib/cms';
import { useSeo, siteGraph, breadcrumbLd, faqLd, SITE_URL } from '../lib/useSeo';
import { Reveal, SectionHeading, FAQList, FinalCTA } from '../components/PublicSections';

const SERVICE = 'Home Tutor (Special Educator)';

export default function HomeTutor() {
  const content = useContent();
  const { t, list, items, img, zones, areas } = content;
  const { organization: org } = useOrganization();
  const { openBooking } = useBooking();
  const faqs = items('hometutor.faqs');
  const path = '/home-tutor-gurugram';
  const book = () => openBooking({ service: SERVICE, source: 'Home tutor page' });
  useSeo({
    title: t('seo.hometutor.title'),
    description: t('seo.hometutor.description'),
    path,
    image: img('hometutor.image') || undefined,
    jsonLd: siteGraph(content, {
      org,
      extra: [
        {
          '@type': 'Service',
          '@id': `${SITE_URL}${path}#service`,
          name: 'Home tutor and special educator for children',
          serviceType: 'Special education home tutoring',
          description: t('hometutor.lead'),
          url: SITE_URL + path,
          provider: { '@id': `${SITE_URL}/#clinic` },
          audience: { '@type': 'PeopleAudience', audienceType: 'Children with special educational needs and their parents' },
          areaServed: [{ '@type': 'City', name: 'Gurugram' }, ...zones.map((z) => ({ '@type': 'Place', name: `${z.name}, Gurugram` }))],
        },
        faqLd(faqs),
        breadcrumbLd([{ name: 'Home', path: '/' }, { name: 'Home tutor', path }]),
      ],
    }),
  });
  const phone = org?.phone;
  return (
    <div className="tutor-page">
      <section className="tutor-hero">
        <div className="container tutor-hero-grid">
          <div>
            <Reveal>
              <span className="eyebrow">
                <GraduationCap size={14} /> {t('hometutor.eyebrow')}
              </span>
            </Reveal>
            <Reveal delay={0.05} as="h1" className="tutor-h1">
              <Lines text={t('hometutor.title')} />
            </Reveal>
            <Reveal delay={0.1}>
              <p className="tutor-lead" data-testid="tutor-lead">
                {t('hometutor.lead')}
              </p>
            </Reveal>
            <Reveal delay={0.15}>
              <div className="loc-cta-row">
                <button className="button primary" onClick={book} data-testid="tutor-book">
                  {t('hometutor.button')} <ArrowUpRight size={16} />
                </button>
                {phone && (
                  <a className="button outlined" href={`tel:${phone.replaceAll(' ', '')}`}>
                    <Phone size={15} /> {phone}
                  </a>
                )}
              </div>
            </Reveal>
          </div>
          <Reveal delay={0.1}>
            <aside className="tutor-facts" data-testid="tutor-facts" aria-label="At a glance">
              {img('hometutor.image') && <img src={img('hometutor.image')} alt={t('hometutor.title')} className="tutor-facts-image" />}
              <h2>At a glance</h2>
              <dl>
                {items('hometutor.facts').map(({ label, value }) => (
                  <div key={label}>
                    <dt>{label}</dt>
                    <dd>{value}</dd>
                  </div>
                ))}
              </dl>
            </aside>
          </Reveal>
        </div>
      </section>

      <section className="section-pad">
        <div className="container loc-two-col">
          <div className="loc-prose">
            <h2>{t('hometutor.helps_title')}</h2>
            <ul className="loc-goals">
              {list('hometutor.helps').map((point) => (
                <li key={point}>
                  <Check size={16} /> {point}
                </li>
              ))}
            </ul>
          </div>
          <aside className="loc-visit-card">
            <h3>{t('hometutor.difference_title')}</h3>
            <p>{t('hometutor.difference_text')}</p>
          </aside>
        </div>
      </section>

      <section className="process-section section-pad">
        <div className="container">
          <Reveal>
            <SectionHeading id="tutor-steps" eyebrow="STEP BY STEP" title={t('hometutor.steps_title')} />
          </Reveal>
          <div className="process-grid">
            {items('hometutor.steps').map((step, i) => (
              <div className="process-step" key={step.title + i} data-testid={`tutor-step-${i}`}>
                <div className="step-top">
                  <GraduationCap size={26} strokeWidth={1.5} />
                  <span>{String(i + 1).padStart(2, '0')}</span>
                </div>
                <h3>{step.title}</h3>
                <p>{step.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="section-pad">
        <div className="container">
          <div className="loc-home-visit">
            <School size={28} strokeWidth={1.5} />
            <div>
              <h2>{t('hometutor.school_title')}</h2>
              <p>{t('hometutor.school_text')}</p>
            </div>
            <Link className="button outlined" to="/therapies/remedial-therapy">
              Remedial therapy <ArrowUpRight size={16} />
            </Link>
          </div>
        </div>
      </section>

      <section className="section-pad loc-therapy-band">
        <div className="container">
          <Reveal>
            <SectionHeading eyebrow="HOME VISITS" title={t('hometutor.areas_title')} description={t('hometutor.areas_text')} link={{ to: '/locations', label: 'All areas' }} />
          </Reveal>
          <div className="tutor-zones">
            {zones.map((zone) => (
              <Link key={zone.slug} to={`/areas/${zone.slug}`} className="tutor-zone" data-testid={`tutor-zone-${zone.slug}`}>
                <strong>
                  <MapPin size={14} /> {zone.name}
                </strong>
                <span>
                  {areas
                    .filter((a) => a.zone === zone.slug)
                    .slice(0, 6)
                    .map((a) => a.name)
                    .join(' · ')}
                  …
                </span>
              </Link>
            ))}
          </div>
        </div>
      </section>

      <section className="section-pad">
        <div className="container faq-grid">
          <div>
            <span className="eyebrow">QUESTIONS PARENTS ASK</span>
            <h2 className="section-title">Home tutor for special needs — your questions.</h2>
            <p>Can’t find your answer? Call or WhatsApp us and we’ll talk it through.</p>
          </div>
          <FAQList faqs={faqs} prefix="tutor-faq" />
        </div>
      </section>

      <FinalCTA title={t('hometutor.cta_title')} text={t('hometutor.cta_text')} service={SERVICE} source="Home tutor page" />
    </div>
  );
}
