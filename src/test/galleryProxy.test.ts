import { afterEach, describe, expect, it, vi } from "vitest";
import { isAllowedImageHost, onRequest, onRequestGet } from "../../functions/img";
import { getGalleryImageProxyUrl } from "@/lib/galleryProxy";

const IKMAN = "https://i.ikman-st.com/bajaj-2001-for-sale-colombo-62/8f1e10ea/1080/810/cropped.jpg";
const RIYA = "https://riyasewana.com/uploads/a-1.jpg";

function proxyRequest(u: string | null, userAgent = "Mozilla/5.0 (Linux; Android 14) Chrome/131.0 Mobile Safari/537.36"): Request {
  const url = u === null ? "https://motormila.pages.dev/img" : `https://motormila.pages.dev/img?u=${encodeURIComponent(u)}`;
  return new Request(url, { headers: { "user-agent": userAgent } });
}

function imageResponse(body = new Uint8Array([1, 2, 3, 4]), contentType = "image/jpeg"): Response {
  return new Response(body, {
    status: 200,
    headers: { "content-type": contentType, "content-length": String(body.byteLength) },
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("isAllowedImageHost", () => {
  it.each([
    ["i.ikman-st.com", true],
    ["riyasewana.com", true],
    ["www.riyasewana.com", true],
    ["cdn.riyasewana.com", true],
    ["www.saleme.lk", true],
    ["patpat.lk", true],
    ["images.ikman.lk", true],
    ["example.com", false],
    ["i.ikman-st.com.evil.com", false],
    ["notriyasewana.com", false],
    ["motormila.pages.dev", false],
  ])("%s -> %s", (host, expected) => {
    expect(isAllowedImageHost(host)).toBe(expected);
  });
});

describe("onRequestGet", () => {
  it("proxies an allowlisted photo with CORS + edge-cache headers", async () => {
    const fetchMock = vi.fn<(url: string, init?: RequestInit) => Promise<Response>>(async () => imageResponse());
    vi.stubGlobal("fetch", fetchMock);
    const res = await onRequestGet({ request: proxyRequest(IKMAN) });
    expect(res.status).toBe(200);
    expect(res.headers.get("access-control-allow-origin")).toBe("*");
    expect(res.headers.get("cache-control")).toContain("max-age=86400");
    expect(res.headers.get("content-type")).toBe("image/jpeg");
    expect(new Uint8Array(await res.arrayBuffer())).toEqual(new Uint8Array([1, 2, 3, 4]));
    expect(fetchMock).toHaveBeenCalledWith(IKMAN, expect.objectContaining({ redirect: "manual" }));
  });

  it("sends no Referer upstream", async () => {
    const fetchMock = vi.fn<(url: string, init?: RequestInit) => Promise<Response>>(async () => imageResponse());
    vi.stubGlobal("fetch", fetchMock);
    await onRequestGet({ request: proxyRequest(RIYA) });
    const headers = (fetchMock.mock.calls[0][1]?.headers ?? {}) as Record<string, string>;
    expect(headers.Referer ?? headers.referer).toBeUndefined();
  });

  it("rejects a non-allowlisted host", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const res = await onRequestGet({ request: proxyRequest("https://example.com/x.jpg") });
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: "host_not_allowed" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rejects a missing or malformed u", async () => {
    expect((await onRequestGet({ request: proxyRequest(null) })).status).toBe(400);
    expect((await onRequestGet({ request: proxyRequest("not a url") })).status).toBe(400);
    expect((await onRequestGet({ request: proxyRequest("ftp://i.ikman-st.com/x.jpg") })).status).toBe(400);
  });

  it("rejects bot user-agents", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const res = await onRequestGet({
      request: proxyRequest(IKMAN, "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)"),
    });
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: "not_available_to_bots" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rejects a non-image upstream response", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => imageResponse(new Uint8Array([60, 104, 116]), "text/html")));
    const res = await onRequestGet({ request: proxyRequest(IKMAN) });
    expect(res.status).toBe(502);
    expect(await res.json()).toEqual({ error: "not_an_image" });
  });

  it("passes an upstream 404 through", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(null, { status: 404 })));
    const res = await onRequestGet({ request: proxyRequest(IKMAN) });
    expect(res.status).toBe(404);
  });

  it("follows a redirect to another allowlisted host, and refuses one off the allowlist", async () => {
    const fetchMock = vi.fn(async (url: string) =>
      url === IKMAN
        ? new Response(null, { status: 302, headers: { location: RIYA } })
        : imageResponse(),
    );
    vi.stubGlobal("fetch", fetchMock);
    const ok = await onRequestGet({ request: proxyRequest(IKMAN) });
    expect(ok.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(2);

    fetchMock.mockClear();
    fetchMock.mockImplementation(async (url: string) =>
      url === IKMAN
        ? new Response(null, { status: 302, headers: { location: "https://example.com/x.jpg" } })
        : imageResponse(),
    );
    const bad = await onRequestGet({ request: proxyRequest(IKMAN) });
    expect(bad.status).toBe(403);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("rejects an oversized image", async () => {
    const big = new Response(new Uint8Array(10), {
      status: 200,
      headers: { "content-type": "image/jpeg", "content-length": "9000000" },
    });
    vi.stubGlobal("fetch", vi.fn(async () => big));
    const res = await onRequestGet({ request: proxyRequest(IKMAN) });
    expect(res.status).toBe(413);
  });

  it("returns 504 when the upstream times out", async () => {
    const err = new Error("timed out");
    err.name = "TimeoutError";
    vi.stubGlobal("fetch", vi.fn(async () => {
      throw err;
    }));
    const res = await onRequestGet({ request: proxyRequest(IKMAN) });
    expect(res.status).toBe(504);
  });
});

describe("onRequest", () => {
  it("rejects non-GET methods", async () => {
    const res = await onRequest({ request: new Request("https://motormila.pages.dev/img", { method: "POST" }) });
    expect(res.status).toBe(405);
  });
});

describe("getGalleryImageProxyUrl", () => {
  it("proxies a remote photo through /img", () => {
    expect(getGalleryImageProxyUrl(IKMAN)).toBe(`/img?u=${encodeURIComponent(IKMAN)}`);
  });

  it("leaves same-origin and already-proxied URLs alone", () => {
    const sameOrigin = `${window.location.origin}/demo/car.jpg`;
    expect(getGalleryImageProxyUrl(sameOrigin)).toBe(sameOrigin);
    expect(getGalleryImageProxyUrl(`/img?u=${encodeURIComponent(IKMAN)}`)).toBe(`/img?u=${encodeURIComponent(IKMAN)}`);
  });

  it("returns null for relative and non-http URLs", () => {
    expect(getGalleryImageProxyUrl("/demo/car.jpg")).toBeNull();
    expect(getGalleryImageProxyUrl("data:image/png;base64,abc")).toBeNull();
    expect(getGalleryImageProxyUrl(null)).toBeNull();
  });
});
