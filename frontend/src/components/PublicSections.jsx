import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  ArrowUpRight,
  Heart,
  MessageCircle,
  ClipboardList,
  Sprout,
  CalendarCheck,
  ShieldCheck,
  Award,
  Sparkles,
  UserRound,
  GraduationCap,
} from 'lucide-react';
import { Accordion, AccordionItem, AccordionTrigger, AccordionContent } from './ui/accordion';
import { useOrganization, useBooking } from '../lib/context';
import { mediaUrl } from '../lib/api';
import { useContent, Lines, imageUrl } from '../lib/cms';

const EASE = [0.22, 1, 0.36, 1];
export const Reveal = ({ children, delay = 0, y = 26, className, as = 'div', ...rest }) => {
  const M = motion[as] || motion.div;
  return (
    <M
      initial={{ opacity: 0, y }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-70px' }}
      transition={{ duration: 0.6, delay, ease: EASE }}
      className={className}
      {...rest}
    >
      {children}
    </M>
  );
};

export const SectionHeading = ({ eyebrow, title, description, link, id = 'section' }) => (
  <div className="section-heading">
    <div>
      <span className="eyebrow" data-testid={`${id}-eyebrow`}>
        {eyebrow}
      </span>
      <h2 className="section-title" data-testid={`${id}-title`}>
        <Lines text={title} />
      </h2>
      {description && <p data-testid={`${id}-description`}>{description}</p>}
    </div>
    {link && (
      <Link to={link.to} className="text-link" data-testid={`${id}-link`}>
        {link.label}
        <ArrowUpRight size={18} />
      </Link>
    )}
  </div>
);

export const ServiceGrid = ({ items }) => {
  const { organization } = useOrganization() || {};
  const { therapies } = useContent();
  const overrides = organization?.therapy_images || {};
  return (
    <div className="service-grid">
      {(items || therapies).map(({ slug, title, Icon, color, short, image }, i) => {
        const photo = overrides[slug] ? mediaUrl(overrides[slug]) : imageUrl(image);
        return (
          <motion.div
            key={slug}
            initial={{ opacity: 0, y: 22 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: '-50px' }}
            transition={{ duration: 0.5, delay: Math.min(i * 0.05, 0.3), ease: EASE }}
          >
            <Link className="service-card" to={`/therapies/${slug}`} data-testid={`service-${slug}`}>
              {photo && (
                <span className="service-photo">
                  <img src={photo} alt={title} loading="lazy" />
                </span>
              )}
              <span className={`service-icon ${color}`}>
                <Icon size={26} strokeWidth={1.5} />
              </span>
              <h3>{title}</h3>
              <p>{short}</p>
              <span className="service-card-bottom">
                Explore therapy <ArrowUpRight size={18} />
              </span>
            </Link>
          </motion.div>
        );
      })}
    </div>
  );
};

export const SportsGrid = ({ items }) => {
  const { sports } = useContent();
  return (
    <div className="sports-grid">
      {(items || sports).map(({ slug, title, Icon, color, image, short, focus }, i) => (
        <motion.div
          key={slug}
          initial={{ opacity: 0, y: 24 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '-50px' }}
          transition={{ duration: 0.55, delay: Math.min(i * 0.06, 0.36), ease: EASE }}
          whileHover={{ y: -6 }}
        >
          <Link className="sport-card" to={`/sports/${slug}`} data-testid={`sport-${slug}`}>
            <div className="sport-card-media">
              {image && <img src={imageUrl(image)} alt={`${title} at Moonlight Neurocare`} loading="lazy" />}
              <span className={`sport-icon ${color}`}>
                <Icon size={20} strokeWidth={1.6} />
              </span>
            </div>
            <div className="sport-card-body">
              <h3>{title}</h3>
              <p>{short}</p>
              <span className="sport-card-focus">{focus}</span>
              <span className="sport-card-link">
                Explore <ArrowUpRight size={16} />
              </span>
            </div>
          </Link>
        </motion.div>
      ))}
    </div>
  );
};

const POINT_ICONS = [ShieldCheck, Heart, Sprout];
export const SportsShowcase = () => {
  const { t, list, img } = useContent();
  return (
    <section className="sports-section section-pad">
      <div className="container">
        <Reveal>
          <SectionHeading
            id="sports"
            eyebrow={t('home.sports.eyebrow')}
            title={t('home.sports.title')}
            description={t('home.sports.text')}
            link={{ to: '/sports', label: t('home.sports.link') }}
          />
        </Reveal>
        <div className="sports-feature">
          <Reveal className="sports-feature-media" y={30}>
            {img('home.sports.image') && (
              <img className="kenburns" src={img('home.sports.image')} alt={t('home.sports.feature_title')} loading="lazy" />
            )}
          </Reveal>
          <Reveal className="sports-feature-copy" delay={0.1}>
            <span className="eyebrow">{t('home.sports.feature_eyebrow')}</span>
            <h3>{t('home.sports.feature_title')}</h3>
            <p>{t('home.sports.feature_text')}</p>
            <ul className="check-list">
              {list('home.sports.points').map((point, i) => {
                const Icon = POINT_ICONS[i % POINT_ICONS.length];
                return (
                  <li key={point}>
                    <Icon size={17} /> {point}
                  </li>
                );
              })}
            </ul>
          </Reveal>
        </div>
        <SportsGrid />
      </div>
    </section>
  );
};

const STEP_ICONS = [MessageCircle, ClipboardList, Sprout, CalendarCheck];
export const GettingStarted = () => {
  const { t, items } = useContent();
  return (
    <section className="process-section section-pad">
      <div className="container">
        <Reveal>
          <SectionHeading id="getting-started" eyebrow={t('steps.eyebrow')} title={t('steps.title')} description={t('steps.text')} />
        </Reveal>
        <div className="process-grid">
          {items('steps.items').map((step, i) => {
            const Icon = STEP_ICONS[i % STEP_ICONS.length];
            const n = String(i + 1).padStart(2, '0');
            return (
              <motion.div
                className="process-step"
                key={n}
                data-testid={`process-step-${n}`}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: '-50px' }}
                transition={{ duration: 0.5, delay: Math.min(i * 0.07, 0.35), ease: EASE }}
              >
                <div className="step-top">
                  <Icon size={28} strokeWidth={1.5} />
                  <span>{n}</span>
                </div>
                <h3>{step.title}</h3>
                <p>{step.body}</p>
              </motion.div>
            );
          })}
        </div>
        <Link className="text-link" to="/what-to-expect" data-testid="process-what-to-expect">
          {t('steps.link')} <ArrowUpRight size={17} />
        </Link>
      </div>
    </section>
  );
};

