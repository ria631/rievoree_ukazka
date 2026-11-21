// ESLint (flat config) for the frontend. The Deno code (worker/, edge
// functions) is checked by `deno test` / `deno check`; SQL by the scripts in
// scripts/. Type errors are tsc's job — this catches what types can't.
import js from "@eslint/js"
import globals from "globals"
import reactHooks from "eslint-plugin-react-hooks"
import tseslint from "typescript-eslint"

export default tseslint.config(
  { ignores: ["dist", "node_modules", "worker", "supabase", "design", "scripts"] },
  {
    files: ["**/*.{ts,tsx}"],
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    languageOptions: { ecmaVersion: 2022, globals: globals.browser },
    plugins: { "react-hooks": reactHooks },
    rules: {
      "react-hooks/rules-of-hooks": "error",
      "react-hooks/exhaustive-deps": "warn",
      // tsc (noUnusedLocals/Parameters) already reports these.
      "@typescript-eslint/no-unused-vars": "off",
    },
  },
)
