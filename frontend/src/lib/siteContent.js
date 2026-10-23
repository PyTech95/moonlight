// Every editable piece of public website content, with today's wording as the default.
// The admin "Website content" editor is generated from PAGES; public components read values through useContent().
// Field types: text · textarea · image · list (one item per line) · items (repeating groups with sub-fields).
import {
  MessageCircle, Hand, Sprout, Shapes, PersonStanding, Activity, BookOpen, Music, Footprints, Mountain,
  Sparkles, Dribbble, Waves, Heart, ShieldCheck, ClipboardList, CalendarCheck, GraduationCap, Home, Brain, Smile,
  Puzzle, Ear, Baby, Users,
} from 'lucide-react';
import { services, sports as SPORT_DEFAULTS, faqs as FAQ_DEFAULTS, HERO, DIRECTOR_PHOTO, CENTER_IMAGES, SPORTS_HERO, TEAM_DEFAULTS, DIRECTOR_QUALS, LOGO } from './content';
import { DEFAULT_AREAS, ZONES } from './areas';

export const ICONS = {
  MessageCircle, Hand, Sprout, Shapes, PersonStanding, Activity, BookOpen, Music, Footprints, Mountain, Sparkles,
  Dribbble, Waves, Heart, ShieldCheck, ClipboardList, CalendarCheck, GraduationCap, Home, Brain, Smile, Puzzle, Ear,
  Baby, Users,
};
export const ICON_NAMES = Object.keys(ICONS);
const iconName = (component) => Object.keys(ICONS).find((name) => ICONS[name] === component) || 'Sparkles';
export const COLORS = ['sage', 'peach', 'lavender', 'yellow'];

export const DEFAULT_THERAPIES = services.map(({ icon, ...rest }) => ({
  ...rest,
  icon: iconName(icon),
  seo_title: '',
  seo_description: '',
}));
export const DEFAULT_SPORTS = SPORT_DEFAULTS.map(({ icon, schedule, ...rest }) => ({
  ...rest,
  icon: iconName(icon),
  schedule: schedule.map(([day, time]) => `${day} | ${time}`),
}));
export const DEFAULT_FAQS = FAQ_DEFAULTS.map(([q, a]) => ({ q, a }));
export { DEFAULT_AREAS, ZONES };

const f = (key, label, type, value, extra = {}) => ({ key, label, type, default: value, ...extra });
const seo = (page, title, description) => ({
  label: 'Search engines (SEO)',
  fields: [
    f(`seo.${page}.title`, 'Page title in Google (50–60 characters)', 'text', title),
    f(`seo.${page}.description`, 'Description in Google (140–160 characters)', 'textarea', description),
  ],
});
const sectionsField = (key, value) =>
  f(key, 'Sections', 'items', value.map(([title, body]) => ({ title, body })), {
    fields: [
      { key: 'title', label: 'Heading', type: 'text' },
      { key: 'body', label: 'Text', type: 'textarea' },
    ],
  });
const infoPage = (id, label, path, eyebrow, title, intro, sections, seoTitle, seoDescription) => ({
  id,
  label,
  path,
  groups: [
    {
      label: 'Page',
      fields: [
        f(`${id}.eyebrow`, 'Small heading', 'text', eyebrow),
        f(`${id}.title`, 'Main heading', 'textarea', title),
        f(`${id}.intro`, 'Introduction', 'textarea', intro),
        sectionsField(`${id}.sections`, sections),
      ],
    },
    seo(id, seoTitle, seoDescription),
  ],
});
const policy = (id, title, paragraphs) => ({
  label: title,
  fields: [
    f(`policy.${id}.title`, 'Heading', 'text', title),
    f(`policy.${id}.paragraphs`, 'Paragraphs (one per line)', 'list', paragraphs, { multiline: true }),
  ],
});

