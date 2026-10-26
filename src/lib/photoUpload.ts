/**
 * Seller photo uploads — pure state + browser helpers (no React).
 *
 * Flow per photo: processing (decode → resize ≤1600px → WebP, JPEG fallback,
 * EXIF orientation applied, all metadata incl. GPS dropped by the canvas
 * re-encode) → queued → uploading (presigned PUT straight to R2, at most
 * MAX_PARALLEL_UPLOADS at a time) → done | error (retryable).
 *
 * Links pasted via "Add from link" join the same ordered list as `done` items,
 * so ordering, the cover (index 0) and the 12-photo cap cover both kinds.
 */

export const MAX_PHOTOS = 12;
export const MAX_EDGE_PX = 1600;
export const MAX_PARALLEL_UPLOADS = 3;
export const DEFAULT_MAX_BYTES = 1_572_864;
const WEBP_QUALITY = 0.8;
const JPEG_QUALITY = 0.82;

export type PhotoStatus = "processing" | "queued" | "uploading" | "done" | "error";

export type PhotoItem = {
  id: string;
  source: "upload" | "link";
  status: PhotoStatus;
  /** 0..1 upload progress (bytes sent / total). */
  progress: number;
  /** What the thumbnail shows: an object URL for uploads, the link itself for links. */
  previewUrl: string | null;
  /** Public URL saved on the listing once the photo is done. */
  url: string | null;
  blob: Blob | null;
  contentType: string | null;
  name: string;
  error: string | null;
  /** Which step failed, so retry resumes at the right place. */
  failedAt: "processing" | "uploading" | null;
};

export type PhotoAction =
  | { type: "add"; items: PhotoItem[] }
  | { type: "processed"; id: string; blob: Blob; contentType: string; previewUrl: string }
  | { type: "start"; id: string }
  | { type: "progress"; id: string; progress: number }
  | { type: "uploaded"; id: string; url: string }
  | { type: "failed"; id: string; error: string }
  | { type: "retry"; id: string }
  | { type: "remove"; id: string }
  | { type: "move"; from: number; to: number }
  | { type: "reset" };

let seq = 0;
export function newPhotoId(): string {
  seq += 1;
  return `p${Date.now().toString(36)}${seq.toString(36)}`;
}

export function uploadItem(file: File, id = newPhotoId()): PhotoItem {
  return {
    id,
    source: "upload",
    status: "processing",
    progress: 0,
    previewUrl: null,
    url: null,
    blob: null,
    contentType: null,
    name: file.name || "photo",
    error: null,
    failedAt: null,
  };
}

export function linkItem(url: string, id = newPhotoId()): PhotoItem {
  return {
    id,
    source: "link",
    status: "done",
    progress: 1,
    previewUrl: url,
    url,
    blob: null,
    contentType: null,
    name: url,
    error: null,
    failedAt: null,
  };
}

/** Move one element; out-of-range targets clamp to the ends. */
export function moveItem<T>(list: readonly T[], from: number, to: number): T[] {
  if (from < 0 || from >= list.length) return list.slice();
  const target = Math.max(0, Math.min(list.length - 1, to));
  if (target === from) return list.slice();
  const next = list.slice();
  const [item] = next.splice(from, 1);
  next.splice(target, 0, item);
  return next;
}

/** How many of `incoming` fit under the cap. */
export function roomFor(currentCount: number, incoming: number, max = MAX_PHOTOS): number {
  return Math.max(0, Math.min(incoming, max - currentCount));
}

const patch = (items: PhotoItem[], id: string, fn: (item: PhotoItem) => PhotoItem) =>
  items.map((item) => (item.id === id ? fn(item) : item));

export function photosReducer(items: PhotoItem[], action: PhotoAction): PhotoItem[] {
  switch (action.type) {
    case "add": {
      const room = roomFor(items.length, action.items.length);
      return room > 0 ? [...items, ...action.items.slice(0, room)] : items;
    }
    case "processed":
      return patch(items, action.id, (it) =>
        it.status === "processing"
          ? { ...it, status: "queued", blob: action.blob, contentType: action.contentType, previewUrl: action.previewUrl, error: null, failedAt: null }
          : it,
      );
    case "start":
      return patch(items, action.id, (it) => (it.status === "queued" ? { ...it, status: "uploading", progress: 0 } : it));
    case "progress":
      return patch(items, action.id, (it) =>
        it.status === "uploading" ? { ...it, progress: Math.max(it.progress, Math.min(1, action.progress)) } : it,
      );
    case "uploaded":
      // The bytes live in R2 now; drop the blob so a long session doesn't hold
      // 12 encoded photos in memory (the preview object URL stays for the thumbnail).
      return patch(items, action.id, (it) => ({ ...it, status: "done", progress: 1, url: action.url, blob: null, error: null, failedAt: null }));
    case "failed":
      return patch(items, action.id, (it) => ({
        ...it,
        status: "error",
        error: action.error,
        failedAt: it.status === "processing" ? "processing" : "uploading",
      }));
    case "retry":
      return patch(items, action.id, (it) => {
        if (it.status !== "error") return it;
        // A processing failure (undecodable file) can't be fixed by retrying the upload.
        if (it.failedAt === "processing" || !it.blob) return it;
        return { ...it, status: "queued", progress: 0, error: null, failedAt: null };
      });
    case "remove":
      return items.filter((it) => it.id !== action.id);
    case "move":
      return moveItem(items, action.from, action.to);
    case "reset":
      return [];
    default:
      return items;
  }
}

