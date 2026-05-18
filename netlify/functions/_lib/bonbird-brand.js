// _lib/bonbird-brand.js
// ─────────────────────────────────────────────────────────────────────────────
// BONBIRD BRAND CONTEXT — sourced from:
//   • Official Bonbird Brand Guidelines 2025 (BONBIRD_BrandGuidelines2025_Approval.pdf)
//   • Confirmed menu artwork (New_Bonbird_Menu_2025_Update_ART 1–6)
//
// Drop this into _lib/brand.js, replacing the Bonbird placeholder.
// This is injected into every Claude prompt for Bonbird content generation.
// ─────────────────────────────────────────────────────────────────────────────

const BONBIRD_BRAND_CONTEXT = {
  name: "Bonbird",
  domain: "bonbirdchicken.com",
  siteUrl: "https://bonbirdchicken.com/",
  gscProperty: "sc-domain:bonbirdchicken.com",

  // ── Brand Statement ────────────────────────────────────────────────────
  brandStatement: "All bird. No bull.",

  // ── Brand Positioning ──────────────────────────────────────────────────
  positioning:
    "Bonbird is a Dubai-born, community-focused fried chicken brand. " +
    "100% fresh, hormone-free, antibiotic-free chicken — made to order, served daily. " +
    "Like our older sibling Pickl, we're proud to be a Yolk Brands UAE original. " +
    "A community chicken shop where everyone can grab a bite and share a bucket.",

  // ── Customer & Team Language ───────────────────────────────────────────
  // CRITICAL: Bonbird calls customers and team "Champs" — NOT Legends (that is Pickl's term)
  customerTerm: "Champs",

  // ── Tone of Voice (Brand Guidelines pp.8–10) ───────────────────────────
  // Brand characters: FEARLESS · EDGY · HONEST · LIGHT
  toneRules: [
    "DIRECT (not rude) — straightforward, clear, unambiguous, candid, to-the-point. Never evasive or sugar-coated.",
    "BOLD (not flamboyant) — daring, assertive, confident. Never timid, cautious or restrained.",
    "DYNAMIC (not chaotic) — energetic, spontaneous, lively. Never routine or predictable.",
    "CONFIDENT (not cocky) — self-assured, decisive, poised. Never hesitant or wavering.",
    "UNAPOLOGETIC (not aggressive) — unreserved, fearless, candid. Never apologetic or reserved.",
    "Plain speak — not sales copy. Short, sharp, impactful statements.",
    "No clichés: fresh ingredients, passion for food, crafted with love.",
    "No hollow superlatives: best ever, greatest, #1, unbeatable (unless backed by data).",
    "No exclamation marks in blog posts, meta descriptions or long-form copy.",
  ],

  // ── Core Brand Language & Key Statements ──────────────────────────────
  brandLanguage: [
    "All bird. No bull.",              // master brand statement
    "Eat Like A Champ",               // key consumer statement
    "Serving Golden Chicken Daily",   // product statement
    "Always Fresh (never frozen)",    // food credibility
    "Made fresh. To order.",          // food credibility
    "Homegrown. Handmade.",           // origin story
    "Antibiotic free",                // product claim — use small and confident
    "Hormone free",                   // product claim — use small and confident
    "Good Good Sauce",                // proprietary sauce — always capitalise
    "Bon Gravy",                      // proprietary gravy — always capitalise
    "Chicken Salt",                   // signature seasoning — always capitalise
    "Bon Wrap",                       // wrap size — always capitalise
    "Snack-A-Wrap",                   // smaller wrap — always capitalise
    "Champs",                         // how we address customers AND team
  ],

  // ── Vocabulary: NEVER USE ──────────────────────────────────────────────
  doNots: [
    "Never use: delicious, tasty, mouth-watering, scrumptious, yummy, finger-licking",
    "Never call the brand, food or experience 'legendary' — customers decide that",
    "Never use 'Legends' for customers — that is Pickl's word. Bonbird uses 'Champs'",
    "No exclamation marks in blog posts, meta descriptions or long-form copy",
    "Never use AI-generated imagery descriptions in content (brand policy)",
    "Never sound generic, flamboyant, chaotic, apologetic or aggressive",
    "No boardroom speak or marketing buzzwords",
  ],

  // ── FULL CONFIRMED MENU (from menu artwork 2025) ───────────────────────
  menu: {

    // SPICE SYSTEM — customer selects a spice level OR a flavour (not both)
    spiceLevels: ["Plain Jane", "Medium", "Hot", "XXX"],
    flavours: [
      "Garlic Parm",
      "Jamaican Tang",
      "Jalapeño",
      "Lemon Pepper",
      "Chicken Salt",
    ],

    // BONE-IN — "on the bone and by the bucket (or box)"
    boneIn: {
      comboMeals: [
        { size: "2-piece", price: 30, includes: "choice of side and a drink" },
        { size: "3-piece", price: 40, includes: "choice of side and a drink" },
        { size: "5-piece", price: 60, includes: "choice of side and a drink" },
        { size: "8-piece", price: 100, includes: "choice of two sides and two drinks" },
        { size: "12-piece", price: 150, includes: "choice of two sides and two drinks" },
      ],
      justPieces: [
        { size: "2 bone-in chicken", price: 19 },
        { size: "3 bone-in chicken", price: 25 },
        { size: "5 bone-in chicken", price: 39 },
        { size: "8 bone-in chicken", price: 59 },
      ],
    },

    // TENDERS — "fresh fried chicken tenders, your way"
    tenders: {
      comboMeals: [
        { size: "2-piece", price: 30, includes: "choice of side and a drink" },
        { size: "3-piece", price: 40, includes: "choice of side and a drink" },
        { size: "5-piece", price: 60, includes: "choice of side and a drink" },
        { size: "8-piece", price: 100, includes: "choice of two sides and two drinks" },
        { size: "12-piece", price: 150, includes: "choice of two sides and two drinks" },
      ],
      justTenders: [
        { size: "2 chicken tenders", price: 19 },
        { size: "3 chicken tenders", price: 25 },
        { size: "5 chicken tenders", price: 39 },
        { size: "8 chicken tenders", price: 59 },
      ],
    },

    // SANDWICHES — "100% fresh, hormone free, antibiotic free chicken"
    sandwiches: [
      {
        name: "Classic Chicken Burger",
        description: "fresh fried chicken, lettuce and herb mayo",
        price: 29,
      },
      {
        name: "The Good Good Chicken Burger",
        description: "fresh fried chicken, lettuce, and good good sauce",
        price: 28,
      },
      {
        name: "The Korean Chicken Burger",
        description: "fresh fried chicken, cabbage, gochujang sauce and ranch",
        price: 30,
      },
      {
        name: "The Chicken Melt",
        description: "fresh fried chicken, triple cheese, cabbage and good good sauce",
        price: 28,
      },
    ],

    // WRAPS — two sizes: Bon Wrap / Snack-A-Wrap
    wraps: [
      {
        name: "Classic Wrap",
        description: "chicken tenders, cheese, lettuce, tomato and herb mayo",
        bonWrap: 23,
        snackAWrap: 12,
      },
      {
        name: "Good Good Wrap",
        description: "chicken tenders, cheese, lettuce, tomato and good good sauce",
        bonWrap: 23,
        snackAWrap: 12,
      },
      {
        name: "Buffalo Wrap",
        description: "chicken tenders, cheese, lettuce, tomato and buffalo sauce",
        bonWrap: 27,
        snackAWrap: 14,
      },
      {
        name: "Korean Wrap",
        description: "chicken tenders, cabbage, cheese, tomato, gochujang sauce and ranch",
        bonWrap: 27,
        snackAWrap: 14,
      },
    ],

    // RICE BOWLS
    riceBowls: [
      {
        name: "Classic Chicken Rice Bowl",
        description: "fresh fried chicken, turmeric rice, lettuce, tomato, herb mayo",
        price: 27,
      },
      {
        name: "Korean Chicken Rice Bowl",
        description: "fresh fried chicken, turmeric rice, cabbage, tomato, gochujang sauce, ranch",
        price: 29,
      },
    ],

    // SIDES
    sides: [
      { name: "Plain Fries", price: "14", note: "simply fries, straight up" },
      { name: "Chicken Salt Fries", price: "16", note: "once tried, impossible to resist" },
      { name: "Spicy Fries", price: "16", note: "fries with a little more heat" },
      { name: "Mac & Three Cheese", price: "10/16", note: "triple the cheese, triple good" },
      { name: "Mash Potato", price: "10/16", note: "fried chicken's soul mate" },
      { name: "Bon Gravy", price: "8/12", note: "secret signature recipe" },
      { name: "Rice", price: "8/12", note: "turmeric spiced rice" },
      { name: "Slaw", price: "8/12", note: "homemade proper slaw" },
      { name: "Tub of Dill Pickles", price: "8/12", note: "our signature pickles" },
      { name: "Tub of Chilli Pickles", price: "8/12", note: "add a little heat and tang" },
      { name: "Bread", price: "2", note: "when it's time to mop up" },
      { name: "Bag of Chicken Salt", price: "5", note: "a little bag of umami" },
    ],

    // SAUCES
    sauces: [
      { name: "Regular Sauce", price: 4, size: null, note: "for a lil' dip" },
      { name: "Large Sauce", price: 12, size: "125ml", note: "get saucy" },
      { name: "Mega Sauce", price: 20, size: "250ml", note: "don't run dry, go MEGA" },
    ],

    // SHAKES — "thick ice cream shakes freshly made"
    shakes: [
      { name: "Vanilla Shake", price: 22 },
      { name: "Chocolate Shake", price: 22 },
      { name: "Strawberry Shake", price: 22 },
    ],

    // ICE CREAM — Vanilla / Chocolate / Strawberry
    iceCream: [
      { name: "Single Scoop", price: 10 },
      { name: "Double Scoop", price: 15 },
    ],

    // DRINKS
    drinks: [
      { name: "Soft Drinks", price: 11 },
      { name: "Water", price: 6 },
    ],
  },

  // ── UAE Locations ──────────────────────────────────────────────────────
  uaeLocations: [
    "Motor City, Dubai",
    "City Walk, Dubai",
    "City Centre Mirdif, Dubai",
    "Aljada, Sharjah",
    "Khalifa City, Abu Dhabi",
  ],

  // ── International Markets (CONFIRMED — Bonbird only) ──────────────────
  // IMPORTANT: Do NOT mix with Pickl international markets
  // Pickl = Jordan, Egypt, Saudi Arabia, Qatar, Bahrain
  // Bonbird = Oman, Pakistan, Qatar
  international: ["Oman", "Pakistan", "Qatar"],

  // ── Competitors ────────────────────────────────────────────────────────
  competitors: [
    { name: "Salt", domain: "saltuae.com", notes: "UAE QSR, also does fried chicken" },
    { name: "High Joint", domain: "highjoint.co", notes: "Premium fried chicken, UAE-native" },
    { name: "Shake Shack", domain: "shakeshack.com", notes: "Chicken Shack — premium QSR benchmark" },
    { name: "Five Guys", domain: "fiveguys.ae", notes: "Indirect competitor" },
    { name: "Al Baik", domain: "albaik.com", notes: "Dominant regional fried chicken benchmark" },
    { name: "KFC", domain: "kfc.com", notes: "Mass market price anchor" },
  ],

  // ── SEO Seed Keywords ──────────────────────────────────────────────────
  seedKeywords: [
    // Category
    "fried chicken dubai",
    "best fried chicken uae",
    "crispy fried chicken dubai",
    "chicken tenders dubai",
    "bone in fried chicken dubai",
    "chicken sandwich dubai",
    "chicken melt dubai",
    "fried chicken delivery dubai",
    "halal fried chicken dubai",
    "korean chicken burger dubai",
    "chicken rice bowl dubai",
    "chicken wraps dubai",
    "bonbird menu",
    "bonbird dubai",
    // Location-specific
    "fried chicken motor city dubai",
    "restaurants motor city dubai",
    "fried chicken city walk dubai",
    "city walk dubai restaurants",
    "fried chicken mirdif dubai",
    "city centre mirdif restaurants",
    "fried chicken sharjah",
    "restaurants aljada sharjah",
    "fried chicken khalifa city abu dhabi",
    "restaurants khalifa city abu dhabi",
  ],
};

