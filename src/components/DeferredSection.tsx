import { startTransition, useEffect, useRef, useState, type ReactNode } from "react";
import { viewTransitionInFlight } from "@/lib/viewTransition";

/**
 * Below-the-fold sections that mount one per frame, after the page above them
 * has painted.
 *
 * Each section owns its "ready" state, so mounting one re-renders only that
 * section (a page-level stage counter re-rendered the whole page per step).
 * Sections join a single FIFO queue in render order; the next one starts only
 * after the previous one has committed and a frame has gone by (rAF → task),
 * each as a transition. A page that mounted its whole below-the-fold at once
 * produced one 100 ms+ long task (React commit + the forced style/layout of
 * every new node).
 *
 * Nothing starts while a View Transition is running: DOM inserted under a
 * live transition is restyled and re-rasterised into the new snapshot every
 * frame, which is what dropped the card → listing morph to ~20 fps.
 *
 * `lazy` sections (carousels, Radix sliders that measure on mount) skip the
 * queue: they mount when they come within `margin` of the viewport, or once
 * the browser is idle `idleAfter` ms later, whichever is first.
 */

type Job = { run: () => void; cancelled: boolean };
const queue: Job[] = [];
let busy: Job | null = null;
let watchdog = 0;

function release(job: Job): void {
  if (busy !== job) return;
  busy = null;
  window.clearTimeout(watchdog);
  pump();
}

function pump(): void {
  if (busy) return;
  let job = queue.shift();
  while (job && job.cancelled) job = queue.shift();
  if (!job) return;
  const current = job;
  busy = current;
  const start = () => window.requestAnimationFrame(() => {
    window.setTimeout(() => {
      if (current.cancelled) return release(current);
      startTransition(current.run);
      // A section that never reports (suspended, errored) can't stall the rest.
      watchdog = window.setTimeout(() => release(current), 600);
    }, 0);
  });
  // Hold the queue until any running View Transition has finished.
  const waitForTransition = () => {
    if (current.cancelled) return release(current);
    if (viewTransitionInFlight()) window.setTimeout(waitForTransition, 50);
    else start();
  };
  waitForTransition();
}

function enqueue(run: () => void, first: boolean): Job {
  const job: Job = { run, cancelled: false };
  if (first) queue.unshift(job);
  else queue.push(job);
  pump();
  return job;
}

function canSchedule(): boolean {
  return typeof window !== "undefined" && typeof window.requestAnimationFrame === "function";
}

type Props = {
  children: ReactNode;
  /** Space held before the section mounts (keeps the page height steady). */
  minHeight?: number;
  lazy?: boolean;
  margin?: string;
  idleAfter?: number;
  /** Jump the queue (e.g. a sidebar block that is above the fold on desktop). */
  first?: boolean;
};

export function DeferredSection({ children, minHeight = 0, lazy = false, margin = "600px", idleAfter = 1500, first = false }: Props) {
  const [ready, setReady] = useState(() => !canSchedule());
  const jobRef = useRef<Job | null>(null);
  const holderRef = useRef<HTMLDivElement>(null);

  // Queued mount.
  useEffect(() => {
    if (ready || lazy) return;
    const job = enqueue(() => setReady(true), first);
    jobRef.current = job;
    return () => {
      job.cancelled = true;
      release(job);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- queue position is fixed at mount
  }, [ready, lazy]);

  // Committed: let the next section go.
  useEffect(() => {
    if (ready && jobRef.current) release(jobRef.current);
  }, [ready]);

  // Lazy mount: near the viewport, or idle a while after the page settled.
  useEffect(() => {
    if (ready || !lazy) return;
    const el = holderRef.current;
    let poll = 0;
    const show = () => {
      window.clearTimeout(poll);
      if (viewTransitionInFlight()) poll = window.setTimeout(show, 50);
      else startTransition(() => setReady(true));
    };
    if (!el || typeof IntersectionObserver === "undefined") {
      show();
      return;
    }
    const io = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) show();
    }, { rootMargin: `${margin} 0px` });
    io.observe(el);
    // rIC also fires in the gaps between frames of a running (compositor)
    // transition, so idle only counts after `idleAfter`.
    // On idle the section joins the one-per-frame queue (two lazy sections
    // going idle together would otherwise commit in one task).
    const viaQueue = () => {
      if (jobRef.current) return;
      jobRef.current = enqueue(() => setReady(true), false);
    };
    const ric = window.requestIdleCallback;
    let idle = 0;
    const timer = window.setTimeout(() => {
      idle = typeof ric === "function" ? ric(viaQueue, { timeout: 3000 }) : window.setTimeout(viaQueue, 0);
    }, idleAfter);
    return () => {
      io.disconnect();
      window.clearTimeout(timer);
      window.clearTimeout(poll);
      if (jobRef.current && !jobRef.current.cancelled) {
        jobRef.current.cancelled = true;
        release(jobRef.current);
      }
      if (typeof ric === "function") window.cancelIdleCallback?.(idle);
      else window.clearTimeout(idle);
    };
  }, [ready, lazy, margin, idleAfter]);

  if (ready) return <>{children}</>;
  return <div ref={holderRef} aria-hidden style={minHeight ? { minHeight } : undefined} />;
}
