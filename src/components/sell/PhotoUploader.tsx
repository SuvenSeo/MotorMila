import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { AlertCircle, ImagePlus, Link2, RotateCw, X } from "lucide-react";
import { useAppPreferences } from "@/lib/appPreferences";
import { MAX_PHOTOS, type PhotoItem } from "@/lib/photoUpload";
import type { PhotoUploads } from "@/hooks/usePhotoUploads";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import "@/styles/sell-photos.css";

type Props = {
  photos: PhotoUploads;
  /** Backend can issue upload URLs. When false only "add from link" is offered. */
  uploadsEnabled: boolean;
};

const RING_R = 15;
const RING_C = 2 * Math.PI * RING_R;

function ProgressRing({ item, label }: { item: PhotoItem; label: string }) {
  const indeterminate = item.status !== "uploading" || item.progress <= 0;
  const pct = Math.round(item.progress * 100);
  return (
    <span
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={indeterminate ? undefined : pct}
      className="flex h-11 w-11 items-center justify-center rounded-full bg-black/55 text-white"
    >
      <svg viewBox="0 0 36 36" className={cn("h-9 w-9 -rotate-90", indeterminate && "sell-ring__spin")} aria-hidden>
        <circle cx="18" cy="18" r={RING_R} fill="none" stroke="currentColor" strokeOpacity="0.25" strokeWidth="3" />
        <circle
          cx="18"
          cy="18"
          r={RING_R}
          fill="none"
          stroke="currentColor"
          strokeWidth="3"
          strokeLinecap="round"
          strokeDasharray={RING_C}
          strokeDashoffset={indeterminate ? RING_C * 0.72 : RING_C * (1 - item.progress)}
        />
      </svg>
    </span>
  );
}

type Drag = {
  id: string;
  pointerId: number;
  startX: number;
  startY: number;
  originIndex: number;
  index: number;
  started: boolean;
  touch: boolean;
  timer: number | null;
  slots: { x: number; y: number; w: number; h: number }[];
};

