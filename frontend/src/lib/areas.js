// Areas served by the Sector 37C center: every Gurugram sector plus towns within ~20 km.
// Distances are approximate straight-line km from Sector 37C — check against Google Maps before relying on them.
// `page: true` = the area has its own page (/locations/<slug>); every other area is listed on its zone page.
// Everything here is the default; admins edit the list in Website content → Areas.

export const ZONES = [
  { slug: 'around-sector-37c', name: 'Around our center', range: '0–5 km', blurb: 'The sectors right around our Sector 37C center, near Sector 10A and the Dwarka Expressway. Most families here reach us in a few minutes.' },
  { slug: 'new-gurugram', name: 'New Gurugram', range: '4–8 km', blurb: 'Sectors 76–95, the fast-growing residential belt west of NH-48 towards Manesar, with many young families in newer housing societies.' },
  { slug: 'dwarka-expressway', name: 'Dwarka Expressway', range: '6–10 km', blurb: 'Sectors 104–115 along the Dwarka Expressway towards Delhi.' },
  { slug: 'old-gurugram', name: 'Old Gurugram', range: '3–9 km', blurb: 'The established sectors and colonies of old Gurugram, from Palam Vihar and Sector 4–7 to Sadar Bazar and Jacobpura.' },
  { slug: 'central-gurugram-sohna-road', name: 'Central Gurugram & Sohna Road', range: '5–10 km', blurb: 'Sectors 29–57 around Millennium City Centre, South City, Sushant Lok and the Sohna Road belt.' },
  { slug: 'dlf-golf-course-road', name: 'DLF, MG Road & Golf Course Road', range: '9–13 km', blurb: 'DLF Phases 1–5, Cyber City, MG Road, Udyog Vihar and the Golf Course Road corridor.' },
  { slug: 'golf-course-extension-spr', name: 'Golf Course Extension & SPR', range: '9–16 km', blurb: 'Sectors 58–75 along Golf Course Extension Road and the Southern Peripheral Road.' },
  { slug: 'nearby-towns', name: 'Nearby towns within 20 km', range: '10–18 km', blurb: 'Manesar, Farrukhnagar and nearby villages, plus Delhi neighbourhoods such as Dwarka, Bijwasan and Kapashera.' },
];