/** Ids of queued photos to start now, keeping at most `max` uploads in flight. */
export function nextToUpload(items: readonly PhotoItem[], max = MAX_PARALLEL_UPLOADS): string[] {
  const inFlight = items.filter((it) => it.status === "uploading").length;
  const slots = Math.max(0, max - inFlight);
  return items.filter((it) => it.status === "queued").slice(0, slots).map((it) => it.id);
}

export const doneUrls = (items: readonly PhotoItem[]): string[] =>
  items.filter((it) => it.status === "done" && it.url).map((it) => it.url as string);

export const isBusy = (items: readonly PhotoItem[]) =>
  items.some((it) => it.status === "processing" || it.status === "queued" || it.status === "uploading");

export const hasFailures = (items: readonly PhotoItem[]) => items.some((it) => it.status === "error");

/* ── Resize / re-encode ──────────────────────────────────────────────────── */

export function fitWithin(width: number, height: number, maxEdge = MAX_EDGE_PX): { width: number; height: number } {
  const longest = Math.max(width, height);
  if (!longest || longest <= maxEdge) return { width: Math.max(1, Math.round(width)), height: Math.max(1, Math.round(height)) };
  const scale = maxEdge / longest;
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
}

type Decoded = { source: CanvasImageSource; width: number; height: number; close: () => void };

/**
 * Decode with EXIF orientation applied. `createImageBitmap(…, { imageOrientation:
 * "from-image" })` rotates per EXIF; the <img> fallback relies on the CSS default
 * `image-orientation: from-image`, which every current browser applies.
 */
async function decode(file: Blob): Promise<Decoded> {
  if (typeof createImageBitmap === "function") {
    try {
      const bmp = await createImageBitmap(file, { imageOrientation: "from-image" });
      return { source: bmp, width: bmp.width, height: bmp.height, close: () => bmp.close() };
    } catch {
      /* fall through to <img> (e.g. older Safari) */
    }
  }
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.decoding = "async";
    img.src = url;
    await img.decode();
    return { source: img, width: img.naturalWidth, height: img.naturalHeight, close: () => undefined };
  } finally {
    URL.revokeObjectURL(url);
  }
}

function toBlob(canvas: HTMLCanvasElement, type: string, quality: number): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, type, quality));
}

/**
 * Encode as WebP; browsers that can't (they silently return PNG) get JPEG.
 * Steps quality down, then size, until the result fits `maxBytes`.
 */
export async function encodeCanvas(
  canvas: HTMLCanvasElement,
  maxBytes = DEFAULT_MAX_BYTES,
): Promise<{ blob: Blob; contentType: "image/webp" | "image/jpeg" }> {
  const probe = await toBlob(canvas, "image/webp", WEBP_QUALITY);
  const useWebp = probe?.type === "image/webp";
  const type = useWebp ? "image/webp" : "image/jpeg";
  const qualities = useWebp ? [WEBP_QUALITY, 0.7, 0.6, 0.5] : [JPEG_QUALITY, 0.72, 0.62, 0.5];
  for (let i = 0; i < qualities.length; i += 1) {
    const blob = i === 0 && useWebp ? probe : await toBlob(canvas, type, qualities[i]);
    if (blob && blob.type === type && blob.size <= maxBytes) return { blob, contentType: type };
  }
  throw new Error("too-large");
}

/** Resize to ≤ MAX_EDGE_PX on the long edge and re-encode without metadata. */
export async function processPhoto(file: Blob, maxBytes = DEFAULT_MAX_BYTES): Promise<{ blob: Blob; contentType: "image/webp" | "image/jpeg"; width: number; height: number }> {
  if (file.type && !file.type.startsWith("image/")) throw new Error("not-image");
  let decoded: Decoded;
  try {
    decoded = await decode(file);
  } catch {
    throw new Error("unreadable");
  }
  try {
    let { width, height } = fitWithin(decoded.width, decoded.height);
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("unreadable");
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = "high";
      ctx.drawImage(decoded.source, 0, 0, width, height);
      try {
        const out = await encodeCanvas(canvas, maxBytes);
        return { ...out, width, height };
      } catch (err) {
        if ((err as Error).message !== "too-large") throw err;
        ({ width, height } = fitWithin(width, height, Math.round(Math.max(width, height) * 0.8)));
      } finally {
        canvas.width = 0;
        canvas.height = 0;
      }
    }
    throw new Error("too-large");
  } finally {
    decoded.close();
  }
}

/* ── Upload ──────────────────────────────────────────────────────────────── */

export type Ticket = { uploadUrl: string; publicUrl: string; headers: Record<string, string> };

/**
 * PUT the bytes to a presigned URL with progress. XHR (not fetch) because
 * fetch has no upload progress. No credentials/auth headers — the signature
 * is the authorisation, and R2 must not receive our session.
 */
export function putWithProgress(
  ticket: Ticket,
  blob: Blob,
  onProgress: (fraction: number) => void,
  signal?: AbortSignal,
): Promise<string> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", ticket.uploadUrl, true);
    xhr.withCredentials = false;
    for (const [name, value] of Object.entries(ticket.headers || {})) xhr.setRequestHeader(name, value);
    xhr.upload.onprogress = (ev) => {
      if (ev.lengthComputable && ev.total > 0) onProgress(ev.loaded / ev.total);
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        onProgress(1);
        resolve(ticket.publicUrl);
      } else reject(new Error(`upload-${xhr.status}`));
    };
    xhr.onerror = () => reject(new Error("network"));
    xhr.onabort = () => reject(new Error("aborted"));
    if (signal) {
      if (signal.aborted) {
        reject(new Error("aborted"));
        return;
      }
      signal.addEventListener("abort", () => xhr.abort(), { once: true });
    }
    xhr.send(blob);
  });
}
