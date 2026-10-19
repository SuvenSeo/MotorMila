/**
 * Canonical make normalization.
 *
 * Scrape-side make values are noisy: the same brand arrives as "Bmw"/"BMW",
 * "Mg"/"MG", "Dfsk"/"DFSK", "Land rover"/"Land Rover", plus typo variants
 * ("Mitshubishi", "Sukuzi", "Nisan", "Daihatzu", "Cheery") and outright junk
 * ("Test", "TestPOS", "testused", "2018", "Other brand").
 *
 * Those values reach the public make combobox and the valuation/trends model
 * pickers, where duplicates split a brand's listings across several rows and
 * junk makes pollute the filter. Everything that reaches the UI goes through
 * `canonicalizeMake` so a brand is one row with one set of listings.
 *
 * Mirrored in the backend at `backend/app/utils/make_canonical.py`; keep the
 * two tables in sync (the frontend owns the snapshot path, the backend owns
 * the live path).
 */

/** Normalized (lowercase, alnum-only) key -> canonical display name. */
const MAKE_ALIASES: Record<string, string> = {
  // Case / spacing duplicates of the big brands.
  toyota: "Toyota",
  suzuki: "Suzuki",
  nissan: "Nissan",
  honda: "Honda",
  bmw: "BMW",
  benz: "Mercedes",
  bencik: "Benz",
  mercedesbenz: "Mercedes",
  mercedes: "Mercedes",
  mg: "MG",
  kia: "Kia",
  dfsk: "DFSK",
  hyndai: "Hyundai",
  proton: "Proton",
  landrover: "Land Rover",
  rangerover: "Land Rover",
  rollsroyce: "Rolls-Royce",
  harley: "Harley-Davidson",
  harleydavidson: "Harley-Davidson",
  ssang: "SsangYong",
  ssangyong: "SsangYong",

  // Typo variants seen in live listings.
  mitshubishi: "Mitsubishi",
  suzuzi: "Suzuki",
  sukuzi: "Suzuki",
  nisan: "Nissan",
  daihatzu: "Daihatsu",
  cheery: "Chery",
  mubota: "Kubota",
  kubota: "Kubota",
  hyndaitrajet: "Hyundai",
  suzukimaruti: "Maruti Suzuki",
  marutisuzuki: "Maruti Suzuki",
  sahcmaxus: "Maxus",
  saicmaxus: "Maxus",
  maxus: "Maxus",

  // Scrape artifacts where a model name landed in the make column.
  hondafit: "Honda",
  hondacar: "Honda",
  tatanexon: "Tata",
  mg4: "MG",
  gacaion: "GAC",
  baicbeijing: "BAIC",
  microgeely: "Micro",
  heroelectric: "Hero",
  jeepwrangler: "Jeep",
  mercedesbenzc180: "Mercedes",
  singerlima: "Singer",
};

/**
 * Multi-word values that are a leaked model or garbage rather than a real
 * marque. Kept separate from JUNK_MAKES so genuine two-word brands ("Ashok
 * Leyland", "Royal Enfield", "John Deere") are never dropped by the same rule.
 */
const LEAKED_MODEL_MAKES = new Set([
  "vitzcar",
  "vezelzplay",
  "utone",
  "vivaelite",
  "scooty",
  "car",
  "cars",
  "auto",
  "vehicle",
]);

/**
 * Values that carry no brand information. Returning null for these keeps them
 * out of the make/model filters entirely rather than offering "Test" as a car
 * brand.
 */
const JUNK_MAKES = new Set([
  "other",
  "otherbrand",
  "otherbrands",
  "others",
  "unknown",
  "unnamed",
  "na",
  "n/a",
  "none",
  "null",
  "nil",
  "test",
  "test1",
  "test2",
  "testpos",
  "testlisting",
  "testused",
  "testuser",
  "sample",
  "demo",
  "dummy",
  "lorem",
  "ipsum",
  "asdf",
]);

function compactKey(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "");
}

/**
 * True when a make value carries no usable brand signal and should be hidden
 * from make pickers, deal rails, and hero features.
 */
