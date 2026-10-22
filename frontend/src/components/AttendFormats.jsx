import { Link } from 'react-router-dom';
import { ArrowUpRight, Home, MapPin, Monitor } from 'lucide-react';
import { useContent } from '../lib/cms';

const ICON = [MapPin, Monitor, Home];
const KEYS = ['center', 'online', 'home'];

export const AttendFormats = ({ compact = false }) => {
  const { t, items } = useContent();
  return (
    <section className={`attend-formats ${compact ? 'compact' : ''}`} data-testid="attend-formats">
      <div className="attend-head">
        <span className="eyebrow">{t('attend.eyebrow')}</span>
        <h2>{t('attend.title')}</h2>
        <p>{t('attend.text')}</p>
      </div>
      <div className="attend-grid">
        {items('attend.items').map(({ title, text, tag }, i) => {
          const Icon = ICON[i % ICON.length];
          const key = KEYS[i] || `format-${i}`;
          return (
            <article className={`attend-card ${key}`} key={key} data-testid={`attend-format-${key}`}>
              <Icon size={26} strokeWidth={1.5} />
              <h3>{title}</h3>
              <p>{text}</p>
              <span>{tag}</span>
            </article>
          );
        })}
      </div>
      <Link to="/book-assessment" className="text-link" data-testid="attend-formats-enquire">
        {t('attend.link')} <ArrowUpRight size={16} />
      </Link>
    </section>
  );
};