export const FAQList = ({ faqs, prefix = 'faq' }) => (
  <Accordion type="single" collapsible className="faq-list">
    {faqs.map(({ q, a }, i) => (
      <AccordionItem key={q + i} value={`${prefix}-${i}`}>
        <AccordionTrigger data-testid={`${prefix}-question-${i}`}>{q}</AccordionTrigger>
        <AccordionContent data-testid={`${prefix}-answer-${i}`}>{a}</AccordionContent>
      </AccordionItem>
    ))}
  </Accordion>
);

export const FAQSection = ({ faqs: override, title }) => {
  const { t, faqs } = useContent();
  return (
    <section className="section-pad">
      <div className="container faq-grid">
        <div>
          <span className="eyebrow">{t('faq.eyebrow')}</span>
          <h2 className="section-title" data-testid="faq-title">
            {title || t('faq.title')}
          </h2>
          <p>
            <Lines text={t('faq.text')} />
          </p>
          <Link to="/contact" className="text-link" data-testid="faq-contact">
            {t('faq.link')} <ArrowUpRight size={17} />
          </Link>
        </div>
        <FAQList faqs={override || faqs} />
      </div>
    </section>
  );
};

export const FinalCTA = ({ title, text, service, source }) => {
  const { openBooking } = useBooking();
  const { t } = useContent();
  return (
    <section className="final-cta">
      <div className="container">
        <Reveal>
          <div>
            <span className="eyebrow">{t('cta.eyebrow')}</span>
            <h2 data-testid="final-cta-title">{title || t('cta.title')}</h2>
            <p>{text || t('cta.text')}</p>
          </div>
        </Reveal>
        <button onClick={() => openBooking({ service, source })} className="button light-button" data-testid="final-book-assessment">
          {t('cta.button')} <ArrowUpRight size={18} />
        </button>
      </div>
    </section>
  );
};

const PRINCIPLE_ICONS = [Heart, MessageCircle, ShieldCheck];
export const CarePrinciples = () => {
  const { items } = useContent();
  return (
    <div className="care-principles container">
      {items('home.principles').map(({ title, body }, i) => {
        const Icon = PRINCIPLE_ICONS[i % PRINCIPLE_ICONS.length];
        return (
          <motion.div
            key={title + i}
            data-testid={`care-principle-${i}`}
            initial={{ opacity: 0, y: 16 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: '-40px' }}
            transition={{ duration: 0.5, delay: i * 0.08, ease: EASE }}
          >
            <Icon size={28} strokeWidth={1.4} />
            <div>
              <strong>{title}</strong>
              <p>{body}</p>
            </div>
          </motion.div>
        );
      })}
    </div>
  );
};

