import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { describe, expect, it } from "vitest";
import { RouteTransition, routeTransitionOwnsScroll } from "@/components/RouteTransition";
import { page } from "@/lib/motion";

describe("RouteTransition", () => {
  it("renders the active outlet without a CSS filter blur", () => {
    render(
      <MemoryRouter initialEntries={["/trends"]}>
        <Routes>
          <Route element={<RouteTransition />}>
            <Route path="/trends" element={<p>Trends page</p>} />
          </Route>
        </Routes>
      </MemoryRouter>,
    );
    expect(screen.getByText("Trends page")).toBeInTheDocument();
    for (const v of Object.values(page)) expect("filter" in (v as object)).toBe(false);
  });

  it("never animates back/forward or reduced motion", () => {
    expect(routeTransitionOwnsScroll("POP", false)).toBe(false);
    expect(routeTransitionOwnsScroll("PUSH", true)).toBe(false);
    expect(routeTransitionOwnsScroll("PUSH", false)).toBe(true);
  });
});
