import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { loadWatchlistIds, saveWatchlistIds, toggleWatchlistId, useWatchlist } from "@/lib/watchlist";

let storage = new Map<string, string>();

beforeEach(() => {
  storage = new Map<string, string>();
  Object.defineProperty(window, "localStorage", {
    configurable: true,
    value: {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => {
        storage.set(key, value);
      },
      removeItem: (key: string) => {
        storage.delete(key);
      },
      clear: () => {
        storage.clear();
      },
    },
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("watchlist storage", () => {
  it("keeps search and detail selections synchronized and restores them after remount", () => {
    const search = renderHook(() => useWatchlist());
    const detail = renderHook(() => useWatchlist());
    act(() => { detail.result.current.toggle(12); });
    expect(search.result.current.ids).toEqual([12]);
    detail.unmount();
    const returning = renderHook(() => useWatchlist());
    expect(returning.result.current.ids).toEqual([12]);
    act(() => { search.result.current.toggle(12); });
    expect(returning.result.current.ids).toEqual([]);
  });

  it("updates open views when another tab changes saved listings", () => {
    const view = renderHook(() => useWatchlist());
    act(() => {
      localStorage.setItem("motormila.watchlist.ids", "[7]");
      window.dispatchEvent(new StorageEvent("storage", { key: "motormila.watchlist.ids" }));
    });
    expect(view.result.current.ids).toEqual([7]);
  });

  it("does not claim a save succeeded when storage rejects the write", () => {
    const view = renderHook(() => useWatchlist());
    vi.spyOn(window.localStorage, "setItem").mockImplementation(() => { throw new Error("storage blocked"); });
    act(() => { expect(view.result.current.toggle(5)).toMatchObject({ saved: false, error: true }); });
    expect(view.result.current.ids).toEqual([]);
  });

  it("stores and restores ids", () => {
    saveWatchlistIds([12, 3]);
    expect(loadWatchlistIds()).toEqual([12, 3]);
  });

  it("toggles ids on and off", () => {
    expect(toggleWatchlistId([], 5).ids).toEqual([5]);
    expect(toggleWatchlistId([5], 5).ids).toEqual([]);
  });

  it("caps max watchlist size when limit is hit", () => {
    const state = toggleWatchlistId([1, 2, 3], 4, 3);
    expect(state.ids).toEqual([1, 2, 3]);
    expect(state.blocked).toBe(true);
  });
});
