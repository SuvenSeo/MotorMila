import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ModerationQueuePanel, RemovalRequestsPanel } from "@/pages/admin/AdminQueues";

function wrap(ui: React.ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>);
}

afterEach(() => vi.unstubAllGlobals());

describe("admin queues", () => {
  it("lists pending user listings and approves one", async () => {
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      if (String(url).includes("/approve")) return new Response(JSON.stringify({ id: 5, status: "published" }), { status: 200 });
      expect(init?.method ?? "GET").toBe("GET");
      return new Response(JSON.stringify({ items: [{ id: 5, title: "2017 Toyota Aqua", status: "pending", priceLkr: 6500000, district: "Colombo", isActive: false }], count: 1 }), { status: 200 });
    });
    vi.stubGlobal("fetch", fetchMock);
    wrap(<ModerationQueuePanel />);
    expect(await screen.findByText("2017 Toyota Aqua")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Approve/ }));
    await waitFor(() => expect(fetchMock.mock.calls.some(([u, i]) => String(u).includes("/admin/listings/5/approve") && i?.method === "POST")).toBe(true));
  });

  it("shows server errors instead of an empty queue", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ detail: "Admin access required." }), { status: 403 })));
    wrap(<RemovalRequestsPanel />);
    expect(await screen.findByRole("alert")).toHaveTextContent("Admin access required.");
  });
});
