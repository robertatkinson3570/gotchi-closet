/**
 * Baseline ESLint config. The repo had a `lint` script but no config file, so
 * linting never ran. This is intentionally lean: it runs cleanly and catches
 * the highest-value bug class (React Hooks rules) without flooding a codebase
 * that was never linted. Rules can be tightened incrementally.
 */
module.exports = {
  root: true,
  env: { browser: true, es2022: true, node: true },
  parser: "@typescript-eslint/parser",
  parserOptions: { ecmaVersion: "latest", sourceType: "module", ecmaFeatures: { jsx: true } },
  plugins: ["@typescript-eslint", "react-hooks"],
  rules: {
    "react-hooks/rules-of-hooks": "error",
    "no-debugger": "error",
    "no-cond-assign": ["error", "except-parens"],
  },
  ignorePatterns: [
    "dist",
    "build",
    "node_modules",
    "coverage",
    "*.config.ts",
    "*.config.js",
    "*.cjs",
    "attached_assets",
    ".playwright-mcp",
    "public",
  ],
};
