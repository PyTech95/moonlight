import { Link, useLocation, useParams } from 'react-router-dom';
import { ArrowUpRight, Phone, Mail, MapPin, ShieldCheck, Clock } from 'lucide-react';
import { useOrganization } from '../lib/context';
import { useContent, Lines } from '../lib/cms';
import { INFO_PATHS, POLICY_IDS } from '../lib/siteContent';
import { useSeo, siteGraph, breadcrumbLd, faqLd } from '../lib/useSeo';
import { GettingStarted, FAQSection, FinalCTA, DirectorSection, TeamSection, CenterGallery } from '../components/PublicSections';

const FaqPage = () => {
  const content = useContent();
  const { organization: org } = useOrganization();
  useSeo({
    title: content.t('seo.faqs.title'),
    description: content.t('seo.faqs.description'),
    path: '/faqs',
    jsonLd: siteGraph(content, { org, extra: [faqLd(content.faqs), breadcrumbLd([{ name: 'Home', path: '/' }, { name: 'FAQs', path: '/faqs' }])] }),
  });
  return (
    <>
      <FAQSection />
      <FinalCTA />
    </>
  );
};

const ExpectPage = () => {
  const content = useContent();
  const { t } = content;
  const { organization: org } = useOrganization();
  useSeo({ title: t('seo.expect.title'), description: t('seo.expect.description'), path: '/what-to-expect', jsonLd: siteGraph(content, { org }) });
  return (
    <>
      <div className="container page-heading">
        <span className="eyebrow">{t('expect.eyebrow')}</span>
        <h1 data-testid="what-expect-title">
          <Lines text={t('expect.title')} />
        </h1>
        <p>{t('expect.text')}</p>
      </div>
      <GettingStarted />
      <FinalCTA />
    </>
  );
};

const ContactPage = () => {
  const content = useContent();
  const { t } = content;
  const { organization: org } = useOrganization();
  useSeo({
    title: t('seo.contact.title'),
    description: t('seo.contact.description'),
    path: '/contact',
    jsonLd: siteGraph(content, { org, extra: [breadcrumbLd([{ name: 'Home', path: '/' }, { name: 'Contact', path: '/contact' }])] }),
  });
  const mapLink = t('global.map_url') || `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(org?.address || 'Moonlight Neurocare Sector 37C Gurugram')}`;
  return (
    <section className="container section-pad contact-page">
      <span className="eyebrow">{t('contact.eyebrow')}</span>
      <h1 data-testid="contact-title">{t('contact.title')}</h1>
      <p>{t('contact.text')}</p>
      <div className="contact-grid">
        <div>
          <div className="contact-detail">
            <MapPin />
            <div>
              <h2>{t('global.name')}</h2>
              <p data-testid="contact-address">{org?.address || 'Contact information is loading.'}</p>
            </div>
          </div>
          {t('global.hours') && (
            <div className="contact-detail">
              <Clock />
              <div>
                <h2>Opening hours</h2>
                <p data-testid="contact-hours">{t('global.hours')}</p>
              </div>
            </div>
          )}
          <div className="contact-detail">
            <Phone />
            <div>
              <h2>Call the center</h2>
              {[org?.phone, org?.secondary_phone].filter(Boolean).map((phone, i) => (
                <a key={phone} href={`tel:${phone.replaceAll(' ', '')}`} data-testid={`contact-phone-${i}`}>
                  {phone}
                </a>
              ))}
            </div>
          </div>
          <div className="contact-detail">
            <Mail />
            <div>
              <h2>Email</h2>
              <a href={org ? `mailto:${org.email}` : undefined} data-testid="contact-email">
                {org?.email || 'Loading…'}
              </a>
            </div>
          </div>
          <Link to="/book-assessment" className="button primary" data-testid="contact-book">
            Request an assessment
            <ArrowUpRight size={17} />
          </Link>
        </div>
        <div className="directions-panel">
          <MapPin size={42} strokeWidth={1.3} />
          <span className="eyebrow">{t('global.location_short').toUpperCase()}</span>
          <h2>{t('contact.directions_title')}</h2>
          <p>{t('contact.directions_text')}</p>
          <a data-testid="open-directions" target="_blank" rel="noreferrer" className="button outlined" href={mapLink}>
            {t('contact.directions_button')} <ArrowUpRight size={17} />
          </a>
        </div>
      </div>
    </section>
  );
};

