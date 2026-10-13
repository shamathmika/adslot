const names = ['Priya', 'Marcus', 'Jen', 'Tomás', 'Aiko', 'Sam', 'Olu', 'Hannah', 'Rafael', 'Mei', 'Dev', 'Clara'];
const bodies = [
  'Ran a half marathon in these on day three. No break-in needed, no hot spots.',
  'Cushioning is great but the toe box runs a little narrow. Size up half if you have wide feet.',
  'Grip on wet pavement is noticeably better than my last pair. Laces are too long.',
  'Feels light enough for tempo runs but still protective for long Sunday miles.',
  'The colour is more muted than the photos. Comfort is excellent though.',
  'I have plantar fasciitis and these have been the kindest shoe I have tried this year.',
  'Outsole is showing wear at 300 miles, which is about what I expected.',
  'Heel counter is firm and locks the foot in. Took one run to get used to it.',
];

export const reviews = Array.from({ length: 24 }, (_, i) => ({
  id: i,
  author: `${names[i % names.length]} ${String.fromCharCode(65 + (i * 7) % 26)}.`,
  rating: 5 - (i % 4 === 3 ? 2 : i % 3 === 2 ? 1 : 0),
  title: ['Best daily trainer', 'Comfortable but narrow', 'Great grip', 'Solid all-rounder'][i % 4],
  body: bodies[i % bodies.length] + ' ' + bodies[(i * 3 + 1) % bodies.length],
  date: new Date(2026, 8, 28 - i).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }),
  helpful: (i * 13) % 41,
}));

export const specs: [string, string][] = [
  ['Weight', '248 g (US M9)'], ['Heel-to-toe drop', '8 mm'], ['Stack height', '36 mm heel / 28 mm forefoot'],
  ['Midsole', 'Supercritical EVA blend'], ['Outsole', 'Carbon rubber, 4 mm lugs'], ['Upper', 'Engineered recycled mesh'],
  ['Arch support', 'Neutral'], ['Terrain', 'Road, light trail'], ['Closure', 'Lace-up, gusseted tongue'],
  ['Width options', 'Standard, Wide'], ['Recommended use', 'Daily training, long runs'], ['Care', 'Hand wash, air dry'],
];

export const related = Array.from({ length: 8 }, (_, i) => ({
  id: i,
  name: ['Trailblaze Tempo', 'Summit Grip GTX', 'Cityline Racer', 'Pacer Lite', 'Ridge Runner 2', 'Harbor Walk', 'Velo Trainer', 'Cloudstep'][i],
  price: 89 + i * 11,
  img: `/img/related${i + 1}.jpg`,
}));
