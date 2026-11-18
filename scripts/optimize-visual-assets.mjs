/**
 * Aggressive Motormila visual asset optimizer.
 * Rewrites assets/*.webp + emits -sm.webp (960w) companions.
 *
 * Usage: node scripts/optimize-visual-assets.mjs
 */
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");

const DIRS = [path.join(root, "assets")];

/** Hero / full-bleed photos — large display, need more width */
const HERO_NAMES = new Set([
  "page_home_hero.webp",
  "page_home_hero_dusk.webp",
  "page_home_hero (1).webp",
  "page_search_hero.webp",
  "alt2_hero_orange_sunset.webp",
  "alt2_hero_ultrawide_panorama.webp",
  "alt2_page_pricing_bg.webp",
  "alt2_blog_tea_plantation.webp",
  "page_blog_header.webp",
  "page_compare_hero.webp",
  "categories_lineup.webp",
  "alt_category_suv_white.webp",
  "page_pro_premium.webp",
  "page_listing_detail.webp",
  "dark_garage_silhouette.webp",
  "page_make_hub.webp",
  "page_district_atmosphere.webp",
  "page_dealer_yard.webp",
  "page_official_pulse.webp",
  "page_estimate_valuation.webp",
  "page_best_picks_deals.webp",
  "page_ev_hub.webp",
  "page_pro_terminal.webp",
  "page_settings_locale.webp",
  "alt2_page_features_bg.webp",
  "alt2_page_insurance_finance.webp",
  "og_social_card.webp",
]);

const ILLUSTRATION_NAMES = new Set([
  "empty_state.webp",
  "lost_car_fork_404.webp",
  "page_faq_illustration.webp",
]);

function profileFor(name) {
  if (ILLUSTRATION_NAMES.has(name)) {
    return { maxW: 900, quality: 72, effort: 6, sm: 480 };
  }
  if (name.includes("ultrawide") || name.includes("home_hero")) {
    return { maxW: 1920, quality: 68, effort: 6, sm: 960 };
  }
  if (HERO_NAMES.has(name)) {
    return { maxW: 1600, quality: 68, effort: 6, sm: 800 };
  }
  // textures / admin / map / footer
  return { maxW: 1400, quality: 70, effort: 6, sm: 720 };
}

async function optimizeFile(filePath) {
  const name = path.basename(filePath);
  if (!name.endsWith(".webp") || name.includes("-sm.webp")) return null;
  if (name.startsWith(".")) return null;

  const before = (await fs.stat(filePath)).size;
  const profile = profileFor(name);
  const input = await fs.readFile(filePath);
  const meta = await sharp(input).metadata();

  const full = await sharp(input)
    .rotate()
    .resize({
      width: profile.maxW,
      height: Math.round(profile.maxW * 0.7),
      fit: "inside",
      withoutEnlargement: true,
    })
    .webp({
      quality: profile.quality,
      effort: profile.effort,
      smartSubsample: true,
      alphaQuality: 80,
    })
    .toBuffer();

  await fs.writeFile(filePath, full);

  const smPath = filePath.replace(/\.webp$/i, "-sm.webp");
  const sm = await sharp(input)
    .rotate()
    .resize({
      width: profile.sm,
      height: Math.round(profile.sm * 0.7),
      fit: "inside",
      withoutEnlargement: true,
    })
    .webp({
      quality: Math.min(profile.quality + 2, 75),
      effort: profile.effort,
      smartSubsample: true,
      alphaQuality: 80,
    })
    .toBuffer();
  await fs.writeFile(smPath, sm);

  const after = full.length;
  return {
    name,
    beforeKb: +(before / 1024).toFixed(1),
    afterKb: +(after / 1024).toFixed(1),
    smKb: +(sm.length / 1024).toFixed(1),
    dims: `${meta.width}x${meta.height}`,
    savedPct: Math.round((1 - after / before) * 100),
  };
}

async function main() {
  const results = [];
  for (const dir of DIRS) {
    let entries = [];
    try {
      entries = await fs.readdir(dir);
    } catch {
      continue;
    }
    for (const entry of entries) {
      if (!entry.endsWith(".webp") || entry.includes("-sm.webp")) continue;
      const full = path.join(dir, entry);
      const st = await fs.stat(full);
      if (!st.isFile()) continue;
      const row = await optimizeFile(full);
      if (row) {
        row.dir = path.basename(dir);
        results.push(row);
        console.log(
          `${row.dir}/${row.name}: ${row.beforeKb}KB → ${row.afterKb}KB (−${row.savedPct}%) + sm ${row.smKb}KB`,
        );
      }
    }
  }

  const before = results.reduce((s, r) => s + r.beforeKb, 0);
  const after = results.reduce((s, r) => s + r.afterKb, 0);
  console.log(
    `\nDone: ${results.length} files · ${before.toFixed(0)}KB → ${after.toFixed(0)}KB (−${Math.round((1 - after / before) * 100)}%)`,
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
