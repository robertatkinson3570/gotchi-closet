/**
 * Prerender (SEO/GEO): after `vite build`, render selected routes in headless
 * Chromium and write the fully rendered HTML into dist/ as static files
 * (dist/<route>/index.html). Vercel serves filesystem matches before SPA
 * rewrites, so crawlers that don't execute JS (GPTBot, ClaudeBot,
 * PerplexityBot) get real content while users still hydrate into the SPA.
 *
 * Wired into the Vercel build via `pnpm build:vercel` (vercel.json). Failures
 * here are NON-FATAL by design: a flaky prerender must never block a deploy,
 * so this script installs its own Chromium, guards every route, keeps the
 * original SPA index.html whenever a page fails to hydrate, and exits 0 on
 * any error (loudly). Run locally: `npx vite build && npx tsx scripts/prerender.ts`
 * (VITE_WALLETCONNECT_PROJECT_ID must have been set at build time or pages
 * boot to an error state and are skipped by the hydration guard below).
 *
 * Scale to every /sets/ and /wearable/ URL from public/sitemap.xml via a
 * nightly job once render time and output size are acceptable.
 */
import { execSync } from "node:child_process";
import { createServer } from "node:http";
import fs from "node:fs";
import path from "node:path";

const DIST = path.join(process.cwd(), "dist");
const PORT = 4173;

// Indexable hub pages (routes verified to exist in src/app/App.tsx). The
// per-wearable/set long tail stays on the nightly-job roadmap.
const ROUTES = [
  "/",
  "/wearables",
  "/sets",
  "/traits",
  "/rarity-score",
  "/dress",
  "/wardrobe-lab",
  "/baazaar",
  "/lending",
  "/forge",
  "/dao",
  "/games",
  "/pulse",
  "/stats",
  "/activity",
  "/get-tokens",
];

const MIME: Record<string, string> = {
  ".html": "text/html",
  ".js": "text/javascript",
  ".css": "text/css",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
  ".json": "application/json",
  ".txt": "text/plain",
  ".xml": "application/xml",
  ".woff2": "font/woff2",
};

function serveDist() {
  return createServer((req, res) => {
    const urlPath = decodeURIComponent((req.url || "/").split("?")[0]);
    let filePath = path.join(DIST, urlPath);
    if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
      filePath = path.join(DIST, "index.html"); // SPA fallback, mirrors Vercel rewrite
    }
    const ext = path.extname(filePath);
    res.writeHead(200, { "Content-Type": MIME[ext] || "application/octet-stream" });
    fs.createReadStream(filePath).pipe(res);
  }).listen(PORT);
}

async function main() {
  if (!fs.existsSync(path.join(DIST, "index.html"))) {
    console.error("prerender: dist/index.html not found. Run `vite build` first. Skipping.");
    return;
  }

  // CI containers (Vercel) don't ship a Playwright browser; install on demand.
  // Cached between builds on Vercel, so this is a no-op most of the time.
  try {
    execSync("npx playwright install chromium", { stdio: "inherit", timeout: 300_000 });
  } catch {
    console.error("prerender: could not install Chromium. Skipping prerender (non-fatal).");
    return;
  }
  const { chromium } = await import("playwright");

  const server = serveDist();
  const browser = await chromium.launch();
  const page = await browser.newPage();
  let ok = 0;

  for (const route of ROUTES) {
    try {
      const url = `http://localhost:${PORT}${route}`;
      await page.goto(url, { waitUntil: "networkidle", timeout: 60_000 });
      // Give lazy route chunks + helmet a beat to settle.
      await page.waitForTimeout(1_000);
      // Hydration guard: only snapshot pages that actually rendered app
      // content. A boot error (missing env, crashed chunk) leaves #root
      // empty; writing that would REPLACE working HTML with a blank page —
      // fatally so for "/" (it is also the SPA fallback for every route).
      // Content length is the gate; some hub pages legitimately have no <h1>.
      const h1 = await page.locator("h1").first().textContent({ timeout: 5_000 }).catch(() => null);
      const rootLen = await page.evaluate(() => document.getElementById("root")?.innerText.trim().length ?? 0);
      if (rootLen < 500) {
        console.error(`prerender: ${route} did not hydrate (root chars: ${rootLen}); keeping SPA HTML.`);
        continue;
      }
      const html = await page.content();
      const outDir = route === "/" ? DIST : path.join(DIST, route.slice(1));
      fs.mkdirSync(outDir, { recursive: true });
      const outFile = path.join(outDir, "index.html");
      fs.writeFileSync(outFile, "<!doctype html>\n" + html.replace(/^<!doctype html>/i, "").trimStart());
      ok++;
      console.log(`prerendered ${route} -> ${path.relative(process.cwd(), outFile)} (h1: ${h1?.trim() || "(no h1)"})`);
    } catch (e) {
      console.error(`prerender: ${route} failed (${(e as Error).message.slice(0, 120)}); keeping SPA HTML.`);
    }
  }

  await browser.close();
  server.close();
  console.log(`prerender: ${ok}/${ROUTES.length} routes captured.`);
}

main().catch((e) => {
  // Never fail the deploy over prerendering; crawler coverage degrades to the
  // static shell, which is still real content.
  console.error("prerender: fatal error, skipping (non-fatal for the build):", e);
});
