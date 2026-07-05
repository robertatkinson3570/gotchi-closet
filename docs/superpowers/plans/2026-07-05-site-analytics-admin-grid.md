# Site Analytics + Hidden Admin Grid Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Track who visits gotchicloset.com (anon session id + wallet + IP + page views) and surface it on a hidden `/admin` page, gated by wallet signature, as a sortable/filterable grid with an analytics summary below it.

**Architecture:** A fire-and-forget client beacon writes page-view and wallet-connect events to a SQLite table via a public ingest route; the server stamps the real client IP. Two signature-gated admin GET routes read the data. The `/admin` page (no nav link) renders a hand-rolled sortable/filterable grid plus a client-computed summary. All modules mirror the existing `server/games/*` + `src/lib/games/*` feature pattern.

**Tech Stack:** Express + better-sqlite3 (server), viem signature verification, React + wagmi + @tanstack/react-query + @tanstack/react-virtual (client), vitest (tests).

**Hard UI constraint:** No em dashes (`—`) in any text rendered on the page. Use a hyphen, comma, or a period. (This applies to visible copy only, not code comments.)

**Spec:** `docs/superpowers/specs/2026-07-05-site-analytics-admin-grid-design.md`

---

## File Structure

**Create:**
- `src/lib/analytics/auth.ts` - signed-message builder (shared client/server)
- `src/lib/analytics/types.ts` - shared event/visitor/summary types
- `src/lib/analytics/summary.ts` - pure aggregation over an event array
- `src/lib/analytics/summary.test.ts`
- `src/lib/analytics/track.ts` - visitorId + beacon
- `src/lib/analytics/api.ts` - admin read client (signature headers)
- `server/analytics/store.ts` - SQLite events table + queries
- `server/analytics/store.test.ts`
- `server/analytics/auth.ts` - admin allowlist + signature verify
- `server/analytics/auth.test.ts`
- `server/routes/analytics.ts` - ingest + admin read routes
- `server/routes/analytics.test.ts`
- `src/pages/AdminPage.tsx` - the hidden admin page
- `src/components/admin/EventGrid.tsx` - sortable/filterable virtualized grid
- `src/components/admin/AnalyticsSummary.tsx` - stat tiles + charts

**Modify:**
- `server/app.ts` - register the analytics router
- `src/app/router.tsx` - add the `/admin` route (no nav link anywhere)
- `src/components/analytics/TrackerProvider.tsx` (create) mounted in `src/components/layout/RootLayout.tsx` - fires page-view + connect beacons

---

## Task 1: Shared types and signed-message builder

**Files:**
- Create: `src/lib/analytics/types.ts`
- Create: `src/lib/analytics/auth.ts`

- [ ] **Step 1: Write the types**

`src/lib/analytics/types.ts`:

```ts
// src/lib/analytics/types.ts
export type EventType = "pageview" | "connect";

export interface AnalyticsEvent {
  id: number;
  visitor_id: string;
  wallet: string | null;
  ip: string | null;
  path: string | null;
  event_type: EventType;
  user_agent: string | null;
  created_at: number; // epoch ms
}

export interface VisitorRow {
  visitor_id: string;
  wallet: string | null;   // most recent wallet seen for this visitor
  ip: string | null;       // most recent IP
  events: number;
  first_seen: number;
  last_seen: number;
}

export interface Sig {
  wallet: string;
  signature: string;
  signedAt: number;
}

export type WindowKey = "24h" | "7d" | "30d";

export function windowMs(w: WindowKey): number {
  return w === "24h" ? 86_400_000 : w === "7d" ? 604_800_000 : 2_592_000_000;
}
```

- [ ] **Step 2: Write the signed-message builder**

`src/lib/analytics/auth.ts` (mirrors `src/lib/games/auth.ts`; reuses the shared freshness/TTL):

```ts
// src/lib/analytics/auth.ts
// Pure builder shared by the client (signs) and server (verifies). The exact string
// must match on both sides or the recovered address won't equal the claimed wallet.
export { isSignedAtFresh, PREMIUM_SIG_TTL_MS as SIG_TTL_MS } from "../companion/premiumAuth";

export function siteAdminMessage(wallet: string, signedAt: number): string {
  return `GotchiCloset site admin\nwallet: ${wallet.toLowerCase()}\nts: ${signedAt}`;
}
```

- [ ] **Step 3: Commit**

```bash
git add src/lib/analytics/types.ts src/lib/analytics/auth.ts
git commit -m "feat(analytics): shared types and signed-message builder"
```

---

## Task 2: Admin allowlist + signature verification (server)

**Files:**
- Create: `server/analytics/auth.ts`
- Test: `server/analytics/auth.test.ts`

- [ ] **Step 1: Write the failing test**

`server/analytics/auth.test.ts` (mirrors `server/games/auth.test.ts`):

```ts
// server/analytics/auth.test.ts
import { afterEach, describe, expect, it } from "vitest";
import { privateKeyToAccount } from "viem/accounts";
import { siteAdminMessage } from "../../src/lib/analytics/auth";
import { verifyAdminSignature, isAdmin } from "./auth";

const account = privateKeyToAccount(
  "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80"
);

afterEach(() => {
  delete process.env.SITE_ADMINS;
});

describe("site admin allowlist", () => {
  it("defaults to the two owner addresses when SITE_ADMINS is unset", () => {
    expect(isAdmin("0xe0d4f8f6F04A42aeD5a7EA4f68Bc612E6A54A3c2")).toBe(true);
    expect(isAdmin("0xc4cb6cb969e8b4e309ab98e4da51b77887afad96")).toBe(true); // case-insensitive
    expect(isAdmin("0x0000000000000000000000000000000000000001")).toBe(false);
  });

  it("SITE_ADMINS overrides the default set", () => {
    process.env.SITE_ADMINS = account.address.toLowerCase();
    expect(isAdmin(account.address)).toBe(true);
    expect(isAdmin("0xe0d4f8f6F04A42aeD5a7EA4f68Bc612E6A54A3c2")).toBe(false);
  });

  it("verifyAdminSignature requires a valid signature AND allowlist membership", async () => {
    process.env.SITE_ADMINS = account.address.toLowerCase();
    const signedAt = Date.now();
    const signature = await account.signMessage({ message: siteAdminMessage(account.address, signedAt) });
    expect(await verifyAdminSignature(account.address, signedAt, signature)).toBe(true);

    process.env.SITE_ADMINS = "0xdead";
    expect(await verifyAdminSignature(account.address, signedAt, signature)).toBe(false);
  });

  it("rejects a stale signature", async () => {
    process.env.SITE_ADMINS = account.address.toLowerCase();
    const signedAt = Date.now() - 48 * 60 * 60 * 1000;
    const signature = await account.signMessage({ message: siteAdminMessage(account.address, signedAt) });
    expect(await verifyAdminSignature(account.address, signedAt, signature)).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run server/analytics/auth.test.ts`
