# SEO / GEO / AEO overhaul: summary

Date: 2026-07-09. Scope: full audit + strategy + implementation for https://www.gotchicloset.com. All code changes are in the working tree only (nothing committed, pushed, or deployed, per instructions).

## What was verified (Phase 0/1)

- **Confirmed the critical issue**: raw HTML on every route contained only `<title>GotchiCloset</title>`: no description, no h1, no content, no structured data. Confirmed by direct curl and by running SiteCrawlIQ's own audit engines (geo-audit + structured-data modules, run standalone against 11 live URLs since the full platform needs a Postgres stack; see assumptions.md). Baseline scores: citability 0/100, schema 0/100, question headings 0, answer-first 0/11. Raw results: `sitecrawliq-audit.json`.
- **Found a worse problem than the brief expected**: robots.txt and all 465 sitemap URLs pointed at `gotchicloset.xyz`, a dead domain. Search engines were being directed away from every page, including the 452 programmatic set/wearable/trait pages.
- Also found: `/llms.txt` returned the HTML shell with HTTP 200 (false-positive "exists"), 4 indexable pages had no Seo component at all (including `/dress`, the core product), and set/wearable pages emitted invalid Article schema (missing required fields).

## What was fixed (implemented in this pass)

1. **`index.html`**: full static head (title, description, OG/Twitter, JSON-LD `@graph`: WebSite + Organization + WebApplication) plus a real crawler-visible content shell inside `#root` (h1, entity definition, linked feature list, 3 question-format H2s with 40-60 word answers). Static tags are marked `data-static-seo` and removed at app boot (`src/main.tsx`) so Helmet's per-route tags never duplicate.
2. **`public/robots.txt` + `public/sitemap.xml`**: regenerated on the correct domain; 476 URLs (added 14 missing public routes); explicit Allow blocks for 10 AI crawlers; generator template (`scripts/generateSitemap.ts`) updated so regeneration keeps all of it.
3. **`public/llms.txt`**: created (entity definition, hard facts, tool links, deep-link examples, guidance that Polygon-era content is archival).
4. **Per-route meta**: added `Seo` to `/dress`, `/baazaar`, `/wardrobe-lab`, `/games`.
5. **JSON-LD**: HomePage SoftwareApplication completed (offers, description, about-entity); SetPage/WearablePage invalid Article replaced with WebPage + BreadcrumbList across all 452 programmatic pages.
6. **Prerender POC**: `scripts/prerender.ts` (Playwright over built dist, writes `dist/<route>/index.html`). Tested locally: 5 hub routes captured real hydrated H1s, per-route descriptions, and canonicals. Opt-in, not wired into the default build (tradeoffs in technical-fixes.md).
7. **Verification**: `tsc --noEmit` clean (one pre-existing error in the main session's in-flight file, untouched), `vite build` green, generator and prerender both executed successfully.

## What was created (strategy deliverables in seo-output/)

- `technical-fixes.md`: prioritized punch list, exact fixes, prerender rollout options with tradeoffs.
- `keyword-map.md`: 16 keyword clusters mapped to URLs with intent, format, SEO/GEO/AEO angle, and stale-incumbent flags (the July 2025 Base migration invalidated nearly every ranking guide: that vacuum is the strategy).
- `content-plan.md`: 18 briefs: 6 enhancements to existing tool pages (including the 452-page programmatic set/wearable layer with live floor prices) + 12 new guides, each with H1, outline, 40-60 word FAQ answers, internal links, and JSON-LD type.
- `geo-aeo-checklist.md`: llms.txt maintenance, quotable-content rules, entity consistency, directory-listing plan (wiki, aavegotchi.com/tools, awesome-aavegotchi, DappRadar, Base ecosystem), FAQPage/HowTo schema rules, snippet targets, measurement plan.
- `assumptions.md`: environment constraints and judgment calls (including why SiteCrawlIQ ran standalone rather than as a platform crawl).
- `sitecrawliq-audit.json` + `sitecrawliq-runner.ts`: baseline audit data and the reproducible runner.

## Top 5 highest-impact remaining actions

1. **Deploy this working tree, then submit the corrected sitemap in Google Search Console and Bing Webmaster Tools.** Until deployed, crawlers still see the empty shell and the dead .xyz sitemap. If gotchicloset.xyz is still registered, 301 it to .com.
2. **Adopt the prerenderer for hub pages in the Vercel build** (then extend to all 476 sitemap URLs via a nightly job). The 452 programmatic set/wearable/trait pages are the biggest asset nobody else has; they only pay off when crawlers can read them.
3. **Get listed where LLMs look**: aavegotchi.com/tools, wiki.aavegotchi.com, the awesome-aavegotchi GitHub list, DappRadar, and the Base ecosystem page. Assistants currently name Gotchidex for "try on wearables" queries because it appears in those sources; GotchiCloset appears in none of them.
4. **Ship the top 3 guides** (`base-migration`, `get-started`, `rarity-farming` per content-plan.md): they target the post-migration confusion cluster where every incumbent answer is Polygon-era wrong.
5. **Add live floor prices to the per-wearable/per-set pages** with dated "as of" phrasing, and FAQPage schema on pages with visible FAQs. That turns 452 stat pages into the citable source of record for every "{wearable} price / {set} bonus" query, for both Google and AI engines.
