# Technical fixes: prioritized punch list

Audited 2026-07-09 against the live site (raw curl + SiteCrawlIQ's geo-audit and structured-data engines run standalone; full results in `sitecrawliq-audit.json`). Stack detected: Vite 5 + React 18 SPA, react-router v6, react-helmet-async for per-route head tags, TypeScript, Express server (`server/`, VPS) for APIs, frontend on Vercel with an SPA rewrite (`vercel.json`). 25 of 34 pages already used the `Seo` component before this pass; the problem was never "no SEO code", it was that none of it exists in the raw HTML crawlers fetch.

Legend: [DONE] implemented in this pass (working tree, not committed). [TODO] needs a decision or deploy-side action.

## P0: Crawlers saw an empty page (confirmed)

**Finding (verified 2026-07-09):** `curl https://www.gotchicloset.com/` returned only `<title>GotchiCloset</title>`, zero meta description, zero h1, zero body text, zero JSON-LD, for every route. SiteCrawlIQ scoring on 11 raw URLs: citability 0/100, schema markup 0/100 (all 9 expected types missing), question headings 0, answer-first pages 0/11, average raw word count ~10. GPTBot, ClaudeBot, PerplexityBot, and Bing's crawler do not reliably execute JS; they saw nothing to index or cite.

1. **[DONE] Static SEO head in `index.html`.** Default title, meta description, OG/Twitter tags, and a JSON-LD `@graph` (WebSite + Organization + WebApplication with offers) now ship in the raw HTML. All static tags carry `data-static-seo` and are removed at app boot in `src/main.tsx`, so react-helmet-async per-route tags never duplicate them in the rendered DOM (no double-description for Googlebot, which does render JS).
2. **[DONE] Static crawler-visible landing content in `index.html`.** A semantic shell inside `#root` (h1, entity-defining first paragraph "GotchiCloset is a free web app for Aavegotchi...", linked feature list, three question-format H2s with 40-60 word direct answers, stat-dense copy, internal links). React's `createRoot().render()` replaces it on mount, so JS users see the app unchanged. Non-JS crawlers now get a real page.
3. **[DONE, opt-in] Prerender proof of concept: `scripts/prerender.ts`.** After `vite build`, renders routes in headless Chromium (Playwright is already a devDependency) and writes `dist/<route>/index.html`. Verified locally: `/`, `/wearables`, `/sets`, `/traits`, `/rarity-score` each captured their real hydrated H1, per-route meta description, and canonical. Vercel serves filesystem matches before the SPA rewrite, so prerendered files win for crawlers and still hydrate for users.

   **Note:** a production build without `VITE_WALLETCONNECT_PROJECT_ID` throws at boot (`src/lib/env.ts` marks it required), leaving only the static shell. Vercel has the var, local prerender runs need it set (a dummy value works for rendering).

   **Prerender rollout options, with tradeoffs:**
   | Option | Effort | Coverage | Tradeoffs |
   |---|---|---|---|
   | Static shell only (current) | done | landing page raw HTML | Content flash pre-hydration; other routes still empty in raw HTML (but have prerender-POC coverage when adopted) |
   | `prerender.ts` in Vercel build for ~20 hub pages | low | all indexable hubs | +1-2 min build, needs Playwright on Vercel (`npx playwright install chromium` in build step) |
   | `prerender.ts` over the full sitemap (476 URLs) | medium | every wearable/set/trait page | ~10-20 min builds; better: run nightly via GitHub Action committing to a `prerender` artifact, or render on a schedule and upload |
   | Full SSR (migrate to Remix/Next or vite-plugin-ssr) | high | everything, always fresh | Big migration for an app this wallet-interactive; not recommended now |

   **Recommendation:** adopt option 2 now (hub pages), option 3 via nightly job once stable. The per-wearable/set pages are the programmatic SEO payload and deserve raw-HTML coverage.

## P1: Wrong-domain robots.txt and sitemap (confirmed, high impact)

**Finding:** `robots.txt` declared `Sitemap: https://gotchicloset.xyz/sitemap.xml` and all 465 sitemap URLs pointed at `gotchicloset.xyz`, which does not respond at all (dead domain). Google was being told the site's URLs live on a dead host. This alone can suppress discovery of the 452 programmatic set/wearable/trait pages.

4. **[DONE] Regenerated both files for `https://www.gotchicloset.com`** via `scripts/generateSitemap.ts` (the script already defaulted to .com; the committed files had been generated with a stale `VITE_SITE_URL`). Now 476 URLs.
5. **[DONE] Added missing public routes to the sitemap**: `/dress`, `/wardrobe-lab`, `/baazaar`, `/lending`, `/lending/analytics`, `/forge`, `/dao`, `/staking`, `/games`, `/leaderboard`, `/pulse`, `/stats`, `/activity`, `/get-tokens`.
6. **[DONE] robots.txt now explicitly allows AI crawlers** (GPTBot, OAI-SearchBot, ChatGPT-User, ClaudeBot, Claude-SearchBot, Claude-User, PerplexityBot, Perplexity-User, Google-Extended, CCBot) and links llms.txt. The generator template was updated too, so regeneration cannot clobber this.
7. **[TODO] Redirect gotchicloset.xyz to gotchicloset.com (301)** if the .xyz registration is still held; do it in the registrar/Vercel domain settings. Also submit the corrected sitemap in Google Search Console and Bing Webmaster Tools (neither could be verified from this environment).

## P2: GEO surface

8. **[DONE] `public/llms.txt` created**: entity definition, key facts (Base migration date, BRS math, tier bonuses), tool URLs, example deep links, authoritative sources, and explicit "Polygon-era content is archival" guidance for AI assistants. Before this fix `/llms.txt` returned the HTML shell with HTTP 200 (SiteCrawlIQ's llms.txt check false-positived on it; noted in assumptions.md). On Vercel the static file will now be served.
9. **[DONE] JSON-LD upgrades:**
   - `index.html`: WebSite + Organization + WebApplication `@graph` (static, crawler-visible).
   - `HomePage.tsx`: SoftwareApplication completed (url, description, offers price 0, operatingSystem, `about` linking the Aavegotchi entity). Previously missing `offers`/full fields, which SiteCrawlIQ flags.
   - `SetPage.tsx` / `WearablePage.tsx`: replaced incomplete `Article` markup (missing required author/datePublished, a validation error) with `WebPage` + `BreadcrumbList` (Home > Sets > {set}, Home > Wearables > {item}).
   - FAQPage and HowTo schema: deliberately deferred to the visible FAQ/guide pages specced in `content-plan.md` (schema must match rendered content).

## P3: Per-route meta coverage

10. **[DONE] Added `Seo` to the 4 indexable pages that lacked it**: `/dress` (the core product!), `/baazaar` (ExplorerPage), `/wardrobe-lab` (the optimizer, a prime "best wearables" asset), `/games`. Remaining pages without Seo are intentionally excluded: `/admin`, `/soul/verify/:id` (utility), `/steward`, and the dynamic arena pages.
11. **[TODO] Dynamic Seo for `/g/:tokenId` (PublicGotchiPage) and `/gotchi/:tokenId`**: title pattern `"{name} (#{id}) – BRS {brs} Aavegotchi | GotchiCloset"`. These are shareable pages; OG tags per gotchi would make every share a branded card. Needs the gotchi fetch to resolve before Helmet renders, easy with existing hooks. Skipped here to keep this pass reviewable.
12. **[TODO] OG image**: `og:image` currently uses `/logo.png` (square). Produce a 1200x630 branded card (and per-gotchi dynamic OG images later via an edge function; Vercel OG is a natural fit).

## P4: Performance notes (code inspection, not CWV-measured)

13. Route-level code splitting is already in place (`lazyWithRetry` per page) and the landing chunk is modest. Two flags from the build output: `SnapshotVotePanel` chunk is 1.2 MB (gzip 397 kB); it only loads on /dao, but worth a dynamic import inside the panel. Google Fonts are render-blocking in `<head>`; consider `font-display: swap` is already implied by `display=swap`, fine as is.
14. **[TODO] Measure CWV properly** post-deploy (PageSpeed Insights / CrUX; SiteCrawlIQ's CWV module once a crawl runs on the platform). The SPA's LCP on mobile is the number to watch: the landing hero image (`/logo.png`, rendered at 256px) could ship a resized version.

## Verification performed

- `npx tsc --noEmit`: clean except one pre-existing unused-import error in `src/components/explorer/AuctionGrid.tsx` (main session's in-flight file, untouched by this work).
- `npx vite build`: succeeds with the new index.html; static shell present in `dist/index.html`.
- `npx tsx scripts/prerender.ts`: all 5 POC routes render their real app content (route-specific H1 + meta + canonical captured).
- `npx tsx scripts/generateSitemap.ts`: 476 URLs, all on gotchicloset.com; robots.txt regenerates with the AI-crawler template.
