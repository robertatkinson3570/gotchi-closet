# Game Center Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a community game/tool directory at `/games` where Aavegotchi owners submit entries that admins approve before they go live.

**Architecture:** A `better-sqlite3` store (`server/games/store.ts`) holds entries with a `pending|approved|rejected` status and the image bytes inline. An Express router (`server/routes/games.ts`) exposes public read + submit endpoints and admin-only review endpoints, gating submits behind a wallet signature + an on-chain `balanceOf ≥ 1` check and gating review behind a `GAME_CENTER_ADMINS` allowlist. A React page (`src/pages/GameCenterPage.tsx`) renders a category-filtered neon card grid, a wallet-gated submit form with a live ownership warning, and an inline admin review tab. Pure helpers (message builders, validation) live in `src/lib/games/` so client and server share them and unit tests can hit them directly.

**Tech Stack:** TypeScript, Express, better-sqlite3, viem (Base 8453), React, wagmi, react-router, Tailwind + shadcn `src/ui` primitives, vitest.

---

## File Structure

**Create:**
- `src/lib/games/types.ts` — shared types + the fixed `CATEGORIES` list.
- `src/lib/games/auth.ts` — `submitMessage`/`adminMessage` builders (pure, shared client+server).
- `src/lib/games/validate.ts` — pure `validateSubmission()` used by the route and tested directly.
- `src/lib/games/image.ts` — client-side `downscaleImageFile()` canvas helper.
- `src/lib/games/constants.ts` — client-side diamond address for the ownership read.
- `src/lib/games/api.ts` — client fetch wrappers (`listGames`, `submitGame`, `listPending`, `reviewGame`, `checkAdmin`).
- `server/games/store.ts` — SQLite store (schema, insert, list, review, pending-count).
- `server/games/auth.ts` — signature verification + admin allowlist membership.
- `server/games/ownership.ts` — `ownsAavegotchi(wallet)` on-chain check.
- `server/routes/games.ts` — the Express router.
- `src/pages/GameCenterPage.tsx` — the page.
- `src/components/games/SubmitGameDialog.tsx` — the submit form.
- `src/components/games/AdminReviewTab.tsx` — the review queue.
- `src/components/games/GameCard.tsx` — one neon card.
- Test files alongside each server/lib unit (`*.test.ts`).

**Modify:**
- `server/app.ts` — import + mount `app.use("/api/games", gamesRoutes)`.
- `src/app/router.tsx` — lazy import + `{ path: "games", element: <GameCenterPage /> }`.
- `src/components/layout/RootLayout.tsx` — add a NAV entry for `/games`.

**Test command:** `npx vitest run <path>` for a single file; `npm run test:unit` for all.

---

## Task 1: Shared types + categories

**Files:**
- Create: `src/lib/games/types.ts`

- [ ] **Step 1: Write the file**

```typescript
// src/lib/games/types.ts
// Shared across client and server so the category list and row shape never drift.

export const CATEGORIES = ["Games", "Tools", "Dashboards", "Other"] as const;
export type Category = (typeof CATEGORIES)[number];

export function isCategory(v: unknown): v is Category {
  return typeof v === "string" && (CATEGORIES as readonly string[]).includes(v);
}

export type GameStatus = "pending" | "approved" | "rejected";

/** A row as stored. Image bytes live in image_data (base64, no data: prefix). */
export interface GameRow {
  id: number;
  title: string;
  description: string;
  url: string;
  category: Category;
  image_mime: string;
  image_data: string;
  submitter_wallet: string;
  status: GameStatus;
  created_at: number;
  reviewed_at: number | null;
  reviewed_by: string | null;
}

/** Public-facing shape (no image bytes; image served via imageUrl). */
export interface GamePublic {
  id: number;
  title: string;
  description: string;
  url: string;
  category: Category;
  imageUrl: string;
  createdAt: number;
}
```

- [ ] **Step 2: Commit**

```bash
git add src/lib/games/types.ts
git commit -m "feat(games): shared category + row types"
```

---

## Task 2: Shared signed-message builders

**Files:**
- Create: `src/lib/games/auth.ts`
- Test: `src/lib/games/auth.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// src/lib/games/auth.test.ts
import { describe, expect, it } from "vitest";
import { submitMessage, adminMessage } from "./auth";

describe("games message builders", () => {
  it("lowercases the wallet and embeds the timestamp", () => {
    expect(submitMessage("0xABC", 123)).toBe(
      "GotchiCloset Game Center — submit\nwallet: 0xabc\nts: 123"
    );
    expect(adminMessage("0xABC", 123)).toBe(
      "GotchiCloset Game Center — admin\nwallet: 0xabc\nts: 123"
    );
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/games/auth.test.ts`
Expected: FAIL — cannot find module `./auth`.

- [ ] **Step 3: Write minimal implementation**

```typescript
// src/lib/games/auth.ts
// Pure builders shared by the client (signs) and server (verifies). The exact string
// must match on both sides or the recovered address won't equal the claimed wallet.
// TTL/freshness is reused from the companion module to avoid a second definition.
export { isSignedAtFresh, PREMIUM_SIG_TTL_MS as SIG_TTL_MS } from "../companion/premiumAuth";

export function submitMessage(wallet: string, signedAt: number): string {
  return `GotchiCloset Game Center — submit\nwallet: ${wallet.toLowerCase()}\nts: ${signedAt}`;
}

export function adminMessage(wallet: string, signedAt: number): string {
  return `GotchiCloset Game Center — admin\nwallet: ${wallet.toLowerCase()}\nts: ${signedAt}`;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/games/auth.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/games/auth.ts src/lib/games/auth.test.ts
git commit -m "feat(games): shared signed-message builders"
```

