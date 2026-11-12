// Header fit logic (polish r3), kept out of Navbar.tsx for fast refresh.

/** Collapse steps, in order: 1 hide "Ctrl K" · 2 Search → icon · 3 account name → icon · 4 Saved → More. */
const MAX_FIT = 4;
/** Minimum clear space between the centre group and either side cluster. */
const NAV_MIN_GAP = 12;

function cssPx(style: CSSStyleDeclaration, name: string, fallback: number) {
  const v = parseFloat(style.getPropertyValue(name));
  return Number.isFinite(v) ? v : fallback;
}

type NavGeometry = { top: number; cap: number; shift: number; capSx: number; capSy: number };

/**
 * Geometry of both header states, from the CSS custom properties (the same
 * math as index.css "Site header"): the content width of the full row and of
 * the capsule interior, how far each side cluster moves between them, and the
 * scale that maps the capsule onto the full-bleed bar (its start pose).
 * Computed from the target geometry, not the live layout, so a morph in flight
 * never skews it.
 */
function navGeometry(header: HTMLElement): NavGeometry {
  const cs = getComputedStyle(header);
  const w = header.clientWidth;
  // The 64px row, not the header box (which also holds the open menu panel).
  const h = header.querySelector<HTMLElement>(".site-nav")?.offsetHeight || 64;
  const rowPad = cssPx(cs, "--row-pad", 20);
  const rowMax = cssPx(cs, "--row-max", 1560);
  const capMax = cssPx(cs, "--cap-max", 1280);
  const capGap = cssPx(cs, "--cap-gap", 16);
  const capPad = cssPx(cs, "--cap-pad", 12);
  const capTop = cssPx(cs, "--cap-top", 8);
  const capBottom = cssPx(cs, "--cap-bottom", 4);
  const padTop = Math.max(rowPad, (w - rowMax) / 2 + rowPad);
  const capInset = Math.max(capGap, (w - capMax) / 2);
  const padCap = Math.max(padTop, capInset + capPad);
  const capW = Math.max(1, w - 2 * capInset);
  const capH = Math.max(1, h - capTop - capBottom);
  return {
    top: Math.max(0, w - 2 * padTop),
    cap: Math.max(0, w - 2 * padCap),
    shift: padCap - padTop,
    capSx: w / capW,
    capSy: h / capH,
  };
}

/**
 * Pick, for both the full row and the capsule, the smallest collapse step at
 * which brand · centre · actions fit with the centre group still centred and
 * >= NAV_MIN_GAP clear of both sides. Stores them as data-fit-top /
 * data-fit-cap (the scroll path just copies one into data-fit, a pure write),
 * plus the morph geometry as CSS variables. Runs synchronously (DOM
 * attributes, no React state) so there is no flash and no fit/unfit
 * oscillation, and only on resize / content changes — never per scroll frame.
 * CSS media queries give the same steps a width-based floor for the
 * pre-hydration render.
 */
export function fitNav(header: HTMLElement, capsule: boolean) {
  const g = navGeometry(header);
  header.style.setProperty("--nav-shift", `${g.shift.toFixed(2)}px`);
  header.style.setProperty("--cap-sx", g.capSx.toFixed(4));
  header.style.setProperty("--cap-sy", g.capSy.toFixed(4));
  const nav = header.querySelector<HTMLElement>(".site-nav");
  const center = header.querySelector<HTMLElement>(".site-nav__center");
  if (!nav || !center || center.offsetWidth === 0) {
    header.dataset.fitTop = "0";
    header.dataset.fitCap = "0";
    header.dataset.fit = "0";
    return 0;
  }
  const brand = nav.firstElementChild as HTMLElement | null;
  const actions = nav.lastElementChild as HTMLElement | null;
  let top = -1;
  let cap = -1;
  for (let level = 0; level <= MAX_FIT && cap < 0; level++) {
    header.dataset.fit = String(level);
    const need = center.offsetWidth + 2 * (Math.max(brand?.offsetWidth ?? 0, actions?.offsetWidth ?? 0) + NAV_MIN_GAP);
    if (top < 0 && need <= g.top) top = level;
    if (need <= g.cap) cap = level;
  }
  if (top < 0) top = MAX_FIT;
  if (cap < 0) cap = MAX_FIT;
  header.dataset.fitTop = String(top);
  header.dataset.fitCap = String(cap);
  const level = capsule ? cap : top;
  header.dataset.fit = String(level);
  return level;
}
