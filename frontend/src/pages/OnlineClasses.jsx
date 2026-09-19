import { Link } from 'react-router-dom';
import { ArrowUpRight, Check, MapPin, CircleHelp, Video, Wifi, MessageCircle, ClipboardList, Sprout, CalendarCheck, ShieldCheck, Monitor, Users, Clock, Laptop, Globe } from 'lucide-react';
import { FinalCTA, FAQSection, Reveal } from '../components/PublicSections';
import ContactForm from '../components/ContactForm';

const HERO_IMAGE = 'https://images.unsplash.com/photo-1619852182277-79aa23f82c8e';
const SECTION_IMAGE = 'https://images.pexels.com/photos/7985559/pexels-photo-7985559.jpeg';

const INCLUDED = [
  'A live, one-to-one video session with a member of the team',
  'Activities you can do together with everyday items at home',
  'A parent alongside your child, so support continues after the call',
  'Gentle pacing — space to watch first, take breaks and try again',
  'A short written summary of ideas to explore between sessions',
];

const FORMATS = [
  [Video, 'One-to-one live sessions', 'Focused, individual video sessions shaped entirely around your child’s goals and comfort.'],
  [Users, 'Parent-coaching sessions', 'Practical guidance for you — simple strategies to weave into everyday routines with confidence.'],
  [Monitor, 'Small guided groups', 'Optional small-group activities for connection and play, kept calm and sensory-friendly.'],
];

const NEED = [
  'A phone, tablet or laptop with a camera',
  'A reasonably steady internet connection',
  'A quiet, familiar corner where your child feels at ease',
  'A parent or carer nearby for the session',
];

const STEPS = [
  [MessageCircle, '01', 'Start with a conversation', 'Tell us what matters to your family and whether online could suit your child.'],
  [Monitor, '02', 'Get set up', 'We share a simple link and a short guide — a phone, tablet or laptop is all you need.'],
  [Sprout, '03', 'Join the session', 'Meet the team live, with your child in a familiar, comfortable space.'],
  [CalendarCheck, '04', 'Reflect and plan', 'Talk through ideas to try at home and agree what a next step could look like.'],
];

const SCHEDULE = [
  ['Session length', '30–45 minutes, adjusted to your child’s attention and comfort'],
  ['Frequency', 'Weekly or fortnightly — agreed together after a first conversation'],
  ['Timings', 'Weekday and early-evening slots, confirmed by the center'],
  ['Language', 'English now; Hindi support planned as the team grows'],
];

