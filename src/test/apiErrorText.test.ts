import { describe, expect, it } from "vitest";
import { APIError } from "@/services/api";
import { friendlyApiError } from "@/lib/apiErrorText";

describe("friendlyApiError", () => {
  it("never surfaces raw API error text", () => {
    expect(friendlyApiError(new APIError(401, "Authentication required."), "x")).toMatch(/session has expired/);
    expect(friendlyApiError("API error 401: Authentication required.", "x")).toMatch(/session has expired/);
    expect(friendlyApiError(new APIError(503, "down"), "x")).toMatch(/busy/);
    expect(friendlyApiError(new APIError(429, ""), "x")).toMatch(/Too many requests/);
    expect(friendlyApiError(new APIError(404, "Not found"), "Couldn't load.")).toBe("Couldn't load.");
  });

  it("maps network failures and keeps readable messages", () => {
    expect(friendlyApiError(new TypeError("Failed to fetch"), "x")).toMatch(/couldn't reach/);
    expect(friendlyApiError(new Error("Yard name already claimed"), "x")).toBe("Yard name already claimed");
    expect(friendlyApiError(undefined, "Fallback")).toBe("Fallback");
  });
});
