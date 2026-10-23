import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ArrowUpRight, ArrowRight, MapPin, Heart, Check, Leaf, GraduationCap } from 'lucide-react';
import { HERO_IMAGES } from '../lib/content';
import { mediaUrl } from '../lib/api';
import { useOrganization, useBooking } from '../lib/context';
import { useContent, Lines, imageUrl } from '../lib/cms';
import { ICONS } from '../lib/siteContent';
import { useSeo, siteGraph } from '../lib/useSeo';
import {
  SectionHeading,
  ServiceGrid,
  GettingStarted,
  FAQSection,
  FinalCTA,
  CarePrinciples,
  SportsShowcase,
  DirectorSection,
} from '../components/PublicSections';
import GoogleReviews from '../components/GoogleReviews';
import { AreasWeServe } from './Locations';

const HERO_EASE = [0.22, 1, 0.36, 1];
const heroContainer = { hidden: {}, show: { transition: { staggerChildren: 0.13, delayChildren: 0.08 } } };
const heroItem = {
  hidden: { opacity: 0, y: 26 },
  show: { opacity: 1, y: 0, transition: { duration: 0.65, ease: HERO_EASE } },
};
const lineWrap = { hidden: {}, show: { transition: { staggerChildren: 0.14, delayChildren: 0.04 } } };
const lineUp = { hidden: { y: '115%' }, show: { y: 0, transition: { duration: 0.9, ease: HERO_EASE } } };