export default function OnlineClasses(){
  return <>
    <section className="sport-hero"><div className="container">
      <div className="sport-hero-content">
        <Reveal>
          <span className="eyebrow">LIVE, ONLINE & GUIDED</span>
          <h1 data-testid="online-classes-title">Online classes.<br/>Care that reaches your home.</h1>
          <p data-testid="online-classes-intro">For families who travel, live further away, or simply prefer to begin from home — online sessions bring the team to your living room. Warm, unhurried and led by your child’s pace, over a secure video call.</p>
          <div className="action-row">
            <a href="#online-form" className="button primary" data-testid="online-classes-enquire">Enquire about online classes <ArrowUpRight size={18}/></a>
            <Link to="/therapies" className="text-link" data-testid="online-classes-therapies-link">See our therapies</Link>
          </div>
          <span className="editorial-label" data-testid="online-classes-draft-status">Programme draft · suitability confirmed by the center · not individual advice</span>
        </Reveal>
        <Reveal className="sport-hero-media" y={30} delay={0.1}><img className="kenburns" src={HERO_IMAGE} alt="A young child on a video call at home during an online session"/></Reveal>
      </div>
    </div></section>

    <section className="container service-detail section-pad">
      <div className="service-main">
        <article>
          <span className="eyebrow">WHY FAMILIES CHOOSE ONLINE</span>
          <h2>Support that fits around life.</h2>
          <p>Not every family can travel to the center each week — and some children feel most settled at home. Online sessions keep the same thoughtful, child-first approach, wherever you are. You stay close, your child stays comfortable, and the team guides you both in real time.</p>
        </article>
        <article>
          <h2>What a session looks like</h2>
          <p>A calm, focused video call built around your child. There’s always room to watch first, pause, or try a different way — because confidence grows when a child feels safe and in control. A parent stays alongside, so the ideas continue long after the call ends.</p>
          <ul className="check-list">{INCLUDED.map((item,i)=><li key={item} data-testid={`online-included-${i}`}><Check size={18}/>{item}</li>)}</ul>
        </article>

        <article>
          <h2>Formats we offer</h2>
          <p>Every family is different. We’ll suggest the format that fits your child best — and it can change over time.</p>
          <div className="detail-cards" data-testid="online-formats">
            {FORMATS.map(([Icon,t,d],i)=><div className="detail-card" key={t} data-testid={`online-format-${i}`}><span className="detail-card-icon"><Icon size={22} strokeWidth={1.6}/></span><h3>{t}</h3><p>{d}</p></div>)}
          </div>
        </article>

        <article className="sports-feature" style={{marginTop:'6px'}}>
          <Reveal className="sports-feature-media" y={26}><img className="kenburns" src={SECTION_IMAGE} alt="A parent supporting their child during an online session at home" loading="lazy"/></Reveal>
          <Reveal className="sports-feature-copy" delay={0.1}>
            <span className="eyebrow">TOGETHER, ON SCREEN</span>
            <h3>You’re never doing it alone.</h3>
            <p>Online doesn’t mean distant. The team coaches you gently through each activity, answers your questions as they come up, and helps you feel confident supporting your child between sessions.</p>
            <ul className="check-list">
              <li><Wifi size={17}/> Works on a phone, tablet or laptop</li>
              <li><ShieldCheck size={17}/> Private, secure one-to-one video</li>
              <li><Sprout size={17}/> Everyday items, no special equipment</li>
            </ul>
          </Reveal>
        </article>

        <article>
          <h2>What you’ll need</h2>
          <p>Getting started is simple — no special software or equipment.</p>
          <ul className="check-list two-col" data-testid="online-need">{NEED.map((item,i)=><li key={item} data-testid={`online-need-${i}`}><Laptop size={18}/>{item}</li>)}</ul>
        </article>

        <article>
          <h2>Who it’s for</h2>
          <p>Online classes may suit families who live outside Gurugram, travel often, are visiting from abroad, or would like to begin from the comfort of home. Whether online is right for your child is something we’ll talk through together first — it isn’t suitable for every situation, and we’ll always say so honestly.</p>
        </article>

        <article className="sport-schedule" data-testid="online-how-it-works">
          <span className="eyebrow">SIMPLE TO JOIN</span>
          <h2>How it works.</h2>
          <div className="process-grid" style={{marginTop:'22px',marginBottom:'0'}}>
            {STEPS.map(([Icon,n,t,d])=><div className="process-step" key={n} data-testid={`online-step-${n}`}><div className="step-top"><Icon size={26} strokeWidth={1.5}/><span>{n}</span></div><h3>{t}</h3><p>{d}</p></div>)}
          </div>
        </article>

        <article className="sport-schedule" data-testid="online-schedule">
          <span className="eyebrow">SESSIONS & FREQUENCY</span>
          <h2>A sample rhythm.</h2>
          <ul className="spec-list">{SCHEDULE.map(([k,v],i)=><li key={k} data-testid={`online-spec-${i}`}><span className="spec-key"><Clock size={15}/> {k}</span><span className="spec-val">{v}</span></li>)}</ul>
          <span className="small muted">Sample details for illustration only · actual formats, timings and fees are confirmed by the center. No slot is reserved by an enquiry.</span>
        </article>

        <div className="review-panel" data-testid="online-review-metadata"><ClipboardList size={21}/><div><strong>Programme details pending</strong><p>Session formats, availability and suitability guidance are being finalised by the center. Verified details will be published before booking opens. No slot is reserved by an enquiry.</p></div></div>
      </div>
      <aside className="service-aside">
        <h2>Your next step</h2>
        <p>Talk through your questions and whether online could work for your child.</p>
        <a className="button primary full-width" href="#online-form" data-testid="online-aside-book">Send an enquiry <ArrowUpRight size={16}/></a>
        <div className="aside-detail"><Video size={19}/><div><strong>Live, one-to-one</strong><p>Secure video sessions with a member of the team.</p></div></div>
        <div className="aside-detail"><Globe size={19}/><div><strong>Wherever you are</strong><p>Join from anywhere in India or abroad.</p></div></div>
        <div className="aside-detail"><MapPin size={19}/><div><strong>Sector 37C, Gurugram</strong><Link to="/contact" data-testid="online-location-link">Contact & directions</Link></div></div>
        <div className="aside-detail"><CircleHelp size={19}/><div><strong>Availability & fees</strong><p>To be confirmed by the center. No slot is reserved by an enquiry.</p></div></div>
        <span className="small muted">Prefer in-person, at home? Explore <Link to="/therapy-at-home" data-testid="online-home-link">therapy at home</Link>.</span>
      </aside>
    </section>

    <ContactForm source="Online Classes page" eyebrow="ENQUIRE ABOUT ONLINE CLASSES" title="Send us a message" description="Share a few details about your child and what you’re looking for. The team will reach out to talk through online sessions, suitability and next steps." defaultService="I am not sure" idPrefix="online"/>

    <FAQSection/>
    <FinalCTA/>
  </>;
}