// Areas with their own page. Slugs of the original 16 pages are kept so existing links keep working.
const PAGES = [
  ['sector-37c', 'Sector 37C', 'around-sector-37c', 0, 'Our home center, first floor, opposite Alpine Convent School.', ['Sector 37D', 'Sector 10A', 'Basai'], { home: true, index_therapies: ['speech-therapy', 'occupational-therapy', 'aba-therapy', 'sensory-integration-therapy'] }],
  ['sector-10a', 'Sector 10A', 'around-sector-37c', 1, 'Next door to our Sector 37C center.', ['Sector 37C', 'Sector 10', 'Sector 9A']],
  ['sector-102', 'Sector 102', 'around-sector-37c', 4, 'On the Dwarka Expressway, a short drive from our center.', ['Sector 103', 'Sector 101', 'Sector 99']],
  ['new-gurugram', 'New Gurugram', 'new-gurugram', 7, 'The Sectors 76–95 growth corridor west of NH-48.', ['Sector 82', 'Sector 84', 'Sector 92']],
  ['sector-92', 'Sector 92', 'new-gurugram', 4, 'A New Gurugram sector with many newer family housing societies.', ['Sector 91', 'Sector 93', 'Sector 95']],
  ['sector-84', 'Sector 84', 'new-gurugram', 7, 'One of New Gurugram’s busiest residential sectors.', ['Sector 83', 'Sector 85', 'Sector 86']],
  ['sector-109', 'Sector 109', 'dwarka-expressway', 6, 'Along the Dwarka Expressway towards Delhi.', ['Sector 106', 'Sector 108', 'Sector 110']],
  ['sector-4', 'Sector 4', 'old-gurugram', 4, 'Old Gurugram, around the Sector 4–7 market area.', ['Sector 5', 'Sector 7', 'Sector 9']],
  ['sector-14', 'Sector 14', 'old-gurugram', 6, 'Close to Old Gurugram and the Sector 14 market.', ['Sector 15', 'Sector 4', 'Jacobpura']],
  ['palam-vihar', 'Palam Vihar', 'old-gurugram', 8, 'A well-connected neighbourhood in west Gurugram.', ['Sector 22', 'Sector 23', 'Bajghera']],
  ['sector-31', 'Sector 31', 'central-gurugram-sohna-road', 6, 'Central Gurugram, near the Sector 29–31 belt.', ['Sector 30', 'Sector 32', 'Sector 40']],
  ['sector-45', 'Sector 45', 'central-gurugram-sohna-road', 8, 'A short drive along the central Gurugram belt.', ['Sector 46', 'Sector 51', 'South City II']],
  ['sector-47', 'Sector 47', 'central-gurugram-sohna-road', 6, 'On the Sohna Road side of central Gurugram.', ['Sector 46', 'Sector 48', 'Malibu Town']],
  ['sohna-road', 'Sohna Road', 'central-gurugram-sohna-road', 7, 'The fast-growing Sohna Road residential belt.', ['Sector 48', 'Sector 49', 'Vatika Chowk']],
  ['south-city', 'South City', 'central-gurugram-sohna-road', 8, 'South City 1 and 2, established family neighbourhoods in central Gurugram.', ['Sector 40', 'Sector 41', 'Sector 49']],
  ['nirvana-country', 'Nirvana Country', 'central-gurugram-sohna-road', 8, 'A large gated township in Sector 50.', ['Sector 50', 'South City 2', 'Mayfield Garden']],
  ['sushant-lok', 'Sushant Lok', 'central-gurugram-sohna-road', 9, 'Central Gurugram, close to Galleria Market.', ['Sushant Lok Phase 1', 'DLF Phase 4', 'Sector 43']],
  ['dlf-phase-1', 'DLF Phase 1', 'dlf-golf-course-road', 11, 'One of Gurugram’s most established residential phases.', ['DLF Phase 2', 'Sector 26', 'Chakkarpur']],
  ['dlf-phase-2', 'DLF Phase 2', 'dlf-golf-course-road', 11, 'Close to Cyber Hub and the DLF Phase 2 rapid metro.', ['DLF Phase 1', 'DLF Phase 3', 'Cyber City']],
  ['dlf-phase-3', 'DLF Phase 3', 'dlf-golf-course-road', 11, 'A busy hub near Cyber City and Moulsari Avenue.', ['DLF Phase 2', 'Cyber City', 'Sector 24']],
  ['dlf-phase-4', 'DLF Phase 4', 'dlf-golf-course-road', 10, 'Near Galleria Market and Sushant Lok.', ['Galleria Market', 'Sushant Lok', 'DLF Phase 5']],
  ['dlf-phase-5', 'DLF Phase 5', 'dlf-golf-course-road', 11, 'Along Golf Course Road, near Sector 53–54.', ['Golf Course Road', 'Sector 53', 'Sector 54']],
  ['mg-road', 'MG Road', 'dlf-golf-course-road', 11, 'Along the MG Road metro and mall corridor.', ['Sector 28', 'DLF Phase 1', 'Sikanderpur']],
  ['cyber-city', 'Cyber City', 'dlf-golf-course-road', 11, 'Gurugram’s business district near Cyber Hub.', ['DLF Phase 2', 'DLF Phase 3', 'Ambience Mall']],
  ['udyog-vihar', 'Udyog Vihar', 'dlf-golf-course-road', 11, 'Udyog Vihar and Sectors 18–20, close to many workplaces.', ['Sector 18', 'Sector 20', 'DLF Phase 3']],
  ['golf-course-road', 'Golf Course Road', 'dlf-golf-course-road', 12, 'The premium Golf Course Road corridor.', ['Sector 42', 'Sector 43', 'DLF Phase 5']],
  ['sector-56', 'Sector 56', 'dlf-golf-course-road', 11, 'Near Sector 56 and the Golf Course Extension corridor.', ['Sector 57', 'Sector 55', 'Rosewood City']],
  ['sector-70', 'Sector 70', 'golf-course-extension-spr', 10, 'On the Southern Peripheral Road (SPR).', ['Sector 69', 'Sector 71', 'Sector 72']],
  ['manesar', 'Manesar', 'nearby-towns', 12, 'Manesar and IMT Manesar, along NH-48 south of Gurugram.', ['IMT Manesar', 'Kasan', 'Kherki Daula']],
  ['dwarka-delhi', 'Dwarka, Delhi', 'nearby-towns', 13, 'Families from Dwarka, New Delhi, via the Dwarka Expressway.', ['Dwarka Sector 21', 'Bijwasan', 'Kapashera']],
];