---

## Task 3: Submission validation (pure)

**Files:**
- Create: `src/lib/games/validate.ts`
- Test: `src/lib/games/validate.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// src/lib/games/validate.test.ts
import { describe, expect, it } from "vitest";
import { validateSubmission } from "./validate";

const ok = {
  title: "My Game",
  description: "A fun gotchi game",
  url: "https://example.com",
  category: "Games",
  imageBase64: "aGVsbG8=", // "hello"
  imageMime: "image/png",
};

describe("validateSubmission", () => {
  it("accepts a well-formed submission", () => {
    expect(validateSubmission(ok)).toEqual({ ok: true });
  });
  it("rejects a non-http url", () => {
    expect(validateSubmission({ ...ok, url: "javascript:alert(1)" }).ok).toBe(false);
  });
  it("rejects an unknown category", () => {
    expect(validateSubmission({ ...ok, category: "Nope" }).ok).toBe(false);
  });
  it("rejects an empty title", () => {
    expect(validateSubmission({ ...ok, title: "" }).ok).toBe(false);
  });
  it("rejects an over-long description", () => {
    expect(validateSubmission({ ...ok, description: "x".repeat(281) }).ok).toBe(false);
  });
  it("rejects a non-image mime", () => {
    expect(validateSubmission({ ...ok, imageMime: "text/html" }).ok).toBe(false);
  });
  it("rejects an oversized image", () => {
    const big = "A".repeat(420_000); // ~315 KB decoded, over the 300 KB cap
    expect(validateSubmission({ ...ok, imageBase64: big }).ok).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/games/validate.test.ts`
Expected: FAIL — cannot find module `./validate`.

- [ ] **Step 3: Write minimal implementation**

```typescript
// src/lib/games/validate.ts
import { isCategory } from "./types";

export interface SubmissionInput {
  title: string;
  description: string;
  url: string;
  category: string;
  imageBase64: string;
  imageMime: string;
}

export type ValidationResult = { ok: true } | { ok: false; error: string };

const MAX_IMAGE_BYTES = 300 * 1024;
const IMAGE_MIMES = new Set(["image/png", "image/jpeg", "image/webp"]);

/** Decoded byte length of a base64 string without allocating a Buffer. */
function base64Bytes(b64: string): number {
  const len = b64.length;
  if (len === 0) return 0;
  const pad = b64.endsWith("==") ? 2 : b64.endsWith("=") ? 1 : 0;
  return Math.floor((len * 3) / 4) - pad;
}

export function validateSubmission(input: SubmissionInput): ValidationResult {
  const title = (input.title ?? "").trim();
  if (title.length < 1 || title.length > 80) return { ok: false, error: "title must be 1–80 chars" };

  const description = (input.description ?? "").trim();
  if (description.length < 1 || description.length > 280) return { ok: false, error: "description must be 1–280 chars" };

  if (!isCategory(input.category)) return { ok: false, error: "invalid category" };

  let parsed: URL;
  try {
    parsed = new URL(input.url);
  } catch {
    return { ok: false, error: "invalid url" };
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return { ok: false, error: "url must be http(s)" };

  if (!IMAGE_MIMES.has(input.imageMime)) return { ok: false, error: "image must be png, jpeg, or webp" };
  if (!input.imageBase64) return { ok: false, error: "image required" };
  if (base64Bytes(input.imageBase64) > MAX_IMAGE_BYTES) return { ok: false, error: "image too large (max 300 KB)" };

  return { ok: true };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/games/validate.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/games/validate.ts src/lib/games/validate.test.ts
git commit -m "feat(games): pure submission validator"
```

---

## Task 4: SQLite store

**Files:**
- Create: `server/games/store.ts`
- Test: `server/games/store.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// server/games/store.test.ts
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { closeDb, insertPending, listApproved, listPending, review, pendingCountForWallet } from "./store";

let tmpDir: string;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "games-test-"));
  process.env.GAMES_DB_PATH = path.join(tmpDir, "games.db");
});

afterEach(() => {
  closeDb();
  delete process.env.GAMES_DB_PATH;
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

const sample = {
  title: "My Game",
  description: "fun",
  url: "https://example.com",
  category: "Games" as const,
  image_mime: "image/png",
  image_data: "aGVsbG8=",
  submitter_wallet: "0xabc",
};

describe("games store", () => {
  it("inserts pending and hides it from the public list", () => {
    insertPending(sample);
    expect(listApproved()).toHaveLength(0);
    expect(listPending()).toHaveLength(1);
  });

  it("approving publishes the entry", () => {
    const id = insertPending(sample);
    review(id, "approved", "0xadmin");
    const pub = listApproved();
    expect(pub).toHaveLength(1);
    expect(pub[0].title).toBe("My Game");
  });

  it("rejecting keeps it out of the public list", () => {
    const id = insertPending(sample);
    review(id, "rejected", "0xadmin");
    expect(listApproved()).toHaveLength(0);
    expect(listPending()).toHaveLength(0);
  });

  it("filters the public list by category", () => {
    review(insertPending(sample), "approved", "0xadmin");
    review(insertPending({ ...sample, title: "T", category: "Tools" }), "approved", "0xadmin");
    expect(listApproved("Games")).toHaveLength(1);
    expect(listApproved("Tools")).toHaveLength(1);
    expect(listApproved()).toHaveLength(2);
  });

  it("counts a wallet's pending rows", () => {
    insertPending(sample);
    insertPending(sample);
    expect(pendingCountForWallet("0xabc")).toBe(2);
    expect(pendingCountForWallet("0xdef")).toBe(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run server/games/store.test.ts`
