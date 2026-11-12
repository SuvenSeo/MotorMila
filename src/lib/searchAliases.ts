/**
 * Search-box tolerance for romanised Sinhala ("Singlish") spellings and
 * common misspellings of the vehicles Sri Lankans search for most.
 *
 *   normalizeSearchQuery("akwa 2015")  → "aqua 2015"
 *   normalizeSearchQuery("wagonr")     → "wagon r"
 *   resolveSearchAlias("primio")       → { make: "Toyota", model: "Premio", ... }
 *
 * The backend matches each whitespace token with ILIKE against make /
 * model / title, so rewriting the text to the canonical spelling is enough
 * for it to match. Keep this table small and high-confidence: a wrong alias
 * silently hides real results.
 */

interface ModelAlias {
  make: string;
  model: string;
  /** Canonical search text sent to the API ("wagon r"). */
  canonical: string;
  aliases: string[];
}

const MODEL_ALIASES: ModelAlias[] = [
  { make: "Suzuki", model: "Wagon R", canonical: "wagon r", aliases: ["wagonr", "wagon r", "wagan r", "waganr", "wagen r", "wagenr", "wegon r", "wegonr", "vagon r", "vagonr", "wagon-r"] },
  { make: "Toyota", model: "Aqua", canonical: "aqua", aliases: ["aqua", "akwa", "aqwa", "acqua", "akua", "acua", "aquwa", "akva"] },
  { make: "Toyota", model: "Premio", canonical: "premio", aliases: ["premio", "primio", "premeo", "primeo", "premiyo", "premiou"] },
  { make: "Toyota", model: "Vitz", canonical: "vitz", aliases: ["vitz", "vits", "vitts", "witz", "wits"] },
  { make: "Toyota", model: "Axio", canonical: "axio", aliases: ["axio", "axeo", "axsio", "aksio", "axiyo", "akseo"] },
  { make: "Toyota", model: "Allion", canonical: "allion", aliases: ["allion", "alion", "allian", "alian", "aliyon"] },
  { make: "Toyota", model: "Prius", canonical: "prius", aliases: ["prius", "pruis", "prious", "priyus", "preus"] },
  { make: "Toyota", model: "Corolla", canonical: "corolla", aliases: ["corolla", "carolla", "corola", "karola", "korola", "carola"] },
  { make: "Toyota", model: "Raize", canonical: "raize", aliases: ["raize", "raiz", "rize"] },
  { make: "Toyota", model: "Yaris", canonical: "yaris", aliases: ["yaris", "yaaris", "yeris"] },
  { make: "Toyota", model: "Passo", canonical: "passo", aliases: ["passo", "paso"] },
  { make: "Honda", model: "Vezel", canonical: "vezel", aliases: ["vezel", "vezal", "vesel", "wezel", "vezle"] },
  { make: "Honda", model: "Fit", canonical: "fit", aliases: ["fit", "fitt"] },
  { make: "Honda", model: "Grace", canonical: "grace", aliases: ["grace", "grase", "grece"] },
  { make: "Honda", model: "Civic", canonical: "civic", aliases: ["civic", "sivic", "civik", "sivik"] },
  { make: "Honda", model: "CR-V", canonical: "cr-v", aliases: ["crv", "cr-v", "cr v"] },
  { make: "Suzuki", model: "Alto", canonical: "alto", aliases: ["alto", "altto"] },
  { make: "Suzuki", model: "Swift", canonical: "swift", aliases: ["swift", "swif"] },
  { make: "Suzuki", model: "Every", canonical: "every", aliases: ["every", "evry"] },
  { make: "Suzuki", model: "Spacia", canonical: "spacia", aliases: ["spacia", "spasia", "spaciya"] },
  { make: "Suzuki", model: "Hustler", canonical: "hustler", aliases: ["hustler", "hasler", "hustlar", "husler"] },
  { make: "Nissan", model: "Leaf", canonical: "leaf", aliases: ["leaf", "leef", "nissan leaf"] },
  { make: "Nissan", model: "X-Trail", canonical: "x-trail", aliases: ["xtrail", "x-trail", "x trail", "xtrial", "x trial"] },
  { make: "Nissan", model: "Dayz", canonical: "dayz", aliases: ["dayz", "deiz"] },
  { make: "Mitsubishi", model: "Montero", canonical: "montero", aliases: ["montero", "montaro"] },
];

