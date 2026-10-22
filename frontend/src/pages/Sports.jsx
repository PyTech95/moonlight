import { Link, useParams } from 'react-router-dom';
import { ArrowUpRight, Check, ArrowLeft, MapPin, CircleHelp, Clock } from 'lucide-react';
import { useOrganization } from '../lib/context';
import { useContent, Lines, imageUrl } from '../lib/cms';
import { useSeo, siteGraph, breadcrumbLd } from '../lib/useSeo';
import { SportsGrid, FinalCTA, FAQSection, Reveal } from '../components/PublicSections';
import { NotFound } from './Information';

const SportsIndex = () => {
  const content = useContent();
  const { t } = content;
  const { organization: org } = useOrganization();
  useSeo({
    title: t('seo.sports.title'),
    description: t('seo.sports.description'),
    path: '/sports',
    jsonLd: siteGraph(content, { org, extra: [breadcrumbLd([{ name: 'Home', path: '/' }, { name: 'Sports', path: '/sports' }])] }),
  });
  return (
    <>
      <section className="page-heading container">
        <span className="eyebrow">{t('sports.eyebrow')}</span>
        <h1 data-testid="sports-index-title">
          <Lines text={t('sports.title')} />
        </h1>
        <p>{t('sports.text')}</p>
      </section>
      <section className="container section-pad top-zero">
        <SportsGrid />
      </section>
      <FinalCTA service="Indoor Sports" />
    </>
  );
};

const SportPage = ({ sport }) => {
  const content = useContent();
  const { t, sports } = content;
  const { organization: org } = useOrganization();
  const Icon = sport.Icon;
  const path = `/sports/${sport.slug}`;
  useSeo({
    title: `${sport.title} for Children in Gurugram | ${t('global.name')}`,
    description: `${sport.title} at ${t('global.name')}, ${t('global.location_short')}. ${sport.intro}`.slice(0, 158),
    path,
    image: sport.image ? imageUrl(sport.image) : undefined,
    jsonLd: siteGraph(content, {
      org,
      extra: [breadcrumbLd([{ name: 'Home', path: '/' }, { name: 'Sports', path: '/sports' }, { name: sport.title, path }])],
    }),
  });
  return (
    <>
      <section className="sport-hero">
        <div className="container">
          <Link to="/sports" className="breadcrumb" data-testid="sport-breadcrumb">
            <ArrowLeft size={15} /> All sports
          </Link>
          <div className="sport-hero-content">
            <Reveal>
              <span className={`sport-hero-chip ${sport.color}`}>
                <Icon size={18} strokeWidth={1.6} /> {sport.focus}
              </span>
              <h1 data-testid="sport-page-title">{sport.title}</h1>
              <p data-testid="sport-page-introduction">{sport.intro}</p>
              <div className="action-row">
                <Link to="/book-assessment?service=Indoor%20Sports" className="button primary" data-testid="sport-enquire">
                  {t('sport.enquire')} <ArrowUpRight size={18} />
                </Link>
                <Link to="/therapies" className="text-link" data-testid="sport-therapies-link">
                  See our therapies
                </Link>
              </div>
            </Reveal>
            <Reveal className="sport-hero-media" y={30} delay={0.1}>
              {sport.image && <img className="kenburns" src={imageUrl(sport.image)} alt={sport.title} />}
            </Reveal>
          </div>
        </div>
      </section>
      <section className="container service-detail section-pad">
        <div className="service-main">
          <article>
            <span className="eyebrow">{t('sport.why_eyebrow')}</span>
            <h2>{t('sport.why_title')}</h2>
            <p>{t('sport.why_text')}</p>
          </article>
          {(sport.goals || []).length > 0 && (
            <article>
              <h2>{t('sport.goals_title')}</h2>
              <p>{t('sport.goals_text')}</p>
              <ul className="check-list">
                {sport.goals.map((goal, i) => (
                  <li key={goal} data-testid={`sport-goal-${i}`}>
                    <Check size={18} />
                    {goal}
                  </li>
                ))}
              </ul>
            </article>
          )}
          <article>
            <h2>{t('sport.audience_title')}</h2>
            <p data-testid="sport-audience">{sport.audience}</p>
          </article>
          {(sport.ages || sport.schedule.length > 0) && (
            <article className="sport-schedule" data-testid="sport-schedule">
              <span className="eyebrow">{t('sport.schedule_eyebrow')}</span>
              <h2>{t('sport.schedule_title')}</h2>
              {sport.ages && (
                <p className="sport-ages" data-testid="sport-ages">
                  <Clock size={15} /> {sport.ages}
                </p>
              )}
              <ul className="schedule-list">
                {sport.schedule.map(([day, time], i) => (
                  <li key={i} data-testid={`sport-slot-${i}`}>
                    <span className="schedule-day">{day}</span>
                    <span className="schedule-time">{time}</span>
                  </li>
                ))}
              </ul>
              <span className="small muted">{t('sport.schedule_note')}</span>
            </article>
          )}
          <article>
            <h2>{t('sport.safety_title')}</h2>
            <p>{t('sport.safety_text')}</p>
          </article>
        </div>
        <aside className="service-aside">
          <h2>{t('therapy.aside_title')}</h2>
          <p>{t('therapy.aside_text')}</p>
          <Link className="button primary full-width" to="/book-assessment?service=Indoor%20Sports" data-testid="sport-aside-book">
            {t('sport.enquire')} <ArrowUpRight size={16} />
          </Link>
          <div className="aside-detail">
            <MapPin size={19} />
            <div>
              <strong>{t('global.location_short')}</strong>
              <Link to="/contact" data-testid="sport-location-link">
                Contact & directions
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
      <section className="sports-section section-pad top-zero">
        <div className="container">
          <h2 className="section-title" style={{ marginBottom: '28px' }}>
            {t('sport.more_title')}
          </h2>
          <SportsGrid items={sports.filter((s) => s.slug !== sport.slug)} />
        </div>
      </section>
      <FAQSection />
      <FinalCTA service="Indoor Sports" />
    </>
  );
};

export default function SportsPage() {
  const { slug } = useParams();
  const { sports } = useContent();
  if (!slug) return <SportsIndex />;
  const sport = sports.find((s) => s.slug === slug);
  if (!sport) return <NotFound />;
  return <SportPage key={slug} sport={sport} />;
}