Expected: FAIL - cannot find module `./auth`.

- [ ] **Step 3: Write minimal implementation**

`server/analytics/auth.ts`:

```ts
// server/analytics/auth.ts
import { recoverMessageAddress } from "viem";
import { siteAdminMessage, isSignedAtFresh } from "../../src/lib/analytics/auth";

// Default owners. Baked in so prod works with zero config; override with SITE_ADMINS.
const DEFAULT_ADMINS = [
  "0xe0d4f8f6f04a42aed5a7ea4f68bc612e6a54a3c2",
  "0xc4cb6cb969e8b4e309ab98e4da51b77887afad96",
];

export function adminAddresses(): Set<string> {
  const raw = process.env.SITE_ADMINS;
  const list = raw
    ? raw.split(",").map((a) => a.trim().toLowerCase()).filter(Boolean)
    : DEFAULT_ADMINS;
  return new Set(list);
}

export function isAdmin(wallet: string): boolean {
  return adminAddresses().has(wallet.toLowerCase());
}

export async function verifyAdminSignature(
  wallet: string,
  signedAt: number,
  signature: string
): Promise<boolean> {
  if (!isAdmin(wallet)) return false;
  if (!wallet?.startsWith("0x") || !signature?.startsWith("0x")) return false;
  if (!isSignedAtFresh(signedAt, Date.now())) return false;
  try {
    const recovered = await recoverMessageAddress({
      message: siteAdminMessage(wallet, signedAt),
      signature: signature as `0x${string}`,
    });
    return recovered.toLowerCase() === wallet.toLowerCase();
  } catch {
    return false;
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run server/analytics/auth.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add server/analytics/auth.ts server/analytics/auth.test.ts
git commit -m "feat(analytics): admin allowlist + signature verification"
```

---

## Task 3: Event store (SQLite)

**Files:**
- Create: `server/analytics/store.ts`
- Test: `server/analytics/store.test.ts`

- [ ] **Step 1: Write the failing test**

`server/analytics/store.test.ts` (mirrors `server/games/store.test.ts` setup):

```ts
// server/analytics/store.test.ts
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { closeDb, insertEvent, listEvents, listVisitors, pruneOld } from "./store";

let tmpDir: string;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "analytics-test-"));
  process.env.ANALYTICS_DB_PATH = path.join(tmpDir, "analytics.db");
});

afterEach(() => {
  closeDb();
  delete process.env.ANALYTICS_DB_PATH;
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

const base = {
  visitor_id: "v1",
  wallet: null as string | null,
  ip: "1.2.3.4",
  path: "/explorer",
  event_type: "pageview" as const,
  user_agent: "UA",
};

describe("insertEvent + listEvents", () => {
  it("stores and returns events within the window, newest first", () => {
    const now = Date.now();
    insertEvent({ ...base, created_at: now - 1000 });
    insertEvent({ ...base, path: "/pulse", created_at: now });
    const rows = listEvents({ sinceMs: now - 10_000 });
    expect(rows).toHaveLength(2);
    expect(rows[0].path).toBe("/pulse"); // newest first
    expect(rows[0].ip).toBe("1.2.3.4");
  });

  it("excludes events older than the window", () => {
    const now = Date.now();
    insertEvent({ ...base, created_at: now - 100_000 });
    expect(listEvents({ sinceMs: now - 10_000 })).toHaveLength(0);
  });
});

describe("listVisitors", () => {
  it("aggregates one row per visitor with latest wallet and counts", () => {
    const now = Date.now();
    insertEvent({ ...base, created_at: now - 2000 });
    insertEvent({ ...base, wallet: "0xabc", event_type: "connect", created_at: now - 1000 });
    insertEvent({ ...base, visitor_id: "v2", created_at: now });
    const visitors = listVisitors({ sinceMs: now - 10_000 });
    const v1 = visitors.find((v) => v.visitor_id === "v1")!;
    expect(v1.wallet).toBe("0xabc"); // latest non-null wallet backfills the session
    expect(v1.events).toBe(2);
    expect(visitors).toHaveLength(2);
  });
});

describe("pruneOld", () => {
  it("deletes rows older than the cutoff and keeps recent ones", () => {
    const now = Date.now();
    insertEvent({ ...base, created_at: now - 100 });
    insertEvent({ ...base, created_at: now - 200_000 });
    const deleted = pruneOld(now - 10_000);
    expect(deleted).toBe(1);
    expect(listEvents({ sinceMs: now - 1_000_000 })).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run server/analytics/store.test.ts`
Expected: FAIL - cannot find module `./store`.

- [ ] **Step 3: Write minimal implementation**

`server/analytics/store.ts` (DB-path convention copied from `server/games/store.ts`):

