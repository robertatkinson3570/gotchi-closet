# Pulse — State of the Aavegotchiverse (v1: Economy)

**Date:** 2026-07-02
**Status:** Approved design, pre-implementation
**Route:** `/pulse`

## Purpose

A public "State of the Aavegotchiverse" analytics page. Primary job: honest, longitudinal ecosystem-health evidence for the community and DAO debates — data-backed reality instead of vibes. Inspiration for density and tone (not copied): DefiLlama's /chains — a data terminal, not a marketing page.

Two layers per metric section:

1. **Reality** — computed daily time series, trend deltas, and an automatic health verdict from published threshold rules.
2. **Lever** — a short hand-written note on what would move the metric. Visibly badged **"opinion — aspirational"** so editorial is never mistaken for data.

V1 covers the **Economy** family only: GHST and marketplace sales. Engagement (petting/kinship), Lending/REALM, and DAO health are later phases.

## Architecture (Approach B — server-aggregated snapshots)

The browser never computes history. A server module backfills daily aggregates once, a nightly cron keeps them current, and one endpoint serves a precomputed payload.

```
subgraphs (Goldsky, failover) ─┐
DefiLlama price API ───────────┼─> backfill (once) ──> SQLite pulse.db ──> in-memory cache ──> GET /api/pulse ──> PulsePage
Base RPC + Blockscout ─────────┘        ^                                        ^
                                        └── nightly cron (append + snapshots) ───┘
```

Reuses proven patterns in this repo:
- Cron: node-cron like `server/lending/cron.ts` / `server/steward/cron.ts`.
- Cache + 202-while-building: like `server/dao/quorum.ts`.
- SQLite via better-sqlite3: like lending/soul/steward stores.
- Subgraph failover: `server/aavegotchi/subgraphFetch.ts`.

## Metrics (v1)

All series are daily (UTC day buckets). Page windows: 30D / 90D / 1Y / All. Each metric shows WoW and MoM deltas.

### GHST
| Metric | Source | History |
|---|---|---|
| Price (USD) | DefiLlama coins API (`coins.llama.fi` historical) | Backfilled |
| Market cap (USD) | DefiLlama mcap history if available; else price × current supply, labeled approximate | Backfilled |
| Circulating supply on Base | RPC `totalSupply` (pattern already in `server/dao/quorum.ts`) | Forward-accruing daily snapshot |
| Holder count | Blockscout (`base.blockscout.com`), best-effort | Forward-accruing daily snapshot |

### Sales
| Metric | Source | History |
|---|---|---|
| Daily settled volume (GHST + USD) | Core subgraph `erc721Purchases` + `erc1155Purchases` + GBM subgraph settled auctions (timestamped) | Backfilled |
| Daily sale count | same | Backfilled |
| Unique buyers / sellers per day | same (distinct addresses) | Backfilled |
| Average sale price | volume ÷ count | Backfilled |
| Category split over time | purchase `category` (gotchis / wearables / parcels / other) | Backfilled |
| Gotchi floor price | cheapest active `erc721Listings` category 3 (state, not event) | Forward-accruing daily snapshot |

USD conversion for historical days uses that day's stored GHST price, not the current price.

## Server design

New module `server/pulse/`:

- **`store.ts`** — SQLite `pulse.db`. Single table:
  `daily_metrics(day TEXT, metric TEXT, value REAL, PRIMARY KEY(day, metric))`.
  `day` is UTC `YYYY-MM-DD`. Idempotent upserts; re-running backfill or cron for a day is safe.
- **`backfill.ts`** — one-time walk: paginated subgraph queries (1000-row pages by timestamp cursor) bucketed into UTC days; DefiLlama historical price fetch. Runs on first boot when `pulse.db` is empty (or via a manual script). Progress logged.
- **`refresh.ts`** — nightly cron (`0 3 * * *` UTC): recompute yesterday's event-derived rows (late-settling data safe via upsert) and take today's snapshots (supply, holders, floor). Rebuilds the in-memory payload afterward.
- **`verdicts.ts`** — config array, one entry per verdict:
  `{ key, label, rule: (series) => 'green'|'yellow'|'red', ruleText, lever }`.
  - `ruleText` is the human-readable rule shown in Methodology (e.g. "red if 30d volume < 80% of prior 30d").
  - `lever` is the hand-written aspirational note.
  - Initial verdicts (thresholds tunable at implementation): 30d sales volume vs prior 30d; 30d unique buyers vs prior 30d; GHST price 90d trend; holder count 30d trend (only once ≥30 days of snapshots exist — before that, verdict shows "accruing").
- **`routes/pulse.ts`** — `GET /api/pulse` → `{ series, latest, deltas, verdicts, updatedAt }` from in-memory cache. Returns **202 + status** while the initial backfill is running (quorum pattern). Mounted in `server/app.ts`.

## Frontend design

- **`src/pages/PulsePage.tsx`** — lazy route `/pulse` in `src/app/router.tsx`; nav entry in `RootLayout.tsx`.
- Layout, top to bottom:
  1. **Hero tiles** — GHST price, market cap, 30d volume, 30d unique buyers; each with sparkline, delta, and verdict chip (green/yellow/red).
  2. **GHST section** — price/mcap chart (recharts, following `LendingAnalyticsPage.tsx` patterns), supply + holders once accrued; Reality → Lever card.
  3. **Sales section** — daily volume area chart with category split, sale count + unique buyers/sellers lines, average price, floor (accruing); Reality → Lever card.
  4. **Methodology** — collapsible: every data source, every verdict rule verbatim from `ruleText`, snapshot start dates, and the disclaimer that levers are opinion.
- Window toggle (30D/90D/1Y/All) shared across charts.
- Single react-query fetch of `/api/pulse`; 202 renders a "building history…" state that polls.
- Forward-accruing metrics render with an explicit "tracking since {date}" label instead of a misleading short chart.
- Chart/visual design follows the dataviz skill at implementation time.

## Error handling

- Initial backfill in progress → API 202, page shows building state.
- DefiLlama/Blockscout/RPC failure during cron → keep last stored values, log, retry next night; payload carries `updatedAt` and the page shows "data as of {date}" when stale (>48h).
- Subgraph reads use the existing primary→backup failover.
- A missing day in a series renders as a gap, never interpolated.

## Testing

Vitest on pure logic (no network):
- Day-bucketing of timestamped purchases (UTC boundaries, empty days).
- Delta math (WoW/MoM, division-by-zero on empty priors).
- Verdict rule evaluation against fixture series, including the "accruing" state.
- `/api/pulse` payload shape.

## Out of scope (recorded, not forgotten)

- **"Today so far" live tiles** (client-side, Approach C) — agreed fast-follow after v1 ships.
- Engagement family (daily active petters, kinship distribution, summons/sacrifices) — phase 2.
- Lending + REALM/alchemica family — phase 3 (alchemica data availability on Base needs a feasibility check first).
- DAO health family (turnout, quorum trend, treasury) — phase 4.
- AI-generated narrative reports.
- Social share-card image generation.
- Backfilling floor price or holder counts (state-based; accrue forward only).
