import js from "@eslint/js";
import globals from "globals";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import jsxA11y from "eslint-plugin-jsx-a11y";
import tseslint from "typescript-eslint";

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
    files: ["src/components/ui/**/*.{ts,tsx}", "src/lib/authContext.tsx", "src/lib/appPreferences.tsx"],
    rules: {
      "react-refresh/only-export-components": "off",
    },
  },
);
