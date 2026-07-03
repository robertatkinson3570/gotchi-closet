# Game Center — Design Spec

**Date:** 2026-07-03
**Status:** Approved design → ready for implementation plan
**Route:** `/games` (frontend), `/api/games` (backend)

## Summary

A community directory of Aavegotchi games, tools, and dashboards. Anyone who
owns at least one Aavegotchi can submit an entry (title, description, URL,
category, image). Submissions land in a **pending** queue and are invisible to
the public until an **admin** wallet approves them. Approved entries render as a
category-filtered grid of neon "Baazaar-mode" cards. Moderation lives inline on
the same page, visible only when connected with an admin wallet.

This mirrors the shape of the existing Pulse feature (React page + Express router
+ `better-sqlite3` store) and reuses the wallet-signature auth pattern from the
Companion feature. No external services are introduced.

## Goals

- Community-submitted, admin-curated directory of Aavegotchi games/tools.
- Self-contained: images stored in SQLite, no external hosting dependency.
- Sybil-resistant submission: connect wallet + own ≥1 Aavegotchi.
- Admin approval gate: only allowlisted wallets can publish an entry.
- Clear on-page instructions and an up-front ownership warning.
- Styling consistent with the app's Baazaar/neon aesthetic.

## Non-Goals

- Editing/versioning of approved entries by submitters (admin can reject; a
  future iteration may add edit). Out of scope for v1.
- Voting, ratings, comments, or ranking. Out of scope.
- Public list of who submitted what (submitter wallet is stored but not shown
  publicly in v1).

## Categories

Fixed set, used both as the submit dropdown and the public filter tabs:

`Games`, `Tools`, `Dashboards`, `Other`

## Architecture

Follows the Pulse feature layout:

| Layer | Location | Pattern reference |
|-------|----------|-------------------|
| Frontend page | `src/pages/GameCenterPage.tsx` (lazy in `src/app/router.tsx` at `/games`) | `PulsePage.tsx` |
| Express router | `server/routes/games.ts`, mounted `app.use("/api/games", …)` in `server/app.ts` | `server/routes/pulse.ts` |
| Store | `server/games/store.ts` (`better-sqlite3`) | `server/pulse/store.ts` |
| Signature auth | `server/games/auth.ts` (`recoverMessageAddress`) | `server/companion/auth.ts` |
| On-chain gate | reuse viem Base 8453 client | `server/steward/chain.ts` |

### Database

DB path resolution copies the Pulse fallback so it lands on the writable volume
in prod:

1. `process.env.GAMES_DB_PATH` if set, else
2. `path.join(dirname(process.env.COMPANION_DB_PATH), "games.db")` if that env
   is set, else
3. `./data/games.db`.

WAL mode, created on first `getDb()`.

```sql
CREATE TABLE IF NOT EXISTS games (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  title          TEXT NOT NULL,
  description    TEXT NOT NULL,
  url            TEXT NOT NULL,
  category       TEXT NOT NULL,              -- Games | Tools | Dashboards | Other
  image_mime     TEXT NOT NULL,             -- image/png | image/jpeg | image/webp
  image_data     TEXT NOT NULL,             -- base64 (no data: prefix)
  submitter_wallet TEXT NOT NULL,           -- lowercased 0x address
  status         TEXT NOT NULL DEFAULT 'pending', -- pending | approved | rejected
  created_at     INTEGER NOT NULL,          -- epoch ms (Date.now())
  reviewed_at    INTEGER,                   -- epoch ms
  reviewed_by    TEXT                       -- lowercased admin address
);
CREATE INDEX IF NOT EXISTS idx_games_status_cat ON games(status, category);
```

## API

Base path `/api/games`. JSON in/out except the image route.

### `GET /`
Public. Returns approved entries (metadata only — no image bytes). Optional
`?category=Games|Tools|Dashboards|Other` filter. Cached (`Cache-Control:
public, max-age=300`, like Pulse). Each entry:

```json
{ "id": 12, "title": "…", "description": "…", "url": "https://…",
  "category": "Games", "imageUrl": "/api/games/12/image", "createdAt": 1751500000000 }
```

### `GET /:id/image`
Public. Streams the stored image bytes for an **approved** entry with the stored
mime type and long cache headers. Also serves a **pending** row's image when the
request carries a valid admin signature (`?wallet=&signature=&signedAt=`), so the
review queue can show previews. 404 if not found, or not approved and no valid
admin signature.

### `POST /`
Submit a new entry (status `pending`). Body:

```json
{ "title": "…", "description": "…", "url": "https://…", "category": "Games",
  "imageBase64": "…", "imageMime": "image/png",
  "wallet": "0x…", "signature": "0x…", "signedAt": 1751500000000 }
```

Server validation, in order (first failure returns `400`/`403` with a reason):

1. **Signature.** `signedAt` fresh (reuse `isSignedAtFresh`); `recoverMessageAddress`
   over a fixed submit message equals `wallet`. Message builder lives in a shared
   `src/lib/games/auth.ts` so client and server agree, e.g.
   `Gotchi Closet — submit to Game Center\nwallet: <wallet>\nat: <signedAt>`.
2. **Ownership gate.** `balanceOf(wallet) ≥ 1` on the Aavegotchi diamond
   (Base 8453 ERC-721). `403` if zero. This is the authoritative gate.
