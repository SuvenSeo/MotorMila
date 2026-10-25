import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { Link, Route, Routes } from "react-router-dom";
import { TestRouter } from "./testUtils";
import { ScrollRestoration } from "@/components/ScrollRestoration";

function TrendsPage() {
  return <div data-testid="trends-page">Trends</div>;
}

function HomePage() {
  return (
    <div>
      <div id="market" data-testid="market-section">
        Market
      </div>
      <Link to="/trends">Go trends</Link>
    </div>
  );
}

describe("ScrollRestoration", () => {
  beforeEach(() => {
    window.scrollTo = vi.fn();
    Element.prototype.scrollIntoView = vi.fn();
  });

  it("scrolls to the top when navigating to a route without a hash", () => {
    render(
      <TestRouter initialEntries={["/trends"]}>
        <ScrollRestoration />
        <Routes>
          <Route path="/trends" element={<TrendsPage />} />
        </Routes>
      </TestRouter>,
    );

    expect(window.scrollTo).toHaveBeenCalledWith({ top: 0, left: 0, behavior: "instant" });
    expect(screen.getByTestId("trends-page")).toBeInTheDocument();
  });

  it("scrolls to a hash target instead of resetting to top", () => {
    render(
      <TestRouter initialEntries={["/#market"]}>
        <ScrollRestoration />
        <Routes>
          <Route path="/" element={<HomePage />} />
        </Routes>
      </TestRouter>,
    );

    expect(window.scrollTo).not.toHaveBeenCalled();
    expect(screen.getByTestId("market-section").scrollIntoView).toHaveBeenCalledWith(
      expect.objectContaining({ block: "start" }),
    );
  });
});