export const PAGES = [
  {
    id: 'global',
    label: 'Header, footer & contact',
    path: '/',
    groups: [
      {
        label: 'Center details (used across the site and in Google)',
        fields: [
          f('global.name', 'Center name', 'text', 'Moonlight Neurocare'),
          f('global.logo', 'Logo', 'image', LOGO),
          f('global.location_short', 'Short location', 'text', 'Sector 37C, Gurugram'),
          f('global.street', 'Street address (for Google)', 'text', 'First Floor, Plot No. 26B, opposite Alpine Convent School, near Param Ultrasound, Sector 37C'),
          f('global.city', 'City', 'text', 'Gurugram'),
          f('global.postal_code', 'PIN code', 'text', '122001'),
          f('global.hours', 'Opening hours (shown on contact page)', 'text', '', { help: 'e.g. Monday–Saturday, 9 am – 7 pm. Leave empty to hide.' }),
          f('global.hours_schema', 'Opening hours for Google', 'text', '', { help: 'Format: Mo-Sa 09:00-19:00. Leave empty if unsure.' }),
          f('global.map_url', 'Google Maps link to the center', 'text', '', { help: 'Paste the "Share" link from your Google Business Profile.' }),
          f('global.geo_lat', 'Map latitude (optional)', 'text', ''),
          f('global.geo_lng', 'Map longitude (optional)', 'text', ''),
          f('global.social', 'Social and listing profiles (one link per line)', 'list', [], { help: 'Google Business Profile, Instagram, Facebook, YouTube, Practo, Justdial…' }),
        ],
      },
      {
        label: 'Top bar & menu',
        fields: [
          f('global.utility_tagline', 'Top bar tagline', 'text', 'Growing together, one step at a time'),
          f('global.nav', 'Menu links', 'items', [
            { label: 'About', to: '/about' },
            { label: 'Therapies', to: '/therapies' },
            { label: 'Home Tutor', to: '/home-tutor-gurugram' },
            { label: 'Sports', to: '/sports' },
            { label: 'Areas', to: '/locations' },
            { label: 'For Parents', to: '/for-parents' },
            { label: 'Contact', to: '/contact' },
          ], { fields: [{ key: 'label', label: 'Label', type: 'text' }, { key: 'to', label: 'Link (e.g. /about)', type: 'text' }] }),
          f('global.book_label', 'Booking button', 'text', 'Book an assessment'),
          f('global.login_label', 'Login link', 'text', 'Login'),
          f('global.whatsapp_message', 'Pre-filled WhatsApp message', 'textarea', 'Hi Moonlight Neurocare 🌙, I’d like to book an assessment for my child. Please share the next steps. Thank you!'),
        ],
      },
      {
        label: 'Footer',
        fields: [
          f('global.footer_tagline', 'Footer tagline', 'textarea', 'A little support.\nA world of possibility.'),
          f('global.footer_note', 'Footer note', 'text', 'Child development & family support · Sector 37C, Gurugram'),
          f('global.footer_explore', '“Explore” links', 'items', [
            { label: 'Our approach', to: '/our-approach' },
            { label: 'Our therapies', to: '/therapies' },
            { label: 'Home tutor in Gurugram', to: '/home-tutor-gurugram' },
            { label: 'What to expect', to: '/what-to-expect' },
            { label: 'Fees & payment process', to: '/fees' },
            { label: 'FAQs', to: '/faqs' },
          ], { fields: [{ key: 'label', label: 'Label', type: 'text' }, { key: 'to', label: 'Link', type: 'text' }] }),
          f('global.footer_family', '“Here for your family” links', 'items', [
            { label: 'Parent login', to: '/login' },
            { label: 'Areas we serve', to: '/locations' },
            { label: 'Families visiting India', to: '/international/families-visiting-india' },
            { label: 'Contact & directions', to: '/contact' },
            { label: 'Accessibility', to: '/policies/accessibility' },
            { label: 'Complaints & feedback', to: '/policies/complaints' },
          ], { fields: [{ key: 'label', label: 'Label', type: 'text' }, { key: 'to', label: 'Link', type: 'text' }] }),
          f('global.footer_motto', 'Footer motto', 'text', 'Thoughtful care. Shared possibilities.'),
        ],
      },
    ],
  },
  {
    id: 'home',
    label: 'Home page',
    path: '/',
    groups: [
      {
        label: 'Hero (top of the page)',
        help: 'The slideshow pictures are managed in Site images → Homepage hero slideshow.',
        fields: [
          f('home.hero.eyebrow', 'Small heading', 'text', 'CHILD DEVELOPMENT & FAMILY SUPPORT · GURUGRAM'),
          f('home.hero.title1', 'Headline, line 1', 'text', 'Support for your child.'),
          f('home.hero.title2', 'Headline, line 2 (coloured)', 'text', 'Guidance for your family.'),
          f('home.hero.text', 'Text under the headline', 'textarea', 'A little understanding can open up a world of possibility. Thoughtful support for communication, everyday skills and learning — at your child’s pace.'),
          f('home.hero.button2', 'Second button', 'text', 'Explore therapies'),
          f('home.hero.note', 'Small note under the buttons', 'text', 'Start with a request. We’ll confirm the next steps together.'),
          f('home.hero.image_alt', 'Picture description (for Google and screen readers)', 'text', 'Children and families at Moonlight Neurocare'),
          f('home.hero.default_image', 'Default hero picture (used when the slideshow is empty)', 'image', HERO),
        ],
      },
      {
        label: 'Three principles',
        fields: [
          f('home.principles', 'Principles', 'items', [
            { title: 'Your child, at the center', body: 'Individual needs. Meaningful goals.' },
            { title: 'Your family, part of the team', body: 'Listening, sharing and planning together.' },
            { title: 'Care that respects every child', body: 'Every voice. Every way of communicating.' },
          ], { fields: [{ key: 'title', label: 'Heading', type: 'text' }, { key: 'body', label: 'Text', type: 'text' }] }),
        ],
      },
      {
        label: '“What would you like support with?”',
        fields: [
          f('home.concern.eyebrow', 'Small heading', 'text', 'LET’S START WITH WHAT MATTERS TO YOU'),
          f('home.concern.title', 'Heading', 'text', 'What would you like support with?'),
          f('home.concern.text', 'Side text', 'text', 'No labels needed. Just a place to start.'),
          f('home.concern.options', 'Options', 'items', [
            { name: 'Communication', icon: 'MessageCircle', therapies: 'speech-therapy, music-play-therapy', sports: '' },
            { name: 'Sensory needs', icon: 'Shapes', therapies: 'sensory-integration-therapy, occupational-therapy', sports: 'trampoline-bounce' },
            { name: 'Everyday skills', icon: 'Hand', therapies: 'occupational-therapy', sports: 'balance-agility' },
            { name: 'Learning', icon: 'BookOpen', therapies: 'remedial-therapy', sports: '', link: '/home-tutor-gurugram' },
            { name: 'Social participation', icon: 'Sprout', therapies: 'music-play-therapy, speech-therapy', sports: 'ball-games' },
            { name: 'Movement & play', icon: 'Footprints', therapies: '', sports: 'roller-skating, soft-climbing, balance-agility, movement-play' },
            { name: 'I’m not sure', icon: 'MessageCircle', therapies: '', sports: '' },
          ], {
            fields: [
              { key: 'name', label: 'Label', type: 'text' },
              { key: 'icon', label: 'Icon', type: 'icon' },
              { key: 'therapies', label: 'Therapy URL names (comma separated)', type: 'text' },
              { key: 'sports', label: 'Sport URL names (comma separated)', type: 'text' },
              { key: 'link', label: 'Extra page link (optional, e.g. /home-tutor-gurugram)', type: 'text' },
            ],
          }),
          f('home.concern.result_title', 'Result heading', 'text', 'A few places to begin exploring'),
          f('home.concern.result_empty', 'Result heading when unsure', 'text', 'It’s okay not to know where to start.'),
          f('home.concern.result_note', 'Result note', 'text', 'This is information, not a screening or diagnosis. A qualified professional can discuss your child’s needs.'),
          f('home.concern.talk', 'Talk-to-team link', 'text', 'Talk to the team'),
        ],
      },
      {
        label: 'Therapies section',
        fields: [
          f('home.therapies.eyebrow', 'Small heading', 'text', 'DIFFERENT NEEDS. THOUGHTFUL SUPPORT.'),
          f('home.therapies.title', 'Heading', 'text', 'Care that meets your child where they are.'),
          f('home.therapies.text', 'Text', 'textarea', 'Explore our therapies. Find out what the next step could look like for your family.'),
          f('home.therapies.link', 'Link label', 'text', 'All therapies'),
        ],
      },
      {
        label: 'Home tutor band',
        fields: [
          f('home.tutor.eyebrow', 'Small heading', 'text', 'AT HOME, ACROSS GURUGRAM'),
          f('home.tutor.title', 'Heading', 'text', 'A home tutor who understands your child.'),
          f('home.tutor.text', 'Text', 'textarea', 'Our special educators come to your home to support reading, writing, attention and everyday skills — at your child’s pace, where they feel most at ease.'),
          f('home.tutor.button', 'Button', 'text', 'Home tutor & special educator'),
        ],
      },
      {
        label: 'Sports section',
        fields: [
          f('home.sports.eyebrow', 'Small heading', 'text', 'NEW · PLAYFUL MOVEMENT'),
          f('home.sports.title', 'Heading', 'text', 'Indoor sports, built around every child.'),
          f('home.sports.text', 'Text', 'textarea', 'Skating, climbing, balance and ball play — gentle, sensory-friendly movement that builds confidence, coordination and connection, at your child’s pace.'),
          f('home.sports.link', 'Link label', 'text', 'All sports'),
          f('home.sports.image', 'Feature picture', 'image', SPORTS_HERO),
          f('home.sports.feature_eyebrow', 'Feature small heading', 'text', 'MOVEMENT WITH MEANING'),
          f('home.sports.feature_title', 'Feature heading', 'text', 'Sport, the sensory-friendly way.'),
          f('home.sports.feature_text', 'Feature text', 'textarea', 'Every activity is calm, unhurried and adaptable. There’s always space to watch first, take a break, or try a different way — because confidence grows when a child feels safe.'),
          f('home.sports.points', 'Feature points', 'list', ['Soft equipment and safe, padded spaces', 'Led by your child’s comfort and pace', 'Building motor skills, focus and connection']),
        ],
      },
      {
        label: 'Getting started (4 steps)',
        fields: [
          f('steps.eyebrow', 'Small heading', 'text', 'A GENTLE FIRST STEP'),
          f('steps.title', 'Heading', 'text', 'You don’t have to figure it out alone.'),
          f('steps.text', 'Text', 'textarea', 'We begin with listening. The next steps are a conversation, not a commitment.'),
          f('steps.items', 'Steps', 'items', [
            { title: 'Let’s talk', body: 'Tell us what’s on your mind and what matters to your family.' },
            { title: 'Understand your child', body: 'Discuss an individual assessment and your child’s preferences.' },
            { title: 'Agree on a plan', body: 'Set meaningful goals together, with space for your questions.' },
            { title: 'Grow, reflect, adjust', body: 'Make room for sessions, family involvement and regular reviews.' },
          ], { fields: [{ key: 'title', label: 'Heading', type: 'text' }, { key: 'body', label: 'Text', type: 'textarea' }] }),
          f('steps.link', 'Link label', 'text', 'What to expect on your first visit'),
        ],
      },
      {
        label: 'Partnership with parents',
        fields: [
          f('home.partner.eyebrow', 'Small heading', 'text', 'TOGETHER, BEYOND THE SESSION'),
          f('home.partner.title', 'Heading', 'textarea', 'You know your child.\nWe value what you know.'),
          f('home.partner.text', 'Text', 'textarea', 'Your questions, observations and everyday moments matter. Shared goals and thoughtful home activities help keep your family part of the conversation.'),
          f('home.partner.points', 'Points', 'list', ['Goals shaped around everyday life', 'Space to share what’s working — and what isn’t', 'Updates that make sense to your family']),
          f('home.partner.link', 'Link label', 'text', 'Our partnership with parents'),
          f('home.partner.preview_label', 'Preview card label', 'text', 'Parent portal preview'),
        ],
      },
      {
        label: 'Areas section',
        fields: [
          f('home.areas.eyebrow', 'Small heading', 'text', 'SERVING GURUGRAM'),
          f('home.areas.title', 'Heading', 'text', 'Care within reach, across Gurugram.'),
          f('home.areas.text', 'Text', 'textarea', 'Families visit our Sector 37C center from all over the city — and our home tutors and therapists visit families across Gurugram.'),
          f('home.areas.link', 'Link label', 'text', 'See all areas'),
        ],
      },
      {
        label: 'Visit band',
        fields: [
          f('home.visit.eyebrow', 'Small heading', 'text', 'A PLACE TO BEGIN'),
          f('home.visit.title', 'Heading', 'text', 'Find us in Sector 37C, Gurugram.'),
          f('home.visit.text', 'Text', 'text', 'First floor, opposite Alpine Convent School · near Param Ultrasound'),
          f('home.visit.button', 'Button', 'text', 'Plan your visit'),
        ],
      },
      seo('home', 'Child Therapy Center in Gurugram | Speech, OT & Autism Support – Moonlight Neurocare', 'Moonlight Neurocare, Sector 37C Gurugram: speech, occupational, ABA, sensory integration and play therapy for children, plus home tutors. Book an assessment.'),
    ],
  },
  {
    id: 'shared',
    label: 'Shared sections',
    path: '/about',
    groups: [
      {
        label: 'Director',
        help: 'Shown on the home page and About page.',
        fields: [
          f('director.photo', 'Photo', 'image', DIRECTOR_PHOTO),
          f('director.eyebrow', 'Small heading', 'text', 'MEET THE DIRECTOR'),
          f('director.name', 'Name', 'text', 'Dr. Dharamveer'),
          f('director.suffix', 'After the name', 'text', '(PT)'),
          f('director.role', 'Role', 'text', 'Director & Pediatric Therapist · Moonlight Neurocare, Gurugram'),
          f('director.badge_number', 'Experience number', 'text', '5+'),
          f('director.badge_text', 'Experience text', 'text', 'years in pediatric therapy'),
          f('director.quals', 'Qualifications', 'list', DIRECTOR_QUALS),
          f('director.bio', 'Biography (one paragraph per line)', 'list', [
            'A child-centred, evidence-based pediatric therapist devoted to helping every child grow — at their own pace, and in their own way. With over five years of hands-on experience, Dr. Dharamveer supports children with sensory processing difficulties, developmental delays, behavioural and communication concerns, and challenges with everyday activities and participation.',
            'Through structured therapy, meaningful play and family-centred guidance, he helps children build independence, confidence and functional skills — keeping families closely involved and supported at every step of the journey. As Director, he leads a warm, professional and child-friendly space where progress is measured in each child’s own milestones.',
          ], { multiline: true }),
          f('director.focus', 'Focus areas', 'list', ['Sensory processing', 'Developmental delays', 'Behavioural support', 'Communication', 'Daily-living skills']),
          f('director.tagline', 'Tagline', 'text', 'Where every child shines.'),
        ],
      },
      {
        label: 'Ways to attend (center, online, home)',
        fields: [
          f('attend.eyebrow', 'Small heading', 'text', 'THREE WAYS TO ATTEND'),
          f('attend.title', 'Heading', 'text', 'Center · Online · At home'),
          f('attend.text', 'Text', 'textarea', 'Which format suits your child is agreed with the therapist after assessment. Not every goal works well online, and home visits depend on the area.'),
          f('attend.items', 'Formats', 'items', [
            { key: 'center', title: 'At the center', text: 'Sessions in our sensory-friendly rooms at Sector 37C, Gurugram, with the full range of equipment.', tag: 'Individual & small groups' },
            { key: 'online', title: 'Online', text: 'Live video sessions from home, through the secure family portal. A parent joins to practise together.', tag: 'Secure video room' },
            { key: 'home', title: 'At home', text: 'A therapist or special educator visits your home to work on everyday routines in the place they actually happen.', tag: 'Gurugram service areas' },
          ], { fields: [{ key: 'title', label: 'Heading', type: 'text' }, { key: 'text', label: 'Text', type: 'textarea' }, { key: 'tag', label: 'Label', type: 'text' }] }),
          f('attend.link', 'Link label', 'text', 'Ask which format fits your child'),
        ],
      },
      {
        label: 'FAQ section heading',
        help: 'The questions themselves are in Website content → FAQs.',
        fields: [
          f('faq.eyebrow', 'Small heading', 'text', 'A FEW THINGS YOU MAY BE WONDERING'),
          f('faq.title', 'Heading', 'text', 'Questions are always welcome.'),
          f('faq.text', 'Text', 'textarea', 'Every family starts somewhere different.\nWe’re here to help you find your next step.'),
          f('faq.link', 'Link label', 'text', 'Let’s talk'),
        ],
      },
      {
        label: 'Closing call-to-action band',
        fields: [
          f('cta.eyebrow', 'Small heading', 'text', 'WHEN YOU’RE READY, WE’RE HERE'),
          f('cta.title', 'Heading', 'text', 'Small steps. Shared possibilities.'),
          f('cta.text', 'Text', 'text', 'A conversation is a good place to begin.'),
          f('cta.button', 'Button', 'text', 'Book an assessment'),
        ],
      },
      {
        label: 'Center gallery (About page)',
        fields: [
          f('gallery.eyebrow', 'Small heading', 'text', 'A REAL PLACE, IN GURUGRAM'),
          f('gallery.title', 'Heading', 'text', 'Step inside our center.'),
          f('gallery.text', 'Text', 'textarea', 'A calm, purpose-built space in Sector 37C — bright sensory-therapy rooms, soft, safe equipment and plenty of room to move, play and feel at ease.'),
          f('gallery.items', 'Pictures', 'items', [
            { image: CENTER_IMAGES.exterior, caption: 'Our building · Sector 37C, Gurugram', alt: 'Moonlight Neurocare center building in Sector 37C, Gurugram' },
            { image: CENTER_IMAGES.gym, caption: 'The movement & sensory gym', alt: 'Bright indoor sensory movement gym with swings, trampoline and soft play' },
            { image: CENTER_IMAGES.swings, caption: 'Sensory integration room', alt: 'Occupational therapy sensory room with suspension swings and rope ladder' },
            { image: CENTER_IMAGES.room, caption: 'A quiet therapy space', alt: 'Calm therapy room with soft mats and sensory swings' },
          ], { fields: [{ key: 'image', label: 'Picture', type: 'image' }, { key: 'caption', label: 'Caption', type: 'text' }, { key: 'alt', label: 'Description', type: 'text' }] }),
        ],
      },
      {
        label: 'Team (About page)',
        help: 'Team members with photos are added in Site images → Team members; these cards show until then.',
        fields: [
          f('team.eyebrow', 'Small heading', 'text', 'THE TEAM BEHIND THE CARE'),
          f('team.title', 'Heading', 'text', 'A growing team, chosen with care.'),
          f('team.text', 'Text', 'textarea', 'Every therapist who joins Moonlight is chosen for both skill and heart. As our team grows, their profiles appear here.'),
          f('team.defaults', 'Team role cards', 'items', TEAM_DEFAULTS.map(({ name, role, bio, focus }) => ({ name, role, bio, focus })), {
            fields: [{ key: 'name', label: 'Name / title', type: 'text' }, { key: 'role', label: 'Role', type: 'text' }, { key: 'bio', label: 'Bio', type: 'textarea' }, { key: 'focus', label: 'Focus', type: 'text' }],
          }),
          f('team.join_title', 'Join-us heading', 'text', 'Are you a qualified pediatric therapist?'),
          f('team.join_text', 'Join-us text', 'text', 'We’d love to hear from thoughtful, child-first professionals who want to grow with us.'),
          f('team.join_button', 'Join-us button', 'text', 'Get in touch'),
        ],
      },
    ],
  },
  {
    id: 'therapies',
    label: 'Therapies pages',
    path: '/therapies',
    help: 'Each therapy (name, text, goals, picture) is edited in Website content → Therapies.',
    groups: [
      {
        label: 'All-therapies page',
        fields: [
          f('therapies.eyebrow', 'Small heading', 'text', 'SPACE FOR EVERY WAY OF GROWING'),
          f('therapies.title', 'Heading', 'textarea', 'Thoughtful support.\nIndividual possibilities.'),
          f('therapies.text', 'Text', 'textarea', 'Explore our therapies at your own pace, then talk to the team about your child.'),
        ],
      },
      {
        label: 'Single therapy page (shared wording)',
        fields: [
          f('therapy.eyebrow', 'Small heading', 'text', 'EVERYDAY CONNECTIONS. INDIVIDUAL GOALS.'),
          f('therapy.enquire', 'Main button', 'text', 'Enquire about an assessment'),
          f('therapy.label', 'Small note', 'text', 'General information · not individual advice'),
          f('therapy.audience_title', '“Who is it for” heading', 'text', 'Who might want to explore this?'),
          f('therapy.conversation_title', 'Second heading', 'text', 'A conversation before a plan'),
          f('therapy.conversation_text', 'Second text', 'textarea', 'The first step is to understand your priorities, your child’s preferences and what participation looks like in everyday life. A qualified professional decides what assessment is appropriate and discusses the findings with you.'),
          f('therapy.goals_title', 'Goals heading', 'text', 'What meaningful goals could look like'),
          f('therapy.goals_text', 'Goals text', 'text', 'Goals are agreed individually. These are examples for discussion, not promised outcomes.'),
          f('therapy.role_title', 'Family heading', 'text', 'Your role, and your child’s voice'),
          f('therapy.role_text', 'Family text', 'textarea', 'Share what matters to your family, what your child enjoys, and which approaches feel comfortable. Communication may include speech, AAC, gestures or other preferences. Harmless self-regulation and a child’s autonomy are respected.'),
          f('therapy.sessions_title', 'Sessions heading', 'text', 'Sessions and progress reviews'),
          f('therapy.sessions_text', 'Sessions text', 'textarea', 'Format, frequency and suitability are agreed after assessment. Ask about family involvement, home activities and how goals will be reviewed. There is no fixed recovery timeline or guaranteed outcome.'),
          f('therapy.aside_title', 'Side box heading', 'text', 'Your next step'),
          f('therapy.aside_text', 'Side box text', 'text', 'Talk through your questions before making a decision.'),
          f('therapy.aside_button', 'Side box button', 'text', 'Request an assessment'),
          f('therapy.fees_title', 'Fees heading', 'text', 'Availability & fees'),
          f('therapy.fees_text', 'Fees text', 'text', 'Shared by the team after your first conversation. An enquiry does not reserve a slot.'),
        ],
      },
      seo('therapies', 'Child Therapies in Gurugram | Speech, OT, ABA & Sensory – Moonlight', 'Speech, occupational, ABA, sensory integration, yoga, neurodevelopmental, remedial and music & play therapy for children at Moonlight Neurocare, Sector 37C Gurugram.'),
    ],
  },
  {
    id: 'sports',
    label: 'Sports pages',
    path: '/sports',
    help: 'Each activity is edited in Website content → Sports.',
    groups: [
      {
        label: 'All-sports page',
        fields: [
          f('sports.eyebrow', 'Small heading', 'text', 'MOVEMENT, PLAY & CONFIDENCE'),
          f('sports.title', 'Heading', 'textarea', 'Indoor sports.\nEvery child, every pace.'),
          f('sports.text', 'Text', 'textarea', 'Gentle, sensory-friendly movement — skating, climbing, balance and ball play — designed to build confidence, coordination and connection. Explore the activities, then talk to the team about your child.'),
        ],
      },
      {
        label: 'Single sport page (shared wording)',
        fields: [
          f('sport.enquire', 'Main button', 'text', 'Enquire about a session'),
          f('sport.why_eyebrow', 'Small heading', 'text', 'WHY IT HELPS'),
          f('sport.why_title', 'Heading', 'text', 'More than movement.'),
          f('sport.why_text', 'Text', 'textarea', 'Every session is calm, unhurried and adaptable — with soft equipment, safe spaces and warm support. Children can watch first, take breaks and try again, because confidence grows when a child feels safe and in control.'),
          f('sport.goals_title', 'Goals heading', 'text', 'What your child might explore'),
          f('sport.goals_text', 'Goals text', 'text', 'These are examples, shaped around your child’s comfort and preferences — not fixed targets or promised outcomes.'),
          f('sport.audience_title', '“Who it’s for” heading', 'text', 'Who it’s for'),
          f('sport.schedule_eyebrow', 'Timetable small heading', 'text', 'SESSIONS'),
          f('sport.schedule_title', 'Timetable heading', 'text', 'When it runs.'),
          f('sport.schedule_note', 'Timetable note', 'text', 'Please confirm days and times with the team when you enquire.'),
          f('sport.safety_title', 'Safety heading', 'text', 'Safety, always first'),
          f('sport.safety_text', 'Safety text', 'textarea', 'Activities use soft, padded equipment and are supervised throughout. Suitability, group size and any precautions are confirmed by the team after a conversation about your child.'),
          f('sport.more_title', '“More sports” heading', 'text', 'More ways to move'),
        ],
      },
      seo('sports', 'Indoor Sports for Children in Gurugram | Sensory-Friendly – Moonlight', 'Roller skating, soft climbing, trampoline, balance and ball games for children, adapted for sensory needs, at Moonlight Neurocare, Sector 37C Gurugram.'),
    ],
  },
  {
    id: 'hometutor',
    label: 'Home tutor page',
    path: '/home-tutor-gurugram',
    groups: [
      {
        label: 'Top of page',
        fields: [
          f('hometutor.eyebrow', 'Small heading', 'text', 'HOME TUTOR & SPECIAL EDUCATOR · GURUGRAM'),
          f('hometutor.title', 'Main heading', 'textarea', 'Home tutor for children with special needs in Gurugram'),
          f('hometutor.lead', 'Opening paragraph (keep the direct answer first)', 'textarea', 'A trained special educator from Moonlight Neurocare comes to your home to support your child’s learning — reading, writing, numbers, attention and everyday skills — at their own pace, in the place they feel most comfortable. Speech and occupational therapy home visits are also available in many Gurugram areas.'),
          f('hometutor.button', 'Main button', 'text', 'Book a home assessment'),
          f('hometutor.image', 'Picture', 'image', ''),
        ],
      },
      {
        label: 'At a glance (fact box)',
        fields: [
          f('hometutor.facts', 'Facts', 'items', [
            { label: 'Who it’s for', value: 'Children with learning difficulties, autism, ADHD, speech and language delays or developmental delays' },
            { label: 'Who visits', value: 'A special educator from the Moonlight team, guided by our therapists' },
            { label: 'Where', value: 'At your home, across the Gurugram areas listed below' },
            { label: 'Session plan', value: 'Agreed after the first home assessment' },
            { label: 'Fees', value: 'Shared in writing after the assessment, before you commit' },
            { label: 'How to start', value: 'Call, WhatsApp or book a home assessment online' },
          ], { fields: [{ key: 'label', label: 'Label', type: 'text' }, { key: 'value', label: 'Answer', type: 'text' }] }),
        ],
      },
      {
        label: 'What we help with',
        fields: [
          f('hometutor.helps_title', 'Heading', 'text', 'What a home tutor works on'),
          f('hometutor.helps', 'Points', 'list', ['Reading, writing and number skills', 'Attention, sitting tolerance and finishing tasks', 'Following instructions and daily routines', 'Homework and school readiness', 'Communication and social skills in everyday play', 'Fine-motor skills for writing']),
          f('hometutor.difference_title', 'Difference heading', 'text', 'Not regular tuition'),
          f('hometutor.difference_text', 'Difference text', 'textarea', 'Regular tuition follows the school syllabus. A special educator first understands how your child learns — attention, language, motor and sensory needs — and then teaches skills step by step, with small goals you agree together.'),
        ],
      },
      {
        label: 'How it works',
        fields: [
          f('hometutor.steps_title', 'Heading', 'text', 'How it works'),
          f('hometutor.steps', 'Steps', 'items', [
            { title: 'A first conversation', body: 'Tell us about your child, their school and what feels hard right now.' },
            { title: 'Home assessment visit', body: 'The educator meets your child at home and understands strengths, needs and routines.' },
            { title: 'A plan with you', body: 'Clear, small goals agreed with you — and with the school if you wish.' },
            { title: 'Regular sessions and reviews', body: 'Sessions at home, practice ideas in the parent portal, and regular progress reviews.' },
          ], { fields: [{ key: 'title', label: 'Heading', type: 'text' }, { key: 'body', label: 'Text', type: 'textarea' }] }),
        ],
      },
      {
        label: 'School support & areas',
        fields: [
          f('hometutor.school_title', 'School heading', 'text', 'Working with your child’s school'),
          f('hometutor.school_text', 'School text', 'textarea', 'With your permission, goals and strategies can be shared with your child’s school through our secure school portal. Ask us whether shadow-teacher support is possible for your child’s school.'),
          f('hometutor.areas_title', 'Areas heading', 'text', 'Areas we cover for home visits'),
          f('hometutor.areas_text', 'Areas text', 'textarea', 'Home visits depend on distance and timing. These are the areas we serve — call us to check your sector.'),
        ],
      },
      {
        label: 'Questions parents ask',
        fields: [
          f('hometutor.faqs', 'Questions', 'items', [
            { q: 'What does a home tutor for a special child do?', a: 'A special educator works one-to-one with your child at home on learning and everyday skills, using methods matched to how your child learns best — not regular tuition that only follows the syllabus.' },
            { q: 'How is this different from regular home tuition?', a: 'Regular tuition follows school homework. A special educator first understands your child’s learning profile (attention, language, motor and sensory needs) and then teaches skills step by step, with goals you agree together.' },
            { q: 'Which areas of Gurugram do you cover?', a: 'Families across Gurugram, from New Gurugram and the Dwarka Expressway to Sohna Road and DLF. Distance and timing affect availability, so please call to check your sector.' },
            { q: 'How often are sessions?', a: 'This is agreed after the home assessment, based on your child’s needs and your family’s routine.' },
            { q: 'How much does a home tutor cost?', a: 'Fees depend on the plan and are shared in writing after the assessment, before you commit.' },
            { q: 'Do parents need to be at home?', a: 'Yes, a parent or trusted adult should be at home during sessions. You’ll also get short activities to practise between visits.' },
            { q: 'Can you work with my child’s school?', a: 'Yes, with your permission. Goals and strategies can be shared with the school through our secure school portal.' },
            { q: 'Which language are sessions in?', a: 'Tell us your child’s preferred language — Hindi, English or both — when you enquire, and we’ll plan around it.' },
          ], { fields: [{ key: 'q', label: 'Question', type: 'text' }, { key: 'a', label: 'Answer', type: 'textarea' }] }),
        ],
      },
      {
        label: 'Closing band',
        fields: [
          f('hometutor.cta_title', 'Heading', 'text', 'Book a home assessment'),
          f('hometutor.cta_text', 'Text', 'text', 'Tell us a little about your child. We’ll call back to plan the first visit.'),
        ],
      },
      seo('hometutor', 'Home Tutor & Special Educator at Home in Gurugram | Moonlight', 'Special educator home tutor for children with autism, ADHD, learning or speech delays across Gurugram. Home assessment, clear goals, parent guidance. Call Moonlight Neurocare.'),
    ],
  },
  {
    id: 'locations',
    label: 'Areas pages',
    path: '/locations',
    help: 'The list of areas is edited in Website content → Areas.',
    groups: [
      {
        label: 'All areas page',
        fields: [
          f('locations.eyebrow', 'Small heading', 'text', 'AREAS WE SERVE · GURUGRAM'),
          f('locations.title', 'Heading', 'textarea', 'Child development therapy for families\nacross Gurugram.'),
          f('locations.text', 'Text', 'textarea', 'From our sensory-friendly center in Sector 37C, we support children and families from every corner of Gurugram and nearby towns within about 20 km — at the center, online, or at home.'),
          f('locations.zones_title', 'Zones heading', 'text', 'Find your sector'),
        ],
      },
      {
        label: 'Area page (shared wording)',
        help: 'Use {area} where the area name should appear.',
        fields: [
          f('area.title', 'Heading', 'text', 'Child development therapy in {area}, Gurugram.'),
          f('area.lead', 'Opening text', 'textarea', 'Families in {area} choose Moonlight Neurocare for warm, child-first therapy and home tutoring.'),
          f('area.therapies_title', 'Therapies heading', 'text', 'How we support children in {area}.'),
          f('area.home_visit_title', 'Home visit heading', 'text', 'Home tutor and therapy visits in {area}'),
          f('area.home_visit_text', 'Home visit text', 'textarea', 'Our special educators and therapists can also visit families in {area} at home, depending on timing. Call us to check availability for your sector.'),
          f('area.why', 'Why families choose us', 'items', [
            { title: 'Child-first & unhurried', body: 'Sessions move at your child’s pace — no pressure, plenty of play and connection.' },
            { title: 'A calm sensory center', body: 'Bright, purpose-built therapy rooms and a sensory gym designed to feel safe and welcoming.' },
            { title: 'Families involved', body: 'We partner with parents at every step, with clear guidance you can use at home.' },
          ], { fields: [{ key: 'title', label: 'Heading', type: 'text' }, { key: 'body', label: 'Text', type: 'textarea' }] }),
        ],
      },
      seo('locations', 'Child Therapy Across Gurugram – All Sectors We Serve | Moonlight', 'Speech, occupational, ABA and sensory therapy plus home tutors for families in every Gurugram sector and nearby towns within 20 km of Sector 37C.'),
    ],
  },
  infoPage('about', 'About', '/about', 'MOONLIGHT NEUROCARE', 'Every child brings their own light.', 'A child-centred therapy and family-support center in Sector 37C, Gurugram.', [
    ['What we offer', 'Speech, occupational, ABA, sensory integration, yoga, neurodevelopmental, remedial, and music & play therapies, home tutors, and indoor sports built around every child. The right mix for your child is decided together after an individual assessment.'],
    ['How we work', 'Sessions move at your child’s pace, with play, connection and plenty of room to pause. Families are kept closely involved, with clear goals and guidance you can use at home.'],
    ['Your priorities matter', 'Support should recognise your child’s strengths, respect their choices, and make room for the everyday experiences that matter to your family.'],
  ], 'About Moonlight Neurocare | Child Development Center, Gurugram', 'Meet Moonlight Neurocare in Sector 37C, Gurugram: a child-first therapy center led by Dr. Dharamveer (PT), with families involved at every step.'),
  infoPage('our-approach', 'Our approach', '/our-approach', 'OUR APPROACH', 'Listen first. Plan together.', 'Individual goals, family involvement, and room to reflect.', [
    ['Understand the everyday context', 'A useful first conversation starts with your family’s priorities and your child’s preferences.'],
    ['Respect all communication', 'Speech, AAC, gestures, pictures and other communication preferences all deserve space.'],
    ['Review, not promise', 'Meaningful progress is individual. We do not promise cures, guaranteed speech or a fixed recovery timeline. Goals are reviewed with you regularly.'],
  ], 'Our Approach to Child Therapy | Moonlight Neurocare Gurugram', 'Listen first, plan together: how Moonlight Neurocare sets individual goals with families and reviews progress honestly.'),
  infoPage('for-parents', 'For parents', '/for-parents', 'YOUR FAMILY IS PART OF THE TEAM', 'Support doesn’t stop at the session.', 'Shared goals, small everyday moments, and a clear conversation about what comes next.', [
    ['One place for your day', 'The parent portal shows your child’s upcoming sessions, shared goals, home-practice videos from the therapist and updates from the team.'],
    ['Share what you notice', 'Tell the team how a home activity went and ask for an adaptation when something isn’t working. No streaks, scores or comparison with other children.'],
    ['Make changes together', 'Request a reschedule or tell us about an absence from the portal. The team confirms every change with you.'],
  ], 'For Parents | Parent Portal & Home Practice – Moonlight Neurocare', 'How parents stay involved at Moonlight Neurocare: shared goals, home-practice videos and updates in the secure parent portal.'),
  infoPage('fees', 'Fees', '/fees', 'CLEAR INFORMATION BEFORE YOU DECIDE', 'Let’s talk about the practical details.', 'You receive a clear, written fee breakdown before you commit to anything.', [
    ['Assessment first', 'Fees depend on the assessment and the plan agreed with your family. Ask the team for the assessment fee, session fees and any package options.'],
    ['Cancellations and refunds', 'Notice periods, cancellation charges, package validity and refund conditions are shared in writing before your first session.'],
    ['Paying the center', 'The team will explain the payment methods available when your plan is agreed.'],
  ], 'Fees & Payment | Moonlight Neurocare Gurugram', 'How fees work at Moonlight Neurocare: assessment first, a written fee breakdown and clear cancellation terms before you commit.'),
  infoPage('center', 'Visiting the center', '/center', 'PLAN A COMFORTABLE VISIT', 'A familiar first step in Gurugram.', 'We are on the first floor, opposite Alpine Convent School, Sector 37C, Gurugram.', [
    ['Access needs', 'Tell us before your visit about step-free access, sensory needs, parking or anything else that would make arrival easier, and we’ll plan around it.'],
    ['A first look', 'Bright therapy rooms, a sensory movement gym and quiet spaces. See photos of the center on the About page.'],
  ], 'Visit Our Center in Sector 37C, Gurugram | Moonlight Neurocare', 'Plan your visit to Moonlight Neurocare, first floor, opposite Alpine Convent School, Sector 37C, Gurugram.'),
  infoPage('resources', 'Resources', '/resources', 'KNOWLEDGE WITH CARE', 'Helpful information for families.', 'Practical next steps for families, without scores or labels.', [
    ['Preparing for your first conversation', 'Think about what matters to your child, their preferred communication, and the everyday activities you would like to discuss. You do not need to share detailed medical history in a public enquiry.'],
    ['Guides from our team', 'Practical guides for families are being added here. Until then, the team is happy to answer questions by phone or WhatsApp.'],
  ], 'Resources for Parents | Moonlight Neurocare Gurugram', 'Practical guides for families preparing for child therapy in Gurugram.'),
  infoPage('intl-visiting', 'Families visiting India', '/international/families-visiting-india', 'FAMILIES VISITING INDIA', 'Planning from afar. Staying connected.', 'Planning a visit to our center in Sector 37C, Gurugram from outside India.', [
    ['Start with an enquiry', 'Share your intended dates, your time zone and any accessibility needs. The team will tell you what is possible and what to prepare before you travel.'],
    ['Share documents securely', 'Please don’t send medical histories through the public enquiry form. The team will tell you how to share reports securely.'],
    ['After you return home', 'Ask about home-practice guidance and how to stay in touch with the team once you are back.'],
  ], 'Child Therapy in Gurugram for Families Visiting India | Moonlight', 'Planning child therapy in Gurugram from abroad: dates, documents and staying connected with the Moonlight Neurocare team.'),
  infoPage('intl-dubai', 'Dubai to Gurugram', '/international/dubai-to-gurugram', 'DUBAI TO GURUGRAM', 'Planning Child Therapy in Gurugram from Dubai', 'A planning guide for families travelling from Dubai to our Gurugram center.', [
    ['Before travel', 'Contact the Gurugram center about suitability and availability before booking travel, so sessions can be planned around your dates.'],
    ['Time zones', 'Dubai uses Asia/Dubai (UTC+4); Gurugram uses Asia/Kolkata (UTC+5:30). India is 1 hour 30 minutes ahead. Confirm the zone on every appointment.'],
    ['Documents and continuity', 'Ask the team how documents can be shared securely and how home practice can continue after you return.'],
  ], 'Child Therapy in Gurugram from Dubai | Moonlight Neurocare', 'A planning guide for Dubai families travelling to Gurugram for child therapy at Moonlight Neurocare.'),
  {
    id: 'other',
    label: 'Contact, booking & first visit',
    path: '/contact',
    groups: [
      {
        label: 'Contact page',
        fields: [
          f('contact.eyebrow', 'Small heading', 'text', 'LET’S FIND YOUR NEXT STEP'),
          f('contact.title', 'Heading', 'text', 'A conversation starts here.'),
          f('contact.text', 'Text', 'text', 'Visit the center in Gurugram, or get in touch with your questions.'),
          f('contact.directions_title', 'Directions heading', 'text', 'Opposite Alpine Convent School'),
          f('contact.directions_text', 'Directions text', 'textarea', 'Near Param Ultrasound. Ask the team about parking, building access and arrival arrangements before your visit.'),
          f('contact.directions_button', 'Directions button', 'text', 'Open directions'),
        ],
      },
      seo('contact', 'Contact Moonlight Neurocare | Sector 37C, Gurugram', 'Call, WhatsApp or visit Moonlight Neurocare, first floor, opposite Alpine Convent School, Sector 37C, Gurugram.'),
      {
        label: 'Book an assessment page',
        fields: [
          f('book.eyebrow', 'Small heading', 'text', 'LET’S TAKE THE FIRST STEP, TOGETHER'),
          f('book.title', 'Heading', 'textarea', 'Tell us a little.\nWe’ll listen.'),
          f('book.text', 'Text', 'text', 'Ask about an assessment, explore a therapy, or simply find out where to begin.'),
          f('book.explain_title', 'Note heading', 'text', 'A request, not a reservation.'),
          f('book.explain_text', 'Note text', 'text', 'The team will discuss your needs, availability and fees before confirming an appointment.'),
          f('book.success', 'Thank-you message', 'textarea', 'Thank you. The team will contact you at your preferred time to talk through next steps. This is a request, not a confirmed appointment.'),
        ],
      },
      seo('book', 'Book a Child Assessment in Gurugram | Moonlight Neurocare', 'Request an assessment for speech, occupational, ABA, sensory or home-tutor support at Moonlight Neurocare, Sector 37C, Gurugram.'),
      {
        label: 'What to expect page',
        fields: [
          f('expect.eyebrow', 'Small heading', 'text', 'YOUR FIRST VISIT'),
          f('expect.title', 'Heading', 'textarea', 'A little clarity.\nA more comfortable beginning.'),
          f('expect.text', 'Text', 'textarea', 'Ask about access needs, what to bring, fees and your child’s preferred way of communicating before your visit.'),
        ],
      },
      seo('expect', 'Your First Visit | What to Expect – Moonlight Neurocare', 'What happens at your child’s first visit to Moonlight Neurocare in Gurugram, and how to prepare.'),
      seo('faqs', 'FAQs | Child Therapy in Gurugram – Moonlight Neurocare', 'Answers to common questions about assessments, fees, communication and parent involvement at Moonlight Neurocare.'),
    ],
  },
  {
    id: 'policies',
    label: 'Policies',
    path: '/policies/privacy',
    help: 'Please have these reviewed by the center (and a lawyer for the privacy policy).',
    groups: [
      policy('privacy', 'Privacy policy', [
        'When you send an enquiry we collect the parent or guardian’s name, phone number, optional email, the support you are interested in, your country and how you prefer to be contacted. We use this only to respond to your enquiry and to arrange an assessment.',
        'If your family joins the center, the parent portal and app hold information the center shares with you about your child, such as goals, schedules and home-practice videos. Access is limited to your family, the care team working with your child and anyone you approve (for example, your child’s school), and every access is logged.',
        'We do not sell personal information. We use only the cookies needed to keep you signed in and to protect forms. Enquiry alerts reach the center team by email or WhatsApp.',
        'The Moonlight Neurocare app for Android opens this same portal. It uses the camera and microphone only when you choose to record or upload a practice video or join an online session, and it saves files you download (such as invoices) to your phone. It has no advertising and no tracking.',
        'Online payments are handled by Razorpay, and online sessions run on Daily.co video rooms; they receive only what is needed to take the payment or run the call. One-time sign-in codes are sent by WhatsApp or email.',
        'Information is sent over encrypted connections and kept on the center’s own server. Invoices and clinical records are kept for as long as the law requires.',
        'To see, correct or delete your information, or to withdraw consent, contact the center using the details on the contact page. To delete your portal and app account, see moonlightneurocare.com/policies/account-deletion.',
      ]),
      policy('terms', 'Website terms', [
        'Information on this website is general. It does not diagnose a child or replace an individual assessment by a qualified professional.',
        'Sending an assessment request does not confirm an appointment. The team will contact you to discuss suitability, fees and availability.',
        'Portal and app accounts are personal. Please keep your password and verification codes private.',
      ]),
      policy('accessibility', 'Accessibility', [
        'This website supports keyboard navigation, visible focus, readable labels and reduced-motion preferences. Please tell us if you need information in another format.',
        'Contact the center to discuss physical access needs before visiting, and we’ll plan your arrival together.',
      ]),
      policy('child-safeguarding', 'Child safeguarding', [
        'Every child’s dignity, autonomy, communication preferences and privacy are respected. Agreeing to photos or publicity is never a condition of receiving support.',
        'Photos or videos of children are shared publicly only with written parental consent. Practice videos in the portal are private to the family and the care team.',
        'If you have a safeguarding concern, contact the center directly. If a child is in immediate danger, call 112.',
      ]),
      policy('complaints', 'Complaints & feedback', [
        'If something hasn’t gone right, please tell us. Contact the center by phone, WhatsApp or email and we will respond as quickly as we can.',
        'This portal is not an emergency service. In an emergency, call 112.',
      ]),
      policy('cancellation', 'Appointment cancellations & refunds', [
        'Cancellation notice periods, charges, package validity and refund rules are shared with you in writing before your first session.',
        'A change request from the parent portal is confirmed only when the team accepts it.',
      ]),
      policy('online-classes', 'Online class terms', [
        'Online sessions run on a secure video link shared by the center. Sessions are not recorded unless you agree in advance.',
        'Joining details, time zone, fees and refund rules are confirmed when you book.',
      ]),
      policy('account-deletion', 'Deleting your account', [
        'You can ask for your Moonlight Neurocare portal and app account to be deleted at any time.',
        'In the app or portal: sign in, open More, then Account & privacy (Account security for staff), and choose Delete my account. Or ask the center by phone, WhatsApp or email using the details on the contact page.',
        'The center completes the request within 7 days and confirms by email. Your sign-in, password, phone number, signed-in devices and links to your child’s record are removed, and the account can no longer be used.',
        'Some records must be kept by law or for your child’s care, such as invoices, payment receipts and clinical notes. They are kept with the center for the period the law requires and then deleted. To ask for any other information to be deleted, contact the center.',
      ]),
      policy('consent', 'Understanding consent', [
        'Treatment, sharing with a school or another professional, messages, marketing, session recording and public image use are separate choices. You can say yes to some and no to others.',
        'You can withdraw consent at any time from the parent portal or by contacting the center. Saying no to publicity never affects your child’s access to therapy.',
      ]),
    ],
  },
];

