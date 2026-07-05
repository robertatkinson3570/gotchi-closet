# Site Analytics + Hidden Admin Grid — Design

**Date:** 2026-07-05
**Status:** Approved-pending-review

## Goal

Know who is on gotchicloset.com and what they did. Surface it on a **hidden admin
page** (no nav link) that only functions for the site owner's two wallet
addresses, presented as a **sortable/filterable data grid** the owner can slice
and dice.

Admin addresses (default, overridable via `SITE_ADMINS` env):

- `0xe0d4f8f6F04A42aeD5a7EA4f68Bc612E6A54A3c2`
- `0xc4Cb6cB969e8b4e309Ab98E4Da51b77887aFaD96`

## Decisions (from brainstorm)

| Question | Decision |
| --- | --- |
| What to capture | Page views + wallet-connect events (no per-action tracking in v1) |
| Anonymous visitors | Track everyone via an anon `visitorId`; link rows to a wallet on connect |
| Admin view | One client-side sortable/filterable grid, with a group-by-visitor toggle |
| Admin gate | Wallet **signature** verified server-side (mirrors Game Center admin) |
| Route | `/admin`, absent from all nav; real protection is the server signature check |
| Geo-location | Out of scope for v1 (IP only); fast-follow if wanted |

## How a visitor is identified

Each browser stores a random `visitorId` (uuid) in `localStorage`, persisting
across visits. A beacon fires on every route change and on wallet-connect. The
server stamps the **real client IP** (`req.ip` — already correct behind nginx via
the existing `app.set("trust proxy", 1)`), timestamp, and User-Agent.

When a wallet connects, the beacon includes the address, so that visitor's rows
carry it and prior anonymous rows in the same session are attributable in the UI.
The wallet is self-reported and **not** signature-verified on ingest — acceptable
because this is the owner's read-only analytics; spoofing a wallet on your own
traffic gains nothing. (The *admin read* side is fully signature-gated.)

## Components

All mirror existing feature patterns (`server/games/*`, `src/lib/games/*`).

### 1. `src/lib/analytics/track.ts` (client)
- `getVisitorId()` — reads/creates the `localStorage` uuid.
- `track(eventType, path, wallet?)` — `POST /api/analytics/track` via
  `navigator.sendBeacon` (fire-and-forget; falls back to `fetch(..., {keepalive:true})`).
  Never awaited, never blocks or throws into the UI.
- Wired into the router (one `useEffect` on location change) for automatic
  page-view events, and called once from the wallet-connect handler.

### 2. `server/analytics/store.ts`
- `better-sqlite3`, WAL, DB path via the shared convention:
  `ANALYTICS_DB_PATH` → else dir of `COMPANION_DB_PATH` → else `./data/analytics.db`.
- Table `events`:
  `id INTEGER PK, visitor_id TEXT NOT NULL, wallet TEXT, ip TEXT, path TEXT,
   event_type TEXT NOT NULL, user_agent TEXT, created_at INTEGER NOT NULL`.
- Indices on `visitor_id`, `wallet`, `created_at`.
- `insertEvent(row)`; `listEvents({window})` → rows for the grid;
  `listVisitors({window})` → aggregate (group by `visitor_id`: latest wallet, last
  IP, event count, first/last seen).
- Opportunistic prune: on insert, occasionally delete rows older than 90 days.

### 3. `server/analytics/auth.ts`
- Mirrors `server/games/auth.ts`.
- `adminAddresses()` — defaults to the two addresses above, overridable by
  `SITE_ADMINS` (comma-separated). `isAdmin(wallet)`.
- `verifyAdminSignature(wallet, signedAt, signature)` — viem `recoverMessageAddress`,
  freshness via the shared `isSignedAtFresh`, admin-set membership check.
- Signed message builder in `src/lib/analytics/auth.ts`:
  `GotchiCloset — site admin\nwallet: <lower>\nts: <signedAt>`.

### 4. `server/routes/analytics.ts`
- `POST /api/analytics/track` — **public** ingest. Minimal payload validation,
  captures `req.ip` / UA / ts, writes a row. Per-IP rate limit (reuse existing
  limiter pattern). Returns `204`.
- `GET /api/analytics/events?window=7d` — **admin only**. Reads signature from
  headers (`x-wallet`, `x-signed-at`, `x-signature`); `401` if not a valid admin
  signature; else returns events for the window.
- `GET /api/analytics/visitors?window=7d` — **admin only**, same gate, returns the
  aggregate.
- Registered in `server/app.ts` alongside the other routers.

### 5. `src/pages/AdminPage.tsx` + `src/lib/analytics/api.ts`
- Route `/admin` added to the router but **not** to any nav/menu component.
- On mount: if no wallet or connected wallet ∉ admin set → render a plain
  "Not found" (404-style) and fetch nothing (no hint the page exists).
- If admin: prompt one signature, cache `{wallet, signedAt, signature}` in memory,
  fetch via react-query with those headers.
- **Grid** (hand-rolled, reusing `SortSheet`/`MarketGrid` styling + `@tanstack/react-virtual`):
  - Columns: **Time · Visitor (wallet or `anon:<short id>`) · IP · Event · Path · Browser**.
  - Click a header to sort (asc/desc); default sort = Time desc.
  - Filter bar: free-text (matches address/IP/path), event-type dropdown,
    "connected wallets only" toggle, window selector (24h / 7d / 30d).
  - "Group by visitor" toggle switches to the visitors aggregate (one row per
    visitor: address/anon, last IP, # events, first/last seen).
  - Rows virtualized for large volumes.

### 6. Analytics summary (below the grid)
Computed client-side from the **currently filtered** event set (respects window +
filter bar), so it always describes what the grid is showing. No extra backend.
- **Stat tiles:** Unique visitors · Page views · Wallet connects · Returning
  visitors (seen on >1 calendar day) · Connect rate (connects ÷ unique visitors).
- **Page views over time** — sparkline/area, bucketed by hour (24h window) or day
  (7d/30d).
- **Top pages** — horizontal bar list of the busiest `path`s with counts.
- **Top visitors** — short list by event count (wallet or `anon:<short id>`).
- Charts follow the `dataviz` skill's palette/mark guidance and are theme-aware
  (light/dark), reusing existing chart styling where present.

## Security boundary

The page bundle cannot be truly hidden — anyone could load `/admin`'s JS. What
protects the data is the **server signature check** on the two `GET` endpoints:
without a valid signature from one of the two admin addresses they return `401`
with no data. The absent nav link + client-side 404 keep it invisible in normal
use. Identical trust model to the existing Game Center admin.

## Testing

- `server/analytics/store.test.ts` — insert/list/aggregate, prune boundary, wallet
  back-fill in the visitor aggregate.
- `server/analytics/auth.test.ts` — valid admin sig passes; non-admin sig fails;
  stale `signedAt` fails; bad signature fails (mirror `games/auth.test.ts`).
- `src/lib/analytics/auth.test.ts` — message builder is stable/lowercased.
- Route test: `POST /track` writes a row + stamps IP; admin `GET`s reject missing/
  bad signatures with `401`.
- Summary aggregation is a pure function over an event array (unique visitors,
  page views, connects, returning, time buckets, top pages) — unit-tested directly.

## Out of scope (YAGNI for v1)

- Geo-location (IP → city/country).
- Per-action events (pet/swap/chat/game). Page-views + connects only.
- Real-time streaming / websockets. React-query polling on the grid is enough.
- Bot filtering beyond what the UA column lets the owner eyeball.
