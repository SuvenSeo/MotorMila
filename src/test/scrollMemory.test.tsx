import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Route, Routes, useLocation, useNavigate } from "react-router-dom";
import { TestRouter } from "./testUtils";
import { ScrollRestoration } from "@/components/ScrollRestoration";
import {
  applyScroll,
  findAnchor,
  markRestorePending,
  markScrollAnchor,
  markScrollAnchorFromEvent,
  readScroll,
  resetScrollMemory,
  restorePending,
  restoreScroll,
  RESTORE_ATTR,
  saveScroll,
  signalScrollRestored,
} from "@/lib/scrollMemory";
import { useDeferredMount } from "@/hooks/useDeferredMount";
import { DeferredSection } from "@/components/DeferredSection";

let scrollY = 0;
let scrollHeight = 5000;

function rect(top: number, height = 400): DOMRect {
  return { top, bottom: top + height, left: 0, right: 300, width: 300, height, x: 0, y: top, toJSON: () => ({}) } as DOMRect;
}

/** A card whose document position is `docTop` (viewport top follows scrollY). */
function card(id: string, docTop: number): HTMLElement {
  const el = document.createElement("article");
  el.dataset.scrollAnchor = id;
  el.getBoundingClientRect = () => rect(docTop - scrollY);
  document.body.appendChild(el);
  return el;
}

/** A plain listing link (a "What's moving" row, a similar car) at `docTop`. */
function link(href: string, docTop: number, height = 80): HTMLAnchorElement {
  const el = document.createElement("a");
  el.setAttribute("href", href);
  el.getBoundingClientRect = () => rect(docTop - scrollY, height);
  document.body.appendChild(el);
  return el;
}

beforeEach(() => {
  resetScrollMemory();
  scrollY = 0;
  scrollHeight = 5000;
  Object.defineProperty(window, "scrollY", { configurable: true, get: () => scrollY });
  Object.defineProperty(window, "innerHeight", { configurable: true, value: 800 });
  Object.defineProperty(document.documentElement, "scrollHeight", { configurable: true, get: () => scrollHeight });
  window.scrollTo = vi.fn((opts?: ScrollToOptions | number) => {
    if (typeof opts === "object" && opts.top != null) scrollY = opts.top;
  }) as unknown as typeof window.scrollTo;
});

afterEach(() => {
  document.body.innerHTML = "";
  document.documentElement.removeAttribute(RESTORE_ATTR);
});

