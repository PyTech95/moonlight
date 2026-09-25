import { Link } from 'react-router-dom';
import { ArrowUpRight, Check, MapPin, CircleHelp, Home, Heart, MessageCircle, ClipboardList, Sprout, CalendarCheck, ShieldCheck, Users, Clock, Sofa, Backpack, MapPinned } from 'lucide-react';
import { FinalCTA, FAQSection, Reveal } from '../components/PublicSections';
import ContactForm from '../components/ContactForm';

const HERO_IMAGE = 'https://images.unsplash.com/photo-1708687045030-26702e62fc65?crop=entropy&cs=srgb&fm=jpg&ixid=M3w4NTYxOTF8MHwxfHNlYXJjaHwzfHx0aGVyYXBpc3QlMjBjaGlsZCUyMGhvbWV8ZW58MHx8fHwxNzg5Nzk0NzgyfDA&ixlib=rb-4.1.0&q=85';
const SECTION_IMAGE = 'https://images.pexels.com/photos/6255806/pexels-photo-6255806.jpeg?auto=compress&cs=tinysrgb&dpr=2&h=650&w=940';

const INCLUDED = [
  'A member of the team visiting your home at an agreed time',
  'Activities woven into your child’s real routines and favourite spaces',
  'Practical coaching for parents and carers, in your own environment',
  'Gentle pacing — familiar surroundings help a child feel safe',
  'A short summary of simple ideas to continue during the week',
];

const FOCUS = [
  [Sofa, 'Everyday routines', 'Support built into mealtimes, play, dressing and settling — the real moments that matter.'],
  [Users, 'Parent & carer coaching', 'Hands-on guidance so the whole family feels confident continuing between visits.'],
  [Heart, 'A calm, familiar space', 'Less travel and fewer new places — ideal for children who find change hard.'],
];

const BRING = [
  'A friendly, DBS-minded professional (verification before launch)',
  'Simple, playful activities suited to your child',
  'Ideas that use what your home already has',
  'A short written summary after each visit',
];

const STEPS = [
  [MessageCircle, '01', 'Start with a conversation', 'Tell us about your child, your home and what everyday support could look like.'],
  [ClipboardList, '02', 'Plan the visit', 'Agree a time, a comfortable space and the goals that matter most to your family.'],
  [Home, '03', 'The home session', 'The team joins you at home, working with your child in familiar surroundings.'],
  [CalendarCheck, '04', 'Reflect and plan', 'Talk through what worked and agree gentle ideas to try before the next visit.'],
];

const SCHEDULE = [
  ['Visit length', '45–60 minutes, adjusted to your child’s comfort and stamina'],
  ['Frequency', 'Weekly or fortnightly — agreed together after a first conversation'],
  ['Areas', 'Sector 37C and nearby Gurugram neighbourhoods (coverage confirmed by the center)'],
  ['Who attends', 'A parent or carer present throughout every visit'],
];

const AREAS = ['Sector 37C','Sector 38','Sector 39','Sector 40','Palam Vihar','DLF Phase 1','DLF Phase 2','DLF Phase 3','Sushant Lok','Sohna Road','South City','Nirvana Country','Sector 56','Sector 57'];

