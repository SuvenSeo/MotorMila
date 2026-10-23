import js from "@eslint/js";
import globals from "globals";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import jsxA11y from "eslint-plugin-jsx-a11y";
import tseslint from "typescript-eslint";

// Design-system guard rails (web/premium-p0), warning level: new code should
// reach for tokens (styles/tokens.css, src/styles/type-scale.ts, lib/motion.ts).
const PALETTE = "(?:slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)-[0-9]{2,3}";
const TOKEN_RULES = [
  { re: String.raw`text-\[[0-9.]+(px|rem)\]`, msg: "Arbitrary font size: use the type scale (text-caption…text-hero)." },
  { re: String.raw`(^|[\s:])(bg|text|border|ring|fill|stroke|from|via|to|divide|outline)-${PALETTE}`, msg: "Raw palette colour: use a semantic token (foreground, label-2, surface-1, primary, deal-*)." },
  { re: String.raw`(^|[\s:])(bg|border|ring|divide)-white.[0-9\[]`, msg: "white/N ignores light mode: use foreground/N or border." },
  { re: String.raw`(^|\s)transition-all($|\s)`, msg: "transition-all animates layout: use transition-ui (colour/opacity/transform)." },
  { re: String.raw`#[0-9a-fA-F]{6}\b`, msg: "Hard-coded hex colour: use a CSS token (hsl(var(--…)))." },
];
const tokenSyntax = TOKEN_RULES.flatMap(({ re, msg }) => [
  { selector: `Literal[value=/${re}/]`, message: msg },
  { selector: `TemplateElement[value.raw=/${re}/]`, message: msg },
]);

export default tseslint.config(
  { ignores: ["dist", "node_modules", "backend", ".qoder"] },
  {
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    files: ["**/*.{ts,tsx}"],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
    plugins: {
      "react-hooks": reactHooks,
      "react-refresh": reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      "react-refresh/only-export-components": ["warn", { allowConstantExport: true }],
      "@typescript-eslint/no-unused-vars": "warn",
      "@typescript-eslint/no-explicit-any": "warn",
    },
  },
  // Accessibility: jsx-a11y recommended rules, downgraded to warnings so the
  // existing backlog doesn't block CI. Fix warnings as files are touched.
  {
    files: ["src/**/*.{jsx,tsx}"],
    plugins: { "jsx-a11y": jsxA11y },
    languageOptions: { parserOptions: { ecmaFeatures: { jsx: true } } },
    rules: Object.fromEntries(
      Object.entries(jsxA11y.flatConfigs.recommended.rules).map(([rule, setting]) => {
        const level = Array.isArray(setting) ? setting[0] : setting;
        if (level === "off" || level === 0) return [rule, "off"];
        return [rule, Array.isArray(setting) ? ["warn", ...setting.slice(1)] : "warn"];
      }),
    ),
  },
  {
    files: ["src/**/*.{ts,tsx}"],
    ignores: ["src/test/**", "src/**/*.test.{ts,tsx}", "src/components/charts/**", "src/lib/proReports.ts", "src/lib/laneExport.ts"],
    rules: { "no-restricted-syntax": ["warn", ...tokenSyntax] },
  },
  {
    files: ["src/components/ui/**/*.{ts,tsx}", "src/lib/authContext.tsx", "src/lib/appPreferences.tsx"],
    rules: {
      "react-refresh/only-export-components": "off",
    },
  },
);
