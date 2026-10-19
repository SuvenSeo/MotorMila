import { describe, expect, it, vi, beforeEach } from "vitest";
import { DeleteAccountError, deleteMyAccount } from "@/lib/accountApi";

describe("deleteMyAccount", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    localStorage.setItem("motormila.auth_token", "tok123");
  });

  it("sends DELETE /auth/me with bearer + optional password", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ ok: true, deleted: true, email: "a@b.lk" }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const res = await deleteMyAccount("pw");
    expect(res).toMatchObject({ ok: true, deleted: true, email: "a@b.lk" });
    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toMatch(/\/auth\/me$/);
    expect(init.method).toBe("DELETE");
    expect(init.headers.Authorization).toBe("Bearer tok123");
    expect(JSON.parse(init.body)).toEqual({ password: "pw" });
  });

  it("maps HTTP errors to codes", async () => {
    for (const [status, code] of [[401, "unauthenticated"], [403, "wrong_password"], [409, "managed_account"], [429, "rate_limited"], [503, "unavailable"]] as const) {
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ detail: "x" }), { status })));
      await expect(deleteMyAccount()).rejects.toMatchObject({ code, status });
    }
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("offline")));
    await expect(deleteMyAccount()).rejects.toBeInstanceOf(DeleteAccountError);
  });
});