Expected: FAIL — cannot find module `./store`.

- [ ] **Step 3: Write minimal implementation**

```typescript
// server/games/store.ts
// One table, image bytes inline. DB path mirrors the Pulse fallback so prod lands on
// the writable volume the companion DB lives on.
import Database from "better-sqlite3";
import path from "node:path";
import fs from "node:fs";
import type { Category, GameRow, GamePublic, GameStatus } from "../../src/lib/games/types";

let db: Database.Database | null = null;

function dbPath(): string {
  if (process.env.GAMES_DB_PATH) return process.env.GAMES_DB_PATH;
  if (process.env.COMPANION_DB_PATH) {
    return path.join(path.dirname(process.env.COMPANION_DB_PATH), "games.db");
  }
  return path.resolve("./data/games.db");
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
    CREATE TABLE IF NOT EXISTS games (
      id               INTEGER PRIMARY KEY AUTOINCREMENT,
      title            TEXT NOT NULL,
      description      TEXT NOT NULL,
      url              TEXT NOT NULL,
      category         TEXT NOT NULL,
      image_mime       TEXT NOT NULL,
      image_data       TEXT NOT NULL,
      submitter_wallet TEXT NOT NULL,
      status           TEXT NOT NULL DEFAULT 'pending',
      created_at       INTEGER NOT NULL,
      reviewed_at      INTEGER,
      reviewed_by      TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_games_status_cat ON games(status, category);
  `);
  return db;
}

export interface NewGame {
  title: string;
  description: string;
  url: string;
  category: Category;
  image_mime: string;
  image_data: string;
  submitter_wallet: string;
}

export function insertPending(g: NewGame): number {
  const info = getDb()
    .prepare(
      `INSERT INTO games (title, description, url, category, image_mime, image_data, submitter_wallet, status, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'pending', ?)`
    )
    .run(g.title, g.description, g.url, g.category, g.image_mime, g.image_data, g.submitter_wallet.toLowerCase(), Date.now());
  return Number(info.lastInsertRowid);
}

function toPublic(r: GameRow): GamePublic {
  return {
    id: r.id,
    title: r.title,
    description: r.description,
    url: r.url,
    category: r.category,
    imageUrl: `/api/games/${r.id}/image`,
    createdAt: r.created_at,
  };
}

export function listApproved(category?: Category): GamePublic[] {
  const rows = category
    ? (getDb().prepare(`SELECT * FROM games WHERE status='approved' AND category=? ORDER BY created_at DESC`).all(category) as GameRow[])
    : (getDb().prepare(`SELECT * FROM games WHERE status='approved' ORDER BY created_at DESC`).all() as GameRow[]);
  return rows.map(toPublic);
}

/** Admin view: full pending rows (minus image bytes, served separately). */
export function listPending(): Omit<GameRow, "image_data">[] {
  return getDb()
    .prepare(`SELECT id, title, description, url, category, image_mime, submitter_wallet, status, created_at, reviewed_at, reviewed_by FROM games WHERE status='pending' ORDER BY created_at ASC`)
    .all() as Omit<GameRow, "image_data">[];
}

/** Image bytes for a single row, regardless of status (route decides who may see it). */
export function getImage(id: number): { image_mime: string; image_data: string; status: GameStatus } | null {
  const row = getDb().prepare(`SELECT image_mime, image_data, status FROM games WHERE id=?`).get(id) as
    | { image_mime: string; image_data: string; status: GameStatus }
    | undefined;
  return row ?? null;
}

export function review(id: number, status: Exclude<GameStatus, "pending">, admin: string): void {
  getDb()
    .prepare(`UPDATE games SET status=?, reviewed_at=?, reviewed_by=? WHERE id=?`)
    .run(status, Date.now(), admin.toLowerCase(), id);
}