export function isJunkMake(value: unknown): boolean {
  const raw = String(value ?? "").trim();
  const key = compactKey(raw);
  if (!key) return true;
  if (JUNK_MAKES.has(key) || LEAKED_MODEL_MAKES.has(key)) return true;
  // A bare model year in the make column ("2018") is never a brand.
  if (/^(19|20)\d{2}$/.test(key)) return true;
  const words = raw.toLowerCase().split(/\s+/);
  // Test/fixture rows ("Test Allion 2005", "Test Test 2010").
  if (words.includes("test")) return true;
  // A 4-digit year embedded in the make ("Auchev Pisces 2026") means a model
  // string leaked into the make column.
  if (words.some((w) => /^(19|20)\d{2}$/.test(w))) return true;
  // Leading trim/fuel/body word ("Electric 2026") is the same leak.
  if (words.length && JUNK_MODEL_WORDS.has(compactKey(words[0]))) return true;
  return false;
}

/**
 * Resolve a raw make value to its canonical display name.
 *
 * Returns `null` for junk, so callers can drop the row rather than render an
 * unnamed brand. Unknown-but-plausible single-token makes ("Vikyno") are kept:
 * they may be real niche marques, and silently hiding a brand is worse than
 * showing an uncommon one.
 */
export function canonicalizeMake(value: unknown): string | null {
  const raw = String(value ?? "").trim();
  if (!raw) return null;

  const collapsed = raw.replace(/\s+/g, " ");
  const key = compactKey(collapsed);
  if (!key) return null;
  if (JUNK_MAKES.has(key)) return null;
  if (/^(19|20)\d{2}$/.test(key)) return null;

  const direct = MAKE_ALIASES[key];
  if (direct) return direct;

  // "Honda fit" / "Jeep Wrangler" / "BAIC Beijing": a real brand followed by a
  // model that leaked into the make column. The leading brand is the truth.
  const firstToken = collapsed.split(" ")[0];
  if (firstToken && firstToken !== collapsed) {
    const firstKey = compactKey(firstToken);
    // A leading model year ("2012 Gp 1 2012", "95 2026") means the value is
    // a leaked title fragment. No marque starts with a bare number — scan
    // the remaining tokens for a known brand before giving up.
    if (firstKey && (/^(19|20)\d{2}$/.test(firstKey) || /^\d+$/.test(firstToken))) {
      for (const token of collapsed.split(" ").slice(1)) {
        const head = MAKE_ALIASES[compactKey(token)];
        if (head) return head;
      }
      return null;
    }
    if (firstKey && !JUNK_MAKES.has(firstKey) && !/^(19|20)\d{2}$/.test(firstKey)) {
      const head = MAKE_ALIASES[firstKey];
      if (head) return head;
    }
  }

  // Known leaked model strings ("Vitz car", "VEZEL Z PLAY"). Anything else
  // multi-word is treated as a real marque — "Ashok Leyland" and "Royal
  // Enfield" must survive, so an unknown word is not proof of junk.
  if (LEAKED_MODEL_MAKES.has(key)) return null;

  // Title-case unknown makes so the combobox stays consistent, while
  // preserving genuine short acronyms (TVS, JAC, KTM, BYD).
  return collapsed
    .split(" ")
    .map((part) =>
      part.length <= 4 && part === part.toUpperCase()
        ? part
        : part.charAt(0).toUpperCase() + part.slice(1).toLowerCase(),
    )
    .join(" ");
}

/**
 * Common model misspellings seen in live listings (normalized key -> display).
 * Case variants ("chr", "CHR", "C-HR") collapse to one canonical label so a
 * model's listings aren't split across several filter rows.
 */
const MODEL_ALIASES: Record<string, string> = {
  priuas: "Prius",
  prius: "Prius",
  hillux: "Hilux",
  hilux: "Hilux",
  vits: "Vitz",
  vitz: "Vitz",
  chr: "C-HR",
  axio: "Axio",
  aqua: "Aqua",
  vezel: "Vezel",
  vezelzplay: "Vezel",
  fit: "Fit",
  swift: "Swift",
  alto: "Alto",
  wagonr: "Wagon R",
  mira: "Mira",
  move: "Move",
  tanto: "Tanto",
  nv200: "NV200",
  leaf: "Leaf",
  notee: "Note",
  note: "Note",
  serena: "Serena",
  elgrand: "Elgrand",
  landcruiser: "Land Cruiser",
  landcruiserprado: "Land Cruiser Prado",
  prado: "Land Cruiser Prado",
  corolla: "Corolla",
  corollaaxio: "Corolla Axio",
  corollafielder: "Corolla Fielder",
  fielder: "Corolla Fielder",
  allion: "Allion",
  premio: "Premio",
  camry: "Camry",
  crown: "Crown",
  harrier: "Harrier",
  rav4: "RAV4",
  crv: "CR-V",
  x1: "X1",
  x3: "X3",
  x5: "X5",
  "3series": "3 Series",
  "5series": "5 Series",
  cclass: "C-Class",
  eclass: "E-Class",
  sclass: "S-Class",
  corollla: "Corolla",
  coroola: "Corolla",
  corlla: "Corolla",
  carolla: "Corolla",
  perimio: "Premio",
  premeyo: "Premio",
  dolping: "Dolphin",
  dolphin: "Dolphin",
  hylux: "Hilux",
  spriter: "Sprinter",
  sprinter: "Sprinter",
};

