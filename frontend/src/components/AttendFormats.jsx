import { Link } from 'react-router-dom';
import { ArrowUpRight, Home, MapPin, Monitor } from 'lucide-react';

const FORMATS = [
  ['center', MapPin, 'At the center', 'Sessions in our sensory-friendly rooms at Sector 37C, Gurugram, with the full range of equipment.', 'Individual & small groups'],
  ['online', Monitor, 'Online', 'Live video sessions from home, through the secure family portal. A parent joins to practise together.', 'Secure in-app video room'],
  ['home', Home, 'At home', 'A therapist visits your home to work on everyday routines in the place they actually happen.', 'Gurugram service areas'],
];

export const AttendFormats = ({ compact = false }) => (
  <section className={`attend-formats ${compact ? 'compact' : ''}`} data-testid="attend-formats">
    <div className="attend-head">
      <span className="eyebrow">THREE WAYS TO ATTEND</span>
      <h2>Center · Online · At home</h2>
      <p>Which format suits your child is agreed with the therapist after assessment. Not every goal works well online, and home visits depend on the area.</p>
    </div>
    <div className="attend-grid">
      {FORMATS.map(([key, Icon, title, text, tag]) => (
        <article className={`attend-card ${key}`} key={key} data-testid={`attend-format-${key}`}>
          <Icon size={26} strokeWidth={1.5} />
          <h3>{title}</h3>
          <p>{text}</p>
          <span>{tag}</span>
        </article>
      ))}
    </div>
    <Link to="/book-assessment" className="text-link" data-testid="attend-formats-enquire">Ask which format fits your child <ArrowUpRight size={16} /></Link>
  </section>
);
