// netlify/functions/_lib/brand.js
// Brand context loaded into every Claude prompt.
// Stored in Blobs under key 'brandContext:<brand>' — editable via the Settings tab.
// Falls back to hardcoded defaults so the system works out of the box.

const { store } = require('./store');

// ── Pickl default brand context ──────────────────────────────────
// Built from: brand guidelines PDF + menu PDF + founder input.
// Update via Settings tab → Brand Context, or edit defaults here.

const PICKL_DEFAULT = {
  brand: 'pickl',
  name: 'Pickl',
  tagline: 'Grain-fed beef, smashed, seasoned, served up by legends',
  website: 'https://eatpickl.com',
  country: 'UAE',
  halal: true,

  // Brand character (from brand guidelines)
  character: 'Daring, Playful, Approachable, Inventive. On a quest to be legendary — but we never call ourselves legendary. We let the food and our customers speak.',

  // Tone of voice rules (from brand guidelines — these are hard rules for Claude)
  tone: [
    'Playful NOT silly — light-hearted, cheeky, fun but never mean or political',
    'Relatable NOT ordinary — culturally aware, trend-conscious, colloquial over corporate',
    'Witty NOT comical — clever wordplay and subtle humour, not childish jokes',
    'Approachable NOT jargon — simple, conversational, easily digestible for all backgrounds',
    'Authentic NOT sales-y — never bark promotional content; weave personality in naturally',
    'Call customers and team "Legends" — never call the brand or food legendary',
    'Language examples: "Coming soon-ish", "Gooder Milkshakes", "You\'re an absolute legend"',
    'Do NOT use: corporate speak, superlatives about ourselves, salesy CTAs, generic food adjectives like "delicious" or "tasty"',
  ],

  // What Pickl is
  positioning: 'Pickl is a homegrown UAE fast-casual restaurant brand serving premium smashed cheeseburgers, hand-breaded chicken sandos, hot dogs, and plant-based options. Founded in Dubai, proudly part of the Yolk Brands family. The food is the hero — fresh, indulgent, perfectly imperfect.',

  // Key differentiators vs Salt, High Joint, Shake Shack
  differentiators: [
    'Homegrown UAE brand — not an import or franchise, born and raised in Dubai',
    'The namesake artisanal house-made pickles elevate every item — it\'s in the name',
    'Trifecta menu: smashed beef burgers + hand-breaded chicken sandos (5 heat levels) + hot dogs + plant-based options — most competitors do one well, Pickl does all',
    'Chicken sandos in 5 heat levels: Plain, Medium-ish, Feel the Heat, Nashville, The Reaper',
    'Build Your Own option — full customisation with any toppings and any 2 sauces',
    'Plant-based menu using Impossible™ patties — suitable for vegetarians',
    'Grain-fed beef, hand-breaded fresh chicken, served by legends — premium fast food without the pretension',
    'Price point is accessible premium — quality ingredients, no lecture about it',
  ],

  // Full menu (for context — Claude uses this to write accurate, specific content)
  menu: {
    cheeseburgers: [
      'The Original Cheeseburger — double chuck patty, cheese, dill pickles, white onion, mustard, ketchup & potato bun',
      'The New Yorker Cheeseburger — double chuck patty, cheese, tomato, lettuce, secret sauce & potato bun',
      'The Jeff Cheeseburger — double chuck patty, cheese, feel the heat spice, fried onions, ranch sauce & potato bun',
      'The BBQ Bacon Cheeseburger — double chuck patty, cheese, bacon, fried onions, bbq sauce, ranch sauce & potato bun',
      'The Buffalo Cheeseburger — double chuck patty, cheese, lettuce, buffalo sauce, ranch sauce, parmesan & potato bun',
      'Build Your Own Cheeseburger — single or double chuck patty, cheese, potato bun, choice of toppings & 2 sauces',
      'Legendary Patty Melt — double chuck patties, cheese, white onion, secret sauce & potato bun',
    ],
    plantBased: [
      'Original, New Yorker, Jeff, Buffalo Plant-Based Cheeseburgers — same builds as beef using Impossible™ patties',
      'Build Your Own Plant-Based Cheeseburger',
    ],
    chickenSandos: [
      'The Chicken Sando — fresh fried chicken, dill pickles, lettuce, comeback sauce & potato bun',
      'Chicken Caesar Sando — fresh fried chicken, caesar sauce, lettuce, parmesan, cheese & potato bun',
      'Buffalo Chicken Sando — buffalo fried chicken, ranch sauce, buffalo sauce, lettuce, parmesan & potato bun',
      'Legendary Chicken Melt — fresh fried chicken tenders, cheese, comeback sauce & potato bun',
      'All chicken sandos: pick your heat — Plain, Medium-ish, Feel the Heat, Nashville, The Reaper',
    ],
    hotDogs: [
      'Chicago Dog — all beef hot dog, ketchup, mustard, diced dill, diced onion, tomato, fried onion & potato bun',
      'OG Dog — all beef hot dog, ketchup, mustard, diced dill, diced onion & potato bun',
      'Spicy Dog — all beef hot dog, ranch, buffalo, diced jalapeño, feel the heat spice & potato bun',
      'The Clown Dog — all beef hot dog, cheese, secret sauce, diced dill, diced onion, lettuce & potato bun',
      'Build Your Own Hot Dog',
    ],
    friesAndSides: [
      'Sando Fries — fresh fried chicken, dill pickles, comeback sauce & parsley',
      'Messy Fries — beef bacon, dill pickles, secret sauce & parsley',
      'Spicy Fries — skinny fries with feel the heat spice',
      'Plant-Based Fries',
      'Fries | Rocket Parma Salad | Tub O\' House Pickles (dill, onion, chilli)',
      'Chicken Tenders — fresh fried, small (3) or large (6) with dipping sauce',
    ],
    shakesAndDesserts: [
      'Shakes — Vanilla, Strawberry, Chocolate, Salted Caramel. Make it Gooder +2 each with blend, sauce, extras',
      'Sundaes — Lotus, Chocolate, Strawberry Oreo',
      'Famous Ice Cream Sando — choice of ice cream in a deep-fried cinnamon sugar bun',
      'Coke Float — a nostalgia classic',
    ],
    kidsMenu: 'Little Pickl — little meals for little legends (Cheeseburger/Chicken Sando/Tenders/Plant-based + Fries or Carrot Sticks + Drink)',
  },

  // Signature brand language / menu terms to use naturally in content
  brandLanguage: [
    '"Legends" = customers and team members',
    '"Feel the Heat" = medium-hot spice level',
    '"The Reaper" = hottest heat level',
    '"Jeff it up" = add feel the heat spice blend to anything',
    '"Gooder" = better (intentionally grammatically wrong — brand-approved)',
    '"Sando" = sandwich / chicken sandwich',
    '"Soon-ish" = coming soon (playful Pickl-ism)',
    '"Made by Legends" = kitchen crew',
    '"Little Legends" = kids',
    'Grain-fed beef, smashed — always describe burgers this way',
    'Hand-breaded fresh chicken — always describe chicken sandos this way',
  ],

  // UAE locations context (for local SEO content)
  locations: {
    note: 'Full list at eatpickl.com/location',
    uae: [
      'Gardens Plaza, Khalifa City, Abu Dhabi',
      'City Walk, Dubai',
      'One JLT, Dubai',
      'Ribbon Mall, Motor City, Dubai',
      'The Walk, JBR, Dubai',
      'City Centre Mirdif, Dubai',
      'Souq Badr Muhaisnah, Dubai',
      'Al Safa, Dubai',
      'Mamsha Soul Beach, Abu Dhabi',
      'World Trade Centre, Abu Dhabi',
      'Al Ain, Abu Dhabi',
      'Al Hirah Beach, Sharjah',
      'Al Jada, Sharjah',
      'Lagoon Stop, Mina Al Arab, Ras Al Khaimah',
    ],
    areas: ['JBR', 'City Walk', 'JLT', 'Motor City', 'Mirdif', 'Al Safa', 'Khalifa City', 'Mamsha Abu Dhabi', 'World Trade Centre Abu Dhabi', 'Al Ain', 'Al Hirah Beach Sharjah', 'Al Jada Sharjah', 'Mina Al Arab RAK'],
    international: 'Also in Bahrain (Al Aali Mall, Juffair), Qatar (West Walk, District 1), Egypt, Saudi Arabia (Al Nakheel Mall, U Walk, La Palma), Jordan (Vista 4 Amman)',
  },

  // Content DO NOTs — critical for brand consistency
  doNot: [
    'Never call Pickl or its food "legendary" — customers decide that',
    'Never use generic food words: delicious, tasty, mouth-watering, scrumptious',
    'Never be salesy or promotional — be a friend, not an ad',
    'Never use jargon or corporate language',
    'Never be politically opinionated',
    'Never compare negatively to competitors by name',
    'Do not describe price as cheap or affordable — quality is the story',
    'Do not write boring, generic SEO filler — every word should sound like Pickl',
  ],
};

