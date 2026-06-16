/// <reference types="vitest" />
import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "VITE_");
  const apiTarget = env.VITE_API_PROXY_URL || "http://localhost:8787";
  return {
    plugins: [react()],
    resolve: {
      alias: {
        "@": path.resolve(__dirname, "./src"),
      },
    },
    server: {
      host: "0.0.0.0",
      port: 5000,
      allowedHosts: true,
      proxy: {
        "/api": apiTarget,
      },
    },
    build: {
      chunkSizeWarningLimit: 1500,
    },
    test: {
      // Unit tests only. Playwright E2E (*.spec.ts) are run by Playwright, not
      // vitest; the heavy wallet regression has its own `mommy:regression`
      // script and is excluded from the fast unit run.
      include: ["tests/**/*.test.ts", "src/**/*.test.{ts,tsx}"],
      exclude: ["**/node_modules/**", "**/dist/**", "**/*.spec.ts", "tests/e2e/**", "tests/mommy-regression.test.ts"],
    },
  };
});

