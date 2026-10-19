import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  LOW_DATA_CLASS,
  LOW_DATA_STORAGE_KEY,
  lowDataImageList,
  lowDataReducedMotion,
  pickLowDataImage,
  shouldAutoplay,
  useLowData,
} from "@/hooks/useLowData";

function setSaveData(value: boolean | undefined) {
  Object.defineProperty(navigator, "connection", {
    configurable: true,
    value: value === undefined ? undefined : { saveData: value },
  });
}

describe("useLowData", () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.classList.remove(LOW_DATA_CLASS);
    setSaveData(undefined);
  });
  afterEach(() => setSaveData(undefined));

  it("defaults off, toggles, persists and sets the html class", () => {
    const { result } = renderHook(() => useLowData());
    expect(result.current.lowData).toBe(false);
    act(() => result.current.setLowData(true));
    expect(result.current.lowData).toBe(true);
    expect(localStorage.getItem(LOW_DATA_STORAGE_KEY)).toBe("1");
    expect(document.documentElement.classList.contains(LOW_DATA_CLASS)).toBe(true);
    act(() => result.current.toggle());
    expect(result.current.lowData).toBe(false);
    expect(localStorage.getItem(LOW_DATA_STORAGE_KEY)).toBe("0");
    expect(document.documentElement.classList.contains(LOW_DATA_CLASS)).toBe(false);
  });

  it("reads the stored value on mount and syncs instances", () => {
    localStorage.setItem(LOW_DATA_STORAGE_KEY, "1");
    const a = renderHook(() => useLowData());
    const b = renderHook(() => useLowData());
    expect(a.result.current.lowData).toBe(true);
    act(() => a.result.current.setLowData(false));
    expect(b.result.current.lowData).toBe(false);
  });

  it("suggests (but never forces) low-data when Data Saver is on and the user never chose", () => {
    setSaveData(true);
    const { result } = renderHook(() => useLowData());
    expect(result.current.saveDataHint).toBe(true);
    expect(result.current.lowData).toBe(false);
    expect(result.current.shouldSuggest).toBe(true);
    act(() => result.current.dismissSuggestion());
    expect(result.current.shouldSuggest).toBe(false);
  });

  it("does not suggest once the user has chosen", () => {
    setSaveData(true);
    localStorage.setItem(LOW_DATA_STORAGE_KEY, "0");
    const { result } = renderHook(() => useLowData());
    expect(result.current.shouldSuggest).toBe(false);
  });

  it("helpers pick thumbnails, stop autoplay and force reduced motion", () => {
    expect(pickLowDataImage({ thumbnail_url: "t.jpg", images: ["big.jpg"] })).toBe("t.jpg");
    expect(pickLowDataImage({ images: [null, "big.jpg"] })).toBe("big.jpg");
    expect(lowDataImageList(["a", "b", "c"], "t")).toEqual(["t"]);
    expect(lowDataImageList(["a", "b"], null, false)).toEqual(["a", "b"]);
    expect(shouldAutoplay(true)).toBe(false);
    expect(shouldAutoplay(false)).toBe(true);
    expect(shouldAutoplay(false, true)).toBe(false);
    expect(lowDataReducedMotion(true)).toBe("always");
  });
});