/**
 * Whole-value generic words that leak into the model column on some feeds
 * (trim level, fuel, body style, condition). Matched against the compacted
 * whole value only — "Glory 580" keeps "Glory", but a bare "Suv" is dropped.
 */
const JUNK_MODEL_WORDS = new Set([
  "other",
  "othermodel",
  "othermake",
  "unknownmodel",
  "unknown",
  "suv",
  "muv",
  "door",
  "hybrid",
  "electrichybrid",
  "electric",
  "ev",
  "petrol",
  "diesel",
  "cng",
  "turbo",
  "fully",
  "brandnew",
  "reconditioned",
  "used",
  "lorry",
  "truck",
  "van",
  "bus",
  "car",
  "cars",
  "auto",
  "vehicle",
  "vehicles",
  "double",
  "single",
  "crew",
  "crewcab",
  "highest",
  "long",
  "short",
  "new",
  // Observed in live snapshots: country / town names, dealer words and
  // equipment leaking into the model column ("Japan", "Malabe", "Elephant",
  // "Shell", "Forklift"). Whole-value matches only — no real car model is
  // named any of these.
  "japan",
  "elephant",
  "shell",
  "forklift",
  "fork",
  "roadroller",
]);

/**
 * Equipment / place words whose misspellings also leak into the model column
 * ("Eliphent" for Elephant). Matched fuzzily (edit distance <= 2) because the
 * base words are distinctive enough that near-misses are certainly typos —
 * no real car model is within 2 edits of "elephant".
 */
const FUZZY_JUNK_WORDS = ["elephant", "forklift", "roadroller", "shell", "japan"];

