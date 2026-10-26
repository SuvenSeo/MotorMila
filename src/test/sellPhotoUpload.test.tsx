import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  MAX_PHOTOS,
  doneUrls,
  encodeCanvas,
  fitWithin,
  hasFailures,
  isBusy,
  linkItem,
  moveItem,
  nextToUpload,
  photosReducer,
  putWithProgress,
  roomFor,
  uploadItem,
  type PhotoItem,
} from "@/lib/photoUpload";
import { usePhotoUploads } from "@/hooks/usePhotoUploads";

const file = (name = "a.jpg", type = "image/jpeg") => new File([new Uint8Array(10)], name, { type });

describe("fitWithin (resize to ≤1600px long edge)", () => {
  it("scales landscape and portrait by the long edge", () => {
    expect(fitWithin(4032, 3024)).toEqual({ width: 1600, height: 1200 });
    expect(fitWithin(3024, 4032)).toEqual({ width: 1200, height: 1600 });
  });
  it("never upscales small images", () => {
    expect(fitWithin(800, 600)).toEqual({ width: 800, height: 600 });
    expect(fitWithin(1600, 900)).toEqual({ width: 1600, height: 900 });
  });
  it("keeps at least 1px on extreme aspect ratios", () => {
    expect(fitWithin(20000, 5)).toEqual({ width: 1600, height: 1 });
  });
});

describe("encodeCanvas (WebP, JPEG fallback, size cap)", () => {
  const canvasWith = (impl: (type: string, quality: number) => Blob | null) =>
    ({ toBlob: (cb: (b: Blob | null) => void, type: string, q: number) => cb(impl(type, q)) }) as unknown as HTMLCanvasElement;

  it("uses WebP at ~0.8 when supported", async () => {
    const calls: [string, number][] = [];
    const out = await encodeCanvas(
      canvasWith((type, q) => {
        calls.push([type, q]);
        return new Blob([new Uint8Array(1000)], { type });
      }),
    );
    expect(out.contentType).toBe("image/webp");
    expect(calls).toEqual([["image/webp", 0.8]]);
  });

  it("falls back to JPEG when the browser silently returns PNG for WebP", async () => {
    const out = await encodeCanvas(
      canvasWith((type) => new Blob([new Uint8Array(1000)], { type: type === "image/webp" ? "image/png" : type })),
    );
    expect(out.contentType).toBe("image/jpeg");
    expect(out.blob.type).toBe("image/jpeg");
  });

  it("steps quality down until the photo fits the byte cap", async () => {
    const qualities: number[] = [];
    const out = await encodeCanvas(
      canvasWith((type, q) => {
        qualities.push(q);
        return new Blob([new Uint8Array(q > 0.65 ? 5000 : 900)], { type });
      }),
      1000,
    );
    expect(out.blob.size).toBe(900);
    expect(qualities).toEqual([0.8, 0.7, 0.6]);
  });

  it("throws too-large when even the lowest quality is over the cap", async () => {
    await expect(encodeCanvas(canvasWith((type) => new Blob([new Uint8Array(5000)], { type })), 1000)).rejects.toThrow("too-large");
  });
});

