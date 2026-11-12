import { act, fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { MemoryRouter, useLocation, useNavigate } from "react-router-dom";
import {
  parseFiltersFromParams,
  serializeFiltersToParams,
  useSearchFilters,
} from "@/lib/searchUrlState";

function Probe() {
  const [filters, setFilters] = useSearchFilters();
  const location = useLocation();
  const navigate = useNavigate();
  return (
    <div>
      <p data-testid="loc">{location.pathname + location.search + location.hash}</p>
      <p data-testid="sort">{filters.sort}</p>
      <button type="button" onClick={() => setFilters((p) => ({ ...p, make: "Toyota", page: 1 }))}>make</button>
      <button type="button" onClick={() => setFilters((p) => ({ ...p, page: p.page + 1 }))}>next</button>
      <button type="button" onClick={() => setFilters((p) => ({ ...p, sort: "price_asc" }), { replace: true })}>replace</button>
      <button type="button" onClick={() => navigate(-1)}>back</button>
    </div>
  );
}

const future = { v7_startTransition: true, v7_relativeSplatPath: true } as const;

describe("search URL state", () => {
  it("round-trips filters and omits defaults", () => {
    const params = serializeFiltersToParams({ sort: "best_match", page: 1, vehicle_category: "cars", make: "Toyota", price_max: 8_500_000 });
    expect(params.toString()).toBe("make=Toyota&price_max=8500000");
    const parsed = parseFiltersFromParams(new URLSearchParams("make=Toyota&sort=newest&page=2&utm_source=fb"));
    expect(parsed).toMatchObject({ make: "Toyota", sort: "newest", page: 2, vehicle_category: "cars" });
    expect(parseFiltersFromParams(new URLSearchParams("sort=bogus&page=-4"))).toMatchObject({ sort: "best_match", page: 1 });
  });

  it("keeps unrelated query params", () => {
    const params = serializeFiltersToParams({ sort: "newest", page: 2 }, new URLSearchParams("utm_source=fb&make=Honda"));
    expect(params.get("utm_source")).toBe("fb");
    expect(params.get("make")).toBeNull();
    expect(params.get("sort")).toBe("newest");
  });

  it("pushes discrete changes so Back steps back, and keeps path + hash", () => {
    render(
      <MemoryRouter initialEntries={["/cars/toyota/aqua#market"]} future={future}>
        <Probe />
      </MemoryRouter>,
    );
    act(() => fireEvent.click(screen.getByText("make")));
    expect(screen.getByTestId("loc").textContent).toBe("/cars/toyota/aqua?make=Toyota#market");
    act(() => fireEvent.click(screen.getByText("next")));
    expect(screen.getByTestId("loc").textContent).toBe("/cars/toyota/aqua?make=Toyota&page=2#market");
    act(() => fireEvent.click(screen.getByText("back")));
    expect(screen.getByTestId("loc").textContent).toBe("/cars/toyota/aqua?make=Toyota#market");
    act(() => fireEvent.click(screen.getByText("back")));
    expect(screen.getByTestId("loc").textContent).toBe("/cars/toyota/aqua#market");
  });

  it("replace does not add a history entry", () => {
    render(
      <MemoryRouter initialEntries={["/start", "/"]} initialIndex={1} future={future}>
        <Probe />
      </MemoryRouter>,
    );
    act(() => fireEvent.click(screen.getByText("replace")));
    expect(screen.getByTestId("sort").textContent).toBe("price_asc");
    act(() => fireEvent.click(screen.getByText("back")));
    expect(screen.getByTestId("loc").textContent).toBe("/start");
  });
});
