import { useState, useEffect } from 'react';
import { Star, ArrowUpRight, Quote } from 'lucide-react';
import { api } from '../lib/api';
import { Reveal, SectionHeading } from './PublicSections';

const FALLBACK_MAPS = 'https://www.google.com/search?q=Moonlight+Neurocare+-+speech+%26+Occupational+therapy+centre+in+gurgaon';

const GoogleG = () => <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true"><path fill="#4285F4" d="M45.12 24.5c0-1.56-.14-3.06-.4-4.5H24v8.51h11.84c-.51 2.75-2.06 5.08-4.39 6.64v5.52h7.11c4.16-3.83 6.56-9.47 6.56-16.17z"/><path fill="#34A853" d="M24 46c5.94 0 10.92-1.97 14.56-5.33l-7.11-5.52c-1.97 1.32-4.49 2.1-7.45 2.1-5.73 0-10.58-3.87-12.31-9.07H4.34v5.7A21.99 21.99 0 0 0 24 46z"/><path fill="#FBBC05" d="M11.69 28.18c-.44-1.32-.69-2.73-.69-4.18s.25-2.86.69-4.18v-5.7H4.34A21.99 21.99 0 0 0 2 24c0 3.55.85 6.91 2.34 9.88l7.35-5.7z"/><path fill="#EA4335" d="M24 10.75c3.23 0 6.13 1.11 8.41 3.29l6.31-6.31C34.91 4.18 29.93 2 24 2 15.4 2 7.96 6.95 4.34 14.12l7.35 5.7c1.73-5.2 6.58-9.07 12.31-9.07z"/></svg>;

const Stars = ({ n = 5 }) => <span className="rv-stars" aria-label={`${n} out of 5`}>{[0, 1, 2, 3, 4].map(i => <Star key={i} size={15} fill={i < Math.round(n) ? '#e8a23d' : 'none'} stroke={i < Math.round(n) ? '#e8a23d' : '#d9c9a6'} strokeWidth={1.6} />)}</span>;

export default function GoogleReviews() {
  const [data, setData] = useState(null);
  useEffect(() => {
    let on = true;
    api.get('/public/reviews').then(r => { if (on) setData(r.data); }).catch(() => { if (on) setData({ configured: false, reviews: [] }); });
    return () => { on = false; };
  }, []);
  const reviews = data?.reviews || [];
  const mapsUrl = data?.googleMapsUri || FALLBACK_MAPS;
  const description = data?.total
    ? `Rated ${Number(data.rating).toFixed(1)} out of 5 across ${data.total} Google reviews.`
    : 'Real reviews from families across Gurugram — straight from our Google profile.';
  const card = (r, i, dup) => <a key={`${dup ? 'd' : 'r'}-${i}`} className="review-card" href={r.authorUri || mapsUrl} target="_blank" rel="noreferrer" data-testid={dup ? undefined : `review-card-${i}`} aria-hidden={dup ? 'true' : undefined} tabIndex={dup ? -1 : undefined}>
    <div className="review-card-top"><Stars n={r.rating || 5} /><GoogleG /></div>
    <p className="review-text">{r.text}</p>
    <div className="review-author">{r.authorPhoto ? <img src={r.authorPhoto} alt={r.author || 'Reviewer'} referrerPolicy="no-referrer" loading="lazy" /> : <span className="review-avatar">{(r.author || 'G')[0]}</span>}<div><strong>{r.author || 'Google user'}</strong><span>{r.relativeTime || 'on Google'}</span></div></div>
  </a>;
  return <section className="reviews-section section-pad"><div className="container">
    <Reveal><SectionHeading id="reviews" eyebrow="LOVED BY FAMILIES" title="Kind words from our families." description={description} /></Reveal>
    {reviews.length ? <>
      <div className="reviews-marquee" data-testid="reviews-marquee"><div className="reviews-track">{reviews.map((r, i) => card(r, i, false))}{reviews.map((r, i) => card(r, i, true))}</div></div>
      <div className="reviews-cta"><a className="button outlined" href={mapsUrl} target="_blank" rel="noreferrer" data-testid="reviews-google-link">Read all reviews on Google <ArrowUpRight size={16} /></a></div>
    </> : <Reveal><div className="reviews-empty" data-testid="reviews-empty"><Quote size={26} /><p>Our Google reviews will appear here shortly. In the meantime, you can read them directly on our Google profile.</p><a className="button outlined" href={mapsUrl} target="_blank" rel="noreferrer" data-testid="reviews-google-link">Read our Google reviews <ArrowUpRight size={16} /></a></div></Reveal>}
    <p className="reviews-attribution">Reviews and profile information are provided by Google.</p>
  </div></section>;
}