export const POLICY_IDS = ['privacy', 'terms', 'accessibility', 'child-safeguarding', 'complaints', 'cancellation', 'online-classes', 'consent', 'account-deletion'];
export const INFO_PATHS = {
  '/about': 'about',
  '/our-approach': 'our-approach',
  '/for-parents': 'for-parents',
  '/fees': 'fees',
  '/center': 'center',
  '/resources': 'resources',
  '/international/families-visiting-india': 'intl-visiting',
  '/international/dubai-to-gurugram': 'intl-dubai',
};

export const FIELDS = PAGES.flatMap((page) => page.groups.flatMap((group) => group.fields.map((field) => ({ ...field, page: page.id }))));
export const DEFAULTS = Object.fromEntries(FIELDS.map((field) => [field.key, field.default]));

// Lists (collections) edited as whole lists, with the item fields the admin editor shows.
export const COLLECTIONS = {
  therapies: {
    label: 'Therapies',
    defaults: DEFAULT_THERAPIES,
    title: (item) => item.title,
    path: (item) => `/therapies/${item.slug}`,
    fields: [
      { key: 'title', label: 'Name', type: 'text' },
      { key: 'slug', label: 'URL name (lowercase-with-hyphens)', type: 'text' },
      { key: 'short', label: 'One-line summary', type: 'text' },
      { key: 'intro', label: 'Introduction', type: 'textarea' },
      { key: 'audience', label: 'Who it’s for', type: 'textarea' },
      { key: 'goals', label: 'Example goals (one per line)', type: 'list' },
      { key: 'image', label: 'Picture', type: 'image' },
      { key: 'icon', label: 'Icon', type: 'icon' },
      { key: 'color', label: 'Colour', type: 'color' },
      { key: 'seo_title', label: 'Google title (optional)', type: 'text' },
      { key: 'seo_description', label: 'Google description (optional)', type: 'textarea' },
    ],
    blank: { title: 'New therapy', slug: 'new-therapy', short: '', intro: '', audience: '', goals: [], image: '', icon: 'Sparkles', color: 'sage', seo_title: '', seo_description: '' },
  },
  sports: {
    label: 'Sports',
    defaults: DEFAULT_SPORTS,
    title: (item) => item.title,
    path: (item) => `/sports/${item.slug}`,
    fields: [
      { key: 'title', label: 'Name', type: 'text' },
      { key: 'slug', label: 'URL name', type: 'text' },
      { key: 'short', label: 'One-line summary', type: 'text' },
      { key: 'intro', label: 'Introduction', type: 'textarea' },
      { key: 'focus', label: 'Focus (e.g. Balance · coordination)', type: 'text' },
      { key: 'ages', label: 'Ages & group size', type: 'text' },
      { key: 'schedule', label: 'Timetable (one per line: Day | Time)', type: 'list' },
      { key: 'goals', label: 'What children explore (one per line)', type: 'list' },
      { key: 'audience', label: 'Who it’s for', type: 'textarea' },
      { key: 'image', label: 'Picture', type: 'image' },
      { key: 'icon', label: 'Icon', type: 'icon' },
      { key: 'color', label: 'Colour', type: 'color' },
    ],
    blank: { title: 'New activity', slug: 'new-activity', short: '', intro: '', focus: '', ages: '', schedule: [], goals: [], audience: '', image: '', icon: 'Sparkles', color: 'sage' },
  },
  faqs: {
    label: 'FAQs',
    defaults: DEFAULT_FAQS,
    title: (item) => item.q,
    fields: [
      { key: 'q', label: 'Question', type: 'text' },
      { key: 'a', label: 'Answer', type: 'textarea' },
    ],
    blank: { q: 'New question', a: '' },
  },
  areas: {
    label: 'Areas',
    defaults: DEFAULT_AREAS,
    title: (item) => item.name,
    path: (item) => (item.page ? `/locations/${item.slug}` : `/areas/${item.zone}`),
    fields: [
      { key: 'name', label: 'Name', type: 'text' },
      { key: 'slug', label: 'URL name', type: 'text' },
      { key: 'zone', label: 'Zone', type: 'zone' },
      { key: 'page', label: 'Has its own page', type: 'toggle' },
      { key: 'km', label: 'Approx. distance from center (km) — check on Google Maps', type: 'number' },
      { key: 'blurb', label: 'One-line description', type: 'text' },
      { key: 'intro', label: 'Unique introduction (recommended for own pages)', type: 'textarea' },
      { key: 'travel', label: 'Getting here from this area', type: 'textarea' },
      { key: 'near', label: 'Nearby places (one per line)', type: 'list' },
      { key: 'index_therapies', label: 'Therapy pages to show in Google for this area (URL names, one per line)', type: 'list' },
    ],
    blank: { name: 'New area', slug: 'new-area', zone: 'around-sector-37c', page: false, km: '', blurb: '', intro: '', travel: '', near: [], index_therapies: [] },
  },
};
