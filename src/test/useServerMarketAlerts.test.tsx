import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { useServerMarketAlerts } from "@/hooks/useServerMarketAlerts";
import type { AlertCreateInput, ServerMarketAlert } from "@/services/api";

const mocks = vi.hoisted(() => ({
  getOrCreateAlertToken: vi.fn(() => "test-token"),
  getAlerts: vi.fn(),
  createAlert: vi.fn(),
  deleteAlert: vi.fn(),
}));

vi.mock("@/services/api", () => ({
  getOrCreateAlertToken: mocks.getOrCreateAlertToken,
  getAlerts: mocks.getAlerts,
  createAlert: mocks.createAlert,
  deleteAlert: mocks.deleteAlert,
}));

function serverAlert(overrides: Partial<ServerMarketAlert> = {}): ServerMarketAlert {
  return {
    id: 42,
    user_token: "test-token",
    make: "Toyota",
    model: "Vitz",
    max_price: 7_000_000,
    district: null,
    active: true,
    created_at: "2026-05-20T09:00:00Z",
    ...overrides,
  };
}

describe("useServerMarketAlerts", () => {
  beforeEach(() => {
    mocks.getAlerts.mockReset();
    mocks.createAlert.mockReset();
    mocks.deleteAlert.mockReset();
    mocks.getAlerts.mockResolvedValue([]);
  });

  it("create() resolves with the server-created alert so callers can link it without reading stale hook state", async () => {
    const created = serverAlert();
    mocks.createAlert.mockResolvedValue(created);
    mocks.getAlerts.mockResolvedValueOnce([]).mockResolvedValueOnce([created]);

    const { result } = renderHook(() => useServerMarketAlerts());

    await waitFor(() => expect(result.current.loading).toBe(false));

    const input: AlertCreateInput = { make: "Toyota", model: "Vitz", max_price: 7_000_000 };
    let resolved: ServerMarketAlert | undefined;
    await act(async () => {
      resolved = await result.current.create(input);
    });

    expect(resolved).toEqual(created);
    expect(mocks.createAlert).toHaveBeenCalledWith("test-token", input);
    await waitFor(() => expect(result.current.alerts).toEqual([created]));
  });

  it("propagates create() rejection instead of silently returning undefined", async () => {
    mocks.createAlert.mockRejectedValue(new Error("network down"));

    const { result } = renderHook(() => useServerMarketAlerts());
    await waitFor(() => expect(result.current.loading).toBe(false));

    await expect(
      act(async () => {
        await result.current.create({ make: "Honda" });
      }),
    ).rejects.toThrow("network down");
  });

  it("does not GET /alerts on mount when autoLoad is false (anonymous home feed)", async () => {
    mocks.createAlert.mockResolvedValue(serverAlert());
    const { result } = renderHook(() => useServerMarketAlerts({ autoLoad: false }));
    await act(async () => {
      await result.current.create({ make: "Toyota" } as AlertCreateInput);
    });
    expect(mocks.createAlert).toHaveBeenCalledTimes(1);
    expect(mocks.getAlerts).not.toHaveBeenCalled();
  });
});