export function pendingCountForWallet(wallet: string): number {
  const row = getDb()
    .prepare(`SELECT COUNT(*) AS n FROM games WHERE status='pending' AND submitter_wallet=?`)
    .get(wallet.toLowerCase()) as { n: number };
  return row.n;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run server/games/store.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add server/games/store.ts server/games/store.test.ts
git commit -m "feat(games): sqlite store with pending/approved lifecycle"
```

---

## Task 5: Signature verification + admin allowlist

**Files:**
- Create: `server/games/auth.ts`
- Test: `server/games/auth.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// server/games/auth.test.ts
import { afterEach, describe, expect, it } from "vitest";
import { privateKeyToAccount } from "viem/accounts";
import { submitMessage, adminMessage } from "../../src/lib/games/auth";
import { verifySubmitSignature, verifyAdminSignature, isAdmin } from "./auth";

const account = privateKeyToAccount(
  "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80"
);

afterEach(() => {
  delete process.env.GAME_CENTER_ADMINS;
});

describe("verifySubmitSignature", () => {
  it("accepts a fresh signature from the same wallet", async () => {
    const signedAt = Date.now();
    const signature = await account.signMessage({ message: submitMessage(account.address, signedAt) });
    expect(await verifySubmitSignature(account.address, signedAt, signature)).toBe(true);
  });
  it("rejects a stale signature", async () => {
    const signedAt = Date.now() - 48 * 60 * 60 * 1000;
    const signature = await account.signMessage({ message: submitMessage(account.address, signedAt) });
    expect(await verifySubmitSignature(account.address, signedAt, signature)).toBe(false);
  });
});

describe("admin allowlist", () => {
  it("isAdmin is case-insensitive membership in GAME_CENTER_ADMINS", () => {
    process.env.GAME_CENTER_ADMINS = account.address.toLowerCase() + ",0xdead";
    expect(isAdmin(account.address)).toBe(true);
    expect(isAdmin(account.address.toUpperCase())).toBe(true);
    expect(isAdmin("0x0000000000000000000000000000000000000001")).toBe(false);
  });
  it("verifyAdminSignature requires both a valid signature and allowlist membership", async () => {
    const signedAt = Date.now();
    const signature = await account.signMessage({ message: adminMessage(account.address, signedAt) });
    process.env.GAME_CENTER_ADMINS = account.address.toLowerCase();
    expect(await verifyAdminSignature(account.address, signedAt, signature)).toBe(true);
    process.env.GAME_CENTER_ADMINS = "0xdead";
    expect(await verifyAdminSignature(account.address, signedAt, signature)).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run server/games/auth.test.ts`
Expected: FAIL — cannot find module `./auth`.

- [ ] **Step 3: Write minimal implementation**

```typescript
// server/games/auth.ts
import { recoverMessageAddress } from "viem";
import { submitMessage, adminMessage, isSignedAtFresh } from "../../src/lib/games/auth";

async function verify(
  build: (wallet: string, signedAt: number) => string,
  wallet: string,
  signedAt: number,
  signature: string
): Promise<boolean> {
  if (!wallet?.startsWith("0x") || !signature?.startsWith("0x")) return false;
  if (!isSignedAtFresh(signedAt, Date.now())) return false;
  try {
    const recovered = await recoverMessageAddress({
      message: build(wallet, signedAt),
      signature: signature as `0x${string}`,
    });
    return recovered.toLowerCase() === wallet.toLowerCase();
  } catch {
    return false;
  }
}

export function adminAddresses(): Set<string> {
  return new Set(
    (process.env.GAME_CENTER_ADMINS || "")
      .split(",")
      .map((a) => a.trim().toLowerCase())
      .filter(Boolean)
  );
}

export function isAdmin(wallet: string): boolean {
  return adminAddresses().has(wallet.toLowerCase());
}

export function verifySubmitSignature(wallet: string, signedAt: number, signature: string): Promise<boolean> {
  return verify(submitMessage, wallet, signedAt, signature);
}

export async function verifyAdminSignature(wallet: string, signedAt: number, signature: string): Promise<boolean> {
  if (!isAdmin(wallet)) return false;
  return verify(adminMessage, wallet, signedAt, signature);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run server/games/auth.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add server/games/auth.ts server/games/auth.test.ts
git commit -m "feat(games): signature verification + admin allowlist"
```

---

## Task 6: On-chain ownership check

**Files:**
- Create: `server/games/ownership.ts`

Note: this reads Base mainnet, so it is not unit-tested (no anvil in CI). It is a thin, single-responsibility wrapper; the route depends on it and is exercised manually in Task 15's smoke check.

- [ ] **Step 1: Write the implementation**

```typescript
// server/games/ownership.ts
// Sybil gate: a submitter must hold at least one Aavegotchi. ERC-721 balanceOf on the
// Base diamond (same address the Steward reads). Fails closed — callers treat a thrown
// error as "couldn't verify", never as a pass.
import { createPublicClient, http } from "viem";
import { base } from "viem/chains";
import { AAVEGOTCHI_DIAMOND } from "../steward/abi";

const RPC = process.env.STEWARD_RPC_URL || "https://mainnet.base.org";
const client = createPublicClient({ chain: base, transport: http(RPC) });

const erc721Abi = [
  { name: "balanceOf", type: "function", stateMutability: "view", inputs: [{ type: "address" }], outputs: [{ type: "uint256" }] },
] as const;

export async function ownsAavegotchi(wallet: string): Promise<boolean> {
  const bal = (await client.readContract({
    address: AAVEGOTCHI_DIAMOND,
    abi: erc721Abi,
    functionName: "balanceOf",
    args: [wallet as `0x${string}`],
  })) as bigint;
  return bal > 0n;
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: no new errors from this file.

- [ ] **Step 3: Commit**

```bash
git add server/games/ownership.ts
git commit -m "feat(games): on-chain aavegotchi ownership gate"
```

---

## Task 7: Express router

**Files:**
- Create: `server/routes/games.ts`
- Modify: `server/app.ts`

- [ ] **Step 1: Write the router**

```typescript
// server/routes/games.ts
import { Router } from "express";
import { insertPending, listApproved, listPending, review, getImage, pendingCountForWallet } from "../games/store";
import { verifySubmitSignature, verifyAdminSignature, isAdmin } from "../games/auth";
import { ownsAavegotchi } from "../games/ownership";
import { validateSubmission } from "../../src/lib/games/validate";
import { isCategory } from "../../src/lib/games/types";

const router = Router();
const MAX_PENDING_PER_WALLET = 5;

// Public: approved entries (metadata only). Optional ?category= filter.
router.get("/", (req, res) => {
  const cat = req.query.category;
  const category = typeof cat === "string" && isCategory(cat) ? cat : undefined;
  res.setHeader("Cache-Control", "public, max-age=60");
  res.json({ games: listApproved(category) });
});

// Cosmetic helper — the client uses it to decide whether to render the review tab.
router.get("/is-admin", (req, res) => {
  const wallet = String(req.query.wallet || "");
  res.json({ admin: wallet ? isAdmin(wallet) : false });
});

// Image bytes. Approved rows are public; a pending row's image is served only with a
// valid admin signature (so the review queue can preview it).
router.get("/:id/image", async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).end();
  const row = getImage(id);
  if (!row) return res.status(404).end();
  if (row.status !== "approved") {
    const { wallet, signature, signedAt } = req.query;
    const okAdmin = await verifyAdminSignature(String(wallet || ""), Number(signedAt), String(signature || ""));
    if (!okAdmin) return res.status(404).end();
  }
  res.setHeader("Content-Type", row.image_mime);
  res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
  res.send(Buffer.from(row.image_data, "base64"));
});

// Submit a new entry → pending. Gated by signature + on-chain ownership.
router.post("/", async (req, res) => {
  const { title, description, url, category, imageBase64, imageMime, wallet, signature, signedAt } = req.body ?? {};

  if (!(await verifySubmitSignature(String(wallet || ""), Number(signedAt), String(signature || "")))) {
    return res.status(403).json({ error: "invalid signature" });
  }

  const v = validateSubmission({ title, description, url, category, imageBase64, imageMime });
  if (!v.ok) return res.status(400).json({ error: v.error });

  if (pendingCountForWallet(wallet) >= MAX_PENDING_PER_WALLET) {
    return res.status(429).json({ error: "you already have 5 submissions awaiting review" });
  }

  let owns: boolean;
  try {
    owns = await ownsAavegotchi(wallet);
  } catch {
    return res.status(503).json({ error: "couldn't verify Aavegotchi ownership, try again" });
  }
  if (!owns) return res.status(403).json({ error: "you must own at least one Aavegotchi to submit" });

  const id = insertPending({ title: title.trim(), description: description.trim(), url, category, image_mime: imageMime, image_data: imageBase64, submitter_wallet: wallet });
  res.json({ ok: true, id });
});

// Admin: list pending queue.
router.get("/pending", async (req, res) => {
  const { wallet, signature, signedAt } = req.query;
  if (!(await verifyAdminSignature(String(wallet || ""), Number(signedAt), String(signature || "")))) {
    return res.status(403).json({ error: "not authorized" });
  }
  res.json({ games: listPending() });
});

// Admin: approve or reject.
router.post("/:id/review", async (req, res) => {
  const id = Number(req.params.id);
  const { action, wallet, signature, signedAt } = req.body ?? {};
  if (!Number.isInteger(id)) return res.status(400).json({ error: "bad id" });
  if (action !== "approve" && action !== "reject") return res.status(400).json({ error: "bad action" });
  if (!(await verifyAdminSignature(String(wallet || ""), Number(signedAt), String(signature || "")))) {
    return res.status(403).json({ error: "not authorized" });
  }
  review(id, action === "approve" ? "approved" : "rejected", wallet);
  res.json({ ok: true });
});

export default router;
```

- [ ] **Step 2: Mount the router in `server/app.ts`**

Add near the other route imports (after the `pulseRoutes` import):

```typescript
import gamesRoutes from "./routes/games";
```

Add near the other `app.use(...)` mounts (after `app.use("/api/pulse", pulseRoutes);`):

```typescript
app.use("/api/games", gamesRoutes);
```

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 4: Commit**

```bash
git add server/routes/games.ts server/app.ts
git commit -m "feat(games): express router + mount"
```

---

## Task 8: Client image downscale helper

**Files:**
- Create: `src/lib/games/image.ts`

Note: canvas isn't available in the vitest node env, so this DOM helper is verified in the browser during Task 15's manual check rather than unit-tested.

- [ ] **Step 1: Write the implementation**

```typescript
// src/lib/games/image.ts
// Downscale a picked file to a small webp/jpeg so it fits the 300 KB store cap and the
// JSON body limit. Returns base64 (no data: prefix) + the chosen mime.
const MAX_EDGE = 512;

export interface DownscaledImage { base64: string; mime: string }

export async function downscaleImageFile(file: File): Promise<DownscaledImage> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));
  const w = Math.round(bitmap.width * scale);
  const h = Math.round(bitmap.height * scale);
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("canvas unsupported");
  ctx.drawImage(bitmap, 0, 0, w, h);

  const mime = "image/webp";
  const dataUrl = canvas.toDataURL(mime, 0.85);
  return { base64: dataUrl.split(",")[1] ?? "", mime };
}
```

- [ ] **Step 2: Typecheck + commit**

```bash
npx tsc --noEmit
git add src/lib/games/image.ts
git commit -m "feat(games): client image downscale helper"
```

---

## Task 9: Client API wrappers

**Files:**
- Create: `src/lib/games/api.ts`

- [ ] **Step 1: Write the implementation**

```typescript
// src/lib/games/api.ts
import { env } from "@/lib/env";
import type { Category, GamePublic } from "./types";

const base = () => env.companionApiUrl || "";

export interface PendingGame {
  id: number; title: string; description: string; url: string;
  category: Category; image_mime: string; submitter_wallet: string; created_at: number;
}
export interface Sig { wallet: string; signature: string; signedAt: number }

export async function listGames(category?: Category): Promise<GamePublic[]> {
  const q = category ? `?category=${encodeURIComponent(category)}` : "";
  const r = await fetch(`${base()}/api/games${q}`);
  if (!r.ok) throw new Error("failed to load games");
  return (await r.json()).games;
}

export async function checkAdmin(wallet: string): Promise<boolean> {
  const r = await fetch(`${base()}/api/games/is-admin?wallet=${wallet}`);
  if (!r.ok) return false;
  return (await r.json()).admin === true;
}

export interface SubmitBody extends Sig {
  title: string; description: string; url: string; category: Category;
  imageBase64: string; imageMime: string;
}
export async function submitGame(body: SubmitBody): Promise<void> {
  const r = await fetch(`${base()}/api/games`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || "submit failed");
}

export async function listPending(sig: Sig): Promise<PendingGame[]> {
  const q = `?wallet=${sig.wallet}&signature=${sig.signature}&signedAt=${sig.signedAt}`;
  const r = await fetch(`${base()}/api/games/pending${q}`);
  if (!r.ok) throw new Error("failed to load pending");
  return (await r.json()).games;
}

export function pendingImageUrl(id: number, sig: Sig): string {
  return `${base()}/api/games/${id}/image?wallet=${sig.wallet}&signature=${sig.signature}&signedAt=${sig.signedAt}`;
}
export function approvedImageUrl(id: number): string {
  return `${base()}/api/games/${id}/image`;
}

export async function reviewGame(id: number, action: "approve" | "reject", sig: Sig): Promise<void> {
  const r = await fetch(`${base()}/api/games/${id}/review`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action, ...sig }),
  });
  if (!r.ok) throw new Error("review failed");
}
```

- [ ] **Step 2: Typecheck + commit**

```bash
npx tsc --noEmit
git add src/lib/games/api.ts
git commit -m "feat(games): client api wrappers"
```

---

## Task 10: Client-side diamond constant

**Files:**
- Create: `src/lib/games/constants.ts`

- [ ] **Step 1: Write the file**

```typescript
// src/lib/games/constants.ts
// Same Base diamond the server checks. Kept client-side for the live ownership read
// that drives the submit form's warning.
export const AAVEGOTCHI_DIAMOND = "0xA99c4B08201F2913Db8D28e71d020c4298F29dBF" as const;
```

- [ ] **Step 2: Commit**

```bash
git add src/lib/games/constants.ts
git commit -m "feat(games): client diamond constant"
```

---

## Task 11: Game card component

**Files:**
- Create: `src/components/games/GameCard.tsx`

- [ ] **Step 1: Write the component**

```tsx
// src/components/games/GameCard.tsx
import type { GamePublic } from "@/lib/games/types";
import { approvedImageUrl } from "@/lib/games/api";

const CHIP: Record<string, string> = {
  Games: "bg-fuchsia-500/15 text-fuchsia-300 border-fuchsia-500/40",
  Tools: "bg-cyan-500/15 text-cyan-300 border-cyan-500/40",
  Dashboards: "bg-emerald-500/15 text-emerald-300 border-emerald-500/40",
  Other: "bg-muted/40 text-muted-foreground border-border/40",
};

export function GameCard({ game }: { game: GamePublic }) {
  return (
    <a
      href={game.url}
      target="_blank"
      rel="noopener noreferrer"
      className="group relative overflow-hidden rounded-2xl border border-white/10 bg-gradient-to-b from-muted/10 to-muted/30 ring-1 ring-primary/5 transition-shadow hover:shadow-[0_0_24px_rgba(217,70,239,0.25)]"
    >
      <div className="absolute -top-16 -right-16 w-40 h-40 rounded-full blur-3xl pointer-events-none bg-fuchsia-500/20 opacity-0 group-hover:opacity-100 transition-opacity" />
      <div className="aspect-video w-full overflow-hidden bg-black/30">
        <img src={approvedImageUrl(game.id)} alt={game.title} loading="lazy" className="w-full h-full object-cover" />
      </div>
      <div className="p-4">
        <div className="flex items-center justify-between gap-2">
          <h3 className="font-semibold truncate">{game.title}</h3>
          <span className={`px-2 py-0.5 rounded-full border text-[10px] font-semibold uppercase tracking-wide ${CHIP[game.category] ?? CHIP.Other}`}>
            {game.category}
          </span>
        </div>
        <p className="mt-1 text-sm text-muted-foreground line-clamp-2">{game.description}</p>
        <span className="mt-3 inline-block text-xs text-primary group-hover:underline">Open ↗</span>
      </div>
    </a>
  );
}
```

- [ ] **Step 2: Typecheck + commit**

```bash
npx tsc --noEmit
git add src/components/games/GameCard.tsx
git commit -m "feat(games): neon game card"
```

---

## Task 12: Submit dialog (wallet-gated, live ownership warning)

**Files:**
- Create: `src/components/games/SubmitGameDialog.tsx`

- [ ] **Step 1: Write the component**

```tsx
// src/components/games/SubmitGameDialog.tsx
import { useState } from "react";
import { useAccount, useReadContract, useSignMessage } from "wagmi";
import { CATEGORIES, type Category } from "@/lib/games/types";
import { submitMessage } from "@/lib/games/auth";
import { downscaleImageFile } from "@/lib/games/image";
import { submitGame } from "@/lib/games/api";
import { AAVEGOTCHI_DIAMOND } from "@/lib/games/constants";
import { Button } from "@/ui/button";
import { Input } from "@/ui/input";
import { useToast } from "@/ui/use-toast";

const erc721Abi = [
  { name: "balanceOf", type: "function", stateMutability: "view", inputs: [{ type: "address" }], outputs: [{ type: "uint256" }] },
] as const;

export function SubmitGameDialog({ onClose, onSubmitted }: { onClose: () => void; onSubmitted: () => void }) {
  const { address, isConnected } = useAccount();
  const { signMessageAsync } = useSignMessage();
  const { toast } = useToast();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [url, setUrl] = useState("");
  const [category, setCategory] = useState<Category>("Games");
  const [image, setImage] = useState<{ base64: string; mime: string } | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const { data: balance } = useReadContract({
    address: AAVEGOTCHI_DIAMOND, abi: erc721Abi, functionName: "balanceOf",
    args: address ? [address] : undefined,
    query: { enabled: !!address },
  });
  const ownsGotchi = typeof balance === "bigint" && balance > 0n;

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const img = await downscaleImageFile(file);
    setImage(img);
    setPreview(`data:${img.mime};base64,${img.base64}`);
  }

  async function submit() {
    if (!address || !image) return;
    setBusy(true);
    try {
      const signedAt = Date.now();
      const signature = await signMessageAsync({ message: submitMessage(address, signedAt) });
      await submitGame({ title, description, url, category, imageBase64: image.base64, imageMime: image.mime, wallet: address, signature, signedAt });
      toast({ title: "Submitted!", description: "Your entry is awaiting review." });
      onSubmitted();
      onClose();
    } catch (err) {
      toast({ title: "Submission failed", description: (err as Error).message, variant: "destructive" });
    } finally {
      setBusy(false);
    }
  }

  const canSubmit = isConnected && ownsGotchi && !!image && !!title.trim() && !!description.trim() && !!url.trim() && !busy;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div className="w-full max-w-lg rounded-2xl border border-white/10 bg-background p-6" onClick={(e) => e.stopPropagation()}>
        <h2 className="text-lg font-semibold">Submit to the Game Center</h2>
        <p className="mt-1 text-sm text-muted-foreground">You must own at least one Aavegotchi. Entries are reviewed before going live.</p>

        {!isConnected && <p className="mt-3 rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-sm text-amber-300">Connect your wallet to submit.</p>}
        {isConnected && !ownsGotchi && <p className="mt-3 rounded-lg border border-red-500/40 bg-red-500/10 p-3 text-sm text-red-300">You need at least one Aavegotchi to submit.</p>}

        <div className="mt-4 space-y-3">
          <Input placeholder="Title" value={title} maxLength={80} onChange={(e) => setTitle(e.target.value)} />
          <Input placeholder="Short description" value={description} maxLength={280} onChange={(e) => setDescription(e.target.value)} />
          <Input placeholder="https://…" value={url} onChange={(e) => setUrl(e.target.value)} />
          <select className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm" value={category} onChange={(e) => setCategory(e.target.value as Category)}>
            {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
          <input type="file" accept="image/*" onChange={onFile} className="text-sm" />
          {preview && <img src={preview} alt="preview" className="rounded-lg max-h-40 object-contain" />}
        </div>

        <div className="mt-5 flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button disabled={!canSubmit} onClick={submit}>{busy ? "Submitting…" : "Submit"}</Button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Typecheck + commit**

```bash
npx tsc --noEmit
git add src/components/games/SubmitGameDialog.tsx
git commit -m "feat(games): submit dialog with live ownership warning"
```

---

## Task 13: Admin review tab

**Files:**
- Create: `src/components/games/AdminReviewTab.tsx`

- [ ] **Step 1: Write the component**

```tsx
// src/components/games/AdminReviewTab.tsx
import { useCallback, useEffect, useState } from "react";
import { useAccount, useSignMessage } from "wagmi";
import { adminMessage } from "@/lib/games/auth";
import { listPending, reviewGame, pendingImageUrl, type PendingGame, type Sig } from "@/lib/games/api";
import { Button } from "@/ui/button";
import { useToast } from "@/ui/use-toast";

export function AdminReviewTab({ onChanged }: { onChanged: () => void }) {
  const { address } = useAccount();
  const { signMessageAsync } = useSignMessage();
  const { toast } = useToast();
  const [items, setItems] = useState<PendingGame[]>([]);
  const [sig, setSig] = useState<Sig | null>(null);

  const authAndLoad = useCallback(async () => {
    if (!address) return;
    const signedAt = Date.now();
    const signature = await signMessageAsync({ message: adminMessage(address, signedAt) });
    const s = { wallet: address, signature, signedAt };
    setSig(s);
    setItems(await listPending(s));
  }, [address, signMessageAsync]);

  useEffect(() => { authAndLoad().catch(() => toast({ title: "Could not authorize", variant: "destructive" })); }, [authAndLoad, toast]);

  async function act(id: number, action: "approve" | "reject") {
    if (!sig) return;
    await reviewGame(id, action, sig);
    setItems((xs) => xs.filter((x) => x.id !== id));
    onChanged();
  }

  if (!items.length) return <p className="text-sm text-muted-foreground">No submissions awaiting review.</p>;

  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {items.map((g) => (
        <div key={g.id} className="rounded-xl border border-white/10 p-4">
          {sig && <img src={pendingImageUrl(g.id, sig)} alt={g.title} className="rounded-lg aspect-video w-full object-cover bg-black/30" />}
          <div className="mt-2 font-semibold">{g.title} <span className="text-xs text-muted-foreground">({g.category})</span></div>
          <p className="text-sm text-muted-foreground line-clamp-2">{g.description}</p>
          <a href={g.url} target="_blank" rel="noopener noreferrer" className="text-xs text-primary break-all">{g.url}</a>
          <div className="mt-3 flex gap-2">
            <Button size="sm" onClick={() => act(g.id, "approve")}>Approve</Button>
            <Button size="sm" variant="ghost" onClick={() => act(g.id, "reject")}>Reject</Button>
          </div>
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 2: Typecheck + commit**

```bash
npx tsc --noEmit
git add src/components/games/AdminReviewTab.tsx
git commit -m "feat(games): admin review tab"
```

---

## Task 14: The page + route + nav

**Files:**
- Create: `src/pages/GameCenterPage.tsx`
- Modify: `src/app/router.tsx`
- Modify: `src/components/layout/RootLayout.tsx`

- [ ] **Step 1: Write the page**

```tsx
// src/pages/GameCenterPage.tsx
import { useCallback, useEffect, useState } from "react";
import { useAccount } from "wagmi";
import { CATEGORIES, type Category, type GamePublic } from "@/lib/games/types";
import { listGames, checkAdmin } from "@/lib/games/api";
import { GameCard } from "@/components/games/GameCard";
import { SubmitGameDialog } from "@/components/games/SubmitGameDialog";
import { AdminReviewTab } from "@/components/games/AdminReviewTab";
import { Button } from "@/ui/button";

type Filter = "All" | Category;
type View = "browse" | "review";

export default function GameCenterPage() {
  const { address } = useAccount();
  const [games, setGames] = useState<GamePublic[]>([]);
  const [filter, setFilter] = useState<Filter>("All");
  const [showSubmit, setShowSubmit] = useState(false);
  const [admin, setAdmin] = useState(false);
  const [view, setView] = useState<View>("browse");

  const load = useCallback(() => {
    listGames(filter === "All" ? undefined : filter).then(setGames).catch(() => setGames([]));
  }, [filter]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { if (address) checkAdmin(address).then(setAdmin); else setAdmin(false); }, [address]);

  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Game Center</h1>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            A community directory of Aavegotchi games, tools, and dashboards. Anyone who owns an Aavegotchi can submit —
            each entry is reviewed before it goes live. Connect your wallet, hit Submit, and add yours.
          </p>
        </div>
        <Button onClick={() => setShowSubmit(true)}>Submit</Button>
      </div>

      {admin && (
        <div className="mt-6 flex gap-2">
          <Button size="sm" variant={view === "browse" ? "default" : "ghost"} onClick={() => setView("browse")}>Browse</Button>
          <Button size="sm" variant={view === "review" ? "default" : "ghost"} onClick={() => setView("review")}>Pending review</Button>
        </div>
      )}

      {view === "review" && admin ? (
        <div className="mt-6"><AdminReviewTab onChanged={load} /></div>
      ) : (
        <>
          <div className="mt-6 flex flex-wrap gap-2">
            {(["All", ...CATEGORIES] as Filter[]).map((c) => (
              <button
                key={c}
                onClick={() => setFilter(c)}
                className={`rounded-full border px-3 py-1 text-sm ${filter === c ? "border-primary bg-primary/15 text-primary" : "border-border/40 text-muted-foreground hover:text-foreground"}`}
              >
                {c}
              </button>
            ))}
          </div>

          {games.length === 0 ? (
            <p className="mt-10 text-center text-sm text-muted-foreground">Nothing here yet — be the first to submit.</p>
          ) : (
            <div className="mt-6 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {games.map((g) => <GameCard key={g.id} game={g} />)}
            </div>
          )}
        </>
      )}

      {showSubmit && <SubmitGameDialog onClose={() => setShowSubmit(false)} onSubmitted={load} />}
    </div>
  );
}
```

- [ ] **Step 2: Add the lazy import + route in `src/app/router.tsx`**

Add with the other `lazy(...)` declarations:

```typescript
const GameCenterPage = lazy(() => import("@/pages/GameCenterPage"));
```

Add inside the `children` array (near the `pulse` route):

```typescript
      { path: "games", element: <GameCenterPage /> },
```

- [ ] **Step 3: Add the nav entry in `src/components/layout/RootLayout.tsx`**

Add `Gamepad2` to the existing `lucide-react` import, then add to the `NAV` array (after the `/pulse` entry):

```typescript
  { to: "/games", title: "Game Center — community games & tools", icon: Gamepad2 },
```

- [ ] **Step 4: Typecheck**

Run: `npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 5: Commit**

```bash
git add src/pages/GameCenterPage.tsx src/app/router.tsx src/components/layout/RootLayout.tsx
git commit -m "feat(games): page, route, and nav link"
```

---

## Task 15: Full verification

- [ ] **Step 1: Run the whole games test suite**

Run: `npx vitest run server/games src/lib/games`
Expected: all PASS.

- [ ] **Step 2: Typecheck the whole project**

Run: `npx tsc --noEmit`
Expected: clean.

- [ ] **Step 3: Manual smoke (dev server)**

Set `GAME_CENTER_ADMINS` in the server env to the two admin addresses (lowercased):
```
GAME_CENTER_ADMINS=0xc4cb6cb969e8b4e309ab98e4da51b77887afad96,0xe0d4f8f6f04a42aed5a7ea4f68bc612e6a54a3c2
```
Start the app, visit `/games`:
- Grid loads (empty initially).
- Submit with a non-owner wallet → blocked with the ownership warning.
- Submit with an owner wallet → success toast; entry not visible publicly.
- Connect an admin wallet → "Pending review" tab appears; approve → entry shows in the grid; reject → stays hidden.

- [ ] **Step 4: Add the env var to deploy config**

Document `GAME_CENTER_ADMINS` in the deploy env (VPS `.env`) alongside `COMPANION_DB_PATH` so the store lands on the writable volume and the allowlist is set in prod.

---

## Self-Review Notes

- **Spec coverage:** categories (Task 1), shared signed messages (Task 2), validation incl. url/image/size (Task 3), store lifecycle + pending cap + category filter (Task 4), signature + admin allowlist (Task 5), on-chain gate fail-closed (Task 6), all six endpoints incl. `/is-admin` and admin image preview (Task 7), client downscale (Task 8), api wrappers (Task 9), client constant (Task 10), neon card (Task 11), submit form with live warning + instructions (Task 12, 14), inline admin review (Task 13–14), page/route/nav (Task 14). All spec sections map to a task.
- **Type consistency:** `Category`/`GamePublic`/`GameRow` defined in Task 1 and reused verbatim; `Sig`/`PendingGame` defined in Task 9 and imported by Tasks 12–13; `AAVEGOTCHI_DIAMOND` server-side from `steward/abi` (Task 6), client-side constant (Task 10, used Task 12).
- **Fail-closed gate:** ownership read errors return 503, never an implicit pass (Task 7).