describe("photosReducer + reorder", () => {
  const a = linkItem("https://x/a.jpg", "a");
  const b = linkItem("https://x/b.jpg", "b");
  const c = linkItem("https://x/c.jpg", "c");

  it("moveItem moves and clamps", () => {
    expect(moveItem([1, 2, 3], 0, 2)).toEqual([2, 3, 1]);
    expect(moveItem([1, 2, 3], 2, 0)).toEqual([3, 1, 2]);
    expect(moveItem([1, 2, 3], 1, 99)).toEqual([1, 3, 2]);
    expect(moveItem([1, 2, 3], 1, -5)).toEqual([2, 1, 3]);
    expect(moveItem([1, 2, 3], 7, 0)).toEqual([1, 2, 3]);
  });

  it("move changes which photo is the cover (index 0)", () => {
    const items = photosReducer([a, b, c], { type: "move", from: 2, to: 0 });
    expect(items.map((i) => i.id)).toEqual(["c", "a", "b"]);
    expect(doneUrls(items)[0]).toBe("https://x/c.jpg");
  });

  it("caps the list at 12 photos", () => {
    expect(roomFor(10, 5)).toBe(2);
    expect(roomFor(12, 1)).toBe(0);
    const many = Array.from({ length: 14 }, (_, i) => linkItem(`https://x/${i}.jpg`, `l${i}`));
    expect(photosReducer([], { type: "add", items: many })).toHaveLength(MAX_PHOTOS);
  });

  it("walks an upload through processed → uploading → done and drops the blob", () => {
    let items = photosReducer([], { type: "add", items: [uploadItem(file(), "u")] });
    expect(items[0].status).toBe("processing");
    expect(isBusy(items)).toBe(true);
    const blob = new Blob(["x"], { type: "image/webp" });
    items = photosReducer(items, { type: "processed", id: "u", blob, contentType: "image/webp", previewUrl: "blob:1" });
    expect(items[0].status).toBe("queued");
    items = photosReducer(items, { type: "start", id: "u" });
    items = photosReducer(items, { type: "progress", id: "u", progress: 0.5 });
    items = photosReducer(items, { type: "progress", id: "u", progress: 0.3 }); // never goes backwards
    expect(items[0].progress).toBe(0.5);
    items = photosReducer(items, { type: "uploaded", id: "u", url: "https://pub/x.webp" });
    expect(items[0]).toMatchObject({ status: "done", url: "https://pub/x.webp", blob: null, previewUrl: "blob:1" });
    expect(isBusy(items)).toBe(false);
  });

  it("retries upload failures but not unreadable files", () => {
    const blob = new Blob(["x"], { type: "image/webp" });
    let items: PhotoItem[] = photosReducer([], { type: "add", items: [uploadItem(file(), "u"), uploadItem(file(), "bad")] });
    items = photosReducer(items, { type: "failed", id: "bad", error: "unreadable" });
    items = photosReducer(items, { type: "processed", id: "u", blob, contentType: "image/webp", previewUrl: "blob:1" });
    items = photosReducer(items, { type: "start", id: "u" });
    items = photosReducer(items, { type: "failed", id: "u", error: "network" });
    expect(hasFailures(items)).toBe(true);
    expect(items.find((i) => i.id === "u")?.failedAt).toBe("uploading");
    expect(items.find((i) => i.id === "bad")?.failedAt).toBe("processing");
    items = photosReducer(items, { type: "retry", id: "u" });
    items = photosReducer(items, { type: "retry", id: "bad" });
    expect(items.find((i) => i.id === "u")?.status).toBe("queued");
    expect(items.find((i) => i.id === "bad")?.status).toBe("error");
  });

  it("nextToUpload keeps at most 3 in flight", () => {
    const q = (id: string, status: PhotoItem["status"]): PhotoItem => ({ ...uploadItem(file(), id), status });
    expect(nextToUpload([q("1", "queued"), q("2", "queued"), q("3", "queued"), q("4", "queued")])).toEqual(["1", "2", "3"]);
    expect(nextToUpload([q("1", "uploading"), q("2", "uploading"), q("3", "queued"), q("4", "queued")])).toEqual(["3"]);
    expect(nextToUpload([q("1", "uploading"), q("2", "uploading"), q("3", "uploading"), q("4", "queued")])).toEqual([]);
  });
});

/* ── XHR PUT with progress ─────────────────────────────────────────────── */

class FakeXHR {
  static instances: FakeXHR[] = [];
  method = "";
  url = "";
  headers: Record<string, string> = {};
  withCredentials = true;
  status = 0;
  body: unknown = null;
  upload: { onprogress: ((e: { lengthComputable: boolean; loaded: number; total: number }) => void) | null } = { onprogress: null };
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  onabort: (() => void) | null = null;
  constructor() {
    FakeXHR.instances.push(this);
  }
  open(method: string, url: string) {
    this.method = method;
    this.url = url;
  }
  setRequestHeader(k: string, v: string) {
    this.headers[k] = v;
  }
  send(body: unknown) {
    this.body = body;
  }
  abort() {
    this.onabort?.();
  }
  progress(loaded: number, total: number) {
    this.upload.onprogress?.({ lengthComputable: true, loaded, total });
  }
  respond(status: number) {
    this.status = status;
    this.onload?.();
  }
}

describe("putWithProgress", () => {
  beforeEach(() => {
    FakeXHR.instances = [];
    vi.stubGlobal("XMLHttpRequest", FakeXHR);
  });
  afterEach(() => vi.unstubAllGlobals());

  const ticket = { uploadUrl: "https://acct.r2.cloudflarestorage.com/b/k.webp?X-Amz-Signature=1", publicUrl: "https://pub/k.webp", headers: { "Content-Type": "image/webp" } };

  it("PUTs the blob with the signed content type and no credentials, reporting progress", async () => {
    const progress: number[] = [];
    const blob = new Blob(["abc"], { type: "image/webp" });
    const done = putWithProgress(ticket, blob, (p) => progress.push(p));
    const xhr = FakeXHR.instances[0];
    expect(xhr.method).toBe("PUT");
    expect(xhr.url).toBe(ticket.uploadUrl);
    expect(xhr.withCredentials).toBe(false);
    expect(xhr.headers).toEqual({ "Content-Type": "image/webp" });
    expect(xhr.body).toBe(blob);
    xhr.progress(1, 4);
    xhr.progress(4, 4);
    xhr.respond(200);
    await expect(done).resolves.toBe("https://pub/k.webp");
    expect(progress).toEqual([0.25, 1, 1]);
  });

  it("rejects on a non-2xx (e.g. expired signature)", async () => {
    const done = putWithProgress(ticket, new Blob(["a"]), () => undefined);
    FakeXHR.instances[0].respond(403);
    await expect(done).rejects.toThrow("upload-403");
  });

  it("aborts via signal", async () => {
    const ctl = new AbortController();
    const done = putWithProgress(ticket, new Blob(["a"]), () => undefined, ctl.signal);
    ctl.abort();
    await expect(done).rejects.toThrow("aborted");
  });
});

