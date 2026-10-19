import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";

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
  plugins: [react()],
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