export const DirectorSection = () => {
  const { organization: org } = useOrganization();
  const { t, list, img } = useContent();
  const photo = org?.director_photo ? mediaUrl(org.director_photo) : img('director.photo');
  const name = t('director.name');
  return (
    <section className="director-section section-pad">
      <div className="container director-grid">
        <Reveal className="director-media" y={30}>
          <div className="director-photo">
            {photo && <img src={photo} alt={`${name} ${t('director.suffix')}, ${t('director.role')}`} loading="lazy" />}
          </div>
          <div className="director-badge" data-testid="director-experience">
            <span className="director-badge-num">{t('director.badge_number')}</span>
            <span>{t('director.badge_text')}</span>
          </div>
        </Reveal>
        <Reveal className="director-copy" delay={0.1}>
          <span className="eyebrow">{t('director.eyebrow')}</span>
          <h2 className="section-title" data-testid="director-name">
            {name} <span>{t('director.suffix')}</span>
          </h2>
          <span className="director-role" data-testid="director-role">
            <Award size={16} /> {t('director.role')}
          </span>
          <ul className="director-quals" data-testid="director-qualifications">
            {list('director.quals').map((q) => (
              <li key={q}>
                <GraduationCap size={15} strokeWidth={1.7} /> {q}
              </li>
            ))}
          </ul>
          {list('director.bio').map((paragraph, i) => (
            <p key={i} data-testid={i === 0 ? 'director-bio' : undefined}>
              {paragraph}
            </p>
          ))}
          <div className="director-focus">
            {list('director.focus').map((focus) => (
              <span key={focus} data-testid={`director-focus-${focus.split(' ')[0].toLowerCase()}`}>
                {focus}
              </span>
            ))}
          </div>
          <div className="director-quote" data-testid="director-tagline">
            <Sparkles size={20} strokeWidth={1.6} /> {t('director.tagline')}
          </div>
        </Reveal>
      </div>
    </section>
  );
};

export const CenterGallery = () => {
  const { t, items } = useContent();
  return (
    <section className="center-gallery section-pad">
      <div className="container">
        <Reveal>
          <SectionHeading id="center" eyebrow={t('gallery.eyebrow')} title={t('gallery.title')} description={t('gallery.text')} />
        </Reveal>
        <div className="center-gallery-grid">
          {items('gallery.items')
            .filter((item) => item.image)
            .map((item, i) => (
              <Reveal key={i} className={`cg-item ${i < 2 ? 'cg-wide' : ''}`} y={26} delay={Math.min(i * 0.05, 0.2)}>
                <img src={imageUrl(item.image)} alt={item.alt || item.caption} loading="lazy" />
                {item.caption && <span className="cg-caption">{item.caption}</span>}
              </Reveal>
            ))}
        </div>
      </div>
    </section>
  );
};

export const TeamSection = () => {
  const { organization: org } = useOrganization();
  const { t, items } = useContent();
  const team = org?.team || [];
  const teamPhoto = org?.team_photo ? mediaUrl(org.team_photo) : '';
  return (
    <section className="team-section section-pad">
      <div className="container">
        <Reveal>
          <SectionHeading id="team" eyebrow={t('team.eyebrow')} title={t('team.title')} description={t('team.text')} />
        </Reveal>
        {teamPhoto && (
          <Reveal className="team-photo" y={26}>
            <img src={teamPhoto} alt="The Moonlight Neurocare team and center" loading="lazy" />
          </Reveal>
        )}
        <div className="team-grid">
          {team.length
            ? team.map((m, i) => (
                <motion.div
                  className="team-card"
                  key={m.id}
                  data-testid={`team-member-${i}`}
                  initial={{ opacity: 0, y: 22 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true, margin: '-50px' }}
                  transition={{ duration: 0.5, delay: Math.min(i * 0.06, 0.3), ease: EASE }}
                >
                  {m.photo ? (
                    <span className="team-avatar team-avatar-photo">
                      <img src={mediaUrl(m.photo)} alt={m.name} />
                    </span>
                  ) : (
                    <span className="team-avatar">
                      <UserRound size={26} strokeWidth={1.5} />
                    </span>
                  )}
                  <h3>{m.name}</h3>
                  <span className="team-member-role">{m.role}</span>
                </motion.div>
              ))
            : items('team.defaults').map((m, i) => (
                <motion.div
                  className="team-card team-card-default"
                  key={m.name + i}
                  data-testid={`team-role-${i}`}
                  initial={{ opacity: 0, y: 22 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true, margin: '-50px' }}
                  transition={{ duration: 0.5, delay: Math.min(i * 0.06, 0.3), ease: EASE }}
                >
                  <span className="team-avatar">
                    <UserRound size={26} strokeWidth={1.5} />
                  </span>
                  <h3>{m.name}</h3>
                  <span className="team-member-role">{m.role}</span>
                  <p className="team-bio">{m.bio}</p>
                  <span className="team-focus">{m.focus}</span>
                </motion.div>
              ))}
        </div>
        <Reveal className="team-note">
          <div>
            <strong>{t('team.join_title')}</strong>
            <p>{t('team.join_text')}</p>
          </div>
          <Link to="/contact" className="button primary" data-testid="team-join">
            {t('team.join_button')} <ArrowUpRight size={17} />
          </Link>
        </Reveal>
      </div>
    </section>
  );
};