const PolicyPage = ({ id }) => {
  const content = useContent();
  const { t, list } = content;
  const title = t(`policy.${id}.title`);
  const paragraphs = list(`policy.${id}.paragraphs`);
  useSeo({ title: `${title} | ${t('global.name')}`, description: (paragraphs[0] || '').slice(0, 155), path: `/policies/${id}` });
  return (
    <section className="container section-pad policy-page">
      <span className="eyebrow">TRUST & TRANSPARENCY</span>
      <h1 data-testid="policy-title">{title}</h1>
      {paragraphs.map((paragraph, i) => (
        <p key={i} data-testid={`policy-paragraph-${i}`}>
          {paragraph}
        </p>
      ))}
      <Link to="/contact" className="text-link" data-testid="policy-contact">
        Contact the center
        <ArrowUpRight size={17} />
      </Link>
    </section>
  );
};

const InfoPage = ({ id, pathname }) => {
  const content = useContent();
  const { t, items } = content;
  const { organization: org } = useOrganization();
  useSeo({
    title: t(`seo.${id}.title`),
    description: t(`seo.${id}.description`),
    path: pathname,
    jsonLd: siteGraph(content, { org, extra: [breadcrumbLd([{ name: 'Home', path: '/' }, { name: t(`${id}.eyebrow`), path: pathname }])] }),
  });
  return (
    <>
      <section className="container page-heading">
        <span className="eyebrow">{t(`${id}.eyebrow`)}</span>
        <h1 data-testid="information-title">
          <Lines text={t(`${id}.title`)} />
        </h1>
        <p data-testid="information-introduction">{t(`${id}.intro`)}</p>
      </section>
      <section className="container information-sections">
        {items(`${id}.sections`).map(({ title, body }, i) => (
          <article key={title + i} data-testid={`information-section-${i}`}>
            <span className="section-number">{String(i + 1).padStart(2, '0')}</span>
            <div>
              <h2>{title}</h2>
              <p>{body}</p>
            </div>
          </article>
        ))}
        {pathname === '/for-parents' && (
          <Link className="button primary" to="/login?role=parent" data-testid="parents-demo-link">
            Parent login
            <ArrowUpRight size={17} />
          </Link>
        )}
        {pathname === '/international/families-visiting-india' && (
          <Link className="text-link" to="/international/dubai-to-gurugram" data-testid="dubai-guide-link">
            Planning from Dubai
            <ArrowUpRight size={17} />
          </Link>
        )}
        {pathname === '/resources' && (
          <div className="resource-links">
            <Link to="/what-to-expect" data-testid="resource-first-visit">
              Preparing for a first visit <ArrowUpRight size={17} />
            </Link>
            <Link to="/home-tutor-gurugram" data-testid="resource-home-tutor">
              Home tutor & special educator <ArrowUpRight size={17} />
            </Link>
            <Link to="/policies/consent" data-testid="resource-consent">
              Understanding consent <ArrowUpRight size={17} />
            </Link>
            <Link to="/international/families-visiting-india" data-testid="resource-international">
              Planning a visit from abroad <ArrowUpRight size={17} />
            </Link>
          </div>
        )}
      </section>
      {pathname === '/about' && (
        <>
          <CenterGallery />
          <DirectorSection />
          <TeamSection />
        </>
      )}
      <FinalCTA />
    </>
  );
};

export default function Information() {
  const { pathname } = useLocation(),
    { policy } = useParams();
  if (pathname === '/faqs') return <FaqPage />;
  if (pathname === '/what-to-expect') return <ExpectPage />;
  if (pathname === '/contact' || pathname === '/locations/gurugram-sector-37c') return <ContactPage />;
  if (policy) return POLICY_IDS.includes(policy) ? <PolicyPage key={policy} id={policy} /> : <NotFound />;
  const id = INFO_PATHS[pathname];
  if (!id) return <NotFound />;
  return <InfoPage key={id} id={id} pathname={pathname} />;
}

export const NotFound = () => {
  useSeo({ title: 'Page not found | Moonlight Neurocare', description: 'This page could not be found.', robots: 'noindex, follow' });
  return (
    <section className="container section-pad not-found">
      <ShieldCheck size={36} />
      <span className="eyebrow">THIS PAGE ISN’T HERE</span>
      <h1 data-testid="not-found-title">Let’s find a familiar path.</h1>
      <p>The address may be incorrect, or the page may have moved.</p>
      <Link to="/" className="button primary" data-testid="not-found-home">
        Back to home
        <ArrowUpRight size={17} />
      </Link>
    </section>
  );
};