const BONBIRD_DEFAULT = {
  brand: 'bonbird',
  name: 'Bonbird',
  tagline: 'Halal fried chicken, done right',
  website: 'https://bonbirdchicken.com',
  country: 'UAE',
  halal: true,
  character: 'Warm, family-friendly, UAE-local. Halal fried chicken with soul.',
  tone: [
    'Warm and welcoming — family-first energy',
    'Approachable — speaks to UAE locals and expats equally',
    'Proud of halal — it\'s a feature, not a disclaimer',
    'Authentic — honest about what it is: great fried chicken',
  ],
  positioning: 'Bonbird is a UAE halal fried chicken restaurant. Crispy, juicy, seasoned properly — no compromise on quality.',
  differentiators: [
    'Halal fried chicken — proudly and explicitly',
    'UAE homegrown brand',
    'Family-friendly positioning',
  ],
  menu: { note: 'Menu details to be added via Settings tab' },
  brandLanguage: [],
  locations: { note: 'Check bonbirdchicken.com/locations for current UAE locations', areas: [] },
  doNot: [
    'Never use generic fried chicken descriptions',
    'Never downplay the halal aspect',
  ],
};

// ── Public API ────────────────────────────────────────────────────

async function getBrandContext(brand) {
  const s = store();
  const stored = await s.get(`brandContext:${brand}`, { type: 'json' }).catch(() => null);
  if (stored) return stored;
  return brand === 'pickl' ? PICKL_DEFAULT : BONBIRD_DEFAULT;
}

