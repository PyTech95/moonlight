import { services } from './content';

// Center NAP (Name / Address / Phone) — edit if the verified details change.
export const CENTER = {
  name: 'Moonlight Neurocare',
  sector: 'Sector 37C',
  city: 'Gurugram',
  region: 'Haryana',
  country: 'IN',
  postalCode: '122001',
  phone: '+917982282025',
  landmark: 'Sector 37C, near Alpine Convent School',
};

// Service areas within ~10–20 km of the Sector 37C center.
export const SERVICE_AREAS = [
  { slug: 'sector-37c', name: 'Sector 37C', km: 0, home: true, blurb: 'Our home center, in the heart of New Gurugram.', near: ['Sector 37D', 'Sector 10A', 'Basai'] },
  { slug: 'sector-14', name: 'Sector 14', km: 6, blurb: 'Close to Old Gurugram and the Sector 14 market.', near: ['Sector 15', 'Sector 4', 'Jacobpura'] },
  { slug: 'sector-45', name: 'Sector 45', km: 9, blurb: 'A short drive along the Southern Peripheral belt.', near: ['Sector 46', 'Sector 51', 'South City II'] },
  { slug: 'sector-56', name: 'Sector 56', km: 12, blurb: 'Near Sector 56 and the Golf Course Extension corridor.', near: ['Sector 57', 'Sector 55', 'Rosewood City'] },
  { slug: 'dlf-phase-1', name: 'DLF Phase 1', km: 12, blurb: 'One of Gurugram’s most established residential phases.', near: ['DLF Phase 2', 'Sector 26', 'Chakkarpur'] },
  { slug: 'dlf-phase-2', name: 'DLF Phase 2', km: 13, blurb: 'Close to Cyber Hub and the DLF Phase 2 rapid metro.', near: ['DLF Phase 1', 'DLF Phase 3', 'Cyber City'] },
  { slug: 'dlf-phase-3', name: 'DLF Phase 3', km: 14, blurb: 'A busy hub near Cyber City and Moulsari Avenue.', near: ['DLF Phase 2', 'Cyber City', 'Sector 24'] },
  { slug: 'dlf-phase-4', name: 'DLF Phase 4', km: 12, blurb: 'Near Galleria Market and Sushant Lok.', near: ['Galleria Market', 'Sushant Lok', 'DLF Phase 5'] },
  { slug: 'dlf-phase-5', name: 'DLF Phase 5', km: 15, blurb: 'Along Golf Course Road, near Sector 53–54.', near: ['Golf Course Road', 'Sector 53', 'Sector 54'] },
  { slug: 'sushant-lok', name: 'Sushant Lok', km: 11, blurb: 'Central Gurugram, close to Galleria Market.', near: ['Sushant Lok Phase 1', 'DLF Phase 4', 'Sector 43'] },
  { slug: 'golf-course-road', name: 'Golf Course Road', km: 14, blurb: 'The premium Golf Course Road corridor.', near: ['Sector 42', 'Sector 43', 'DLF Phase 5'] },
  { slug: 'sohna-road', name: 'Sohna Road', km: 10, blurb: 'The fast-growing Sohna Road residential belt.', near: ['Sector 48', 'Sector 49', 'Vatika Chowk'] },
  { slug: 'palam-vihar', name: 'Palam Vihar', km: 9, blurb: 'A well-connected neighbourhood in west Gurugram.', near: ['Sector 22', 'Sector 23', 'Bajghera'] },
  { slug: 'mg-road', name: 'MG Road', km: 10, blurb: 'Along the MG Road metro and mall corridor.', near: ['Sector 28', 'DLF Phase 1', 'Sikanderpur'] },
  { slug: 'cyber-city', name: 'Cyber City', km: 16, blurb: 'Gurugram’s business district near Cyber Hub.', near: ['DLF Phase 2', 'DLF Phase 3', 'Ambience Mall'] },
  { slug: 'new-gurugram', name: 'New Gurugram', km: 8, blurb: 'The Sectors 82–95 growth corridor along Dwarka Expressway.', near: ['Sector 82', 'Sector 84', 'Sector 92'] },
];

export const THERAPIES = services;
export const findArea = (slug) => SERVICE_AREAS.find((a) => a.slug === slug);
export const findTherapy = (slug) => services.find((s) => s.slug === slug);

export const SITE_ORIGIN = (process.env.REACT_APP_BACKEND_URL || '').replace(/\/$/, '');
export const HERO_IMAGE = SITE_ORIGIN + '/moonlight-logo.svg';

export const directionsUrl = (area) =>
  `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent('Moonlight Neurocare Sector 37C Gurugram')}` +
  (area && !area.home ? `&origin=${encodeURIComponent(area.name + ' Gurugram')}` : '');