```ts
// server/analytics/store.ts
// One table of raw events. DB path mirrors the games/companion convention so prod
// lands on the same writable volume.
import Database from "better-sqlite3";
import path from "node:path";
import fs from "node:fs";
import type { AnalyticsEvent, EventType, VisitorRow } from "../../src/lib/analytics/types";

let db: Database.Database | null = null;

function dbPath(): string {
  if (process.env.ANALYTICS_DB_PATH) return process.env.ANALYTICS_DB_PATH;
  if (process.env.COMPANION_DB_PATH) {
    return path.join(path.dirname(process.env.COMPANION_DB_PATH), "analytics.db");
  }
  return path.resolve("./data/analytics.db");
}

export function closeDb(): void {
  if (db) { db.close(); db = null; }
}

export function getDb(): Database.Database {
  if (db) return db;
  const p = dbPath();
  const dir = path.dirname(p);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  db = new Database(p);
  db.pragma("journal_mode = WAL");
  db.exec(`
    CREATE TABLE IF NOT EXISTS events (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      visitor_id TEXT NOT NULL,
      wallet     TEXT,
      ip         TEXT,
      path       TEXT,
      event_type TEXT NOT NULL,
      user_agent TEXT,
      created_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_events_visitor ON events(visitor_id);
    CREATE INDEX IF NOT EXISTS idx_events_wallet ON events(wallet);
    CREATE INDEX IF NOT EXISTS idx_events_created ON events(created_at);
  `);
  return db;
}

export interface NewEvent {
  visitor_id: string;
  wallet: string | null;
  ip: string | null;
  path: string | null;
  event_type: EventType;
  user_agent: string | null;
  created_at: number;
}

export function insertEvent(e: NewEvent): void {
  getDb()
    .prepare(
      `INSERT INTO events (visitor_id, wallet, ip, path, event_type, user_agent, created_at)
       VALUES (@visitor_id, @wallet, @ip, @path, @event_type, @user_agent, @created_at)`
    )
    .run(e);
}

export function listEvents(opts: { sinceMs: number; limit?: number }): AnalyticsEvent[] {
  return getDb()
    .prepare(
      `SELECT * FROM events WHERE created_at >= ? ORDER BY created_at DESC LIMIT ?`
    )
    .all(opts.sinceMs, opts.limit ?? 5000) as AnalyticsEvent[];
}

export function listVisitors(opts: { sinceMs: number }): VisitorRow[] {
  return getDb()
    .prepare(
      `SELECT
         visitor_id,
         (SELECT wallet FROM events e2
            WHERE e2.visitor_id = e.visitor_id AND e2.wallet IS NOT NULL
              AND e2.created_at >= @since
            ORDER BY e2.created_at DESC LIMIT 1) AS wallet,
         (SELECT ip FROM events e3
            WHERE e3.visitor_id = e.visitor_id AND e3.created_at >= @since
            ORDER BY e3.created_at DESC LIMIT 1) AS ip,
         COUNT(*) AS events,
         MIN(created_at) AS first_seen,
         MAX(created_at) AS last_seen
       FROM events e
       WHERE created_at >= @since
       GROUP BY visitor_id
       ORDER BY last_seen DESC`
    )
    .all({ since: opts.sinceMs }) as VisitorRow[];
}

export function pruneOld(cutoffMs: number): number {
  const info = getDb().prepare(`DELETE FROM events WHERE created_at < ?`).run(cutoffMs);
  return info.changes;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run server/analytics/store.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add server/analytics/store.ts server/analytics/store.test.ts
git commit -m "feat(analytics): sqlite event store with visitor aggregate and prune"
```

---

## Task 4: Routes (public ingest + admin reads)

**Files:**
- Create: `server/routes/analytics.ts`
- Test: `server/routes/analytics.test.ts`
- Modify: `server/app.ts`

- [ ] **Step 1: Write the failing test**

`server/routes/analytics.test.ts`:

```ts
// server/routes/analytics.test.ts
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import express from "express";
import request from "supertest";
import { privateKeyToAccount } from "viem/accounts";
import { siteAdminMessage } from "../../src/lib/analytics/auth";
import { closeDb } from "../analytics/store";
import analyticsRouter from "./analytics";

const account = privateKeyToAccount(
  "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80"
);

let tmpDir: string;
let app: express.Express;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "analytics-route-"));
  process.env.ANALYTICS_DB_PATH = path.join(tmpDir, "analytics.db");
  process.env.SITE_ADMINS = account.address.toLowerCase();
  app = express();
  app.use(express.json());
  app.use("/api/analytics", analyticsRouter);
});

afterEach(() => {
  closeDb();
  delete process.env.ANALYTICS_DB_PATH;
  delete process.env.SITE_ADMINS;
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe("POST /track", () => {
  it("accepts a pageview and returns 204", async () => {
    const res = await request(app)
      .post("/api/analytics/track")
      .send({ visitorId: "v1", eventType: "pageview", path: "/explorer" });
    expect(res.status).toBe(204);
  });

  it("rejects an unknown event type with 400", async () => {
    const res = await request(app)
      .post("/api/analytics/track")
      .send({ visitorId: "v1", eventType: "hack", path: "/x" });
    expect(res.status).toBe(400);
  });
});

describe("GET /events (admin only)", () => {
  it("401 without a signature", async () => {
    const res = await request(app).get("/api/analytics/events");
    expect(res.status).toBe(401);
  });

  it("401 with a bad signature", async () => {
    const res = await request(app)
      .get("/api/analytics/events")
      .set("x-wallet", account.address)
      .set("x-signed-at", String(Date.now()))
      .set("x-signature", "0xdeadbeef");
    expect(res.status).toBe(401);
  });

  it("200 and returns rows with a valid admin signature", async () => {
    await request(app)
      .post("/api/analytics/track")
      .send({ visitorId: "v1", eventType: "pageview", path: "/explorer" });
    const signedAt = Date.now();
    const signature = await account.signMessage({ message: siteAdminMessage(account.address, signedAt) });
    const res = await request(app)
      .get("/api/analytics/events?window=7d")
      .set("x-wallet", account.address)
      .set("x-signed-at", String(signedAt))
      .set("x-signature", signature);
    expect(res.status).toBe(200);
    expect(res.body.events).toHaveLength(1);
    expect(res.body.events[0].path).toBe("/explorer");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run server/routes/analytics.test.ts`
Expected: FAIL - cannot find module `./analytics`.

(If `supertest` is missing, install as a dev dep: `npm i -D supertest @types/supertest`.)

- [ ] **Step 3: Write minimal implementation**

`server/routes/analytics.ts` (rate-limit `hit` copied from `server/routes/companion.ts:38-45`):

```ts
// server/routes/analytics.ts
import { Router } from "express";
import type { Request } from "express";
import { insertEvent, listEvents, listVisitors, pruneOld } from "../analytics/store";
import { verifyAdminSignature } from "../analytics/auth";
import { windowMs, type WindowKey } from "../../src/lib/analytics/types";

const router = Router();

// Per-IP ingest limiter so a single host can't flood the table.
// (req.ip is the real client only because app.ts sets trust proxy.)
const buckets = new Map<string, { count: number; resetAt: number }>();
function hit(key: string, limit: number, windowMsArg: number): boolean {
  const now = Date.now();
  const b = buckets.get(key);
  if (!b || b.resetAt < now) { buckets.set(key, { count: 1, resetAt: now + windowMsArg }); return false; }
  b.count += 1;
  return b.count > limit;
}

const PRUNE_AFTER_MS = 90 * 24 * 60 * 60 * 1000;
let insertsSincePrune = 0;

function readWindow(req: Request): WindowKey {
  const w = String(req.query.window || "7d");
  return w === "24h" || w === "30d" ? (w as WindowKey) : "7d";
}

async function requireAdmin(req: Request): Promise<boolean> {
  const wallet = String(req.header("x-wallet") || "");
  const signedAt = Number(req.header("x-signed-at"));
  const signature = String(req.header("x-signature") || "");
  return verifyAdminSignature(wallet, signedAt, signature);
}

// Public ingest. Fire-and-forget from the client beacon.
router.post("/track", (req, res) => {
  if (req.ip && hit("ip:" + req.ip, 300, 600_000)) return res.status(429).end();

  const { visitorId, eventType, path, wallet } = req.body ?? {};
  if (typeof visitorId !== "string" || !visitorId || visitorId.length > 64) return res.status(400).end();
  if (eventType !== "pageview" && eventType !== "connect") return res.status(400).end();

  insertEvent({
    visitor_id: visitorId,
    wallet: typeof wallet === "string" && wallet.startsWith("0x") ? wallet.toLowerCase() : null,
    ip: req.ip ?? null,
    path: typeof path === "string" ? path.slice(0, 512) : null,
    event_type: eventType,
    user_agent: (req.header("user-agent") || "").slice(0, 512) || null,
    created_at: Date.now(),
  });

  if (++insertsSincePrune >= 500) { insertsSincePrune = 0; pruneOld(Date.now() - PRUNE_AFTER_MS); }
  res.status(204).end();
});

// Admin: raw events for the grid.
router.get("/events", async (req, res) => {
  if (!(await requireAdmin(req))) return res.status(401).json({ error: "unauthorized" });
  const sinceMs = Date.now() - windowMs(readWindow(req));
  res.json({ events: listEvents({ sinceMs }) });
});

// Admin: visitor aggregate.
router.get("/visitors", async (req, res) => {
  if (!(await requireAdmin(req))) return res.status(401).json({ error: "unauthorized" });
  const sinceMs = Date.now() - windowMs(readWindow(req));
  res.json({ visitors: listVisitors({ sinceMs }) });
});

export default router;
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run server/routes/analytics.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Wire the router into the app**

In `server/app.ts`, add the import alongside the other route imports:

```ts
import analyticsRoutes from "./routes/analytics";
```

Then, next to the other `app.use("/api/...")` registrations (search for `app.use("/api/games"` and add below it):

```ts
app.use("/api/analytics", analyticsRoutes);
```

- [ ] **Step 6: Run the full server test suite to confirm nothing broke**

Run: `npx vitest run server/`
Expected: PASS (all existing + new).

- [ ] **Step 7: Commit**

```bash
git add server/routes/analytics.ts server/routes/analytics.test.ts server/app.ts
git commit -m "feat(analytics): ingest route + signature-gated admin read routes"
```

---

## Task 5: Client beacon (visitorId + track)

**Files:**
- Create: `src/lib/analytics/track.ts`

- [ ] **Step 1: Write the implementation**

`src/lib/analytics/track.ts`:

```ts
// src/lib/analytics/track.ts
// Fire-and-forget visitor beacon. Never awaited, never throws into the UI.
import { env } from "@/lib/env";
import type { EventType } from "./types";

const KEY = "gc_visitor_id";

export function getVisitorId(): string {
  try {
    let id = localStorage.getItem(KEY);
    if (!id) {
      id = (crypto.randomUUID?.() ?? String(Date.now()) + Math.random().toString(16).slice(2));
      localStorage.setItem(KEY, id);
    }
    return id;
  } catch {
    // Private mode / storage blocked: use a per-tab volatile id.
    return "nostore";
  }
}

const base = () => env.companionApiUrl || "";

export function track(eventType: EventType, path: string, wallet?: string): void {
  try {
    const body = JSON.stringify({ visitorId: getVisitorId(), eventType, path, wallet: wallet ?? null });
    const url = `${base()}/api/analytics/track`;
    if (navigator.sendBeacon) {
      navigator.sendBeacon(url, new Blob([body], { type: "application/json" }));
    } else {
      void fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body, keepalive: true });
    }
  } catch {
    /* analytics must never break the app */
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add src/lib/analytics/track.ts
git commit -m "feat(analytics): client visitor id + fire-and-forget beacon"
```

---

## Task 6: Tracker provider wired into the layout

**Files:**
- Create: `src/components/analytics/TrackerProvider.tsx`
- Modify: `src/components/layout/RootLayout.tsx`

- [ ] **Step 1: Write the provider**

`src/components/analytics/TrackerProvider.tsx`:

```tsx
// src/components/analytics/TrackerProvider.tsx
// Fires a pageview on every route change and a connect event the first time a
// wallet address appears. Renders nothing.
import { useEffect, useRef } from "react";
import { useLocation } from "react-router-dom";
import { useAccount } from "wagmi";
import { track } from "@/lib/analytics/track";

export function TrackerProvider() {
  const location = useLocation();
  const { address } = useAccount();
  const lastConnected = useRef<string | null>(null);

  // Page views. address is included when known so the row is attributable.
  useEffect(() => {
    track("pageview", location.pathname, address);
  }, [location.pathname, address]);

  // Connect event, once per newly-seen address.
  useEffect(() => {
    if (address && lastConnected.current !== address) {
      lastConnected.current = address;
      track("connect", location.pathname, address);
    }
    if (!address) lastConnected.current = null;
    // location.pathname intentionally omitted: connect fires on address change only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [address]);

  return null;
}
```

- [ ] **Step 2: Mount it in RootLayout**

In `src/components/layout/RootLayout.tsx`, import and render `<TrackerProvider />` once inside the layout tree (near the top of the returned JSX, alongside the existing providers/outlet). Add:

```tsx
import { TrackerProvider } from "@/components/analytics/TrackerProvider";
```

and render `<TrackerProvider />` just inside the root element (it renders nothing, position is not visually significant, but it must be inside the Router so `useLocation` works).

- [ ] **Step 3: Verify the build compiles**

Run: `npx tsc -p tsconfig.json --noEmit`
Expected: no new type errors from the added files.

- [ ] **Step 4: Manual smoke check**

Run the dev server (`npm run dev`), open the site, navigate between two pages, connect a wallet, then confirm rows landed:

Run: `sqlite3 "$(node -e "console.log(process.env.ANALYTICS_DB_PATH||'./data/analytics.db')")" "SELECT event_type,path,wallet,ip FROM events ORDER BY id DESC LIMIT 5;"`
Expected: pageview rows for the pages you visited, and a connect row once you connected. (If `sqlite3` CLI is unavailable, skip; the route test already proves ingest.)

- [ ] **Step 5: Commit**

```bash
git add src/components/analytics/TrackerProvider.tsx src/components/layout/RootLayout.tsx
git commit -m "feat(analytics): fire pageview + connect beacons from the layout"
```

---

## Task 7: Summary aggregation (pure function)

**Files:**
- Create: `src/lib/analytics/summary.ts`
- Test: `src/lib/analytics/summary.test.ts`

- [ ] **Step 1: Write the failing test**

`src/lib/analytics/summary.test.ts`:

```ts
// src/lib/analytics/summary.test.ts
import { describe, expect, it } from "vitest";
import { summarize } from "./summary";
import type { AnalyticsEvent } from "./types";

function ev(p: Partial<AnalyticsEvent>): AnalyticsEvent {
  return {
    id: 1, visitor_id: "v1", wallet: null, ip: "1.1.1.1",
    path: "/explorer", event_type: "pageview", user_agent: "UA",
    created_at: 0, ...p,
  };
}

describe("summarize", () => {
  it("counts unique visitors, page views, and connects", () => {
    const s = summarize([
      ev({ visitor_id: "v1", event_type: "pageview" }),
      ev({ visitor_id: "v1", event_type: "connect", wallet: "0xabc" }),
      ev({ visitor_id: "v2", event_type: "pageview" }),
    ]);
    expect(s.uniqueVisitors).toBe(2);
    expect(s.pageViews).toBe(2);
    expect(s.connects).toBe(1);
  });

  it("ranks top pages by pageview count", () => {
    const s = summarize([
      ev({ path: "/a" }), ev({ path: "/a" }), ev({ path: "/b" }),
    ]);
    expect(s.topPages[0]).toEqual({ path: "/a", count: 2 });
    expect(s.topPages[1]).toEqual({ path: "/b", count: 1 });
  });

  it("counts a visitor as returning when seen on more than one calendar day", () => {
    const day = 86_400_000;
    const s = summarize([
      ev({ visitor_id: "v1", created_at: 0 }),
      ev({ visitor_id: "v1", created_at: day * 2 }),
      ev({ visitor_id: "v2", created_at: 0 }),
    ]);
    expect(s.returningVisitors).toBe(1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/analytics/summary.test.ts`
Expected: FAIL - cannot find module `./summary`.

- [ ] **Step 3: Write minimal implementation**

`src/lib/analytics/summary.ts`:

```ts
// src/lib/analytics/summary.ts
// Pure aggregation over a filtered event array. Drives the summary strip so it
// always describes exactly what the grid is currently showing.
import type { AnalyticsEvent } from "./types";

export interface Summary {
  uniqueVisitors: number;
  pageViews: number;
  connects: number;
  returningVisitors: number;
  connectRate: number; // connects / uniqueVisitors, 0..1
  topPages: { path: string; count: number }[];
  topVisitors: { key: string; count: number }[];
  timeBuckets: { t: number; count: number }[]; // pageviews per bucket, ascending
}

function dayIndex(ms: number): number {
  return Math.floor(ms / 86_400_000);
}

export function summarize(events: AnalyticsEvent[], bucketMs = 3_600_000): Summary {
  const visitors = new Set<string>();
  const daysByVisitor = new Map<string, Set<number>>();
  const pageCounts = new Map<string, number>();
  const visitorCounts = new Map<string, number>();
  const buckets = new Map<number, number>();
  let pageViews = 0;
  let connects = 0;

  for (const e of events) {
    visitors.add(e.visitor_id);
    const days = daysByVisitor.get(e.visitor_id) ?? new Set<number>();
    days.add(dayIndex(e.created_at));
    daysByVisitor.set(e.visitor_id, days);

    const vkey = e.wallet ?? `anon:${e.visitor_id.slice(0, 6)}`;
    visitorCounts.set(vkey, (visitorCounts.get(vkey) ?? 0) + 1);

    if (e.event_type === "connect") connects++;
    if (e.event_type === "pageview") {
      pageViews++;
      if (e.path) pageCounts.set(e.path, (pageCounts.get(e.path) ?? 0) + 1);
      const b = Math.floor(e.created_at / bucketMs) * bucketMs;
      buckets.set(b, (buckets.get(b) ?? 0) + 1);
    }
  }

  let returningVisitors = 0;
  for (const days of daysByVisitor.values()) if (days.size > 1) returningVisitors++;

  const top = (m: Map<string, number>, keyName: "path" | "key") =>
    [...m.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([k, count]) => ({ [keyName]: k, count })) as any[];

  return {
    uniqueVisitors: visitors.size,
    pageViews,
    connects,
    returningVisitors,
    connectRate: visitors.size ? connects / visitors.size : 0,
    topPages: top(pageCounts, "path"),
    topVisitors: top(visitorCounts, "key"),
    timeBuckets: [...buckets.entries()].sort((a, b) => a[0] - b[0]).map(([t, count]) => ({ t, count })),
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/analytics/summary.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/analytics/summary.ts src/lib/analytics/summary.test.ts
git commit -m "feat(analytics): pure summary aggregation over filtered events"
```

---

## Task 8: Admin read client

**Files:**
- Create: `src/lib/analytics/api.ts`

- [ ] **Step 1: Write the implementation**

`src/lib/analytics/api.ts` (mirrors `src/lib/games/api.ts` signature pattern, but via headers):

```ts
// src/lib/analytics/api.ts
import { env } from "@/lib/env";
import type { AnalyticsEvent, Sig, VisitorRow, WindowKey } from "./types";

const base = () => env.companionApiUrl || "";

function headers(sig: Sig): HeadersInit {
  return {
    "x-wallet": sig.wallet,
    "x-signed-at": String(sig.signedAt),
    "x-signature": sig.signature,
  };
}

export async function fetchEvents(sig: Sig, window: WindowKey): Promise<AnalyticsEvent[]> {
  const r = await fetch(`${base()}/api/analytics/events?window=${window}`, { headers: headers(sig) });
  if (r.status === 401) throw new Error("unauthorized");
  if (!r.ok) throw new Error("failed to load events");
  return (await r.json()).events;
}

export async function fetchVisitors(sig: Sig, window: WindowKey): Promise<VisitorRow[]> {
  const r = await fetch(`${base()}/api/analytics/visitors?window=${window}`, { headers: headers(sig) });
  if (r.status === 401) throw new Error("unauthorized");
  if (!r.ok) throw new Error("failed to load visitors");
  return (await r.json()).visitors;
}
```

- [ ] **Step 2: Commit**

```bash
git add src/lib/analytics/api.ts
git commit -m "feat(analytics): admin read client with signature headers"
```

---

## Task 9: The grid component

**Files:**
- Create: `src/components/admin/EventGrid.tsx`

Before writing chart/grid styling, glance at `src/components/explorer/MarketGrid.tsx` and `src/components/explorer/SortSheet.tsx` for the existing table/sort look, and reuse those class names/tokens.

- [ ] **Step 1: Write the grid**

`src/components/admin/EventGrid.tsx`. A controlled, client-side sorted + filtered table. Virtualize with `@tanstack/react-virtual`. No em dashes in any visible string.

```tsx
// src/components/admin/EventGrid.tsx
import { useMemo, useRef, useState } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import type { AnalyticsEvent } from "@/lib/analytics/types";

type SortKey = "created_at" | "visitor" | "ip" | "event_type" | "path";
type Dir = "asc" | "desc";

function visitorLabel(e: AnalyticsEvent): string {
  return e.wallet ? e.wallet : `anon:${e.visitor_id.slice(0, 6)}`;
}
function browserLabel(ua: string | null): string {
  if (!ua) return "unknown";
  if (/Firefox/i.test(ua)) return "Firefox";
  if (/Edg/i.test(ua)) return "Edge";
  if (/Chrome/i.test(ua)) return "Chrome";
  if (/Safari/i.test(ua)) return "Safari";
  return "other";
}

export function EventGrid({
  events,
  filter,
  eventType,
  connectedOnly,
}: {
  events: AnalyticsEvent[];
  filter: string;
  eventType: "all" | "pageview" | "connect";
  connectedOnly: boolean;
}) {
  const [sort, setSort] = useState<SortKey>("created_at");
  const [dir, setDir] = useState<Dir>("desc");

  const rows = useMemo(() => {
    const q = filter.trim().toLowerCase();
    let out = events.filter((e) => {
      if (eventType !== "all" && e.event_type !== eventType) return false;
      if (connectedOnly && !e.wallet) return false;
      if (!q) return true;
      return (
        (e.wallet ?? "").toLowerCase().includes(q) ||
        (e.ip ?? "").toLowerCase().includes(q) ||
        (e.path ?? "").toLowerCase().includes(q) ||
        e.visitor_id.toLowerCase().includes(q)
      );
    });
    const cmp = (a: AnalyticsEvent, b: AnalyticsEvent): number => {
      switch (sort) {
        case "created_at": return a.created_at - b.created_at;
        case "visitor": return visitorLabel(a).localeCompare(visitorLabel(b));
        case "ip": return (a.ip ?? "").localeCompare(b.ip ?? "");
        case "event_type": return a.event_type.localeCompare(b.event_type);
        case "path": return (a.path ?? "").localeCompare(b.path ?? "");
      }
    };
    out = [...out].sort((a, b) => (dir === "asc" ? cmp(a, b) : -cmp(a, b)));
    return out;
  }, [events, filter, eventType, connectedOnly, sort, dir]);

  const parentRef = useRef<HTMLDivElement>(null);
  const virt = useVirtualizer({
    count: rows.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 34,
    overscan: 12,
  });

  const header = (key: SortKey, label: string) => (
    <button
      type="button"
      className="text-left font-semibold hover:underline"
      onClick={() => {
        if (sort === key) setDir(dir === "asc" ? "desc" : "asc");
        else { setSort(key); setDir(key === "created_at" ? "desc" : "asc"); }
      }}
    >
      {label}{sort === key ? (dir === "asc" ? " up" : " down") : ""}
    </button>
  );

  return (
    <div className="rounded border border-white/10">
      <div className="grid grid-cols-[150px_220px_130px_90px_1fr_90px] gap-2 px-3 py-2 text-xs border-b border-white/10 bg-white/5">
        {header("created_at", "Time")}
        {header("visitor", "Visitor")}
        {header("ip", "IP")}
        {header("event_type", "Event")}
        {header("path", "Path")}
        <span className="font-semibold">Browser</span>
      </div>
      <div ref={parentRef} className="max-h-[55vh] overflow-auto">
        <div style={{ height: virt.getTotalSize(), position: "relative" }}>
          {virt.getVirtualItems().map((vi) => {
            const e = rows[vi.index];
            return (
              <div
                key={e.id}
                className="grid grid-cols-[150px_220px_130px_90px_1fr_90px] gap-2 px-3 items-center text-xs border-b border-white/5"
                style={{ position: "absolute", top: 0, left: 0, right: 0, height: 34, transform: `translateY(${vi.start}px)` }}
              >
                <span className="tabular-nums opacity-80">{new Date(e.created_at).toLocaleString()}</span>
                <span className="truncate font-mono">{visitorLabel(e)}</span>
                <span className="font-mono opacity-80">{e.ip ?? ""}</span>
                <span>{e.event_type}</span>
                <span className="truncate opacity-90">{e.path ?? ""}</span>
                <span className="opacity-70">{browserLabel(e.user_agent)}</span>
              </div>
            );
          })}
        </div>
      </div>
      <div className="px-3 py-2 text-xs opacity-60">{rows.length} rows</div>
    </div>
  );
}
```

- [ ] **Step 2: Verify it type-checks**

Run: `npx tsc -p tsconfig.json --noEmit`
Expected: no new errors.

- [ ] **Step 3: Commit**

```bash
git add src/components/admin/EventGrid.tsx
git commit -m "feat(analytics): sortable filterable virtualized event grid"
```

---

## Task 10: The analytics summary component

**Files:**
- Create: `src/components/admin/AnalyticsSummary.tsx`

Apply the `dataviz` skill palette guidance for the sparkline and bar list; keep both theme-aware. No em dashes in visible text.

- [ ] **Step 1: Write the component**

`src/components/admin/AnalyticsSummary.tsx`:

```tsx
// src/components/admin/AnalyticsSummary.tsx
import { useMemo } from "react";
import { summarize } from "@/lib/analytics/summary";
import type { AnalyticsEvent } from "@/lib/analytics/types";

function Tile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded border border-white/10 bg-white/5 px-3 py-2">
      <div className="text-lg font-semibold tabular-nums">{value}</div>
      <div className="text-xs opacity-60">{label}</div>
    </div>
  );
}

function Sparkline({ points }: { points: { t: number; count: number }[] }) {
  if (points.length < 2) return <div className="text-xs opacity-50">not enough data yet</div>;
  const w = 480, h = 60, max = Math.max(...points.map((p) => p.count), 1);
  const dx = w / (points.length - 1);
  const d = points.map((p, i) => `${i === 0 ? "M" : "L"} ${i * dx} ${h - (p.count / max) * h}`).join(" ");
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="w-full h-16" preserveAspectRatio="none" role="img" aria-label="page views over time">
      <path d={d} fill="none" stroke="currentColor" strokeWidth={2} className="text-sky-400" />
    </svg>
  );
}

export function AnalyticsSummary({ events }: { events: AnalyticsEvent[] }) {
  const s = useMemo(() => summarize(events), [events]);
  return (
    <section className="mt-6 space-y-4">
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
        <Tile label="Unique visitors" value={String(s.uniqueVisitors)} />
        <Tile label="Page views" value={String(s.pageViews)} />
        <Tile label="Wallet connects" value={String(s.connects)} />
        <Tile label="Returning" value={String(s.returningVisitors)} />
        <Tile label="Connect rate" value={`${Math.round(s.connectRate * 100)}%`} />
      </div>
      <div className="rounded border border-white/10 p-3">
        <div className="text-xs opacity-60 mb-1">Page views over time</div>
        <Sparkline points={s.timeBuckets} />
      </div>
      <div className="grid sm:grid-cols-2 gap-4">
        <div className="rounded border border-white/10 p-3">
          <div className="text-xs opacity-60 mb-2">Top pages</div>
          {s.topPages.map((p) => (
            <div key={p.path} className="flex justify-between text-sm py-0.5">
              <span className="truncate font-mono opacity-90">{p.path}</span>
              <span className="tabular-nums opacity-70">{p.count}</span>
            </div>
          ))}
        </div>
        <div className="rounded border border-white/10 p-3">
          <div className="text-xs opacity-60 mb-2">Top visitors</div>
          {s.topVisitors.map((v) => (
            <div key={v.key} className="flex justify-between text-sm py-0.5">
              <span className="truncate font-mono opacity-90">{v.key}</span>
              <span className="tabular-nums opacity-70">{v.count}</span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
```

- [ ] **Step 2: Verify it type-checks**

Run: `npx tsc -p tsconfig.json --noEmit`
Expected: no new errors.

- [ ] **Step 3: Commit**

```bash
git add src/components/admin/AnalyticsSummary.tsx
git commit -m "feat(analytics): summary tiles + sparkline + top lists"
```

---

## Task 11: The hidden admin page + route

**Files:**
- Create: `src/pages/AdminPage.tsx`
- Modify: `src/app/router.tsx`

- [ ] **Step 1: Write the page**

`src/pages/AdminPage.tsx` (signing pattern copied from `src/components/games/AdminReviewTab.tsx`):

```tsx
// src/pages/AdminPage.tsx
import { useCallback, useState } from "react";
import { useAccount, useSignMessage } from "wagmi";
import { useQuery } from "@tanstack/react-query";
import { siteAdminMessage } from "@/lib/analytics/auth";
import { fetchEvents } from "@/lib/analytics/api";
import type { Sig, WindowKey } from "@/lib/analytics/types";
import { EventGrid } from "@/components/admin/EventGrid";
import { AnalyticsSummary } from "@/components/admin/AnalyticsSummary";

// Client-side hint only. The real gate is the server signature check on the data
// endpoints; a non-admin who loads this page sees "Not found" and fetches nothing.
const ADMINS = new Set([
  "0xe0d4f8f6f04a42aed5a7ea4f68bc612e6a54a3c2",
  "0xc4cb6cb969e8b4e309ab98e4da51b77887afad96",
]);

export default function AdminPage() {
  const { address } = useAccount();
  const { signMessageAsync } = useSignMessage();
  const [sig, setSig] = useState<Sig | null>(null);
  const [window, setWindow] = useState<WindowKey>("7d");
  const [filter, setFilter] = useState("");
  const [eventType, setEventType] = useState<"all" | "pageview" | "connect">("all");
  const [connectedOnly, setConnectedOnly] = useState(false);

  const isAdmin = !!address && ADMINS.has(address.toLowerCase());

  const authorize = useCallback(async () => {
    if (!address) return;
    const signedAt = Date.now();
    const signature = await signMessageAsync({ message: siteAdminMessage(address, signedAt) });
    setSig({ wallet: address, signedAt, signature });
  }, [address, signMessageAsync]);

  const { data: events = [], isLoading, error } = useQuery({
    queryKey: ["analytics-events", sig?.signedAt, window],
    queryFn: () => fetchEvents(sig!, window),
    enabled: !!sig,
  });

  // Non-admins get no signal that this page exists.
  if (!isAdmin) {
    return (
      <div className="mx-auto max-w-lg py-24 text-center">
        <h1 className="text-2xl font-semibold">Not found</h1>
        <p className="opacity-60 mt-2">The page you are looking for does not exist.</p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <h1 className="text-xl font-semibold mb-4">Site activity</h1>

      {!sig ? (
        <button type="button" onClick={authorize} className="rounded bg-sky-500 px-4 py-2 text-sm font-medium text-white">
          Sign in to view analytics
        </button>
      ) : (
        <>
          <div className="flex flex-wrap gap-2 items-center mb-4">
            <input
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              placeholder="Filter by address, IP, or path"
              className="rounded border border-white/15 bg-transparent px-3 py-1.5 text-sm min-w-[240px]"
            />
            <select value={eventType} onChange={(e) => setEventType(e.target.value as any)} className="rounded border border-white/15 bg-transparent px-2 py-1.5 text-sm">
              <option value="all">All events</option>
              <option value="pageview">Page views</option>
              <option value="connect">Connects</option>
            </select>
            <select value={window} onChange={(e) => setWindow(e.target.value as WindowKey)} className="rounded border border-white/15 bg-transparent px-2 py-1.5 text-sm">
              <option value="24h">Last 24h</option>
              <option value="7d">Last 7 days</option>
              <option value="30d">Last 30 days</option>
            </select>
            <label className="flex items-center gap-1.5 text-sm">
              <input type="checkbox" checked={connectedOnly} onChange={(e) => setConnectedOnly(e.target.checked)} />
              Connected wallets only
            </label>
          </div>

          {isLoading && <div className="opacity-60 text-sm">Loading...</div>}
          {error && <div className="text-red-400 text-sm">Could not load analytics. Try signing in again.</div>}

          {!isLoading && !error && (
            <>
              <EventGrid events={events} filter={filter} eventType={eventType} connectedOnly={connectedOnly} />
              <AnalyticsSummary events={events} />
            </>
          )}
        </>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Register the route (no nav link)**

In `src/app/router.tsx`, add the lazy import near the other page imports:

```ts
const AdminPage = lazyWithRetry(() => import("@/pages/AdminPage"));
```

and add a child route in the `children` array next to the other top-level pages (e.g. after the `steward` entry). Do NOT add it to any nav/menu component:

```tsx
{ path: "admin", element: <AdminPage /> },
```

- [ ] **Step 3: Verify build + type-check**

Run: `npx tsc -p tsconfig.json --noEmit && npm run build`
Expected: build succeeds, `/admin` chunk emitted.

- [ ] **Step 4: Manual verification**

1. `npm run dev`, open `/admin` with NO wallet connected: shows "Not found".
2. Connect a wallet that is NOT one of the two admin addresses: still "Not found".
3. Connect one of the two admin addresses: shows "Sign in to view analytics"; click, sign, and the grid + summary render.
4. Confirm no nav bar / menu anywhere links to `/admin` (grep to be sure):
   Run: `grep -rn "/admin" src/components/layout` - expect no matches.

- [ ] **Step 5: Commit**

```bash
git add src/pages/AdminPage.tsx src/app/router.tsx
git commit -m "feat(analytics): hidden signature-gated /admin analytics page"
```

---

## Task 12: Full verification pass

- [ ] **Step 1: Run the whole test suite**

Run: `npx vitest run`
Expected: all pass, including the four new test files.

- [ ] **Step 2: Type-check + build**

Run: `npx tsc -p tsconfig.json --noEmit && npm run build`
Expected: clean.

- [ ] **Step 3: Grep for accidental em dashes in the new UI text**

Run: `grep -rn "—" src/pages/AdminPage.tsx src/components/admin/`
Expected: no matches. (If any, replace with a hyphen or comma.)

- [ ] **Step 4: Final commit if anything was touched**

```bash
git add -A
git commit -m "chore(analytics): verification pass" || echo "nothing to commit"
```

---

## Deployment notes (not code steps)

- New env `SITE_ADMINS` is optional; the two owner addresses are the built-in default, so prod works with no config.
- The analytics SQLite DB lands next to the companion DB on the VPS writable volume (via `COMPANION_DB_PATH` dirname), matching games. No migration needed; the table self-creates.
- `VITE` client build must have `companionApiUrl` pointing at the API origin (already the case for the existing games/companion features).
```
