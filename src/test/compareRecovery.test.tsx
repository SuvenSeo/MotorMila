import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { TestRouter } from "@/test/testUtils";
import Compare from "@/pages/Compare";
import { getListingsBatch } from "@/services/api";
vi.mock("@/services/api", () => ({ getListingsBatch: vi.fn(async () => []), getListingFmv: vi.fn(async () => { throw new Error("offline"); }) }));
vi.mock("@/components/compare/CompareContext", () => ({ useCompare: () => ({ items: [], remove: vi.fn() }) }));
it("keeps failed comparison IDs visible and offers retry instead of an empty selection", async () => {
  render(<TestRouter initialEntries={["/compare?ids=10,20"]}><Compare /></TestRouter>);
  expect(await screen.findByText("Listing #10 couldn't load")).toBeInTheDocument();
  expect(screen.queryByText("No cars selected yet")).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Retry" }));
  await waitFor(() => expect(vi.mocked(getListingsBatch).mock.calls.length).toBeGreaterThan(1));
});
