import { act, renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it } from "vitest";
import { CompareProvider, toPinnedListing, useCompare } from "@/components/compare/CompareContext";
import { COMPARE_TRAY_KEY, MAX_PINNED } from "@/lib/compareTray";
import { bestIndexes, rowDiffers } from "@/components/compare/compareRows";

const car = (id: number) => ({ id, make: "Toyota", model: `M${id}`, year: 2018, price_lkr: 5_000_000 + id });

describe("useCompare (compare tray hook)", () => {
  beforeEach(() => localStorage.clear());

  it("caps the selection at 4 and reports full", () => {
    expect(MAX_PINNED).toBe(4);
    const { result } = renderHook(() => useCompare());
    for (let i = 1; i <= 4; i += 1) {
      act(() => {
        expect(result.current.add(car(i)).ok).toBe(true);
      });
    }
    expect(result.current.count).toBe(4);
    expect(result.current.isFull).toBe(true);
    let fifth: ReturnType<typeof result.current.add> | undefined;
    act(() => {
      fifth = result.current.add(car(5));
    });
    expect(fifth).toEqual({ ok: false, reason: "full" });
    act(() => {
      expect(result.current.toggle(car(6))).toMatchObject({ ok: false, reason: "full" });
    });
    expect(result.current.href).toBe("/compare?ids=1,2,3,4");
  });

  it("rejects duplicates and toggles off", () => {
    const { result } = renderHook(() => useCompare());
    act(() => {
      result.current.add(car(7));
    });
    expect(result.current.add(car(7))).toEqual({ ok: false, reason: "duplicate" });
    act(() => {
      expect(result.current.toggle(car(7))).toMatchObject({ ok: true, added: false });
    });
    expect(result.current.count).toBe(0);
  });

  it("persists to localStorage and syncs separate hook instances", () => {
    const a = renderHook(() => useCompare());
    const b = renderHook(() => useCompare());
    act(() => {
      a.result.current.add(car(11));
    });
    expect(JSON.parse(localStorage.getItem(COMPARE_TRAY_KEY) || "[]")).toHaveLength(1);
    expect(b.result.current.has(11)).toBe(true);
    act(() => b.result.current.remove(11));
    expect(a.result.current.count).toBe(0);
  });

  it("restores from storage on mount and works inside the provider", () => {
    localStorage.setItem(COMPARE_TRAY_KEY, JSON.stringify([car(21), car(22)]));
    const wrapper = ({ children }: { children: ReactNode }) => <CompareProvider>{children}</CompareProvider>;
    const { result } = renderHook(() => useCompare(), { wrapper });
    expect(result.current.items.map((r) => r.id)).toEqual([21, 22]);
    act(() => result.current.clear());
    expect(result.current.count).toBe(0);
  });

  it("maps a listing to a compact pinned row", () => {
    const row = toPinnedListing({ id: "9", make: "Honda", model: "Vezel", market_median_lkr: 9_000_000, images: ["a.jpg"], mileage_km: 0 });
    expect(row).toMatchObject({ id: 9, fmv_lkr: 9_000_000, thumbnail_url: "a.jpg", mileage_km: 0 });
  });
});

describe("compare rows", () => {
  it("detects differences ignoring unknowns", () => {
    expect(rowDiffers(["auto", "Auto", null])).toBe(false);
    expect(rowDiffers([2018, 2019])).toBe(true);
    expect(rowDiffers([2018, null])).toBe(false);
  });
  it("marks best values only when the row differs", () => {
    expect([...bestIndexes([5, 3, 3], "lower")]).toEqual([1, 2]);
    expect(bestIndexes([5, 5], "lower").size).toBe(0);
    expect([...bestIndexes([2015, 2020], "higher")]).toEqual([1]);
  });
});
