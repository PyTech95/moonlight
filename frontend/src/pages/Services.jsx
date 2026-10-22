import { Link, useParams } from 'react-router-dom';
import { ArrowUpRight, Check, ArrowLeft, MapPin, CircleHelp, GraduationCap } from 'lucide-react';
import { useOrganization } from '../lib/context';
import { useContent, Lines } from '../lib/cms';
import { useSeo, siteGraph, breadcrumbLd, SITE_URL } from '../lib/useSeo';
import { ServiceGrid, FinalCTA, FAQSection } from '../components/PublicSections';
import { AttendFormats } from '../components/AttendFormats';
import { NotFound } from './Information';

const TherapyIndex = () => {
  const content = useContent();
  const { t } = content;
  const { organization: org } = useOrganization();
  useSeo({
    title: t('seo.therapies.title'),
    description: t('seo.therapies.description'),
    path: '/therapies',
    jsonLd: siteGraph(content, { org, extra: [breadcrumbLd([{ name: 'Home', path: '/' }, { name: 'Therapies', path: '/therapies' }])] }),
  });
  return (
    <>
      <section className="page-heading container">
        <span className="eyebrow">{t('therapies.eyebrow')}</span>
        <h1 data-testid="services-index-title">
          <Lines text={t('therapies.title')} />
        </h1>
        <p>{t('therapies.text')}</p>
      </section>
      <section className="container section-pad top-zero">
        <ServiceGrid />
      </section>
      <div className="container">
        <AttendFormats />
      </div>
      <FinalCTA />
    </>
  );
};

const TherapyPage = ({ service }) => {
  const content = useContent();
  const { t } = content;
  const { organization: org } = useOrganization();
  const Icon = service.Icon;
  const path = `/therapies/${service.slug}`;
  useSeo({
    title: service.seo_title || `${service.title} for Children in Gurugram | ${t('global.name')}`,
    description: service.seo_description || `${service.title} at ${t('global.name')}, ${t('global.location_short')}. ${service.intro}`.slice(0, 158),
    path,
    jsonLd: siteGraph(content, {
      org,
      extra: [
        {
          '@type': 'MedicalTherapy',
          '@id': `${SITE_URL}${path}#therapy`,
          name: service.title,
          description: service.intro,
          url: SITE_URL + path,
          provider: { '@id': `${SITE_URL}/#clinic` },
        },
        breadcrumbLd([{ name: 'Home', path: '/' }, { name: 'Therapies', path: '/therapies' }, { name: service.title, path }]),
      ],
    }),
  });
  return (
    <>
      <section className="service-hero">
        <div className="container">
          <Link to="/therapies" className="breadcrumb" data-testid="service-breadcrumb">
            <ArrowLeft size={15} /> All therapies
          </Link>
          <div className="service-hero-content">
            <div>
              <span className="eyebrow">{t('therapy.eyebrow')}</span>
              <h1 data-testid="service-page-title">{service.title}</h1>
              <p data-testid="service-page-introduction">{service.intro}</p>
              <div className="action-row">
                <Link to={`/book-assessment?service=${encodeURIComponent(service.title)}`} className="button primary" data-testid="service-enquire">
                  {t('therapy.enquire')} <ArrowUpRight size={18} />
                </Link>
                <Link to="/fees" className="text-link" data-testid="service-fees">
                  Ask about fees
                </Link>
              </div>
              <span className="editorial-label" data-testid="service-draft-status">
                {t('therapy.label')}
              </span>
            </div>
            <div className={`large-service-icon ${service.color}`}>
              <Icon size={90} strokeWidth={1} />
              <span>{service.short}</span>
            </div>
          </div>
        </div>
      </section>
      <section className="container service-detail section-pad">
        <div className="service-main">
          <article>
            <span className="eyebrow">STARTING WITH YOUR CHILD</span>
            <h2>{t('therapy.audience_title')}</h2>
            <p data-testid="service-audience">{service.audience}</p>
          </article>
          <article>
            <h2>{t('therapy.conversation_title')}</h2>
            <p>{t('therapy.conversation_text')}</p>
          </article>
          {(service.goals || []).length > 0 && (
            <article>
              <h2>{t('therapy.goals_title')}</h2>
              <p>{t('therapy.goals_text')}</p>
              <ul className="check-list">
                {service.goals.map((goal, i) => (
                  <li key={goal} data-testid={`service-goal-${i}`}>
                    <Check size={18} />
                    {goal}
                  </li>
                ))}
              </ul>
            </article>
          )}
          <article>
            <h2>{t('therapy.role_title')}</h2>
            <p>{t('therapy.role_text')}</p>
          </article>
          <article>
            <AttendFormats compact />
          </article>
          <article>
            <h2>{t('therapy.sessions_title')}</h2>
            <p>{t('therapy.sessions_text')}</p>
          </article>
        </div>
        <aside className="service-aside">
          <h2>{t('therapy.aside_title')}</h2>
          <p>{t('therapy.aside_text')}</p>
          <Link className="button primary full-width" to={`/book-assessment?service=${encodeURIComponent(service.title)}`} data-testid="service-aside-book">
            {t('therapy.aside_button')} <ArrowUpRight size={16} />
          </Link>
          <div className="aside-detail">
            <MapPin size={19} />
            <div>
              <strong>{t('global.location_short')}</strong>
              <Link to="/contact" data-testid="service-location-link">
                Contact & directions
              </Link>
            </div>
          </div>
          <div className="aside-detail">
            <GraduationCap size={19} />
            <div>
              <strong>Prefer sessions at home?</strong>
              <Link to="/home-tutor-gurugram" data-testid="service-home-tutor-link">
                Home tutor & home visits
              </Link>
            </div>
          </div>
          <div className="aside-detail">
            <CircleHelp size={19} />
            <div>
              <strong>{t('therapy.fees_title')}</strong>
              <p>{t('therapy.fees_text')}</p>
            </div>
          </div>
        </aside>
      </section>
      <FAQSection />
      <FinalCTA service={service.title} />
    </>
  );
};

export default function Services() {
  const { slug } = useParams();
  const { therapies } = useContent();
  if (!slug) return <TherapyIndex />;
  const service = therapies.find((s) => s.slug === slug);
  if (!service) return <NotFound />;
  return <TherapyPage key={slug} service={service} />;
}
