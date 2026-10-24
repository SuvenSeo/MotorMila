import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("recharts", () => ({
  ScatterChart: ({ children }: { children: React.ReactNode }) => <div data-testid="scatter-chart">{children}</div>,
  Scatter: () => <div data-testid="scatter-dots" />,
  XAxis: () => null,
  YAxis: () => null,
  CartesianGrid: () => null,
  Tooltip: () => null,
  ResponsiveContainer: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="responsive-container">{children}</div>
  ),
}));

import { MileagePriceScatter, paddedDomain } from "@/components/MileagePriceScatter";

const POINTS = [
  { mileage: 45000, price_lkr: 8_500_000, id: 1, label: "Toyota Prius 2018" },
  { mileage: 62000, price_lkr: 7_900_000, id: 2, label: "Toyota Prius 2017" },
  { mileage: 30000, price_lkr: 9_200_000, id: 3, label: "Toyota Prius 2019" },
  { mileage: 80000, price_lkr: 6_500_000, id: 4, label: "Toyota Prius 2016" },
  { mileage: 51000, price_lkr: 8_100_000, id: 5, label: "Toyota Prius 2018" },
  { mileage: 95000, price_lkr: 6_100_000, id: 6, label: "Toyota Prius 2015" },
  { mileage: 38000, price_lkr: 8_900_000, id: 7, label: "Toyota Prius 2019" },
  { mileage: 70000, price_lkr: 7_300_000, id: 8, label: "Toyota Prius 2017" },
];

describe("MileagePriceScatter", () => {
  it("renders the scatter chart with enough points", () => {
    render(<MileagePriceScatter points={POINTS} title="Toyota Prius — mileage vs. price" />);

    expect(screen.getByTestId("scatter-chart")).toBeInTheDocument();
    expect(screen.getByTestId("scatter-dots")).toBeInTheDocument();
  });

  it("shows the title label", () => {
    render(<MileagePriceScatter points={POINTS} title="Toyota Prius — mileage vs. price" />);
    expect(screen.getByText("Toyota Prius — mileage vs. price")).toBeInTheDocument();
  });

  it("shows a listing count badge", () => {
    render(<MileagePriceScatter points={POINTS} />);
    expect(screen.getByText(`${POINTS.length} listings`)).toBeInTheDocument();
  });

  it("renders the compact empty state when fewer than 8 valid points", () => {
    render(
      <MileagePriceScatter
        points={[
          { mileage: 50000, price_lkr: 8_000_000 },
          { mileage: 70000, price_lkr: 7_200_000 },
          ...POINTS.slice(0, 5),
        ]}
        title="Not enough data"
      />,
    );

    expect(screen.getByText("Not enough data")).toBeInTheDocument();
    expect(screen.getByText("Not enough listings with mileage yet")).toBeInTheDocument();
    expect(screen.queryByTestId("scatter-chart")).not.toBeInTheDocument();
  });

  it("renders empty state with no points", () => {
    render(<MileagePriceScatter points={[]} title="No data chart" />);

    expect(screen.getByText("No data chart")).toBeInTheDocument();
    expect(screen.getByText("Not enough listings with mileage yet")).toBeInTheDocument();
  });

  it("filters out points with non-finite mileage", () => {
    const mixedPoints = [
      ...POINTS,
      { mileage: Number.NaN, price_lkr: 5_000_000 },
      { mileage: -1, price_lkr: 4_000_000 },
    ];
    render(<MileagePriceScatter points={mixedPoints} title="Mixed data" />);

    // Should still render the chart since 8 valid points remain
    expect(screen.getByTestId("scatter-chart")).toBeInTheDocument();
    // Badge should show only the valid count
    expect(screen.getByText(`${POINTS.length} listings`)).toBeInTheDocument();
  });

  it("fits the axis domain to the data with padding", () => {
    expect(paddedDomain([30_000, 95_000], 10_000)).toEqual([20_000, 110_000]);
    expect(paddedDomain([6_100_000, 9_200_000], 500_000)).toEqual([5_500_000, 9_500_000]);
    expect(paddedDomain([5_000, 6_000], 10_000)).toEqual([0, 20_000]);
  });

  it("uses default title when none provided", () => {
    render(<MileagePriceScatter points={POINTS} />);
    expect(screen.getByText("Mileage vs. Price")).toBeInTheDocument();
  });
});
