import { describe, expect, it } from "vitest";
import { fitNav } from "@/lib/navFit";

/**
 * fitNav picks the smallest collapse step at which the centre group stays
 * centred with >= 12px clear of both side clusters. jsdom has no layout, so
 * widths are stubbed: the actions cluster shrinks as data-fit rises.
 */
function makeHeader(width: number, actionsByLevel: number[], centre = 440, brand = 157) {
  const header = document.createElement("header");
  header.style.setProperty("--row-pad", "20px");
  header.style.setProperty("--row-max", "1560px");
  header.style.setProperty("--cap-max", "1280px");
  header.style.setProperty("--cap-gap", "16px");
  header.style.setProperty("--cap-pad", "12px");
  header.innerHTML = `<nav class="site-nav"><div></div><div class="site-nav__center"></div><div></div></nav>`;
  const nav = header.querySelector(".site-nav") as HTMLElement;
  const [b, c, a] = Array.from(nav.children) as HTMLElement[];
  Object.defineProperty(header, "clientWidth", { get: () => width });
  Object.defineProperty(b, "offsetWidth", { get: () => brand });
  Object.defineProperty(c, "offsetWidth", { get: () => centre });
  Object.defineProperty(a, "offsetWidth", {
    get: () => actionsByLevel[Math.min(Number(header.dataset.fit ?? 0), actionsByLevel.length - 1)],
  });
  document.body.appendChild(header);
  return header;
}

describe("fitNav", () => {
  // Signed-in actions width per step: full, -Ctrl K, Search→icon, -name, (Saved step leaves actions alone)
  const signedIn = [418, 368, 308, 258, 258];

  it("keeps everything at the top of a wide screen", () => {
    expect(fitNav(makeHeader(1920, signedIn), false)).toBe(0);
  });

  it("collapses in the capsule, which is narrower than the full row", () => {
    // capsule interior at 1920 = 1280 - 24 = 1256 → side budget (1256 - 440) / 2 - 12 = 396
    const header = makeHeader(1920, signedIn);
    expect(fitNav(header, true)).toBe(1);
    expect(header.dataset.fit).toBe("1");
  });

  it("steps further when the side budget is tighter", () => {
    // 1366 top: 1326 interior → budget 431 → full fits; 1240 capsule: 1184 → budget 360 → step 2
    expect(fitNav(makeHeader(1366, signedIn), false)).toBe(0);
    expect(fitNav(makeHeader(1240, signedIn), true)).toBe(2);
  });

  it("caps at the last step when nothing fits", () => {
    expect(fitNav(makeHeader(900, [900]), true)).toBe(4);
  });

  it("is a no-op when the centre group is not rendered (below lg)", () => {
    expect(fitNav(makeHeader(800, signedIn, 0), true)).toBe(0);
  });
});
