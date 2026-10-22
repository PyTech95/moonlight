import { Link, useLocation, useParams } from 'react-router-dom';
import { ArrowUpRight, Phone, Mail, MapPin, ShieldCheck } from 'lucide-react';
import { useOrganization } from '../lib/context';
import {
  GettingStarted,
  FAQSection,
  FinalCTA,
  DirectorSection,
  TeamSection,
  CenterGallery,
} from '../components/PublicSections';

const pages = {
  '/about': {
    eyebrow: 'MOONLIGHT NEUROCARE',
    title: 'Every child brings their own light.',
    intro: 'A child-centred therapy and family-support center in Sector 37C, Gurugram.',
    sections: [
      [
        'What we offer',
        'Speech, occupational, ABA, sensory integration, yoga, neurodevelopmental, remedial, and music & play therapies, alongside indoor sports built around every child. The right mix for your child is decided together after an individual assessment.',
      ],
      [
        'How we work',
        'Sessions move at your child’s pace, with play, connection and plenty of room to pause. Families are kept closely involved, with clear goals and guidance you can use at home.',
      ],
      [
        'Your priorities matter',
        'Support should recognise your child’s strengths, respect their choices, and make room for the everyday experiences that matter to your family.',
      ],
    ],
  },
  '/our-approach': {
    eyebrow: 'OUR APPROACH',
    title: 'Listen first. Plan together.',
    intro: 'Individual goals, family involvement, and room to reflect.',
    sections: [
      [
        'Understand the everyday context',
        'A useful first conversation starts with your family’s priorities and your child’s preferences.',
      ],
      [
        'Respect all communication',
        'Speech, AAC, gestures, pictures and other communication preferences all deserve space.',
      ],
      [
        'Review, not promise',
        'Meaningful progress is individual. We do not promise cures, guaranteed speech or a fixed recovery timeline. Goals are reviewed with you regularly.',
      ],
    ],
  },
  '/for-parents': {
    eyebrow: 'YOUR FAMILY IS PART OF THE TEAM',
    title: 'Support doesn’t stop at the session.',
    intro: 'Shared goals, small everyday moments, and a clear conversation about what comes next.',
    sections: [
      [
        'One place for your day',
        'The parent portal shows your child’s upcoming sessions, shared goals, home-practice videos from the therapist and updates from the team.',
      ],
      [
        'Share what you notice',
        'Tell the team how a home activity went and ask for an adaptation when something isn’t working. No streaks, scores or comparison with other children.',
      ],
      [
        'Make changes together',
        'Request a reschedule or tell us about an absence from the portal. The team confirms every change with you.',
      ],
    ],
  },
  '/fees': {
    eyebrow: 'CLEAR INFORMATION BEFORE YOU DECIDE',
    title: 'Let’s talk about the practical details.',
    intro: 'You receive a clear, written fee breakdown before you commit to anything.',
    sections: [
      [
        'Assessment first',
        'Fees depend on the assessment and the plan agreed with your family. Ask the team for the assessment fee, session fees and any package options.',
      ],
      [
        'Cancellations and refunds',
        'Notice periods, cancellation charges, package validity and refund conditions are shared in writing before your first session.',
      ],
      [
        'Paying the center',
        'The team will explain the payment methods available when your plan is agreed.',
      ],
    ],
  },
  '/center': {
    eyebrow: 'PLAN A COMFORTABLE VISIT',
    title: 'A familiar first step in Gurugram.',
    intro: 'We are on the first floor, opposite Alpine Convent School, Sector 37C, Gurugram.',
    sections: [
      [
        'Access needs',
        'Tell us before your visit about step-free access, sensory needs, parking or anything else that would make arrival easier, and we’ll plan around it.',
      ],
      [
        'A first look',
        'Bright therapy rooms, a sensory movement gym and quiet spaces. See photos of the center on the About page.',
      ],
    ],
  },
  '/resources': {
    eyebrow: 'KNOWLEDGE WITH CARE',
    title: 'Helpful information for families.',
    intro: 'Practical next steps for families, without scores or labels.',
    sections: [
      [
        'Preparing for your first conversation',
        'Think about what matters to your child, their preferred communication, and the everyday activities you would like to discuss. You do not need to share detailed medical history in a public enquiry.',
      ],
      [
        'Guides from our team',
        'Practical guides for families are being added here. Until then, the team is happy to answer questions by phone or WhatsApp.',
      ],
    ],
  },
  '/international/families-visiting-india': {
    eyebrow: 'FAMILIES VISITING INDIA',
    title: 'Planning from afar. Staying connected.',
    intro: 'Planning a visit to our center in Sector 37C, Gurugram from outside India.',
    sections: [
      [
        'Start with an enquiry',
        'Share your intended dates, your time zone and any accessibility needs. The team will tell you what is possible and what to prepare before you travel.',
      ],
      [
        'Share documents securely',
        'Please don’t send medical histories through the public enquiry form. The team will tell you how to share reports securely.',
      ],
      [
        'After you return home',
        'Ask about home-practice guidance and how to stay in touch with the team once you are back.',
      ],
    ],
  },
  '/international/dubai-to-gurugram': {
    eyebrow: 'DUBAI TO GURUGRAM',
    title: 'Planning Child Therapy in Gurugram from Dubai',
    intro: 'A planning guide for families travelling from Dubai to our Gurugram center.',
    sections: [
      [
        'Before travel',
        'Contact the Gurugram center about suitability and availability before booking travel, so sessions can be planned around your dates.',
      ],
      [
        'Time zones',
        'Dubai uses Asia/Dubai (UTC+4); Gurugram uses Asia/Kolkata (UTC+5:30). India is 1 hour 30 minutes ahead. Confirm the zone on every appointment.',
      ],
      [
        'Documents and continuity',
        'Ask the team how documents can be shared securely and how home practice can continue after you return.',
      ],
    ],
  },
};
// Policy text should be reviewed by the center (and its lawyer) and kept up to date from the admin CMS.
const policies = {
  privacy: [
    'Privacy policy',
    'When you send an enquiry we collect the parent or guardian’s name, phone number, optional email, the support you are interested in, your country and how you prefer to be contacted. We use this only to respond to your enquiry and to arrange an assessment.',
    'If your family joins the center, the parent portal and app hold information the center shares with you about your child, such as goals, schedules and home-practice videos. Access is limited to your family, the care team working with your child and anyone you approve (for example, your child’s school), and every access is logged.',
    'We do not sell personal information. We use only the cookies needed to keep you signed in and to protect forms. Enquiry alerts reach the center team by email or WhatsApp.',
    'To see, correct or delete your information, or to withdraw consent, contact the center using the details on the contact page.',
  ],
  terms: [
    'Website terms',
    'Information on this website is general. It does not diagnose a child or replace an individual assessment by a qualified professional.',
    'Sending an assessment request does not confirm an appointment. The team will contact you to discuss suitability, fees and availability.',
    'Portal and app accounts are personal. Please keep your password and verification codes private.',
  ],
  accessibility: [
    'Accessibility',
    'This website supports keyboard navigation, visible focus, readable labels and reduced-motion preferences. Please tell us if you need information in another format.',
    'Contact the center to discuss physical access needs before visiting, and we’ll plan your arrival together.',
  ],
  'child-safeguarding': [
    'Child safeguarding',
    'Every child’s dignity, autonomy, communication preferences and privacy are respected. Agreeing to photos or publicity is never a condition of receiving support.',
    'Photos or videos of children are shared publicly only with written parental consent. Practice videos in the portal are private to the family and the care team.',
    'If you have a safeguarding concern, contact the center directly. If a child is in immediate danger, call 112.',
  ],
  complaints: [
    'Complaints & feedback',
    'If something hasn’t gone right, please tell us. Contact the center by phone, WhatsApp or email and we will respond as quickly as we can.',
    'This portal is not an emergency service. In an emergency, call 112.',
  ],
  cancellation: [
    'Appointment cancellations & refunds',
    'Cancellation notice periods, charges, package validity and refund rules are shared with you in writing before your first session.',
    'A change request from the parent portal is confirmed only when the team accepts it.',
  ],
  'online-classes': [
    'Online class terms',
    'Online sessions run on a secure video link shared by the center. Sessions are not recorded unless you agree in advance.',
    'Joining details, time zone, fees and refund rules are confirmed when you book.',
  ],
  consent: [
    'Understanding consent',
    'Treatment, sharing with a school or another professional, messages, marketing, session recording and public image use are separate choices. You can say yes to some and no to others.',
    'You can withdraw consent at any time from the parent portal or by contacting the center. Saying no to publicity never affects your child’s access to therapy.',
  ],
};

