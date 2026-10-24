import { defineConfig, type Plugin, type Rollup } from "vite";

type OutputBundle = Rollup.OutputBundle;
type OutputChunk = Rollup.OutputChunk;
import react from "@vitejs/plugin-react-swc";
import path from "path";

/**
 * Route-aware early hints, injected into index.html at build time.
 *
 * The SPA shell is the same HTML for every URL, and the route chunk + LCP
 * photo are only discovered after the ~150 kB entry has run. A tiny inline
 * script in <head> looks at location.pathname and adds, before any JS:
 * - modulepreload for the matching route chunk and its static imports
 *   (home → Dashboard, /listing/:id → ListingDetail), and
 * - on "/", a high-priority preload of the hero AVIF with the SAME
 *   srcset/sizes AtmosphericImage renders (so the browser picks the same file).
 * The hero file is the default variant (DEFAULT_HERO_VARIANT_ID "coastal-aerial"
 * in src/lib/heroVariants.ts → assets/page_home_hero_coastal*.avif).
 */
function routeEarlyHints(): Plugin {
  const ROUTES: Array<{ test: string; page: string }> = [
    { test: 'p==="/"', page: "src/pages/Dashboard.tsx" },
    { test: 'p.indexOf("/listing/")===0', page: "src/pages/ListingDetail.tsx" },
  ];
  const HERO_SM = "page_home_hero_coastal-sm.avif";
  const HERO_LG = "page_home_hero_coastal.avif";

  function chunkFor(bundle: OutputBundle, page: string): OutputChunk | undefined {
    const chunks = Object.values(bundle).filter((f): f is OutputChunk => f.type === "chunk");
    const norm = (id: string) => id.replace(/\\/g, "/");
    // Rollup leaves facadeModuleId null when it merges a dynamic entry with
    // shared modules (Dashboard), so fall back to the chunk that holds the page.
    return (
      chunks.find((f) => !!f.facadeModuleId && norm(f.facadeModuleId).endsWith(page)) ??
      chunks.find((f) => f.isDynamicEntry && f.moduleIds.some((id) => norm(id).endsWith(page)))
    );
  }

  function staticClosure(bundle: OutputBundle, root: OutputChunk, skip: Set<string>): string[] {
    const out: string[] = [];
    const seen = new Set<string>();
    const walk = (c: OutputChunk) => {
      if (seen.has(c.fileName)) return;
      seen.add(c.fileName);
      if (!skip.has(c.fileName)) out.push(c.fileName);
      for (const imp of c.imports) {
        const next = bundle[imp];
        if (next && next.type === "chunk") walk(next);
      }
    };
    walk(root);
    return out;
  }

  function assetFile(bundle: OutputBundle, name: string): string | undefined {
    for (const f of Object.values(bundle)) {
      if (f.type !== "asset") continue;
      const names = (f as { names?: string[]; name?: string }).names ?? [];
      if (names.includes(name) || (f as { name?: string }).name === name) return f.fileName;
    }
    return undefined;
  }

  return {
    name: "motormila-route-early-hints",
    apply: "build",
    transformIndexHtml: {
      order: "post",
      handler(html, ctx) {
        const bundle = ctx.bundle;
        if (!bundle) return html;
        // Chunks the entry already modulepreloads (or is) don't need a hint.
        const entry = Object.values(bundle).find((f): f is OutputChunk => f.type === "chunk" && f.isEntry);
        const skip = new Set<string>(entry ? staticClosure(bundle, entry, new Set()) : []);
        const cases: string[] = [];
        for (const r of ROUTES) {
          const chunk = chunkFor(bundle, r.page);
          if (!chunk) continue;
          const files = staticClosure(bundle, chunk, skip);
          if (files.length) cases.push(`if(${r.test})m(${JSON.stringify(files)});`);
        }
        const sm = assetFile(bundle, HERO_SM);
        const lg = assetFile(bundle, HERO_LG);
        const hero =
          sm && lg
            ? `if(p==="/"){var l=d.createElement("link");l.rel="preload";l.as="image";l.type="image/avif";l.setAttribute("imagesrcset","/${sm} 960w, /${lg} 1920w");l.setAttribute("imagesizes","100vw");l.setAttribute("fetchpriority","high");d.head.appendChild(l);}`
            : "";
        if (!cases.length && !hero) return html;
        const script =
          `<script>(function(){try{var d=document,p=location.pathname;` +
          `function m(a){for(var i=0;i<a.length;i++){var l=d.createElement("link");l.rel="modulepreload";l.crossOrigin="";l.href="/"+a[i];d.head.appendChild(l);}}` +
          hero +
          cases.join("") +
          `}catch(e){}})();</script>`;
        return html.replace("</head>", `    ${script}\n  </head>`);
      },
    },
  };
}

export default defineConfig({
  server: {
    host: "::",
    port: 8080,
    proxy: {
      "/api": {
        target: "http://127.0.0.1:8000",
        changeOrigin: true,
      },
    },
  },
  plugins: [react(), routeEarlyHints()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          // Tiny helpers used everywhere (vite's preload helper, commonjs
          // interop, class-name utils). Without an explicit home rollup hoists
          // them into whichever vendor chunk first imports them -- which made
          // the entry statically import (and modulepreload) pdf-vendor and
          // chart-vendor on every page.
          if (
            id.includes("vite/preload-helper") ||
            id.includes("commonjsHelpers") ||
            id.includes("node_modules/clsx") ||
            id.includes("node_modules/tailwind-merge") ||
            id.includes("node_modules/class-variance-authority")
          ) {
            return "core";
          }
          if (
            id.includes("node_modules/react/") ||
            id.includes("node_modules/react-dom/") ||
            id.includes("node_modules/react-router")
          ) {
            return "react-vendor";
          }
          if (id.includes("@tanstack/react-query")) {
            return "query-vendor";
          }
          if (id.includes("@radix-ui") || id.includes("lucide-react")) {
            return "ui-vendor";
          }
          if (id.includes("recharts") || id.includes("d3-")) {
            return "chart-vendor";
          }
          if (id.includes("leaflet") || id.includes("react-leaflet")) {
            return "map-vendor";
          }
          if (id.includes("framer-motion") || id.includes("/motion/")) {
            return "motion-vendor";
          }
          if (
            id.includes("node_modules/jspdf") ||
            id.includes("html2canvas") ||
            id.includes("dompurify")
          ) {
            return "pdf-vendor";
          }
          if (id.includes("node_modules/docx") || id.includes("file-saver")) {
            return "report-vendor";
          }
          if (id.includes("node_modules/zod") || id.includes("@hookform")) {
            return "form-vendor";
          }
        },
      },
    },
  },
});
