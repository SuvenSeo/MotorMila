/**
 * Emit AVIF companions (1920w + 960w) for the LCP hero photos.
 * AtmosphericImage serves them through <picture> automatically (see
 * HERO_AVIF in src/lib/visualAssets.ts); WebP stays as the fallback.
 *   node scripts/build-hero-avif.mjs
 */
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const HEROES = ["page_home_hero", "page_home_hero_dusk", "page_home_hero_coastal"];

for (const name of HEROES) {
  const input = path.join(root, "assets", `${name}.webp`);
  for (const [suffix, width] of [["", 1920], ["-sm", 960]]) {
    const out = path.join(root, "assets", `${name}${suffix}.avif`);
    const info = await sharp(input)
      .resize({ width, withoutEnlargement: true })
      .avif({ quality: 50, effort: 6, chromaSubsampling: "4:2:0" })
      .toFile(out);
    console.log(`${path.basename(out)}  ${info.width}x${info.height}  ${(info.size / 1024).toFixed(1)} KB`);
  }
}