// ─────────────────────────────────────────────────────────────────────────────
// PROMPT CONTEXT BUILDER
// Injected into every Claude API call for Bonbird content.
// ─────────────────────────────────────────────────────────────────────────────

function getBonbirdPromptContext(extraContext = "") {
  const b = BONBIRD_BRAND_CONTEXT;
  const m = b.menu;

  return `
=== BONBIRD BRAND CONTEXT ===
Brand: ${b.name} (${b.domain})
Brand Statement: "${b.brandStatement}"
Positioning: ${b.positioning}

CUSTOMER & TEAM LANGUAGE:
- Always call customers and team: "Champs"
- NEVER use "Legends" — that belongs to Pickl, not Bonbird
- Key phrases: "Eat Like A Champ" / "All bird. No bull." / "Serving Golden Chicken Daily"

TONE OF VOICE:
${b.toneRules.map((r) => `- ${r}`).join("\n")}

BRAND LANGUAGE — use these naturally:
${b.brandLanguage.map((t) => `- ${t}`).join("\n")}

NEVER USE:
${b.doNots.map((r) => `- ${r}`).join("\n")}

FOOD CREDENTIALS (factual, use confidently):
- 100% fresh, hormone free, antibiotic free chicken
- Made fresh to order. Never frozen.
- Dubai-born. Homegrown. Handmade.

SPICE SYSTEM — customer selects a SPICE LEVEL or a FLAVOUR (not both):
Spice levels: ${m.spiceLevels.join(" / ")}
Flavours: ${m.flavours.join(" / ")}

MENU:
Bone-In Combos: 2pc AED30 / 3pc AED40 / 5pc AED60 / 8pc AED100 / 12pc AED150 (with sides + drinks)
Just Bone-In: 2pc AED19 / 3pc AED25 / 5pc AED39 / 8pc AED59
Tenders Combos: same pricing as Bone-In
Just Tenders: same pricing as Just Bone-In
Sandwiches: Classic Chicken Burger (AED29), The Good Good Chicken Burger (AED28), The Korean Chicken Burger (AED30), The Chicken Melt (AED28)
Wraps (Bon Wrap / Snack-A-Wrap): Classic (23/12), Good Good (23/12), Buffalo (27/14), Korean (27/14)
Rice Bowls: Classic Chicken Rice Bowl (AED27), Korean Chicken Rice Bowl (AED29)
Sides: Plain Fries (14), Chicken Salt Fries (16), Spicy Fries (16), Mac & Three Cheese (10/16), Mash Potato (10/16), Bon Gravy (8/12), Rice (8/12), Slaw (8/12), Dill Pickles (8/12), Chilli Pickles (8/12), Bread (2), Bag of Chicken Salt (5)
Sauces: Regular AED4 / Large AED12 (125ml) / Mega AED20 (250ml)
Shakes: Vanilla / Chocolate / Strawberry — AED22 each
Ice Cream: Single Scoop AED10 / Double Scoop AED15
Drinks: Soft Drinks AED11 / Water AED6

UAE LOCATIONS (all confirmed Bonbird restaurants):
${b.uaeLocations.join("\n")}

INTERNATIONAL MARKETS (Bonbird only — do NOT confuse with Pickl markets):
${b.international.join(", ")}

COMPETITORS (aware of — never attack directly):
${b.competitors.map((c) => `- ${c.name}: ${c.notes}`).join("\n")}

${extraContext ? `ADDITIONAL CONTEXT:\n${extraContext}` : ""}
=== END BONBIRD CONTEXT ===
`.trim();
}

module.exports = {
  BONBIRD_BRAND_CONTEXT,
  getBonbirdPromptContext,
};
