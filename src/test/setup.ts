import "@testing-library/jest-dom";
import React from "react";
import { beforeEach, vi } from "vitest";

// The live-API circuit breaker persists in sessionStorage; never leak it between tests.
beforeEach(() => {
  try {
    sessionStorage.clear();
  } catch {
    /* jsdom without storage */
  }
});

vi.mock("recharts", async () => {
  const original = await vi.importActual("recharts");
  return {
    ...original,
    ResponsiveContainer: ({ children }: { children: React.ReactNode }) =>
      React.createElement(
        "div",
        { style: { width: "100%", height: "100%", minWidth: "400px", minHeight: "300px" } },
        children
      ),
  };
});

Object.defineProperty(window, "matchMedia", {
  writable: true,
  value: (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => {},
  }),
});

class ResizeObserverMock {
  observe() {}
  unobserve() {}
  disconnect() {}
}

class IntersectionObserverMock {
  observe() {}
  unobserve() {}
  disconnect() {}
}

Object.defineProperty(globalThis, "ResizeObserver", {
  writable: true,
  value: ResizeObserverMock,
});

Object.defineProperty(globalThis, "IntersectionObserver", {
  writable: true,
  value: IntersectionObserverMock,
});

const domRect = () => ({
  x: 0,
  y: 0,
  width: 800,
  height: 400,
  top: 0,
  left: 0,
  right: 800,
  bottom: 400,
  toJSON: () => ({}),
});

Object.defineProperty(Element.prototype, "getBoundingClientRect", {
  configurable: true,
  value: domRect,
});

// Global localStorage mock
const localStorageStore = new Map<string, string>();
const localStorageMock = {
  getItem: (key: string) => localStorageStore.get(key) ?? null,
  setItem: (key: string, value: string) => {
    localStorageStore.set(key, String(value));
  },
  removeItem: (key: string) => {
    localStorageStore.delete(key);
  },
  clear: () => {
    localStorageStore.clear();
  },
  key: (index: number) => Array.from(localStorageStore.keys())[index] ?? null,
  get length() {
    return localStorageStore.size;
  },
};

Object.defineProperty(globalThis, "localStorage", {
  configurable: true,
  writable: true,
  value: localStorageMock,
});

Object.defineProperty(window, "localStorage", {
  configurable: true,
  writable: true,
  value: localStorageMock,
});