async function setBrandContext(brand, context) {
  await store().setJSON(`brandContext:${brand}`, context);
}

// Build the system prompt block that gets injected into every Claude call
function buildBrandPrompt(ctx) {
  return `=== BRAND CONTEXT: ${ctx.name.toUpperCase()} ===
You are writing SEO content for ${ctx.name} (${ctx.website}), a ${ctx.country} restaurant brand.

POSITIONING: ${ctx.positioning}

WHAT MAKES US DIFFERENT:
${ctx.differentiators.map(d => `- ${d}`).join('\n')}

TONE OF VOICE (follow these strictly):
${ctx.tone.map(t => `- ${t}`).join('\n')}

BRAND LANGUAGE TO USE NATURALLY:
${ctx.brandLanguage.map(l => `- ${l}`).join('\n')}

HALAL: ${ctx.halal ? 'Yes — all food is halal. Mention naturally where relevant.' : 'Not specified'}

KEY MENU ITEMS (reference these specifically — no generic burger descriptions):
Cheeseburgers: ${ctx.menu.cheeseburgers ? ctx.menu.cheeseburgers.slice(0, 4).join(' | ') : 'See menu'}
Chicken: ${ctx.menu.chickenSandos ? ctx.menu.chickenSandos.slice(0, 3).join(' | ') : 'See menu'}
Sides: ${ctx.menu.friesAndSides ? ctx.menu.friesAndSides.slice(0, 3).join(' | ') : 'See menu'}

LOCATIONS (UAE): ${ctx.locations && ctx.locations.areas ? ctx.locations.areas.slice(0, 6).join(', ') + ' and more' : 'Multiple UAE locations'}

ABSOLUTE DO NOTS:
${ctx.doNot.map(d => `- ${d}`).join('\n')}
=== END BRAND CONTEXT ===`;
}

module.exports = { getBrandContext, setBrandContext, buildBrandPrompt, PICKL_DEFAULT, BONBIRD_DEFAULT };