3. **Fields.** `title` (1–80 chars), `description` (1–280 chars), `url` must
   parse as `http(s)`, `category` in the fixed set.
4. **Image.** `imageMime` in {png, jpeg, webp}; decoded byte length ≤ ~300 KB
   (client downscales to stay well under). Reject otherwise.
5. **Anti-spam.** Reject if this wallet already has ≥5 `pending` rows.

On success: insert row `status='pending'`, `submitter_wallet` lowercased,
`created_at=Date.now()`. Returns `{ ok: true, id }`.

### `GET /pending`
**Admin only.** Query params `wallet`, `signature`, `signedAt` (admin signature
over an admin message builder). Recovered address must be in `GAME_CENTER_ADMINS`.
Returns pending entries with `imageUrl` pointing at the admin-scoped image route
(`/api/games/:id/image?wallet=…&signature=…&signedAt=…`). `403` otherwise.

### `POST /:id/review`
**Admin only.** Body `{ action: "approve" | "reject", wallet, signature, signedAt }`.
Verifies admin signature + allowlist membership. Sets `status`, `reviewed_at`,
`reviewed_by`. Approved entries immediately appear in `GET /`.

### `GET /is-admin?wallet=`
Public helper. Returns `{ admin: boolean }` by testing lowercased membership in
`GAME_CENTER_ADMINS`. Cosmetic only — used by the client to decide whether to
render the review tab; every admin route still verifies a signature server-side.

### Admin allowlist

Env `GAME_CENTER_ADMINS` = comma-separated lowercased addresses. Initial value:

```
GAME_CENTER_ADMINS=0xc4cb6cb969e8b4e309ab98e4da51b77887afad96,0xe0d4f8f6f04a42aed5a7ea4f68bc612e6a54a3c2
```

Comparison is always lowercased on both sides.

## Frontend — `/games`

Built from `src/ui` primitives (`card`, `tabs`, `select`, `input`, `button`,
`label`, `toast`) wrapped in the `GlowCard` neon shell (phantom-void gradient +
blur-orb accent + neon hover shadow) matching StatsPage/Pulse and the Baazaar
explorer cards.

**Layout, top to bottom:**

1. **Header + instructions block.** Title "Game Center", one-line tagline, and a
   short instructions panel: what this is (a community directory), how to submit
   (connect wallet → fill the form → it's reviewed before going live), and the
   **rule stated explicitly: "You must own at least one Aavegotchi to submit."**
2. **Category filter tabs** (`ui/tabs`): All · Games · Tools · Dashboards · Other.
   Drives the `?category=` fetch / client filter.
3. **Card grid.** Each card: image (from `imageUrl`), title, description, a
   category chip, and an "Open ↗" button/link to the entry's `url`
   (`target="_blank" rel="noopener noreferrer"`). Neon hover glow.
4. **Submit button** → opens the submit form (modal/`sheet`).

**Submit form:** title, description, url, category (`ui/select`), and an image
file input with live preview. On file pick, the image is **downscaled
client-side** (canvas, max ~512 px longest edge, re-encoded to webp/jpeg, kept
under the size cap) before it's base64-encoded. On submit: request a signature
(`useSignMessage`, TTL-cached like `GlobalChatTab`), POST, toast success/error.

**Ownership warning (client UX; server still enforces):**
- Requirement is always visible in the instructions block.
- When a wallet is connected, the page reads its gotchi balance (existing
  hook/graphql). If the balance is 0, the submit form shows an inline warning
  — "You need at least one Aavegotchi to submit" — and the Submit button is
  **disabled**. Not connected → button prompts to connect first.

**Admin review (inline):**
- If the connected wallet is one of `GAME_CENTER_ADMINS` (checked via
  `GET /is-admin`), an extra "Pending review" tab appears (hidden for everyone
  else). It lists pending entries with Approve / Reject buttons; each action
  signs an admin message and calls `POST /:id/review`, then refreshes the queue
  and the public grid.
- The tab is cosmetic; the server is the source of truth for every admin action.

## Error Handling

- All server rejections return a JSON `{ error: "<reason>" }` with an
  appropriate status; the client surfaces the reason via toast.
- Image route 404s cleanly for missing/unapproved ids.
- On-chain read failure at submit time → `503` "couldn't verify ownership, try
  again", not a silent pass (fail closed on the gate).

## Testing

Follow TDD (`server/pulse/store.test.ts` / `server/companion/auth.test.ts` as
templates):

- **Store unit tests:** insert pending, list approved excludes pending, category
  filter, review transitions, per-wallet pending cap.
- **Auth unit tests:** valid/invalid/stale signature; admin allowlist membership
  (case-insensitive); non-admin rejected.
- **Route tests:** submit happy path (mocked ownership = pass), submit blocked
  when balance 0, non-image/oversized image rejected, invalid url rejected,
  approve makes entry public, reject hides it, image route serves approved only.
- **Client:** downscale util produces an image under the cap; submit disabled
  when balance 0.

## Config Summary

| Env var | Purpose | Default |
|---------|---------|---------|
| `GAMES_DB_PATH` | explicit DB path | — |
| `COMPANION_DB_PATH` | prod volume dir fallback (existing) | — |
| `GAME_CENTER_ADMINS` | comma-separated admin addresses | the two addresses above |

## Rollout

1. Ship DB + store + auth + routes (behind tests).
2. Ship page + submit form + ownership warning.
3. Ship inline admin review.
4. Add nav link to `/games`.
