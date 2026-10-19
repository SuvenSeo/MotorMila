/**
 * Tolerant timestamp parsing.
 *
 * Snapshots and some API payloads carry human-formatted timestamps such as
 * `"Mon 2026-10-19 1:48 PM (UTC+05:30)"` instead of ISO-8601. Chrome's
 * `Date.parse` accepts that shape but silently ignores the offset (reads it as
 * the browser's local time); Safari/Firefox return NaN. This parser handles
 * ISO-8601 and the human shape explicitly, honouring the offset.
 */

const HUMAN_RE =
  /^(?:[A-Za-z]{3},?\s+)?(\d{4})-(\d{2})-(\d{2})(?:[ T]+(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(AM|PM|am|pm)?)?\s*(?:\((?:UTC|GMT)?\s*([+-])(\d{1,2}):?(\d{2})\)|(?:UTC|GMT)?\s*([+-])(\d{2}):?(\d{2})|Z)?\s*$/;

/** Returns epoch milliseconds, or null when the value is not a recognisable time. */
export function parseFlexibleTime(value: string | number | Date | null | undefined): number | null {
  if (value === null || value === undefined || value === "") return null;
  if (value instanceof Date) {
    const t = value.getTime();
    return Number.isFinite(t) ? t : null;
  }
  if (typeof value === "number") return Number.isFinite(value) ? value : null;

  const raw = String(value).trim();
  // Strict ISO with an explicit zone (or date-only) is safe across engines.
  if (/^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:?\d{2}))?$/.test(raw)) {
    const t = Date.parse(raw);
    if (Number.isFinite(t)) return t;
  }

  const m = HUMAN_RE.exec(raw);
  if (m) {
    const [, y, mo, d, hh, mm, ss, ampm, sign1, oh1, om1, sign2, oh2, om2] = m;
    let hour = hh ? Number(hh) : 0;
    if (ampm) {
      const pm = ampm.toUpperCase() === "PM";
      if (hour === 12) hour = pm ? 12 : 0;
      else if (pm) hour += 12;
    }
    const sign = sign1 || sign2;
    const offH = Number(oh1 ?? oh2 ?? 0);
    const offM = Number(om1 ?? om2 ?? 0);
    // No zone given: the pipeline writes Sri Lanka time, so assume +05:30.
    const offsetMin = sign ? (sign === "-" ? -1 : 1) * (offH * 60 + offM) : raw.endsWith("Z") ? 0 : 330;
    const utc = Date.UTC(Number(y), Number(mo) - 1, Number(d), hour, mm ? Number(mm) : 0, ss ? Number(ss) : 0);
    const t = utc - offsetMin * 60_000;
    return Number.isFinite(t) ? t : null;
  }

  const fallback = Date.parse(raw);
  return Number.isFinite(fallback) ? fallback : null;
}

/** Whole days between `value` and `now` (never negative), or null. */
export function daysSince(value: string | number | Date | null | undefined, now: number = Date.now()): number | null {
  const t = parseFlexibleTime(value);
  if (t === null) return null;
  return Math.max(0, Math.floor((now - t) / 86_400_000));
}

/** "just now", "5 min ago", "3h ago", "2 days ago". */
export function relativeAgo(value: string | number | Date | null | undefined, now: number = Date.now()): string | null {
  const t = parseFlexibleTime(value);
  if (t === null) return null;
  const diff = Math.max(0, now - t);
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return days === 1 ? "1 day ago" : `${days} days ago`;
}