function editDistance(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const curr = [i];
    for (let j = 1; j <= b.length; j++) {
      curr[j] = Math.min(prev[j] + 1, curr[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    prev = curr;
  }
  return prev[b.length];
}

function isFuzzyJunkModel(key: string): boolean {
  if (key.length < 4) return false;
  return FUZZY_JUNK_WORDS.some((word) => editDistance(key, word) <= 2);
}

/**
 * Major Sri Lankan town names seen leaking into the model column in live
 * snapshots (the 25 district names are covered separately). Whole-value match.
 */
const TOWN_KEYS = new Set([
  "malabe", "katugastota", "panadura", "badulla", "kadawatha", "negombo",
  "kalutara", "chilaw", "minuwangoda", "mirigama", "nugegoda", "maharagama",
  "boralesgamuwa", "piliyandala", "homagama", "kaduwela", "wattala",
  "kelaniya", "peliyagoda", "ragama", "jaela", "divulapitiya", "wennappuwa",
  "marawila", "nattandiya",
]);

/**
 * Compacted keys of known marques. A model value that IS a car brand is
 * cross-make leakage ("Nissan" appearing under Toyota models) — no genuine
 * model is named exactly like a marque.
 */
const KNOWN_MAKE_KEYS = new Set([
  "toyota", "suzuki", "nissan", "honda", "mitsubishi", "mazda", "hyundai",
  "kia", "bmw", "mercedes", "mercedesbenz", "benz", "audi", "volkswagen",
  "vw", "ford", "chevrolet", "subaru", "lexus", "daihatsu", "isuzu", "tata",
  "mahindra", "maruti", "marutisuzuki", "perodua", "proton", "micro", "dfsk",
  "chery", "byd", "mg", "gac", "baic", "haval", "geely", "tesla", "acura",
  "infiniti", "landrover", "jaguar", "porsche", "volvo",
  "peugeot", "renault", "fiat", "jeep", "ssangyong", "datsun", "opel",
  "skoda", "yamaha", "bajaj", "tvs", "hero", "ktm", "aprilia", "vespa",
  "hino", "ashokleyland", "eicher",
]);

/** The 25 districts (+ "Sri Lanka") as compacted keys — district names leak into the model column. */
const DISTRICT_KEYS = new Set([
  "colombo", "gampaha", "kalutara", "kandy", "matale", "nuwaraeliya",
  "galle", "matara", "hambantota", "jaffna", "kilinochchi", "mannar",
  "vavuniya", "mullaitivu", "batticaloa", "ampara", "trincomalee",
  "kurunegala", "puttalam", "anuradhapura", "polonnaruwa", "badulla",
  "monaragala", "ratnapura", "kegalle", "srilanka",
]);

/**
 * True when a model value is actually a phone number (scrape artifact where
 * the seller's contact leaked into the model column). Sri Lankan mobiles are
 * 07XXXXXXXX / +947XXXXXXXX; landlines 0XXXXXXXXX. A model that is mostly
 * digits with phone-like length is junk.
 */
function isPhoneNumberModel(raw: string): boolean {
  const digits = raw.replace(/\D/g, "");
  if (digits.length < 9 || digits.length > 12) return false;
  // Must be essentially all digits (allow +, spaces, dashes).
  if (raw.replace(/[+\s\-()]/g, "").replace(/[0-9]/g, "") !== "") return false;
  // SL mobile / landline prefixes, or a bare 9-10 digit run.
  return /^(?:\+?94|0)?[17]\d{8}$/.test(digits) || /^\d{9,10}$/.test(digits);
}

/** Canonicalize a model name: trim, drop junk, fold misspellings. */
export function canonicalizeModel(value: unknown): string {
  const raw = String(value ?? "").trim().replace(/\s+/g, " ");
  if (!raw) return "";
  const key = compactKey(raw);
  if (!key) return "";
  if (JUNK_MAKES.has(key) || JUNK_MODEL_WORDS.has(key)) return "";
  if (isFuzzyJunkModel(key)) return "";
  if (/^(19|20)\d{2}$/.test(key)) return "";
  // Phone numbers and "other"/"null"-style placeholders carry no model signal.
  if (isPhoneNumberModel(raw)) return "";
  // Test/fixture rows ("Test Allion 2005").
  if (raw.toLowerCase().split(/\s+/).includes("test")) return "";
  if (/^(other|othermodel|unknownmodel)$/.test(key)) return "";
  // A model value that is exactly a known marque is cross-make leakage
  // ("Nissan" listed under Toyota models) — never a real model name.
  if (KNOWN_MAKE_KEYS.has(key)) return "";
  // District and major-town names leak into the model column on some feeds.
  if (DISTRICT_KEYS.has(key) || TOWN_KEYS.has(key)) return "";
  const alias = MODEL_ALIASES[key];
  if (alias) return alias;
  return raw;
}

/**
 * Well-known models of other marques, seen misattributed in feed rows
 * ("Navara" listed under Toyota). Whole-value match only; under their own
 * make they are kept because the foreign-make check compares against the
 * row's make.
 */
const KNOWN_MODEL_TO_MAKE: Record<string, string> = {
  navara: "Nissan",
  sonet: "Kia",
  seltos: "Kia",
  vanette: "Nissan",
};

/**
 * True when a model string names a *different* marque ("Toyota Aqua" listed
 * under Land Rover) — a cross-feed misattribution, not a real model. Words
 * that resolve to the row's own make ("Mercedes Benz C180" under Mercedes)
 * are fine; only foreign marques trigger.
 */
export function modelContainsForeignMake(model: unknown, ownMake: unknown): boolean {
  const own = canonicalizeMake(ownMake);
  if (!own) return false;
  const ownKey = compactKey(own);
  for (const word of String(model ?? "").trim().split(/\s+/)) {
    const key = compactKey(word);
    if (!key || !KNOWN_MAKE_KEYS.has(key)) continue;
    const wordMake = MAKE_ALIASES[key] ?? key;
    if (compactKey(wordMake) !== ownKey) return true;
  }
  // Known models of other marques ("Navara" under Toyota).
  const mapped = KNOWN_MODEL_TO_MAKE[compactKey(String(model ?? "").trim())];
  if (mapped && compactKey(mapped) !== ownKey) return true;
  return false;
}

/** A listing is "brandable" when both make and model resolve to real values. */
export function hasUsableMakeModel(make: unknown, model: unknown): boolean {
  return Boolean(canonicalizeMake(make)) && Boolean(canonicalizeModel(model));
}
