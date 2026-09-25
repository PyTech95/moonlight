import { Quote } from 'lucide-react';
import { SectionHeading, Reveal } from './PublicSections';

const STORIES = [
  { q: 'The team never rushed us. They met our son where he was, and for the first time we felt understood as a family.', name: 'Priya & Aarav', rel: 'Parent, Gurugram', tone: 'sage' },
  { q: 'Small, gentle steps each week. What helped most was learning simple things we could try together at home.', name: 'Rahul S.', rel: 'Parent, Sector 38', tone: 'blush' },
  { q: 'Kind, patient and honest. They explained everything without labels or pressure — just support at our pace.', name: 'Meera K.', rel: 'Parent, DLF Phase 2', tone: 'sky' },
];

const initials = name => name.split(/[\s&]+/).filter(Boolean).slice(0,2).map(w=>w[0]).join('').toUpperCase();

export default function Testimonials(){
  return <section className="testimonials-section section-pad"><div className="container">
    <Reveal><SectionHeading eyebrow="FROM FAMILIES" title="Little moments, shared." description="A few words from families about what thoughtful, unhurried support has felt like for them."/></Reveal>
    <div className="testimonial-grid" data-testid="testimonial-grid">
      {STORIES.map((s,i)=><Reveal key={s.name} y={26} delay={Math.min(i*0.08,0.3)}>
        <figure className="testimonial-card" data-testid={`testimonial-${i}`}>
          <span className="testimonial-quote-icon"><Quote size={20}/></span>
          <blockquote>{s.q}</blockquote>
          <figcaption>
            <span className={`testimonial-avatar tone-${s.tone}`} aria-hidden="true">{initials(s.name)}</span>
            <span className="testimonial-meta"><strong>{s.name}</strong><span>{s.rel}</span></span>
          </figcaption>
        </figure>
      </Reveal>)}
    </div>
    <p className="testimonial-note" data-testid="testimonial-disclaimer">Illustrative family stories for this demo — not real client testimonials.</p>
  </div></section>;
}