// Every other sector or locality, listed on its zone page.
const LISTED = {
  'around-sector-37c': ['Sector 9', 'Sector 9A', 'Sector 9B', 'Sector 10', 'Sector 34', 'Sector 35', 'Sector 36', 'Sector 36A', 'Sector 37', 'Sector 37A', 'Sector 37B', 'Sector 37D', 'Sector 99', 'Sector 99A', 'Sector 100', 'Sector 101', 'Sector 102A', 'Sector 103', 'Basai', 'Dhanwapur', 'Kadipur', 'Daulatabad'],
  'new-gurugram': ['Sector 76', 'Sector 77', 'Sector 78', 'Sector 79', 'Sector 79A', 'Sector 79B', 'Sector 80', 'Sector 81', 'Sector 81A', 'Sector 82', 'Sector 82A', 'Sector 83', 'Sector 85', 'Sector 86', 'Sector 87', 'Sector 88', 'Sector 88A', 'Sector 88B', 'Sector 89', 'Sector 89A', 'Sector 89B', 'Sector 90', 'Sector 91', 'Sector 93', 'Sector 94', 'Sector 95', 'Sector 95A', 'Sector 95B', 'Kherki Daula', 'Hayatpur', 'Garhi Harsaru', 'Sihi'],
  'dwarka-expressway': ['Sector 104', 'Sector 105', 'Sector 106', 'Sector 107', 'Sector 108', 'Sector 110', 'Sector 110A', 'Sector 111', 'Sector 112', 'Sector 113', 'Sector 114', 'Sector 115', 'Bajghera', 'Chauma', 'Babupur'],
  'old-gurugram': ['Sector 1', 'Sector 1A', 'Sector 2', 'Sector 3', 'Sector 3A', 'Sector 5', 'Sector 6', 'Sector 7', 'Sector 8', 'Sector 11', 'Sector 12', 'Sector 12A', 'Sector 13', 'Sector 15', 'Sector 16', 'Sector 17', 'Sector 21', 'Sector 22', 'Sector 23', 'Sector 23A', 'Ashok Vihar', 'Patel Nagar', 'Jacobpura', 'Sadar Bazar', 'New Colony', 'Civil Lines', 'Model Town', 'Rajiv Nagar', 'Shivaji Nagar', 'Laxman Vihar', 'Krishna Colony', 'Arjun Nagar', 'Subhash Nagar', 'Surat Nagar', 'Dharam Colony', 'Carterpuri'],
  'central-gurugram-sohna-road': ['Sector 29', 'Sector 30', 'Sector 32', 'Sector 33', 'Sector 38', 'Sector 39', 'Sector 40', 'Sector 41', 'Sector 44', 'Sector 46', 'Sector 48', 'Sector 49', 'Sector 50', 'Sector 51', 'Sector 52', 'Sector 57', 'Malibu Town', 'Mayfield Garden', 'Ardee City', 'Uppal Southend', 'Rosewood City', 'Greenwood City', 'Badshahpur', 'Jharsa', 'Kanhai'],
  'dlf-golf-course-road': ['Sector 18', 'Sector 19', 'Sector 20', 'Sector 24', 'Sector 25', 'Sector 26', 'Sector 27', 'Sector 28', 'Sector 42', 'Sector 43', 'Sector 53', 'Sector 54', 'Sector 55', 'Sikanderpur', 'Chakkarpur', 'Nathupur'],
  'golf-course-extension-spr': ['Sector 58', 'Sector 59', 'Sector 60', 'Sector 61', 'Sector 62', 'Sector 63', 'Sector 63A', 'Sector 64', 'Sector 65', 'Sector 66', 'Sector 67', 'Sector 67A', 'Sector 68', 'Sector 69', 'Sector 70A', 'Sector 71', 'Sector 72', 'Sector 72A', 'Sector 73', 'Sector 74', 'Sector 74A', 'Sector 75', 'Sector 75A', 'Ghata', 'Behrampur', 'Gwal Pahari'],
  'nearby-towns': ['IMT Manesar', 'Sultanpur', 'Farrukhnagar', 'Bhondsi', 'Wazirpur', 'Chandu', 'Budhera', 'Bijwasan', 'Kapashera', 'Mahipalpur', 'Palam (Delhi)', 'Najafgarh', 'Vasant Kunj'],
};

export const slugify = (name) =>
  name
    .toLowerCase()
    .replace(/\(.*?\)/g, (m) => m.replace(/[()]/g, ''))
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');

export const DEFAULT_AREAS = [
  ...PAGES.map(([slug, name, zone, km, blurb, near, extra = {}]) => ({
    slug,
    name,
    zone,
    km,
    blurb,
    near,
    page: true,
    home: false,
    intro: '',
    travel: '',
    index_therapies: [],
    ...extra,
  })),
  ...Object.entries(LISTED).flatMap(([zone, names]) =>
    names.map((name) => ({ slug: slugify(name), name, zone, page: false })),
  ),
];
