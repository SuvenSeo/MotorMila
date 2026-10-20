import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { SafetyResearchCard } from "@/components/SafetyResearchCard";
import type { SafetyResearchResponse } from "@/services/api";
import { AppPreferencesProvider } from "@/lib/appPreferences";

const BASE: SafetyResearchResponse = {
  listing_id: 11,
  year: 2015,
  make: "Toyota",
  model: "Camry",
  vehicle_key: "2015|toyota|camry",
  safety: {
    available: true,
    provider: "nhtsa",
    market_scope: "US federal (NHTSA)",
    license_note: "Public US government data.",
    fetched_at: "2026-08-18T00:00:00Z",
    match_confidence: 0.85,
    source_url: "https://www.nhtsa.gov/recalls",
    limitation:
      "US NHTSA safety rating—may vary by trim/market. This is not a verified history of the individual Sri Lankan vehicle.",
    unavailable_reason: null,
    data: {
      rating: { overall: "5", front: "5", side: "5", rollover: "4" },
      recalls: [
        {
          campaign: "20V123000",
          component: "AIR BAGS",
          title: "The passenger air bag inflator may explode.",
          risk: "An inflator explosion can cause serious injury.",
          remedy: "Dealers will replace the inflator.",
        },
      ],
      complaints: { count: 2, crash_count: 1 },
    },
  },
  reliability: {
    available: true,
    provider: "problemsbyvin",
    market_scope: "US NHTSA-derived (ProblemsByVin)",
    license_note: "CC BY 4.0. Attribution: ProblemsByVin.",
    fetched_at: "2026-08-16T00:00:00Z",
    match_confidence: 0.85,
    source_url: "https://problemsbyvin.com/data/",
    limitation:
      "Reliability score is a complaint-and-recall-volume heuristic, not a per-capita failure rate, and is not this car's service history.",
    unavailable_reason: null,
    data: {
      scorecard: { reliability_score: 3.4, complaints: 120, recalls: 4, top_component: "AIR BAGS" },
      known_issues: [{ component: "ENGINE", mileage_median: 87000, complaints: 22 }],
      tsb: { tsb_count: 18, top_category: "ENGINE", note: "A TSB is not a recall." },
    },
  },
};

function renderCard(payload: SafetyResearchResponse | null, unavailable = false) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <AppPreferencesProvider>
      <QueryClientProvider client={client}>
        <SafetyResearchCard research={payload} isLoading={false} isError={unavailable && !payload} />
      </QueryClientProvider>
    </AppPreferencesProvider>,
  );
}

describe("SafetyResearchCard", () => {
  it("labels US scope and does not claim the individual car has an open recall", () => {
    renderCard(BASE);
    expect(screen.getByText(/US NHTSA safety rating/i)).toBeInTheDocument();
    expect(screen.getByText(/may vary by trim\/market/i)).toBeInTheDocument();
    expect(screen.queryByText(/this vehicle has an unresolved recall/i)).not.toBeInTheDocument();
    expect(screen.getAllByText(/AIR BAGS/i).length).toBeGreaterThan(0);
    expect(screen.getByText(/not a recall/i)).toBeInTheDocument();
  });

  it("renders a quiet unavailable state instead of an error", () => {
    renderCard({
      ...BASE,
      safety: {
        ...BASE.safety,
        available: false,
        data: null,
        unavailable_reason: "no_us_match",
        limitation: "No matching US NHTSA safety record for this year, make, and model.",
      },
      reliability: {
        ...BASE.reliability,
        available: false,
        data: null,
        unavailable_reason: "no_snapshot",
        limitation: "US reliability research is not available for this model.",
      },
    });
    expect(screen.getByText(/not available/i)).toBeInTheDocument();
    expect(screen.queryByText(/could not load/i)).not.toBeInTheDocument();
  });
});