export default function TherapyAtHome(){
  return <>
    <section className="sport-hero"><div className="container">
      <div className="sport-hero-content">
        <Reveal>
          <span className="eyebrow">IN YOUR HOME, AT YOUR PACE</span>
          <h1 data-testid="therapy-at-home-title">Therapy at home.<br/>Familiar spaces, gentle progress.</h1>
          <p data-testid="therapy-at-home-intro">Some children do their best growing where they feel most at ease — at home, surrounded by the people and things they know. Home visits bring thoughtful, child-first support into your everyday routines, with you close by every step of the way.</p>
          <div className="action-row">
            <a href="#home-form" className="button primary" data-testid="therapy-at-home-enquire">Enquire about a home visit <ArrowUpRight size={18}/></a>
            <Link to="/therapies" className="text-link" data-testid="therapy-at-home-therapies-link">See our therapies</Link>
          </div>
          <span className="editorial-label" data-testid="therapy-at-home-draft-status">Programme draft · suitability confirmed by the center · not individual advice</span>
        </Reveal>
        <Reveal className="sport-hero-media" y={30} delay={0.1}><img className="kenburns" src={HERO_IMAGE} alt="A warm therapist-and-child moment during a home therapy session"/></Reveal>
      </div>
    </div></section>

    <section className="container service-detail section-pad">
      <div className="service-main">
        <article>
          <span className="eyebrow">WHY HOME CAN HELP</span>
          <h2>Growing where a child feels safe.</h2>
          <p>Home is where routines live — mealtimes, play, getting dressed, settling to sleep. Supporting a child in these real moments helps skills feel natural and lasting. It also means less travel, fewer new places to adjust to, and a calmer start for children who find unfamiliar spaces hard.</p>
        </article>
        <article>
          <h2>What a home visit looks like</h2>
          <p>Unhurried, gentle and shaped around your child. The team works with whatever your home already offers, respecting your family’s rhythm and your child’s comfort. There’s always room to watch first, pause, or try a different way.</p>
          <ul className="check-list">{INCLUDED.map((item,i)=><li key={item} data-testid={`home-included-${i}`}><Check size={18}/>{item}</li>)}</ul>
        </article>

        <article>
          <h2>What we focus on</h2>
          <p>Every visit is built around your family’s priorities. A few of the ways home support helps:</p>
          <div className="detail-cards" data-testid="home-focus">
            {FOCUS.map(([Icon,t,d],i)=><div className="detail-card" key={t} data-testid={`home-focus-card-${i}`}><span className="detail-card-icon"><Icon size={22} strokeWidth={1.6}/></span><h3>{t}</h3><p>{d}</p></div>)}
          </div>
        </article>

        <article className="sports-feature" style={{marginTop:'6px'}}>
          <Reveal className="sports-feature-media" y={26}><img className="kenburns" src={SECTION_IMAGE} alt="A parent and child during a gentle home-based therapy activity" loading="lazy"/></Reveal>
          <Reveal className="sports-feature-copy" delay={0.1}>
            <span className="eyebrow">FAMILY AT THE CENTER</span>
            <h3>Support that stays after we leave.</h3>
            <p>A home visit isn’t only for your child — it’s for you too. The team shares simple, practical ideas you can weave into ordinary days, so progress keeps going long after the session ends.</p>
            <ul className="check-list">
              <li><Heart size={17}/> Built around your child’s real routines</li>
              <li><Users size={17}/> Practical coaching for parents and carers</li>
              <li><ShieldCheck size={17}/> Safe, respectful and led by your child’s pace</li>
            </ul>
          </Reveal>
        </article>

        <article>
          <h2>What we bring</h2>
          <p>You don’t need to prepare anything special — just a comfortable space your child knows.</p>
          <ul className="check-list two-col" data-testid="home-bring">{BRING.map((item,i)=><li key={item} data-testid={`home-bring-${i}`}><Backpack size={18}/>{item}</li>)}</ul>
        </article>

        <article>
          <h2>Who it’s for</h2>
          <p>Home visits may suit children who find new environments overwhelming, families balancing busy routines, or situations where practising in real, everyday settings matters most. Whether home visits are right for your child — and which areas are covered — is something we’ll confirm together first.</p>
        </article>

        <article className="sport-schedule" data-testid="home-how-it-works">
          <span className="eyebrow">HOW A VISIT WORKS</span>
          <h2>From first hello to next step.</h2>
          <div className="process-grid" style={{marginTop:'22px',marginBottom:'0'}}>
            {STEPS.map(([Icon,n,t,d])=><div className="process-step" key={n} data-testid={`home-step-${n}`}><div className="step-top"><Icon size={26} strokeWidth={1.5}/><span>{n}</span></div><h3>{t}</h3><p>{d}</p></div>)}
          </div>
        </article>

        <article className="sport-schedule" data-testid="home-schedule">
          <span className="eyebrow">VISITS & COVERAGE</span>
          <h2>A sample rhythm.</h2>
          <ul className="spec-list">{SCHEDULE.map(([k,v],i)=><li key={k} data-testid={`home-spec-${i}`}><span className="spec-key"><Clock size={15}/> {k}</span><span className="spec-val">{v}</span></li>)}</ul>
          <span className="small muted">Sample details for illustration only · actual coverage areas, timings and fees are confirmed by the center. No visit is reserved by an enquiry.</span>
        </article>

        <div className="review-panel" data-testid="home-review-metadata"><ClipboardList size={21}/><div><strong>Programme details pending</strong><p>Visit areas, availability and suitability guidance are being finalised by the center. Verified details will be published before booking opens. No visit is reserved by an enquiry.</p></div></div>
      </div>
      <aside className="service-aside">
        <h2>Your next step</h2>
        <p>Talk through your questions and whether a home visit could suit your child.</p>
        <a className="button primary full-width" href="#home-form" data-testid="home-aside-book">Send an enquiry <ArrowUpRight size={16}/></a>
        <div className="aside-detail"><Home size={19}/><div><strong>In your own space</strong><p>Sessions built around your child’s familiar routines.</p></div></div>
        <div className="aside-detail"><MapPinned size={19}/><div><strong>Gurugram & nearby</strong><p>Coverage area confirmed by the center on enquiry.</p></div></div>
        <div className="aside-detail"><MapPin size={19}/><div><strong>Sector 37C, Gurugram</strong><Link to="/contact" data-testid="home-location-link">Contact & directions</Link></div></div>
        <div className="aside-detail"><CircleHelp size={19}/><div><strong>Availability & fees</strong><p>To be confirmed by the center. No visit is reserved by an enquiry.</p></div></div>
        <span className="small muted">Live further away? Explore <Link to="/online-classes" data-testid="home-online-link">online classes</Link>.</span>
      </aside>
    </section>

    <section className="container section-pad top-zero" data-testid="home-areas">
      <div className="timetable-head"><span className="eyebrow">WHERE WE VISIT</span><h2>Gurugram areas we may cover.</h2><p>Home visits are currently focused around Sector 37C and nearby neighbourhoods. Coverage for your specific area is confirmed by the center when you enquire.</p></div>
      <div className="area-chips">{AREAS.map((a,i)=><span className="area-chip" key={a} data-testid={`area-${i}`}><MapPin size={13}/> {a}</span>)}</div>
      <span className="small muted">Illustrative list · not all areas may be available · coverage confirmed on enquiry.</span>
    </section>

    <ContactForm source="Home Tuition / Therapy at Home page" eyebrow="ENQUIRE ABOUT A HOME VISIT" title="Send us a message" description="Share a few details about your child, your home and what you’re looking for. The team will reach out to talk through home visits, coverage and next steps." defaultService="I am not sure" idPrefix="home"/>

    <FAQSection/>
    <FinalCTA/>
  </>;
}