export default function Home() {
  const [selected, setSelected] = useState(null);
  const { organization: org } = useOrganization();
  const { openBooking } = useBooking();
  const content = useContent();
  const { t, list, items, csv, therapies, sports, faqs } = content;
  const defaultHero = imageUrl(content.raw('home.hero.default_image'));
  const heroImages = org?.hero_images?.length
    ? org.hero_images.map(mediaUrl)
    : defaultHero && defaultHero !== HERO_IMAGES[0]
      ? [defaultHero]
      : HERO_IMAGES;
  const [slide, setSlide] = useState(0);
  useEffect(() => {
    if (heroImages.length < 2) return;
    const timer = setInterval(() => setSlide((s) => (s + 1) % heroImages.length), 5000);
    return () => clearInterval(timer);
  }, [heroImages.length]);
  useSeo({
    title: t('seo.home.title'),
    description: t('seo.home.description'),
    path: '/',
    jsonLd: siteGraph(content, {
      org,
      extra: [
        {
          '@type': 'FAQPage',
          mainEntity: faqs.map(({ q, a }) => ({ '@type': 'Question', name: q, acceptedAnswer: { '@type': 'Answer', text: a } })),
        },
      ],
    }),
  });
  const concerns = items('home.concern.options');
  return (
    <>
      <section className="hero">
        <div className="hero-slides">
          {heroImages.map((src, i) => (
            <img
              key={src + i}
              className={`hero-image ${i === slide ? 'active' : ''}`}
              src={src}
              alt={t('home.hero.image_alt')}
              fetchPriority={i === 0 ? 'high' : undefined}
            />
          ))}
        </div>
        <div className="hero-wash" />
        <div className="hero-orbs" aria-hidden="true">
          <motion.span className="orb orb-1" animate={{ y: [0, -22, 0] }} transition={{ duration: 9, repeat: Infinity, ease: 'easeInOut' }} />
          <motion.span className="orb orb-2" animate={{ y: [0, 18, 0] }} transition={{ duration: 11, repeat: Infinity, ease: 'easeInOut' }} />
          <motion.span className="orb orb-3" animate={{ scale: [1, 1.14, 1] }} transition={{ duration: 8, repeat: Infinity, ease: 'easeInOut' }} />
        </div>
        <div className="container hero-inner">
          <motion.div className="hero-copy" variants={heroContainer} initial="hidden" animate="show">
            <motion.span className="hero-eyebrow" variants={heroItem} data-testid="hero-location">
              <span /> {t('home.hero.eyebrow')}
            </motion.span>
            <motion.h1 variants={heroItem} data-testid="hero-title">
              <motion.span className="reveal-line" variants={lineWrap}>
                <motion.span className="reveal-word" variants={lineUp}>
                  {t('home.hero.title1')}
                </motion.span>
              </motion.span>
              <motion.span className="reveal-line" variants={lineWrap}>
                <motion.span className="reveal-word grad-text" variants={lineUp}>
                  {t('home.hero.title2')}
                </motion.span>
              </motion.span>
            </motion.h1>
            <motion.p variants={heroItem} data-testid="hero-description">
              <Lines text={t('home.hero.text')} />
            </motion.p>
            <motion.div className="hero-buttons" variants={heroItem}>
              <button onClick={() => openBooking()} className="button primary" data-testid="hero-book-assessment">
                {t('global.book_label')} <ArrowUpRight size={18} />
              </button>
              <Link to="/therapies" className="button ghost-button" data-testid="hero-explore-therapies">
                {t('home.hero.button2')} <ArrowRight size={17} />
              </Link>
            </motion.div>
            <motion.span className="hero-booking-note" variants={heroItem} data-testid="hero-request-disclaimer">
              <Check size={14} /> {t('home.hero.note')}
            </motion.span>
          </motion.div>
        </div>
      </section>
      <CarePrinciples />
      <section className="concern-section section-pad">
        <div className="container">
          <div className="concern-intro">
            <div>
              <span className="eyebrow">{t('home.concern.eyebrow')}</span>
              <h2 className="section-title" data-testid="concern-title">
                {t('home.concern.title')}
              </h2>
            </div>
            <p>{t('home.concern.text')}</p>
          </div>
          <div className="concern-options">
            {concerns.map(({ name, icon }, i) => {
              const Icon = ICONS[icon] || ICONS.MessageCircle;
              return (
                <button
                  key={name + i}
                  onClick={() => setSelected(selected === i ? null : i)}
                  aria-pressed={selected === i}
                  className={selected === i ? 'concern selected' : 'concern'}
                  data-testid={`concern-${i}`}
                >
                  <Icon size={22} strokeWidth={1.5} />
                  <span>{name}</span>
                  <ArrowUpRight size={14} />
                </button>
              );
            })}
          </div>
          {selected !== null &&
            concerns[selected] &&
            (() => {
              const c = concerns[selected];
              const therapyLinks = csv(c.therapies).map((slug) => therapies.find((s) => s.slug === slug)).filter(Boolean);
              const sportLinks = csv(c.sports).map((slug) => sports.find((s) => s.slug === slug)).filter(Boolean);
              const empty = !therapyLinks.length && !sportLinks.length && !c.link;
              return (
                <div className="concern-result" role="status" data-testid="concern-result">
                  <div>
                    <strong>{empty ? t('home.concern.result_empty') : t('home.concern.result_title')}</strong>
                    <p>{t('home.concern.result_note')}</p>
                  </div>
                  <div>
                    {therapyLinks.map((s) => (
                      <Link key={s.slug} to={`/therapies/${s.slug}`} data-testid={`concern-result-${s.slug}`}>
                        {s.title}
                        <ArrowUpRight size={15} />
                      </Link>
                    ))}
                    {sportLinks.map((s) => (
                      <Link key={s.slug} to={`/sports/${s.slug}`} data-testid={`concern-result-${s.slug}`}>
                        {s.title}
                        <ArrowUpRight size={15} />
                      </Link>
                    ))}
                    {c.link && (
                      <Link to={c.link} data-testid="concern-result-link">
                        {c.link === '/home-tutor-gurugram' ? t('home.tutor.button') : c.link}
                        <ArrowUpRight size={15} />
                      </Link>
                    )}
                    <Link to="/book-assessment" data-testid="concern-talk-team">
                      {t('home.concern.talk')} <ArrowUpRight size={15} />
                    </Link>
                  </div>
                </div>
              );
            })()}
        </div>
      </section>
      <section className="therapies-section section-pad">
        <div className="container">
          <SectionHeading
            id="therapies"
            eyebrow={t('home.therapies.eyebrow')}
            title={t('home.therapies.title')}
            description={t('home.therapies.text')}
            link={{ to: '/therapies', label: t('home.therapies.link') }}
          />
          <ServiceGrid />
        </div>
      </section>
      <section className="tutor-band">
        <div className="container tutor-band-inner">
          <span className="tutor-band-icon">
            <GraduationCap size={30} strokeWidth={1.5} />
          </span>
          <div>
            <span className="eyebrow">{t('home.tutor.eyebrow')}</span>
            <h2 data-testid="home-tutor-title">{t('home.tutor.title')}</h2>
            <p>{t('home.tutor.text')}</p>
          </div>
          <Link className="button primary" to="/home-tutor-gurugram" data-testid="home-tutor-link">
            {t('home.tutor.button')} <ArrowUpRight size={17} />
          </Link>
        </div>
      </section>
      <SportsShowcase />
      <GettingStarted />
      <section className="partnership-section section-pad">
        <div className="container partnership-grid">
          <div>
            <span className="eyebrow">{t('home.partner.eyebrow')}</span>
            <h2 className="section-title" data-testid="partnership-title">
              <Lines text={t('home.partner.title')} />
            </h2>
            <p>{t('home.partner.text')}</p>
            <ul className="check-list">
              {list('home.partner.points').map((point) => (
                <li key={point}>
                  <Check size={17} /> {point}
                </li>
              ))}
            </ul>
            <Link className="text-link" to="/for-parents" data-testid="partnership-link">
              {t('home.partner.link')} <ArrowUpRight size={18} />
            </Link>
          </div>
          <div className="portal-preview">
            <div className="preview-header">
              <span>
                <Heart size={17} /> A LITTLE WINDOW INTO THEIR DAY
              </span>
              <span className="status sage">{t('home.partner.preview_label')}</span>
            </div>
            <h3 data-testid="portal-preview-greeting">
              Hello, Aarav’s family <span>☀</span>
            </h3>
            <p>Every little moment matters.</p>
            <div className="preview-activity">
              <span className="preview-leaf">
                <Leaf size={24} />
              </span>
              <div>
                <span>THIS WEEK’S HOME ACTIVITY</span>
                <h4>A little choice, a meaningful moment</h4>
                <p>Communication through child-led play</p>
              </div>
              <ArrowUpRight size={20} />
            </div>
            <div className="preview-bottom">
              <span>
                <Check size={15} /> At your family’s pace
              </span>
              <Link to="/login?role=parent" data-testid="preview-portal-link">
                Parent login <ArrowRight size={16} />
              </Link>
            </div>
          </div>
        </div>
      </section>
      <DirectorSection />
      <AreasWeServe />
      <GoogleReviews />
      <section className="visit-band">
        <div className="container visit-inner">
          <span className="visit-icon">
            <MapPin size={28} />
          </span>
          <div>
            <span className="eyebrow">{t('home.visit.eyebrow')}</span>
            <h2 data-testid="visit-center-title">{t('home.visit.title')}</h2>
            <p>{t('home.visit.text')}</p>
          </div>
          <Link className="button outlined" to="/contact" data-testid="home-directions">
            {t('home.visit.button')} <ArrowUpRight size={17} />
          </Link>
        </div>
      </section>
      <FAQSection />
      <FinalCTA />
    </>
  );
}

