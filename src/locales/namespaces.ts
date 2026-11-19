import { mergeEnglish, type Dictionary } from "./index";

/**
 * Deferred English dictionary chunks. The eager core lives in ./chunks/core.ts
 * and is part of the entry chunk; these arrive per route.
 *
 * The split is generated (scripts/build-locale-chunks.mjs) from the merged
 * dictionaries, so the chunks are disjoint and their union is the complete
 * English dictionary. A failure to load one is not fatal: the call-site English
 * fallback already covers every key, so the route renders in English anyway.
 */
export type EnChunk = "market" | "tools" | "content" | "account" | "rest";

const LOADERS: Record<EnChunk, () => Promise<Dictionary>> = {
  market: () => import("./chunks/market").then((m) => m.EN_MARKET),
  tools: () => import("./chunks/tools").then((m) => m.EN_TOOLS),
  content: () => import("./chunks/content").then((m) => m.EN_CONTENT),
  account: () => import("./chunks/account").then((m) => m.EN_ACCOUNT),
  rest: () => import("./chunks/rest").then((m) => m.EN_REST),
};

export const ALL_EN_CHUNKS: EnChunk[] = ["market", "tools", "content", "account", "rest"];

const loaded = new Set<EnChunk>();
const pending = new Map<EnChunk, Promise<void>>();

function loadChunk(id: EnChunk): Promise<void> {
  if (loaded.has(id)) return Promise.resolve();
  const inFlight = pending.get(id);
  if (inFlight) return inFlight;
  const next = LOADERS[id]().then(
    (dictionary) => {
      mergeEnglish(dictionary);
      loaded.add(id);
      pending.delete(id);
    },
    () => {
      // Retry on the next route: the fallback literal already covers the keys.
      pending.delete(id);
    },
  );
  pending.set(id, next);
  return next;
}

/** Load the given English chunks (idempotent, never rejects). */
export function loadEnChunks(ids: EnChunk[]): Promise<void> {
  if (ids.length === 0) return Promise.resolve();
  return Promise.all(ids.map(loadChunk)).then(() => undefined);
}

/** True once every deferred English chunk is in memory (tests, diagnostics). */
export function allEnChunksLoaded(): boolean {
  return ALL_EN_CHUNKS.every((id) => loaded.has(id));
}
