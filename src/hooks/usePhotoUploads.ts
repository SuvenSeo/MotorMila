import { useCallback, useEffect, useReducer, useRef } from "react";
import {
  DEFAULT_MAX_BYTES,
  MAX_PARALLEL_UPLOADS,
  MAX_PHOTOS,
  linkItem,
  nextToUpload,
  photosReducer,
  processPhoto,
  putWithProgress,
  roomFor,
  uploadItem,
  type PhotoItem,
  type Ticket,
} from "@/lib/photoUpload";

export type TicketFetcher = (input: { contentType: string; size: number; existingCount: number }) => Promise<Ticket>;

type Options = {
  requestTicket: TicketFetcher;
  maxBytes?: number;
  /** Injected for tests; defaults to the canvas pipeline / XHR PUT. */
  process?: typeof processPhoto;
  put?: typeof putWithProgress;
  createObjectUrl?: (blob: Blob) => string;
  revokeObjectUrl?: (url: string) => void;
};

export type PhotoUploads = ReturnType<typeof usePhotoUploads>;

/**
 * Ordered seller photos: uploads (resize → presigned PUT, ≤3 in flight) and
 * pasted links share one list; index 0 is the cover.
 */
export function usePhotoUploads({
  requestTicket,
  maxBytes = DEFAULT_MAX_BYTES,
  process = processPhoto,
  put = putWithProgress,
  createObjectUrl = (b) => URL.createObjectURL(b),
  revokeObjectUrl = (u) => URL.revokeObjectURL(u),
}: Options) {
  const [items, dispatch] = useReducer(photosReducer, [] as PhotoItem[]);
  const itemsRef = useRef(items);
  itemsRef.current = items;
  // Count including adds dispatched but not yet rendered, so two adds in one
  // tick (links + files) still respect the 12-photo cap.
  const countRef = useRef(items.length);
  countRef.current = items.length;
  const files = useRef(new Map<string, File>());
  const controllers = useRef(new Map<string, AbortController>());
  const objectUrls = useRef(new Map<string, string>());
  const processing = useRef(false);
  const deps = useRef({ requestTicket, maxBytes, process, put, createObjectUrl, revokeObjectUrl });
  deps.current = { requestTicket, maxBytes, process, put, createObjectUrl, revokeObjectUrl };

  /* Decode/resize one photo at a time: canvases of 12 phone photos at once would spike memory. */
  const pump = useCallback(async () => {
    if (processing.current) return;
    processing.current = true;
    try {
      for (;;) {
        const next = itemsRef.current.find((it) => it.status === "processing" && files.current.has(it.id));
        if (!next) break;
        const file = files.current.get(next.id)!;
        files.current.delete(next.id);
        try {
          const out = await deps.current.process(file, deps.current.maxBytes);
          if (!itemsRef.current.some((it) => it.id === next.id)) continue; // removed meanwhile
          const preview = deps.current.createObjectUrl(out.blob);
          objectUrls.current.set(next.id, preview);
          dispatch({ type: "processed", id: next.id, blob: out.blob, contentType: out.contentType, previewUrl: preview });
        } catch (err) {
          dispatch({ type: "failed", id: next.id, error: (err as Error).message || "unreadable" });
        }
        // Let React commit so itemsRef reflects the dispatch before the next pick.
        await new Promise((r) => setTimeout(r, 0));
      }
    } finally {
      processing.current = false;
    }
  }, []);

  const startUpload = useCallback(async (id: string) => {
    const item = itemsRef.current.find((it) => it.id === id);
    if (!item?.blob || !item.contentType || controllers.current.has(id)) return;
    const controller = new AbortController();
    controllers.current.set(id, controller);
    dispatch({ type: "start", id });
    try {
      const others = itemsRef.current.filter((it) => it.id !== id).length;
      const ticket = await deps.current.requestTicket({ contentType: item.contentType, size: item.blob.size, existingCount: others });
      const url = await deps.current.put(ticket, item.blob, (p) => dispatch({ type: "progress", id, progress: p }), controller.signal);
      dispatch({ type: "uploaded", id, url });
    } catch (err) {
      if (!controller.signal.aborted) dispatch({ type: "failed", id, error: (err as Error).message || "upload-failed" });
    } finally {
      controllers.current.delete(id);
    }
  }, []);

  // Scheduler: keep ≤ MAX_PARALLEL_UPLOADS PUTs in flight; feed the resize queue.
  useEffect(() => {
    for (const id of nextToUpload(items, MAX_PARALLEL_UPLOADS)) void startUpload(id);
    if (items.some((it) => it.status === "processing" && files.current.has(it.id))) void pump();
  }, [items, pump, startUpload]);

  useEffect(
    () => () => {
      controllers.current.forEach((c) => c.abort());
      objectUrls.current.forEach((u) => deps.current.revokeObjectUrl(u));
    },
    [],
  );

  /** Adds what fits under the cap; returns how many were skipped. */
  const addFiles = useCallback((list: FileList | File[]) => {
    const incoming = Array.from(list);
    const room = roomFor(countRef.current, incoming.length, MAX_PHOTOS);
    const accepted = incoming.slice(0, room).map((file) => {
      const item = uploadItem(file);
      files.current.set(item.id, file);
      return item;
    });
    if (accepted.length) {
      countRef.current += accepted.length;
      dispatch({ type: "add", items: accepted });
    }
    return incoming.length - accepted.length;
  }, []);

  const addLink = useCallback((url: string) => {
    if (countRef.current >= MAX_PHOTOS) return false;
    countRef.current += 1;
    dispatch({ type: "add", items: [linkItem(url)] });
    return true;
  }, []);

  const remove = useCallback((id: string) => {
    controllers.current.get(id)?.abort();
    files.current.delete(id);
    const url = objectUrls.current.get(id);
    if (url) {
      deps.current.revokeObjectUrl(url);
      objectUrls.current.delete(id);
    }
    if (itemsRef.current.some((it) => it.id === id)) countRef.current = Math.max(0, countRef.current - 1);
    dispatch({ type: "remove", id });
  }, []);

  const retry = useCallback((id: string) => dispatch({ type: "retry", id }), []);
  const move = useCallback((from: number, to: number) => dispatch({ type: "move", from, to }), []);
  const reset = useCallback(() => {
    controllers.current.forEach((c) => c.abort());
    objectUrls.current.forEach((u) => deps.current.revokeObjectUrl(u));
    objectUrls.current.clear();
    files.current.clear();
    countRef.current = 0;
    dispatch({ type: "reset" });
  }, []);

  return { items, addFiles, addLink, remove, retry, move, reset };
}