/* ── Hook: resize queue + parallel uploads + retry + remove ─────────────── */

describe("usePhotoUploads", () => {
  type Pending = { resolve: (url: string) => void; reject: (e: Error) => void; progress: (p: number) => void; blob: Blob };

  function setup() {
    const pending: Pending[] = [];
    const tickets: { contentType: string; size: number; existingCount: number }[] = [];
    const requestTicket = vi.fn(async (input: { contentType: string; size: number; existingCount: number }) => {
      tickets.push(input);
      return { uploadUrl: `https://r2/put/${tickets.length}`, publicUrl: `https://pub/${tickets.length}.webp`, headers: {} };
    });
    const put = vi.fn(
      (_t: { publicUrl: string }, blob: Blob, onProgress: (p: number) => void) =>
        new Promise<string>((resolve, reject) => pending.push({ resolve: () => resolve(_t.publicUrl), reject, progress: onProgress, blob })),
    );
    const process = vi.fn(async (f: Blob) => {
      if ((f as File).name === "broken.jpg") throw new Error("unreadable");
      return { blob: new Blob([new Uint8Array(500)], { type: "image/webp" }), contentType: "image/webp" as const, width: 1600, height: 1200 };
    });
    let n = 0;
    const hook = renderHook(() =>
      usePhotoUploads({
        requestTicket,
        put: put as unknown as typeof putWithProgress,
        process,
        createObjectUrl: () => `blob:${++n}`,
        revokeObjectUrl: vi.fn(),
      }),
    );
    return { hook, pending, tickets, requestTicket, put, process };
  }

  it("uploads at most 3 in parallel, then drains the queue", async () => {
    const { hook, pending, tickets } = setup();
    act(() => {
      hook.result.current.addFiles([file("1.jpg"), file("2.jpg"), file("3.jpg"), file("4.jpg"), file("5.jpg")]);
    });
    await waitFor(() => expect(pending).toHaveLength(3));
    expect(hook.result.current.items.filter((i) => i.status === "uploading")).toHaveLength(3);
    expect(tickets[0]).toMatchObject({ contentType: "image/webp", size: 500 });
    expect(tickets[0].existingCount).toBe(4); // the other photos in the listing count toward the cap

    act(() => pending[0].progress(0.4));
    expect(hook.result.current.items[0].progress).toBe(0.4);

    await act(async () => pending[0].resolve(""));
    await waitFor(() => expect(pending).toHaveLength(4));
    await act(async () => {
      pending.slice(1).forEach((p) => p.resolve(""));
    });
    await waitFor(() => expect(pending).toHaveLength(5));
    await act(async () => pending[4].resolve(""));
    await waitFor(() => expect(hook.result.current.items.every((i) => i.status === "done")).toBe(true));
    expect(doneUrls(hook.result.current.items)).toHaveLength(5);
  });

  it("marks failures, retries with a fresh ticket, and removes", async () => {
    const { hook, pending, requestTicket } = setup();
    act(() => {
      hook.result.current.addFiles([file("ok.jpg"), file("broken.jpg")]);
    });
    await waitFor(() => expect(pending).toHaveLength(1));
    await waitFor(() => expect(hook.result.current.items[1].status).toBe("error"));
    expect(hook.result.current.items[1].failedAt).toBe("processing");

    await act(async () => pending[0].reject(new Error("network")));
    await waitFor(() => expect(hook.result.current.items[0].status).toBe("error"));
    expect(hook.result.current.items[0].failedAt).toBe("uploading");

    act(() => hook.result.current.retry(hook.result.current.items[0].id));
    await waitFor(() => expect(pending).toHaveLength(2));
    expect(requestTicket).toHaveBeenCalledTimes(2);
    await act(async () => pending[1].resolve(""));
    await waitFor(() => expect(hook.result.current.items[0].status).toBe("done"));

    act(() => hook.result.current.remove(hook.result.current.items[1].id));
    expect(hook.result.current.items).toHaveLength(1);
  });

  it("reorders uploads and links together and reports skipped files past 12", async () => {
    const { hook } = setup();
    let skipped = 0;
    act(() => {
      for (let i = 0; i < 10; i += 1) hook.result.current.addLink(`https://x/${i}.jpg`);
      skipped = hook.result.current.addFiles([file("a.jpg"), file("b.jpg"), file("c.jpg")]);
    });
    expect(skipped).toBe(1);
    expect(hook.result.current.items).toHaveLength(12);
    expect(hook.result.current.addLink("https://x/13.jpg")).toBe(false);
    act(() => hook.result.current.move(11, 0));
    expect(hook.result.current.items[0].source).toBe("upload");
    act(() => hook.result.current.reset());
    expect(hook.result.current.items).toHaveLength(0);
  });
});
