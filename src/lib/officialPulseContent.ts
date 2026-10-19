export type PulseSourceGuide = {
  key: string; // dmt_registrations | dmt_transfers | customs_tenders | import_parity
  source: string; // dmt | customs | import_parity | import_reference
  signalType: string;
  title: string;
  shortLabel: string;
  summary: string;
  whyItMatters: string[];
  howWeReadIt: string[];
  dealerTip: string;
};

const SOURCE_LABELS: Record<string, string> = {
  dmt: "DMT",
  customs: "Customs",
  import_parity: "Import parity",
  import_reference: "Import refs",
  cbsl: "CBSL",
  dcs: "DCS",
};

const MONTH_SHORT = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
] as const;

/** Human labels for raw metric/category keys stored on market signals. */
const METRIC_LABELS: Record<string, string> = {
  import_cost: "Import cost index",
  official: "Official signal",
  macro: "Macro indicator",
  usd_lkr: "USD / LKR rate",
  registrations: "Registrations",
  transfers: "Ownership transfers",
  new_registrations: "New registrations",
  price_index: "Price index",
  import_parity: "Import parity",
  revenue_licence: "Revenue licence",
  revenue_license: "Revenue licence",
};

/** Turn a raw metric/category key ("import_cost") into a human title. */
export function labelPulseMetric(raw: string | null | undefined): string {
  const value = String(raw ?? "").trim();
  if (!value) return "Market signal";
  const known = METRIC_LABELS[value.toLowerCase()];
  if (known) return known;
  // Only prettify machine-looking keys (snake_case or plain lowercase).
  // Human-written labels ("Passenger cars") pass through untouched.
  if (value === value.toLowerCase()) {
    return value
      .replace(/[_-]+/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .replace(/\b\w/g, (ch) => ch.toUpperCase());
  }
  return value;
}

export const PULSE_SOURCE_GUIDES: PulseSourceGuide[] = [
  {
    key: "dmt_registrations",
    source: "dmt",
    signalType: "registrations",
    title: "DMT registrations",
    shortLabel: "Registrations",
    summary:
      "Vehicle registration document and activity signals published by the Department of Motor Traffic (DMT.gov.lk).",
    whyItMatters: [
      "Registration volume is an early read on how many vehicles are entering the formal on-road fleet.",
      "Shifts in document activity often precede listing-supply changes on consumer marketplaces.",
      "Dealers use registration pace to judge whether a segment is heating up or cooling before prices move.",
    ],
    howWeReadIt: [
      "We track DMT registration-related documents and page activity as a proxy pulse, not a raw VIN-level feed.",
      "Higher document counts in a period usually mean more registration paperwork is circulating for that window.",
      "Compare the latest period against recent months to spot acceleration or slowdown, not day-to-day noise.",
      "Pair registration pace with live listing counts in Motormila to see whether supply is catching demand.",
    ],
    dealerTip:
      "When registration documents spike for a segment you stock, expect more competing inventory within 2–6 weeks — tighten ask prices early rather than waiting for aged stock.",
  },
  {
    key: "dmt_transfers",
    source: "dmt",
    signalType: "transfers",
    title: "DMT transfers",
    shortLabel: "Transfers",
    summary:
      "Ownership transfer document signals from DMT.gov.lk — a proxy for how actively vehicles are changing hands.",
    whyItMatters: [
      "Transfer activity reflects completed ownership changes, not just ads or inquiries.",
      "Rising transfers with flat listings can signal off-market liquidity or faster close rates.",
      "Transfer pace helps separate genuine turnover from listing churn and stale inventory.",
    ],
    howWeReadIt: [
      "We monitor DMT transfer-related documents and page signals as an ownership-change pulse.",
      "Treat the value as a period activity indicator: more matched documents implies more transfer paperwork in view.",
      "Read transfers alongside registrations — registrations add fleet stock; transfers show that stock is actually moving.",
      "A sustained drop in transfers while listings pile up usually means slower retail velocity.",
    ],
    dealerTip:
      "If transfers stay strong while your lot days-on-market climb, the market is still liquid — revisit pricing and presentation before blaming demand.",
  },
  {
    key: "customs_tenders",
    source: "customs",
    signalType: "tender_sales",
    title: "Customs tender sales",
    shortLabel: "Tenders",
    summary:
      "Vehicle tender activity monitored on customs.gov.lk — official sales channels that can inject supply into the trade.",
    whyItMatters: [
      "Customs tenders can release batches of vehicles outside normal dealer wholesale channels.",
      "Sudden tender volume can pressure retail prices in nearby segments once units hit the open market.",
      "Dealers watching tenders get advance notice of potential wholesale alternatives and competitive stock.",
    ],
    howWeReadIt: [
      "We scan Sri Lanka Customs tender-sales pages for vehicle-related tender links and activity counts.",
      "The signal value is typically a count of matching vehicle-tender references observed for the period.",
      "A rising tender count is a supply-side heads-up, not a guaranteed retail price drop the next day.",
      "Cross-check tender spikes with segment medians in Motormila before adjusting floor prices.",
    ],
    dealerTip:
      "Before matching a low retail ask after a tender wave, confirm whether those units actually reach your segment — many tender lots stay wholesale or specialty channels.",
  },
  {
    key: "import_parity",
    source: "import_parity",
    signalType: "landed_cost",
    title: "Import parity & landed cost",
    shortLabel: "Landed cost",
    summary:
      "Import reference and landed-cost availability signals — whether parity / CIF-style reference pages are live for dealer cost checks.",
    whyItMatters: [
      "Landed-cost references anchor what a replacement import would cost before retail margin.",
      "When parity sources are available, dealers can sanity-check used asks against replacement cost.",
      "Missing or stale import references mean you are flying blind on CIF / duty-influenced floors.",
    ],
    howWeReadIt: [
      "We treat this as an availability / reference pulse: whether import parity or landed-cost reference pages respond.",
      "A boolean-style value of available means the reference surface is reachable for that observation window.",
      "Use the signal as a readiness check, then open the in-platform guide and related snapshots for context.",
      "Combine with live listing medians — parity without demand still will not clear aged inventory.",
    ],
    dealerTip:
      "When landed-cost references are available and your retail ask sits far above replacement parity, expect informed buyers to negotiate hard — publish a clear justification or adjust.",
  },
  {
    key: "cbsl_fx",
    source: "cbsl",
    signalType: "exchange_rate",
    title: "CBSL USD/LKR spot",
    shortLabel: "USD/LKR",
    summary:
      "Official indicative USD→LKR spot from the Central Bank of Sri Lanka — the FX input that scales every CIF-based landed-cost calculation.",
    whyItMatters: [
      "A 1% FX move shifts every USD CIF import into LKR duties, VAT, and luxury tax in the same direction.",
      "Dealers quoting landed cost without a fresh CBSL print risk under- or over-bidding Japanese / UAE stock.",
      "FX also frames used retail asks that were set when the rupee was weaker or stronger.",
    ],
    howWeReadIt: [
      "Motormila pulls the latest published USD/LKR spot (macro publisher → CBSL series) into Official Pulse and the calculator.",
      "Treat the value as a business-day indicative rate, not an intraday dealer quote.",
      "Compare the latest print to last week — sustained moves matter more than a single tick.",
      "Use the calculator's Use live FX action to lock the same print into a landed-cost scenario.",
    ],
    dealerTip:
      "When USD/LKR jumps, re-run landed cost on any uncommitted LC before you honour an old LKR ask — duty compounds on the CIF conversion.",
  },
  {
    key: "dcs_inflation",
    source: "dcs",
    signalType: "inflation",
    title: "DCS CCPI inflation",
    shortLabel: "CCPI",
    summary:
      "Colombo Consumer Price Index from the Department of Census & Statistics — the inflation backdrop for real (inflation-adjusted) vehicle price reads.",
    whyItMatters: [
      "Nominal LKR asking prices can look 'up' while real purchasing power is flat once CCPI is rising.",
      "Inflation spikes historically coincided with vehicle price explosions during the 2022 crisis.",
      "Macro context helps separate FX/duty-driven listing moves from pure demand shifts.",
    ],
    howWeReadIt: [
      "We store the CCPI index level and, when published, year-on-year percent as separate pulse metrics.",
      "YoY percent is the headline inflation read; the index level supports longer history comparisons.",
      "Pair inflation with USD/LKR and Motormila model medians before calling a segment 'hot'.",
      "A falling YoY with sticky listing prices often means dealers have not yet repriced.",
    ],
    dealerTip:
      "If CCPI YoY is cooling but your lot still carries crisis-era asks, expect longer DOM — refresh comps against current medians.",
  },
];

function normalizeSourceKey(source: string): string {
  const key = source.trim().toLowerCase();
  if (key === "import_reference") return "import_parity";
  return key;
}

export function matchPulseGuide(source: string, signalType: string): PulseSourceGuide | null {
  const normalizedSource = normalizeSourceKey(source);
  const normalizedType = signalType.trim().toLowerCase();
  if (!normalizedSource || !normalizedType) return null;

  return (
    PULSE_SOURCE_GUIDES.find(
      (guide) =>
        normalizeSourceKey(guide.source) === normalizedSource &&
        guide.signalType.toLowerCase() === normalizedType,
    ) ?? null
  );
}

export function formatPulsePeriod(year: number | null, month: number | null): string | null {
  if (year == null || !Number.isFinite(year)) return null;
  if (month == null || !Number.isFinite(month) || month < 1 || month > 12) {
    return String(year);
  }
  const label = MONTH_SHORT[month - 1];
  return `${label} ${year}`;
}

export function formatPulseValue(
  value: number | null,
  unit: string | null,
  metric: string,
): string {
  if (value == null || !Number.isFinite(value)) {
    const fallback = metric.trim();
    return fallback ? fallback.replace(/_/g, " ") : "—";
  }

  const unitKey = (unit || "").trim().toLowerCase();
  if (unitKey === "boolean" || metric.toLowerCase().includes("available")) {
    return value >= 1 ? "Available" : "Unavailable";
  }

  const formatted = value.toLocaleString();
  if (!unitKey) return formatted;
  if (unitKey === "count") return formatted;
  if (unitKey === "lkr_per_usd" || unitKey === "lkr per usd") {
    return `Rs ${formatted} / USD`;
  }
  if (unitKey === "pct" || unitKey === "%") {
    return `${formatted}%`;
  }
  if (unitKey === "index") {
    return `${formatted} idx`;
  }
  return `${formatted} ${unit}`;
}

export function labelPulseSource(source: string): string {
  const key = source.trim().toLowerCase();
  if (!key) return "Unknown";
  return SOURCE_LABELS[key] || source.replace(/_/g, " ");
}
