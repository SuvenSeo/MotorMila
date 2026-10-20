// Header fit logic (polish r3), kept out of Navbar.tsx for fast refresh.

/** Collapse steps, in order: 1 hide "Ctrl K" · 2 Search → icon · 3 account name → icon · 4 Saved → More. */
const MAX_FIT = 4;
/** Minimum clear space between the centre group and either side cluster. */
const NAV_MIN_GAP = 12;

function cssPx(style: CSSStyleDeclaration, name: string, fallback: number) {
  const v = parseFloat(style.getPropertyValue(name));
  return Number.isFinite(v) ? v : fallback;
}

/**
 * Width the row's content gets in the state the header is heading to (full
 * row at the top, capsule interior when scrolled/menu-open). Computed from the
 * target geometry, not the live layout, so a morph in flight never skews it.
 */
function navContentWidth(header: HTMLElement, capsule: boolean) {
  const cs = getComputedStyle(header);
  const w = header.clientWidth;
  const rowPad = cssPx(cs, "--row-pad", 20);
  const rowMax = cssPx(cs, "--row-max", 1560);
  const top = Math.min(w, rowMax) - 2 * rowPad;
  if (!capsule) return top;
  const capMax = cssPx(cs, "--cap-max", 1280);
  const capGap = cssPx(cs, "--cap-gap", 16);
  const capPad = cssPx(cs, "--cap-pad", 12);
  return Math.min(top, Math.min(capMax, w - 2 * capGap) - 2 * capPad);
}

/**
 * Pick the smallest collapse step at which brand · centre · actions fit with
 * the centre group still centred and >= NAV_MIN_GAP clear of both sides.
 * Runs synchronously (DOM attribute, no React state) so there is no flash and
 * no fit/unfit oscillation. CSS media queries give the same steps a
 * width-based floor for the pre-hydration render.
 */
export function fitNav(header: HTMLElement, capsule: boolean) {
  const nav = header.querySelector<HTMLElement>(".site-nav");
  const center = header.querySelector<HTMLElement>(".site-nav__center");
  if (!nav || !center || center.offsetWidth === 0) {
    header.dataset.fit = "0";
    return 0;
  }
  const brand = nav.firstElementChild as HTMLElement | null;
  const actions = nav.lastElementChild as HTMLElement | null;
  const avail = navContentWidth(header, capsule);
  let level = 0;
  for (; level <= MAX_FIT; level++) {
    header.dataset.fit = String(level);
    const side = Math.max(brand?.offsetWidth ?? 0, actions?.offsetWidth ?? 0);
    if (center.offsetWidth + 2 * (side + NAV_MIN_GAP) <= avail) break;
  }
  level = Math.min(level, MAX_FIT);
  header.dataset.fit = String(level);
  return level;
}
