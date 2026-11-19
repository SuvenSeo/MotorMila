import type { ComponentType } from "react";
import { lazyWithRetry } from "./lazyWithRetry";
import { registerRouteLoaders } from "./routePrefetch";
import { loadEnChunks, type EnChunk } from "@/locales/namespaces";

/**
 * A page route: its JS chunk plus the deferred English dictionary chunks the
 * page renders. Both are awaited before the route mounts, so no section of a
 * page can paint a key that has not arrived. Should a chunk fail, the page
 * still mounts in English from the call-site fallbacks.
 *
 * `prefetchKey` (the same key registerRouteLoaders used) makes hover/idle
 * prefetch warm the dictionaries along with the page, so the next navigation
 * does not pay for them either.
 */
export function pageRoute<T extends ComponentType<unknown>>(
  chunks: EnChunk[],
  load: () => Promise<{ default: T }>,
  prefetchKey?: string | string[],
) {
  const loadPage = () => Promise.all([load(), loadEnChunks(chunks)]).then(([page]) => page);
  const keys = prefetchKey === undefined ? [] : [prefetchKey].flat();
  if (keys.length > 0) registerRouteLoaders(Object.fromEntries(keys.map((k) => [k, loadPage])));
  return lazyWithRetry(loadPage);
}
