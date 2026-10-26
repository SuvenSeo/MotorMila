import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Route, Routes, useLocation, useNavigate } from "react-router-dom";
import { TestRouter } from "./testUtils";
import { ScrollRestoration } from "@/components/ScrollRestoration";
import {
  applyScroll,
  findAnchor,
  markScrollAnchor,
  readScroll,
  resetScrollMemory,
  RESTORE_ATTR,
  saveScroll,
} from "@/lib/scrollMemory";

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
