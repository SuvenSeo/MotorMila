#!/usr/bin/env node
/**
 * sync-snapshots-from-r2.mjs
 *
 * Build-time snapshot sync: pulls the fresh public listing snapshots from the
 * canonical R2 bucket into public/snapshots/latest before `vite build` bundles
 * them. This keeps the deployed site's listing data fresh no matter which git
 * commit triggered the build — the repo's committed snapshot copy is only a
 * stale fallback and must never be the live data source.
 *
 * Never fails the build: on any error it logs a warning and leaves the
 * existing public/snapshots/latest untouched.
 */
import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const R2_BASE =
  process.env.SNAPSHOT_R2_BASE_URL ||
  "https://pub-f15911ef9a914db9a44e1fd6b47dfe4e.r2.dev/snapshots/latest";
const DEST = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../public/snapshots/latest"
);

async function getJson(url) {
  const res = await fetch(url, { redirect: "follow" });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  return res.json();
}

async function downloadFile(url, destPath) {
  const res = await fetch(url, { redirect: "follow" });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  const buf = Buffer.from(await res.arrayBuffer());
  await fs.writeFile(destPath, buf);
  return buf.length;
}

async function main() {
  let remote;
  try {
    remote = await getJson(`${R2_BASE}/manifest.json`);
  } catch (err) {
    console.warn(`[snapshots] R2 manifest unreachable, keeping bundled copy: ${err.message}`);
    return;
  }
  const remoteGen = String(remote?.generated_at || "");

  let localGen = "";
  try {
    const local = JSON.parse(
      await fs.readFile(path.join(DEST, "manifest.json"), "utf8")
    );
    localGen = String(local?.generated_at || "");
  } catch {
    localGen = "";
  }

  if (localGen && remoteGen && localGen >= remoteGen) {
    console.log(`[snapshots] bundled copy is current (${localGen}), skipping R2 sync`);
    return;
  }

  console.log(
    `[snapshots] syncing fresh snapshots from R2 (remote ${remoteGen || "unknown"} > local ${localGen || "none"})`
  );
  await fs.mkdir(DEST, { recursive: true });

  const files = Array.isArray(remote.files) ? remote.files : [];
  // The catalog parts live in listing-catalog.json, not in the manifest file list.
  let parts = [];
  try {
    const catalog = await getJson(`${R2_BASE}/listing-catalog.json`);
    if (Array.isArray(catalog.parts)) parts = catalog.parts;
    await fs.writeFile(
      path.join(DEST, "listing-catalog.json"),
      JSON.stringify(catalog)
    );
  } catch (err) {
    console.warn(`[snapshots] listing-catalog.json failed: ${err.message}`);
  }

  const all = [...new Set([...files, ...parts, "listing-catalog.json", "manifest.json"])];
  let ok = 0;
  for (const name of all) {
    if (typeof name !== "string" || name.includes("..")) continue;
    try {
      const bytes = await downloadFile(`${R2_BASE}/${name}`, path.join(DEST, name));
      ok++;
      if (bytes > 1024 * 1024) console.log(`[snapshots]   ${name} (${(bytes / 1024 / 1024).toFixed(1)} MB)`);
    } catch (err) {
      console.warn(`[snapshots]   SKIP ${name}: ${err.message}`);
    }
  }
  // Write the remote manifest last so a partial sync never looks complete.
  try {
    await fs.writeFile(path.join(DEST, "manifest.json"), JSON.stringify(remote));
  } catch (err) {
    console.warn(`[snapshots] manifest write failed: ${err.message}`);
  }
  console.log(`[snapshots] synced ${ok}/${all.length} files from R2`);
}

main().catch((err) => {
  console.warn(`[snapshots] sync failed, keeping bundled copy: ${err?.message || err}`);
});
