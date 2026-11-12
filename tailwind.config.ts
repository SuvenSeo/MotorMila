import type { Config } from "tailwindcss";
import tailwindcssAnimate from "tailwindcss-animate";
import { TYPE_SCALE, LETTER_SPACING } from "./src/styles/type-scale";

export default {
  darkMode: ["class", ".theme-dark"],
  content: ["./pages/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}", "./app/**/*.{ts,tsx}", "./src/**/*.{ts,tsx}"],
  // Tremor v3 dynamic chart colors (chosen at runtime) — safelist the palette.
  safelist: [
    {
      pattern:
        /^(bg-(?:slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)-(?:50|100|200|300|400|500|600|700|800|900|950))$/,
      variants: ["hover", "ui-selected"],
    },
    {
      pattern:
        /^(text-(?:slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)-(?:50|100|200|300|400|500|600|700|800|900|950))$/,
      variants: ["hover", "ui-selected"],
    },
    {
      pattern:
        /^(border-(?:slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)-(?:50|100|200|300|400|500|600|700|800|900|950))$/,
      variants: ["hover", "ui-selected"],
    },
    {
      pattern:
        /^(ring-(?:slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)-(?:50|100|200|300|400|500|600|700|800|900|950))$/,
    },
    {
      pattern:
        /^(stroke-(?:slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)-(?:50|100|200|300|400|500|600|700|800|900|950))$/,
    },
    {
      pattern:
        /^(fill-(?:slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)-(?:50|100|200|300|400|500|600|700|800|900|950))$/,
    },
  ],
  prefix: "",
  theme: {
    // Type scale (web/premium-p0): 9 steps, nothing below 12px. Not `extend`:
    // Tailwind's default text-xs…text-9xl are intentionally gone. Values live
    // in src/styles/type-scale.ts so tailwind-merge and docs share one list.
    fontSize: TYPE_SCALE,
    letterSpacing: LETTER_SPACING,
    // Radius: 4 steps (styles/tokens.css). Legacy names collapse onto them.
    borderRadius: {
      none: "0",
      control: "var(--radius-control)",
      card: "var(--radius-card)",
      sheet: "var(--radius-sheet)",
      pill: "9999px",
      full: "9999px",
      DEFAULT: "var(--radius-control)",
      xs: "var(--radius-control)",
      sm: "var(--radius-control)",
      md: "var(--radius-control)",
      lg: "var(--radius-card)",
      xl: "var(--radius-card)",
      "2xl": "var(--radius-card)",
      "3xl": "var(--radius-sheet)",
      "4xl": "var(--radius-sheet)",
      input: "var(--radius-control)",
      "tremor-small": "var(--radius-control)",
      "tremor-default": "var(--radius-control)",
      "tremor-full": "9999px",
    },
    // Elevation: 3 steps. Legacy names collapse onto them.
    boxShadow: {
      none: "none",
      e1: "var(--shadow-e1)",
      e2: "var(--shadow-e2)",
      e3: "var(--shadow-e3)",
      DEFAULT: "var(--shadow-e1)",
      sm: "var(--shadow-e1)",
      md: "var(--shadow-e1)",
      lg: "var(--shadow-e2)",
      xl: "var(--shadow-e2)",
      "2xl": "var(--shadow-e3)",
      inner: "inset 0 1px 2px rgb(0 0 0 / 0.06)",
      console: "var(--shadow-e1)",
      "console-soft": "var(--shadow-e1)",
      soft: "var(--shadow-e1)",
      "soft-lg": "var(--shadow-e2)",
      "soft-xl": "var(--shadow-e3)",
      "gold-glow": "0 0 0 4px hsl(var(--ring) / 0.14)",
      "gold-glow-lg": "0 0 0 6px hsl(var(--ring) / 0.16)",
      "tremor-input": "var(--shadow-e1)",
      "tremor-card": "var(--shadow-e1)",
      "tremor-dropdown": "var(--shadow-e2)",
      "dark-tremor-input": "var(--shadow-e1)",
      "dark-tremor-card": "var(--shadow-e1)",
      "dark-tremor-dropdown": "var(--shadow-e2)",
    },
    // Motion tokens (src/lib/motion.ts). Not `extend`: 3 easings, 4 durations only.
    transitionTimingFunction: {
      DEFAULT: "var(--ease-standard)",
      standard: "var(--ease-standard)",
      decelerate: "var(--ease-decelerate)",
      accelerate: "var(--ease-accelerate)",
      linear: "linear",
    },
    transitionDuration: {
      DEFAULT: "var(--dur-short)",
      0: "0ms",
      micro: "var(--dur-micro)",
      short: "var(--dur-short)",
      medium: "var(--dur-medium)",
      long: "var(--dur-long)",
    },
    container: {
      center: true,
      padding: "2rem",
      screens: {
        "2xl": "1400px",
      },
    },
    extend: {
      // Floating-layer scale (ui/shell). Values live in src/styles/layers.css.
      zIndex: {
        base: "var(--z-base)",
        sticky: "var(--z-sticky)",
        floating: "var(--z-floating)",
        "bottom-nav": "var(--z-bottom-nav)",
        header: "var(--z-header)",
        overlay: "var(--z-overlay)",
        modal: "var(--z-modal)",
        toast: "var(--z-toast)",
        skip: "var(--z-skip)",
        devtools: "var(--z-devtools)",
      },
      fontFamily: {
        // Cal Sans only (styles/fonts.css): Display for headlines, Text for everything else.
        sans: ["var(--font-sans)"],
        display: ["var(--font-display)"],
        body: ["var(--font-body)"],
        // `font-mono` is used for prices/figures across the app: keep it a
        // proportional face with tabular-nums (styles/tokens.css), never monospace.
        mono: ["var(--font-numeric-stack)"],
        numeric: ["var(--font-numeric-stack)"],
        code: ['var(--font-mono)', "ui-monospace", "monospace"],
      },
      colors: {
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        "primary-bright": "hsl(var(--primary-bright))",
        "primary-text": "hsl(var(--primary-text))",
        brand: "hsl(var(--brand-blue))",
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
        },
        popover: {
          DEFAULT: "hsl(var(--popover))",
          foreground: "hsl(var(--popover-foreground))",
        },
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },
        surface: {
          DEFAULT: "hsl(var(--surface))",
          foreground: "hsl(var(--surface-foreground))",
          1: "hsl(var(--surface-1))",
          2: "hsl(var(--surface-2))",
          3: "hsl(var(--surface-3))",
        },
        label: {
          1: "hsl(var(--label-1))",
          2: "hsl(var(--label-2))",
          3: "hsl(var(--label-3))",
        },
        separator: "hsl(var(--separator))",
        // Legacy `intelligence.*` names (amber was actually blue) now resolve
        // to semantic tokens; prefer primary / deal-* in new code.
        intelligence: {
          amber: "hsl(var(--primary))",
          gold: "hsl(var(--primary-text))",
          ink: "hsl(var(--foreground))",
          cyan: "hsl(var(--primary-text))",
          green: "hsl(var(--deal-good))",
          red: "hsl(var(--deal-high))",
        },
        // Deal signals — ONE semantic set (styles/tokens.css, TOKENS.md).
        // Badge: border-deal-good/30 bg-deal-good/10 text-deal-good-text
        deal: {
          great: "hsl(var(--deal-great))",
          "great-foreground": "hsl(var(--deal-great-foreground))",
          "great-text": "hsl(var(--deal-great-text))",
          good: "hsl(var(--deal-good))",
          "good-foreground": "hsl(var(--deal-good-foreground))",
          "good-text": "hsl(var(--deal-good-text))",
          fair: "hsl(var(--deal-fair))",
          "fair-foreground": "hsl(var(--deal-fair-foreground))",
          "fair-text": "hsl(var(--deal-fair-text))",
          high: "hsl(var(--deal-high))",
          "high-foreground": "hsl(var(--deal-high-foreground))",
          "high-text": "hsl(var(--deal-high-text))",
          caution: "hsl(var(--deal-caution))",
          "caution-foreground": "hsl(var(--deal-caution-foreground))",
          "caution-text": "hsl(var(--deal-caution-text))",
          // legacy aliases
          green: "hsl(var(--deal-green))",
          "green-foreground": "hsl(var(--deal-green-foreground))",
          amber: "hsl(var(--deal-amber))",
          "amber-foreground": "hsl(var(--deal-amber-foreground))",
          red: "hsl(var(--deal-red))",
          "red-foreground": "hsl(var(--deal-red-foreground))",
        },
        sidebar: {
          DEFAULT: "hsl(var(--sidebar-background))",
          foreground: "hsl(var(--sidebar-foreground))",
          primary: "hsl(var(--sidebar-primary))",
          "primary-foreground": "hsl(var(--sidebar-primary-foreground))",
          accent: "hsl(var(--sidebar-accent))",
          "accent-foreground": "hsl(var(--sidebar-accent-foreground))",
          border: "hsl(var(--sidebar-border))",
          ring: "hsl(var(--sidebar-ring))",
        },
        // Tremor v3 palette (#7 UI review)
        tremor: {
          brand: {
            faint: "#eff6ff",
            muted: "#bfdbfe",
            subtle: "#60a5fa",
            DEFAULT: "#3b82f6",
            emphasis: "#1d4ed8",
            inverted: "#ffffff",
          },
          background: {
            muted: "#f9fafb",
            subtle: "#f3f4f6",
            DEFAULT: "#ffffff",
            emphasis: "#374151",
          },
          border: { DEFAULT: "#e5e7eb" },
          ring: { DEFAULT: "#e5e7eb" },
          content: {
            subtle: "#9ca3af",
            DEFAULT: "#6b7280",
            emphasis: "#374151",
            strong: "#111827",
            inverted: "#ffffff",
          },
        },
        "dark-tremor": {
          brand: {
            faint: "#0B1229",
            muted: "#172554",
            subtle: "#1e40af",
            DEFAULT: "#3b82f6",
            emphasis: "#60a5fa",
            inverted: "#030712",
          },
          background: {
            muted: "#131A2B",
            subtle: "#0f172a",
            DEFAULT: "#111827",
            emphasis: "#d1d5db",
          },
          border: { DEFAULT: "#1f2937" },
          ring: { DEFAULT: "#1f2937" },
          content: {
            subtle: "#4b5563",
            DEFAULT: "#6b7280",
            emphasis: "#e5e7eb",
            strong: "#f9fafb",
            inverted: "#000000",
          },
        },
      },
      // text-primary = brand blue for TEXT (AA on page surfaces in both themes);
      // bg-/border-/ring-primary keep the fill blue (white text on it ≥ 4.5:1).
      textColor: {
        primary: {
          DEFAULT: "hsl(var(--primary-text))",
          foreground: "hsl(var(--primary-foreground))",
        },
      },
      keyframes: {
        "accordion-down": {
          from: { height: "0" },
          to: { height: "var(--radix-accordion-content-height)" },
        },
        "accordion-up": {
          from: { height: "var(--radix-accordion-content-height)" },
          to: { height: "0" },
        },
        "ken-burns": {
          from: { transform: "scale(1) translate3d(0, 0, 0)" },
          to: { transform: "scale(1.08) translate3d(-1.4%, -0.8%, 0)" },
        },
        "motion-rise": {
          from: { opacity: "0", transform: "translateY(16px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
        "motion-fade": {
          from: { opacity: "0" },
          to: { opacity: "1" },
        },
        "scroll-hint": {
          "0%, 100%": { opacity: "0.3", transform: "translateY(0)" },
          "50%": { opacity: "0.8", transform: "translateY(5px)" },
        },
        "fade-up": {
          from: { opacity: "0", transform: "translate3d(0, 12px, 0)" },
          to: { opacity: "1", transform: "translate3d(0, 0, 0)" },
        },
        "infinite-scroll": {
          from: { transform: "translateX(0)" },
          to: { transform: "translateX(-50%)" },
        },
        "fade-in": {
          from: { opacity: "0" },
          to: { opacity: "1" },
        },
        "pulse-soft": {
          "0%, 100%": { opacity: "1" },
          "50%": { opacity: "0.6" },
        },
      },
      animation: {
        "accordion-down": "accordion-down var(--dur-medium) var(--ease-standard)",
        "accordion-up": "accordion-up var(--dur-short) var(--ease-accelerate)",
        "ken-burns": "ken-burns 28s var(--ease-standard) infinite alternate",
        "motion-rise": "motion-rise var(--dur-long) var(--ease-decelerate) both",
        "motion-fade": "motion-fade var(--dur-long) var(--ease-standard) both",
        "fade-up": "fade-up var(--dur-long) var(--ease-decelerate) both",
        "infinite-scroll": "infinite-scroll var(--marquee-duration, 45s) linear infinite",
        "fade-in": "fade-in var(--dur-medium) var(--ease-decelerate) both",
        "scroll-hint": "scroll-hint 2.4s ease-in-out infinite",
        "pulse-soft": "pulse-soft 2s ease-in-out infinite",
      },
      // `transition-ui`: colour, opacity, transform and shadow only — the
      // replacement for transition-all (never animate layout properties).
      transitionProperty: {
        ui: "color, background-color, border-color, text-decoration-color, fill, stroke, opacity, box-shadow, transform",
      },
    },
  },
  plugins: [tailwindcssAnimate],
} satisfies Config;
