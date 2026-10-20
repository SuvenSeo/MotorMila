import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import { NotFoundSearch, queryFromPath } from "@/components/notFound/NotFoundSearch";

describe("404 search", () => {
  it("guesses a query from the dead URL", () => {
    expect(queryFromPath("/toyota-aqua-2015")).toBe("toyota aqua 2015");
    expect(queryFromPath("/listing/abc")).toBe("abc");
    expect(queryFromPath("/")).toBe("");
  });
  it("renders a search box prefilled from the path, plus quick links", () => {
    render(
      <MemoryRouter initialEntries={["/honda-vezel"]}>
        <NotFoundSearch />
      </MemoryRouter>,
    );
    expect(screen.getByRole("search")).toBeInTheDocument();
    expect(screen.getByLabelText("Search vehicles")).toHaveValue("honda vezel");
    expect(screen.getByRole("link", { name: /How we score prices/ })).toHaveAttribute("href", "/how-we-price");
  });
});
