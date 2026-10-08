import { Link, useParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ArrowUpRight, Check, ArrowLeft, MapPin, CircleHelp, ShieldCheck, Clock } from 'lucide-react';
import { sports } from '../lib/content';
import { SportsGrid, FinalCTA, FAQSection, Reveal } from '../components/PublicSections';

export default function SportsPage(){
  const {slug}=useParams();
  if(!slug)return <>
    <section className="page-heading container">
      <span className="eyebrow">MOVEMENT, PLAY & CONFIDENCE</span>
      <h1 data-testid="sports-index-title">Indoor sports.<br/>Every child, every pace.</h1>
      <p>Gentle, sensory-friendly movement — skating, climbing, balance and ball play — designed to build confidence, coordination and connection. Explore the activities, then talk to the team about your child.</p>
      <span className="editorial-label" data-testid="sports-review-status">Programme draft · schedules and suitability confirmed by the center</span>
    </section>
    <section className="container section-pad top-zero"><SportsGrid/></section>
    <FinalCTA/>
  </>;
  const sport=sports.find(s=>s.slug===slug);
  if(!sport)return <section className="container section-pad"><h1 data-testid="sport-not-found">Sport page not found</h1><Link to="/sports" data-testid="back-all-sports">Explore all sports</Link></section>;
  const Icon=sport.icon;
  return <>
    <section className="sport-hero"><div className="container">
      <Link to="/sports" className="breadcrumb" data-testid="sport-breadcrumb"><ArrowLeft size={15}/> All sports</Link>
      <div className="sport-hero-content">
        <Reveal>
          <span className={`sport-hero-chip ${sport.color}`}><Icon size={18} strokeWidth={1.6}/> {sport.focus}</span>
          <h1 data-testid="sport-page-title">{sport.title}</h1>
          <p data-testid="sport-page-introduction">{sport.intro}</p>
          <div className="action-row"><Link to="/book-assessment" className="button primary" data-testid="sport-enquire">Enquire about a session <ArrowUpRight size={18}/></Link><Link to="/therapies" className="text-link" data-testid="sport-therapies-link">See our therapies</Link></div>
          <span className="editorial-label" data-testid="sport-draft-status">Programme draft · not individual advice</span>
        </Reveal>
        <Reveal className="sport-hero-media" y={30} delay={0.1}><img className="kenburns" src={sport.image} alt={sport.title}/></Reveal>
      </div>
    </div></section>
    <section className="container service-detail section-pad">
      <div className="service-main">
        <article><span className="eyebrow">WHY IT HELPS</span><h2>More than movement.</h2><p>Every session is calm, unhurried and adaptable — with soft equipment, safe spaces and warm support. Children can watch first, take breaks and try again, because confidence grows when a child feels safe and in control.</p></article>
        <article><h2>What your child might explore</h2><p>These are examples for discussion, shaped around your child’s comfort and preferences — not fixed targets or promised outcomes.</p><ul className="check-list">{sport.goals.map((goal,i)=><li key={goal} data-testid={`sport-goal-${i}`}><Check size={18}/>{goal}</li>)}</ul></article>
        <article><h2>Who it’s for</h2><p data-testid="sport-audience">{sport.audience}</p></article>
        <article className="sport-schedule" data-testid="sport-schedule"><span className="eyebrow">SAMPLE SESSIONS</span><h2>When it runs.</h2><p className="sport-ages" data-testid="sport-ages"><Clock size={15}/> {sport.ages}</p><ul className="schedule-list">{sport.schedule.map(([day,time],i)=><li key={i} data-testid={`sport-slot-${i}`}><span className="schedule-day">{day}</span><span className="schedule-time">{time}</span></li>)}</ul><span className="small muted">Sample schedule for illustration only · actual days, times and group sizes are confirmed by the center.</span></article>
        <article><h2>Safety, always first</h2><p>Activities use soft, padded equipment and are supervised throughout. Suitability, group size and any precautions are confirmed by the team after a conversation about your child.</p></article>
        <div className="review-panel" data-testid="sport-review-metadata"><ShieldCheck size={21}/><div><strong>Programme details pending</strong><p>Schedules, staffing and safety guidance are being finalised by the center. Verified details will be published before booking opens.</p></div></div>
      </div>
      <aside className="service-aside">
        <h2>Your next step</h2>
        <p>Talk through your questions and your child’s interests before deciding.</p>
        <Link className="button primary full-width" to="/book-assessment" data-testid="sport-aside-book">Request a session <ArrowUpRight size={16}/></Link>
        <div className="aside-detail"><MapPin size={19}/><div><strong>Sector 37C, Gurugram</strong><Link to="/contact" data-testid="sport-location-link">Contact & directions</Link></div></div>
        <div className="aside-detail"><CircleHelp size={19}/><div><strong>Availability & fees</strong><p>To be confirmed by the center. No slot is reserved by an enquiry.</p></div></div>
        <span className="small muted">Explore other activities below.</span>
      </aside>
    </section>
    <section className="sports-section section-pad top-zero"><div className="container"><h2 className="section-title" style={{marginBottom:'28px'}}>More ways to move</h2><SportsGrid items={sports.filter(s=>s.slug!==slug)}/></div></section>
    <FAQSection/><FinalCTA/>
  </>;
}