describe("scrollMemory", () => {
  it("anchors on the first card in view, or the tapped card when it is on screen", () => {
    card("a", 100);
    card("b", 1300);
    card("c", 1750);
    scrollY = 1000;
    expect(findAnchor()).toEqual({ id: "b", top: 300 });
    markScrollAnchor("c");
    expect(findAnchor()).toEqual({ id: "c", top: 750 });
  });

  it("puts the anchor card back at its old viewport offset even if the grid moved", () => {
    card("b", 1340); // the remounted grid laid out 40px lower
    expect(applyScroll({ y: 1000, anchor: { id: "b", top: 300 } })).toBe(true);
    expect(scrollY).toBe(1040);
  });

  it("keeps trying while the page is too short, then lands", () => {
    scrollHeight = 900; // list not rendered yet: max scroll 100
    expect(applyScroll({ y: 2000 })).toBe(false);
    expect(scrollY).toBe(100);
    scrollHeight = 5000;
    expect(applyScroll({ y: 2000 })).toBe(true);
    expect(scrollY).toBe(2000);
  });

  it("waits for a missing anchor until settle, then trusts scrollY", () => {
    expect(applyScroll({ y: 1200, anchor: { id: "gone", top: 200 } })).toBe(false);
    expect(applyScroll({ y: 1200, anchor: { id: "gone", top: 200 } }, true)).toBe(true);
    expect(scrollY).toBe(1200);
  });

  it("anchors on plain listing links too, telling repeated links apart", () => {
    link("/listing/9", 200); // above the viewport: the photo link
    link("/listing/9", 1250); // the title link of the same listing, in view
    scrollY = 1000;
    expect(findAnchor()).toEqual({ id: "link:/listing/9#1", top: 250 });
    // On the way back the second occurrence is the one put back in place.
    scrollY = 0;
    expect(applyScroll({ y: 1000, anchor: { id: "link:/listing/9#1", top: 250 } })).toBe(true);
    expect(scrollY).toBe(1000);
  });

  it("a link inside a card counts as the card", () => {
    const c = card("42", 1300);
    const inner = document.createElement("a");
    inner.setAttribute("href", "/listing/42");
    inner.getBoundingClientRect = () => rect(1300 - scrollY);
    c.appendChild(inner);
    scrollY = 1000;
    markScrollAnchorFromEvent(inner);
    expect(findAnchor()).toEqual({ id: "42", top: 300 });
  });

  it("prefers the link that was tapped over the first one in view", () => {
    link("/listing/1", 1100);
    const tapped = link("/listing/2", 1500);
    scrollY = 1000;
    markScrollAnchorFromEvent(tapped);
    expect(findAnchor()).toEqual({ id: "link:/listing/2#0", top: 500 });
  });

  it("flags a pending restore only for a spot below the first screen, until it lands", () => {
    markRestorePending({ y: 200 });
    expect(restorePending()).toBe(false);
    markRestorePending({ y: 3000 });
    expect(restorePending()).toBe(true);
    signalScrollRestored();
    expect(restorePending()).toBe(false);
    markRestorePending(undefined);
    expect(restorePending()).toBe(false);
  });

  it("puts the anchor back if content above it grows after landing", async () => {
    vi.useFakeTimers();
    try {
      let docTop = 2400;
      const el = document.createElement("article");
      el.dataset.scrollAnchor = "a";
      el.getBoundingClientRect = () => rect(docTop - scrollY);
      document.body.appendChild(el);
      const stop = restoreScroll({ y: 2100, anchor: { id: "a", top: 300 } });
      expect(scrollY).toBe(2100);
      docTop = 2560; // a late section above mounts 160px taller than its placeholder
      await vi.advanceTimersByTimeAsync(3000);
      expect(scrollY).toBe(2260);
      stop();
    } finally {
      vi.useRealTimers();
    }
  });

  it("stops correcting once the visitor scrolls", async () => {
    vi.useFakeTimers();
    try {
      let docTop = 2400;
      const el = document.createElement("article");
      el.dataset.scrollAnchor = "a";
      el.getBoundingClientRect = () => rect(docTop - scrollY);
      document.body.appendChild(el);
      restoreScroll({ y: 2100, anchor: { id: "a", top: 300 } });
      window.dispatchEvent(new Event("wheel"));
      docTop = 2560;
      await vi.advanceTimersByTimeAsync(3000);
      expect(scrollY).toBe(2100);
    } finally {
      vi.useRealTimers();
    }
  });

  it("persists entries per history key", () => {
    scrollY = 640;
    saveScroll("k1");
    expect(readScroll("k1")).toEqual({ y: 640 });
    expect(JSON.parse(window.sessionStorage.getItem("mm:scroll:v1") ?? "[]")).toEqual([["k1", { y: 640 }]]);
  });
});

function Feed() {
  const navigate = useNavigate();
  const { key } = useLocation();
  return (
    <div>
      <button
        type="button"
        onClick={() => {
          saveScroll(key); // the app's router history does this on every navigation
          navigate("/listing/7");
        }}
      >
        open
      </button>
      <span data-testid="feed">feed</span>
    </div>
  );
}

function Detail() {
  const navigate = useNavigate();
  return (
    <button type="button" onClick={() => navigate(-1)}>
      back
    </button>
  );
}

describe("ScrollRestoration back/forward", () => {
  it("opens a listing at the top and returns to the exact feed position on Back", async () => {
    card("7", 2400);
    render(
      <TestRouter initialEntries={["/"]}>
        <ScrollRestoration />
        <Routes>
          <Route path="/" element={<Feed />} />
          <Route path="/listing/:id" element={<Detail />} />
        </Routes>
      </TestRouter>,
    );
    scrollY = 2100;
    await act(async () => fireEvent.click(screen.getByText("open")));
    expect(scrollY).toBe(0);
    await act(async () => fireEvent.click(screen.getByText("back")));
    expect(screen.getByTestId("feed")).toBeInTheDocument();
    expect(scrollY).toBe(2100);
  });
});

function DeferredProbe() {
  const ready = useDeferredMount();
  return <span data-testid="deferred">{ready ? "ready" : "waiting"}</span>;
}

describe("deferred sections on the way back", () => {
  it("render on the first pass while a restore is pending, and defer otherwise", () => {
    const first = render(
      <>
        <DeferredProbe />
        <DeferredSection>
          <span>below</span>
        </DeferredSection>
      </>,
    );
    expect(screen.getByTestId("deferred").textContent).toBe("waiting");
    expect(screen.queryByText("below")).toBeNull();
    first.unmount();

    markRestorePending({ y: 4000 });
    render(
      <>
        <DeferredProbe />
        <DeferredSection>
          <span>below</span>
        </DeferredSection>
      </>,
    );
    expect(screen.getByTestId("deferred").textContent).toBe("ready");
    expect(screen.getByText("below")).toBeInTheDocument();
  });
});