const MAKE_ALIASES: Array<{ make: string; aliases: string[] }> = [
  { make: "Toyota", aliases: ["toyota", "toyata", "toyta", "toyoto", "toyotta", "tayota"] },
  { make: "Suzuki", aliases: ["suzuki", "suzki", "suzuky", "susuki", "suzuk"] },
  { make: "Honda", aliases: ["honda", "hondha", "handa"] },
  { make: "Nissan", aliases: ["nissan", "nisan", "nissen", "nisaan"] },
  { make: "Mitsubishi", aliases: ["mitsubishi", "mitsibishi", "mitsubushi", "mitsubisi", "mitshubishi"] },
  { make: "Daihatsu", aliases: ["daihatsu", "daihatshu", "daihatzu", "daihatsoo"] },
  { make: "Hyundai", aliases: ["hyundai", "hyundae", "hundai", "hyndai", "huyndai"] },
  { make: "Mahindra", aliases: ["mahindra", "mahindhra", "mahendra"] },
  { make: "Mazda", aliases: ["mazda", "masda"] },
  { make: "Perodua", aliases: ["perodua", "peroduwa", "perodwa"] },
  { make: "Bajaj", aliases: ["bajaj", "bajaaj"] },
];

/** Lowercase, collapse whitespace, drop punctuation except hyphens inside words. */
function clean(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFKC")
    .replace(/[^\p{L}\p{N}\s-]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Compact form used for matching: no spaces or hyphens ("wagon-r" → "wagonr"). */
function compact(text: string): string {
  return text.replace(/[\s-]+/g, "");
}

const modelByCompact = new Map<string, ModelAlias>();
for (const entry of MODEL_ALIASES) {
  for (const alias of entry.aliases) modelByCompact.set(compact(clean(alias)), entry);
}
const makeByCompact = new Map<string, string>();
for (const entry of MAKE_ALIASES) {
  for (const alias of entry.aliases) makeByCompact.set(compact(clean(alias)), entry.make);
}

type Token = { kind: "model"; entry: ModelAlias } | { kind: "make"; make: string } | { kind: "text"; text: string };

/** Greedy longest-match tokenizer over 3/2/1-word windows. */
function tokenize(query: string): Token[] {
  const words = clean(query).split(" ").filter(Boolean);
  const out: Token[] = [];
  let i = 0;
  while (i < words.length) {
    let matched = false;
    for (let len = Math.min(3, words.length - i); len >= 1; len -= 1) {
      const key = compact(words.slice(i, i + len).join(" "));
      const model = modelByCompact.get(key);
      if (model) {
        out.push({ kind: "model", entry: model });
        i += len;
        matched = true;
        break;
      }
      const make = makeByCompact.get(key);
      if (make) {
        out.push({ kind: "make", make });
        i += len;
        matched = true;
        break;
      }
    }
    if (!matched) {
      out.push({ kind: "text", text: words[i] });
      i += 1;
    }
  }
  return out;
}

/** Rewrite misspellings to the canonical search spelling. Unknown words pass through. */
export function normalizeSearchQuery(query: string | null | undefined): string {
  if (!query) return "";
  return tokenize(query)
    .map((t) => (t.kind === "model" ? t.entry.canonical : t.kind === "make" ? t.make.toLowerCase() : t.text))
    .join(" ")
    .trim();
}

export interface SearchAliasResolution {
  /** Make inferred from an alias (model alias implies its make). */
  make?: string;
  /** Model when the query named exactly one known model. */
  model?: string;
  /** What is left to send as free text (e.g. a year), already normalised. */
  rest: string;
  /** Full normalised query text. */
  normalized: string;
  /** True when any word was rewritten from a misspelling. */
  corrected: boolean;
}

/**
 * Resolve a query into structured make/model filters where it is
 * unambiguous. "akwa 2015" → { make: Toyota, model: Aqua, rest: "2015" }.
 * A query naming two models, or a make that contradicts the model, keeps
 * everything as text so we never hide results the user asked for.
 */
export function resolveSearchAlias(query: string | null | undefined): SearchAliasResolution {
  const raw = clean(query || "");
  const tokens = tokenize(raw);
  const normalized = normalizeSearchQuery(raw);
  const models = tokens.filter((t): t is Extract<Token, { kind: "model" }> => t.kind === "model");
  const makes = tokens.filter((t): t is Extract<Token, { kind: "make" }> => t.kind === "make");
  const texts = tokens.filter((t): t is Extract<Token, { kind: "text" }> => t.kind === "text").map((t) => t.text);
  const corrected = compact(normalized) !== compact(raw);

  if (models.length === 1 && makes.every((m) => m.make === models[0].entry.make)) {
    return { make: models[0].entry.make, model: models[0].entry.model, rest: texts.join(" "), normalized, corrected };
  }
  if (models.length === 0 && makes.length === 1) {
    return { make: makes[0].make, rest: texts.join(" "), normalized, corrected };
  }
  return { rest: normalized, normalized, corrected };
}