export default function Information() {
  const { pathname } = useLocation(),
    { policy } = useParams(),
    { organization: org } = useOrganization();
  if (pathname === '/faqs') return <FAQSection />;
  if (pathname === '/what-to-expect')
    return (
      <>
        <div className="container page-heading">
          <span className="eyebrow">YOUR FIRST VISIT</span>
          <h1 data-testid="what-expect-title">
            A little clarity.
            <br />A more comfortable beginning.
          </h1>
          <p>
            Ask about access needs, what to bring, fees and your child’s preferred way of communicating before your
            visit.
          </p>
        </div>
        <GettingStarted />
        <FinalCTA />
      </>
    );
  if (pathname === '/contact' || pathname.startsWith('/locations/'))
    return (
      <section className="container section-pad contact-page">
        <span className="eyebrow">LET’S FIND YOUR NEXT STEP</span>
        <h1 data-testid="contact-title">A conversation starts here.</h1>
        <p>Visit the center in Gurugram, or get in touch with your questions.</p>
        <div className="contact-grid">
          <div>
            <div className="contact-detail">
              <MapPin />
              <div>
                <h2>Moonlight Neurocare</h2>
                <p data-testid="contact-address">{org?.address || 'Contact information is loading.'}</p>
              </div>
            </div>
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
            <span className="eyebrow">SECTOR 37C · GURUGRAM</span>
            <h2>Opposite Alpine Convent School</h2>
            <p>
              Near Param Ultrasound. Ask the team about parking, building access and arrival arrangements before your
              visit.
            </p>
            <a
              data-testid="open-directions"
              target="_blank"
              rel="noreferrer"
              className="button outlined"
              href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(org?.address || 'Moonlight Neurocare Sector 37C Gurugram')}`}
            >
              Open directions <ArrowUpRight size={17} />
            </a>
            <span className="small muted">Opens Google Maps with directions to the center.</span>
          </div>
        </div>
      </section>
    );
  if (policy) {
    const data = policies[policy];
    if (!data) return <NotFound />;
    return (
      <section className="container section-pad policy-page">
        <span className="eyebrow">TRUST & TRANSPARENCY</span>
        <h1 data-testid="policy-title">{data[0]}</h1>
        {data.slice(1).map((paragraph, i) => (
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
  }
  const data = pages[pathname];
  if (!data) return <NotFound />;
  return (
    <>
      <section className="container page-heading">
        <span className="eyebrow">{data.eyebrow}</span>
        <h1 data-testid="information-title">{data.title}</h1>
        <p data-testid="information-introduction">{data.intro}</p>
      </section>
      <section className="container information-sections">
        {data.sections.map(([title, copy], i) => (
          <article key={title} data-testid={`information-section-${i}`}>
            <span className="section-number">0{i + 1}</span>
            <div>
              <h2>{title}</h2>
              <p>{copy}</p>
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
}
export const NotFound = () => (
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
