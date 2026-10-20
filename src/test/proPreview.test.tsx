import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { MemoryRouter } from "react-router-dom";
import ProPreview from "@/pages/ProPreview";

function installLocalStorage() {
  const store = new Map<string, string>();
  const storage = {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => store.set(key, value),
    removeItem: (key: string) => store.delete(key),
    clear: () => store.clear(),
    key: (index: number) => Array.from(store.keys())[index] ?? null,
    get length() {
      return store.size;
    },
  };

  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    value: storage,
  });
  Object.defineProperty(window, "localStorage", {
    configurable: true,
    value: storage,
  });
}

describe("ProPreview", () => {
  beforeEach(() => {
    installLocalStorage();
  });

  it("renders locked teaser content without creating an auth session", () => {
    render(
      <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <ProPreview />
      </MemoryRouter>,
    );

    expect(screen.getByRole("heading", { name: /Pro workspace preview/i })).toBeInTheDocument();
    expect(screen.getAllByText(/unlock with pro/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/report formats/i).length).toBeGreaterThan(0);
    expect(screen.getAllByRole("link", { name: /join the waitlist/i })[0]).toHaveAttribute("href", "/pricing");
    expect(localStorage.getItem("motormila.auth_user")).toBeNull();
  });
});