export function PhotoUploader({ photos, uploadsEnabled }: Props) {
  const { t } = useAppPreferences();
  const { items } = photos;
  const inputId = useId();
  const helpId = useId();
  const fileInput = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const nodes = useRef(new Map<string, HTMLLIElement>());
  const handles = useRef(new Map<string, HTMLDivElement>());
  const positions = useRef(new Map<string, { x: number; y: number }>());
  const drag = useRef<Drag | null>(null);
  const [over, setOver] = useState(false);
  const [linkOpen, setLinkOpen] = useState(false);
  const [link, setLink] = useState("");
  const [notice, setNotice] = useState<string | null>(null);
  const [announce, setAnnounce] = useState("");
  const [grabbed, setGrabbed] = useState<{ id: string; from: number } | null>(null);
  const [draggingId, setDraggingId] = useState<string | null>(null);

  const full = items.length >= MAX_PHOTOS;
  const compact = items.length > 0;
  const showLink = !uploadsEnabled || linkOpen;
  const total = items.length;

  /* ── Announce upload outcomes (not every percent) ──────────────────────── */
  const prevStatus = useRef(new Map<string, PhotoItem["status"]>());
  useEffect(() => {
    const messages: string[] = [];
    items.forEach((it, i) => {
      const before = prevStatus.current.get(it.id);
      if (before && before !== it.status) {
        if (it.status === "done" && it.source === "upload") messages.push(t("sell.photos.announceUploaded", "Photo {n} uploaded.", { n: i + 1 }));
        if (it.status === "error") messages.push(t("sell.photos.announceFailed", "Photo {n} couldn't be uploaded.", { n: i + 1 }));
      }
    });
    prevStatus.current = new Map(items.map((it) => [it.id, it.status]));
    if (messages.length) setAnnounce(messages.join(" "));
  }, [items, t]);

  /* ── FLIP: slide siblings to their new slots on reorder (transform only) ─ */
  useLayoutEffect(() => {
    const next = new Map<string, { x: number; y: number }>();
    nodes.current.forEach((el, id) => {
      next.set(id, { x: el.offsetLeft, y: el.offsetTop });
    });
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    next.forEach((pos, id) => {
      const prev = positions.current.get(id);
      const el = nodes.current.get(id);
      if (!prev || !el || reduce || id === drag.current?.id) return;
      const dx = prev.x - pos.x;
      const dy = prev.y - pos.y;
      if (!dx && !dy) return;
      el.style.transition = "none";
      el.style.transform = `translate(${dx}px, ${dy}px)`;
      void el.offsetWidth;
      el.style.transition = "transform 320ms cubic-bezier(0.32, 0.72, 0, 1)";
      el.style.transform = "";
    });
    positions.current = next;
    if (grabbed) handles.current.get(grabbed.id)?.focus({ preventScroll: true });
  }, [items, grabbed]);

  /* ── Adding ────────────────────────────────────────────────────────────── */
  const add = useCallback(
    (files: FileList | File[] | null) => {
      if (!files || !uploadsEnabled) return;
      const images = Array.from(files).filter((f) => !f.type || f.type.startsWith("image/"));
      if (!images.length) return;
      const room = MAX_PHOTOS - items.length;
      const skipped = photos.addFiles(images);
      setNotice(skipped > 0 ? t("sell.photos.skipped", "Only {n} more fit — the rest were skipped.", { n: Math.max(0, room) }) : null);
    },
    [items.length, photos, t, uploadsEnabled],
  );

  const addLink = useCallback(() => {
    const url = link.trim();
    if (!url || full) return;
    if (!/^https?:\/\//i.test(url)) {
      setNotice(t("sell.imageUrlInvalid", "Image must be a valid http(s) URL."));
      return;
    }
    photos.addLink(url);
    setLink("");
    setNotice(null);
  }, [full, link, photos, t]);

  /* ── Pointer drag (mouse immediately; touch after a short press) ────────── */
  const endDrag = useCallback(() => {
    const d = drag.current;
    if (!d) return;
    if (d.timer) window.clearTimeout(d.timer);
    const el = nodes.current.get(d.id);
    if (el && d.started) {
      el.style.transition = "transform 320ms cubic-bezier(0.32, 0.72, 0, 1)";
      el.style.transform = "";
      setAnnounce(t("sell.photos.dropped", "Dropped at position {n} of {total}.", { n: d.index + 1, total: items.length }));
    }
    drag.current = null;
    setDraggingId(null);
  }, [items.length, t]);

  const onPointerMove = useCallback(
    (e: PointerEvent) => {
      const d = drag.current;
      if (!d || e.pointerId !== d.pointerId) return;
      const dx = e.clientX - d.startX;
      const dy = e.clientY - d.startY;
      if (!d.started) {
        const moved = Math.hypot(dx, dy);
        if (d.touch) {
          if (moved > 8) endDrag(); // a scroll, not a press
          return;
        }
        if (moved < 5) return;
        d.started = true;
        setDraggingId(d.id);
      }
      e.preventDefault();
      const origin = d.slots[d.originIndex];
      const px = origin.x + origin.w / 2 + dx;
      const py = origin.y + origin.h / 2 + dy;
      let best = d.index;
      let bestDist = Infinity;
      d.slots.forEach((s, i) => {
        const dist = Math.hypot(s.x + s.w / 2 - px, s.y + s.h / 2 - py);
        if (dist < bestDist) {
          bestDist = dist;
          best = i;
        }
      });
      if (best !== d.index) {
        photos.move(d.index, best);
        d.index = best;
      }
      const slot = d.slots[d.index];
      const el = nodes.current.get(d.id);
      if (el) {
        el.style.transition = "none";
        el.style.transform = `translate(${origin.x - slot.x + dx}px, ${origin.y - slot.y + dy}px) scale(1.04)`;
      }
    },
    [endDrag, photos],
  );

  useEffect(() => {
    const up = (e: PointerEvent) => {
      if (drag.current && e.pointerId === drag.current.pointerId) endDrag();
    };
    // Touch drags must stop the page from scrolling under the finger.
    const touchMove = (e: TouchEvent) => {
      if (drag.current?.started) e.preventDefault();
    };
    window.addEventListener("pointermove", onPointerMove, { passive: false });
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", up);
    document.addEventListener("touchmove", touchMove, { passive: false });
    return () => {
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", up);
      document.removeEventListener("touchmove", touchMove);
    };
  }, [endDrag, onPointerMove]);

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>, id: string, index: number) => {
    if (e.button !== 0 || items.length < 2) return;
    if ((e.target as HTMLElement).closest("button")) return;
    const slots = items.map((it) => {
      const el = nodes.current.get(it.id);
      return el ? { x: el.offsetLeft, y: el.offsetTop, w: el.offsetWidth, h: el.offsetHeight } : { x: 0, y: 0, w: 0, h: 0 };
    });
    const touch = e.pointerType !== "mouse";
    const d: Drag = { id, pointerId: e.pointerId, startX: e.clientX, startY: e.clientY, originIndex: index, index, started: false, touch, timer: null, slots };
    if (touch) {
      d.timer = window.setTimeout(() => {
        if (drag.current !== d) return;
        d.started = true;
        d.touch = false; // from here on, moves drag
        setDraggingId(id);
        navigator.vibrate?.(8);
        const el = nodes.current.get(id);
        if (el) el.style.transform = "scale(1.04)";
      }, 260);
    }
    drag.current = d;
  };

  /* ── Keyboard reorder: Space/Enter picks up, arrows move, Space drops, Esc cancels ─ */
  const onKeyDown = (e: React.KeyboardEvent<HTMLDivElement>, item: PhotoItem, index: number) => {
    if (e.target !== e.currentTarget) return;
    const last = items.length - 1;
    if (e.key === " " || e.key === "Enter") {
      e.preventDefault();
      if (grabbed?.id === item.id) {
        setGrabbed(null);
        setAnnounce(t("sell.photos.dropped", "Dropped at position {n} of {total}.", { n: index + 1, total }));
      } else if (items.length > 1) {
        setGrabbed({ id: item.id, from: index });
        setAnnounce(t("sell.photos.grabbed", "Picked up photo {n}. Use the arrow keys to move it, Space to drop, Escape to cancel.", { n: index + 1 }));
      }
      return;
    }
    if (e.key === "Escape" && grabbed?.id === item.id) {
      e.preventDefault();
      photos.move(index, grabbed.from);
      setGrabbed(null);
      setAnnounce(t("sell.photos.cancelled", "Move cancelled."));
      return;
    }
    if (grabbed?.id === item.id) {
      const delta = { ArrowLeft: -1, ArrowUp: -1, ArrowRight: 1, ArrowDown: 1 }[e.key as string];
      let to: number | null = delta !== undefined ? index + delta : null;
      if (e.key === "Home") to = 0;
      if (e.key === "End") to = last;
      if (to === null) return;
      e.preventDefault();
      to = Math.max(0, Math.min(last, to));
      if (to !== index) {
        photos.move(index, to);
        setAnnounce(t("sell.photos.movedTo", "Moved to position {n} of {total}.", { n: to + 1, total }));
      }
      return;
    }
    if (e.key === "Delete" || e.key === "Backspace") {
      e.preventDefault();
      const nextFocus = items[index + 1]?.id ?? items[index - 1]?.id;
      photos.remove(item.id);
      if (nextFocus) window.setTimeout(() => handles.current.get(nextFocus)?.focus(), 0);
    }
  };

  const statusLabel = (it: PhotoItem) => {
    if (it.status === "processing") return t("sell.photos.processing", "Preparing photo…");
    if (it.status === "queued") return t("sell.photos.waiting", "Waiting to upload…");
    if (it.status === "uploading") return t("sell.photos.uploading", "Uploading {n}%", { n: Math.round(it.progress * 100) });
    if (it.status === "error") {
      if (it.error === "unreadable" || it.error === "not-image") return t("sell.photos.unreadable", "Can't read this file");
      if (it.error === "too-large") return t("sell.photos.tooLarge", "Photo is too large");
      return t("sell.photos.failed", "Upload failed");
    }
    return "";
  };

  return (
    <div className="sell-photos space-y-4">
      {uploadsEnabled && (
        <div
          className={cn(
            "sell-dropzone rounded-card border border-dashed border-label-3/50 bg-surface-2/60",
            compact ? "flex items-center gap-3 px-3 py-3 text-left sm:px-4" : "px-4 py-6 text-center sm:py-8",
          )}
          data-over={over ? "true" : "false"}
          onDragEnter={(e) => {
            if (full || !e.dataTransfer.types.includes("Files")) return;
            e.preventDefault();
            setOver(true);
          }}
          onDragOver={(e) => {
            if (full || !e.dataTransfer.types.includes("Files")) return;
            e.preventDefault();
            e.dataTransfer.dropEffect = "copy";
          }}
          onDragLeave={(e) => {
            if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setOver(false);
          }}
          onDrop={(e) => {
            if (!e.dataTransfer.types.includes("Files")) return;
            e.preventDefault();
            setOver(false);
            if (!full) add(e.dataTransfer.files);
          }}
        >
          <span
            className={cn(
              "sell-dropzone__icon flex shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary",
              compact ? "h-10 w-10" : "mx-auto h-12 w-12",
            )}
          >
            <ImagePlus className={compact ? "h-5 w-5" : "h-6 w-6"} strokeWidth={1.75} aria-hidden />
          </span>
          <div className={cn(compact ? (full ? "min-w-0 flex-1" : "hidden min-w-0 flex-1 sm:block") : "mt-3")}>
            <p className={cn("font-display font-semibold text-foreground", compact ? "text-body" : "text-callout")}>
              {full
                ? t("sell.photos.limitTitle", "12 of 12 photos added")
                : over
                  ? t("sell.photos.dropActive", "Drop to add")
                  : compact
                    ? t("sell.photos.addMore", "Add more photos")
                    : (
                        <>
                          <span className="[@media(hover:none)]:hidden">{t("sell.photos.drop", "Drag photos here")}</span>
                          <span className="hidden [@media(hover:none)]:inline">{t("sell.photos.addTouch", "Add photos of your vehicle")}</span>
                        </>
                      )}
            </p>
            <p className={cn("text-label-2", compact ? (full ? "text-caption" : "hidden text-caption sm:block") : "mx-auto mt-1 max-w-sm text-footnote")}>
              {full
                ? t("sell.photos.limitReached", "That's the maximum. Remove a photo to add another.")
                : t("sell.photos.privacy", "Photos are resized before upload and their location data is removed.")}
            </p>
          </div>
          <input
            ref={fileInput}
            id={inputId}
            type="file"
            accept="image/*"
            multiple
            className="sr-only"
            tabIndex={-1}
            aria-hidden
            disabled={full}
            onChange={(e) => {
              add(e.target.files);
              e.target.value = "";
            }}
          />
          {!full && (
          <Button
            type="button"
            size={compact ? "sm" : undefined}
            variant={compact ? "secondary" : undefined}
            className={cn(compact ? "flex-1 sm:flex-none" : "mt-4")}
            onClick={() => fileInput.current?.click()}
            disabled={full}
          >
            <ImagePlus aria-hidden /> {t("sell.photos.choose", "Choose photos")}
          </Button>
          )}
        </div>
      )}

      {notice && (
        <p role="status" className="sell-fade-in text-footnote text-label-1">
          {notice}
        </p>
      )}

      {items.length > 0 && (
        <>
          <p id={helpId} className="text-caption text-label-2">
            <span className="[@media(hover:none)]:hidden">{t("sell.photos.reorderMouse", "Drag to reorder — the first photo is your cover.")}</span>
            <span className="hidden [@media(hover:none)]:inline">{t("sell.photos.reorderTouch", "Press and hold a photo, then drag to reorder — the first one is your cover.")}</span>
            <span className="sr-only"> {t("sell.photos.reorderKeys", "With a keyboard, press Space on a photo, move it with the arrow keys, then press Space again.")}</span>
          </p>
          <ul ref={listRef} className="relative grid grid-cols-3 gap-2 sm:grid-cols-4" aria-label={t("sell.photos.listLabel", "Your photos")}>
            {items.map((it, i) => {
              const busy = it.status === "processing" || it.status === "queued" || it.status === "uploading";
              const isGrabbed = grabbed?.id === it.id;
              const label =
                (i === 0
                  ? t("sell.photos.coverLabel", "Photo 1 of {total}, cover", { total })
                  : t("sell.photos.itemLabel", "Photo {n} of {total}", { n: i + 1, total })) + (statusLabel(it) ? `. ${statusLabel(it)}` : "");
              return (
                <li
                  key={it.id}
                  ref={(el) => {
                    if (el) nodes.current.set(it.id, el);
                    else nodes.current.delete(it.id);
                  }}
                  data-dragging={draggingId === it.id ? "true" : undefined}
                  data-grabbed={isGrabbed ? "true" : undefined}
                  className="sell-thumb sell-thumb-in group relative aspect-[4/3] overflow-hidden rounded-control border border-border bg-surface-2"
                >
                  {/* The whole thumbnail is the drag/keyboard handle; remove/retry sit above it. */}
                  <div
                    ref={(el) => {
                      if (el) handles.current.set(it.id, el);
                      else handles.current.delete(it.id);
                    }}
                    role="button"
                    tabIndex={0}
                    aria-roledescription={t("sell.photos.sortable", "sortable photo")}
                    aria-label={label}
                    aria-describedby={helpId}
                    aria-pressed={isGrabbed}
                    onPointerDown={(e) => onPointerDown(e, it.id, i)}
                    onKeyDown={(e) => onKeyDown(e, it, i)}
                    onContextMenu={(e) => {
                      if (drag.current) e.preventDefault();
                    }}
                    className={cn(
                      "absolute inset-0 rounded-[inherit] outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring",
                      isGrabbed && "ring-2 ring-inset ring-primary",
                    )}
                  >
                  {it.previewUrl ? (
                    <img src={it.previewUrl} alt="" draggable={false} className={cn("h-full w-full object-cover", (busy || it.status === "error") && "opacity-70")} />
                  ) : (
                    <div className="h-full w-full animate-pulse bg-surface-3" aria-hidden />
                  )}

                  {busy && (
                    <div className="absolute inset-0 flex items-center justify-center">
                      <ProgressRing item={it} label={statusLabel(it)} />
                    </div>
                  )}
                  </div>

                  {it.status === "error" && (
                    <div className="absolute inset-0 flex flex-col items-start justify-end gap-1.5 bg-black/55 p-1.5 text-center text-white sm:items-center sm:justify-center sm:p-2">
                      <AlertCircle className="hidden h-5 w-5 sm:block" aria-hidden />
                      {/* Phone thumbnails are too small for icon + text + button; the button and the live region carry it. */}
                      <span className="hidden text-caption font-semibold leading-tight sm:block">{statusLabel(it)}</span>
                      {it.failedAt === "uploading" && (
                        <button
                          type="button"
                          onClick={() => photos.retry(it.id)}
                          className="inline-flex min-h-8 min-w-8 items-center justify-center gap-1 rounded-full bg-background/95 px-2 text-caption sm:px-3 font-semibold text-foreground transition-ui duration-short ease-standard active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                          aria-label={t("sell.photos.retryN", "Retry photo {n}", { n: i + 1 })}
                        >
                          <RotateCw className="h-3.5 w-3.5" aria-hidden /> <span className="hidden sm:inline">{t("sell.photos.retry", "Retry")}</span>
                        </button>
                      )}
                    </div>
                  )}

                  <button
                    type="button"
                    onClick={() => photos.remove(it.id)}
                    aria-label={t("sell.photos.removeN", "Remove photo {n}", { n: i + 1 })}
                    className="absolute right-1.5 top-1.5 flex h-8 w-8 items-center justify-center rounded-full bg-black/60 text-white transition-ui duration-short ease-standard active:scale-[0.97] focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring [@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-focus-within:opacity-100 [@media(hover:hover)]:group-hover:opacity-100"
                  >
                    <X className="h-4 w-4" aria-hidden />
                  </button>
                  {i === 0 && (
                    <Badge variant="solid" className="pointer-events-none absolute bottom-1.5 left-1.5">
                      {t("sell.cover", "Cover")}
                    </Badge>
                  )}
                </li>
              );
            })}
          </ul>
        </>
      )}

      {full && !uploadsEnabled && (
        <p role="status" className="text-footnote text-label-1">
          {t("sell.photos.limitReached", "That's the maximum. Remove a photo to add another.")}
        </p>
      )}

      {!showLink ? (
        <Button type="button" variant="tertiary" size="sm" onClick={() => setLinkOpen(true)} aria-expanded={false} disabled={full}>
          <Link2 aria-hidden /> {t("sell.photos.addFromLink", "Add from link")}
        </Button>
      ) : (
        <div className={cn("flex gap-2", uploadsEnabled && "sell-fade-in")}>
          <Input
            aria-label={t("sell.imageUrlPh", "Paste an image URL (https://…)")}
            value={link}
            onChange={(e) => setLink(e.target.value)}
            placeholder={t("sell.imageUrlPh", "Paste an image URL (https://…)")}
            disabled={full}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                addLink();
              }
            }}
          />
          <Button type="button" variant="secondary" onClick={addLink} disabled={full || !link.trim()}>
            {t("sell.addImage", "Add")}
          </Button>
        </div>
      )}

      <p className="sr-only" aria-live="polite" aria-atomic="true">
        {announce}
      </p>
    </div>
  );
}
