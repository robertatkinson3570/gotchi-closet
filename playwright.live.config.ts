import { defineConfig } from "@playwright/test";
import base from "./playwright.config";

// Live suite config. Reuses the base settings (webServer, baseURL, browser) but
// runs ONLY the real-data specs under tests/e2e/live — which the base config
// excludes via testIgnore. Opt-in via `pnpm test:e2e:live`; these assert against
// live subgraph/RPC/backend data and visual rendering, so they are intentionally
// kept out of the default deterministic run.
export default defineConfig({
  ...base,
  testIgnore: undefined,
  testMatch: /live[\\/].*\.spec\.ts$/,
});
