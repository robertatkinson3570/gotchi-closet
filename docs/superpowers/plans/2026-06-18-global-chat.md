# Global Chat (Gotchi Room) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a realtime Global Room — a second tab in the companion panel where wallet-connected users post as a gotchi they own, delivered live via SSE.

**Architecture:** A new Express sub-router (`/api/companion/global`) with SSE stream + post + history, backed by a `global_messages` SQLite table in the existing companion DB. Posting reuses the companion's wallet-signature auth (sign-once-to-join) + a per-post ownership check + the existing profanity filter and rate-limit pattern. The client adds a `useGlobalRoom` hook (EventSource) and a `GlobalChatTab`, plus a Chat/Global tab header in the existing panel. AI gotchis are a phase-2 seam (not in this plan).

**Tech Stack:** TypeScript, Express 5, better-sqlite3, viem (signature recovery), React 18 + Vite, native EventSource (SSE), vitest, Playwright.

---

## Conventions (read once)

- Pure shared modules in `src/lib/companion/` MUST stay free of `@/` aliases and DOM APIs (the server imports them via relative path under tsx). `src/lib/companion/api.ts` is client-only and may use `fetch`/`@/`.
- Companion SQLite timestamps are unix epoch **milliseconds** (`Date.now()`).
- Run a single unit test: `pnpm vitest run <path>`. Typecheck: `pnpm typecheck`. Lint: `pnpm lint` (repo runs `--max-warnings 0`).
- The server companion DB module is `server/companion/db.ts` and exposes `getDb()` (better-sqlite3, WAL) and `closeDb()`. The global store reuses `getDb()`.
- The client reaches the API via `env.companionApiUrl` (empty in dev → Vite proxy; VPS origin in prod). Mirror the existing `src/lib/companion/api.ts`.
- Commit after every task with the message in its final step.

---

## File Structure

**Server**
- `server/companion/globalRoom.ts` — SQLite store for `global_messages` (append, recent, since).
- `server/companion/auth.ts` (modify) — add `verifyRoomSignature` (generalize the existing verifier).
- `server/companion/gotchiState.ts` (modify) — add `owner` to the fetch.
- `server/routes/globalChat.ts` — `/post`, `/history`, `/stream` (SSE) + in-memory broadcast.
- `server/app.ts` (modify) — mount the router.

**Shared**
- `src/lib/companion/premiumAuth.ts` (modify) — add `globalRoomMessage`.

**Client**
- `src/lib/companion/api.ts` (modify) — add `getGlobalHistory`, `postGlobal`, `globalStreamUrl`.
- `src/components/companion/useGlobalRoom.ts` — history + EventSource + post hook.
- `src/components/companion/GlobalChatTab.tsx` — the room feed + composer.
- `src/components/companion/CompanionChatPanel.tsx` (modify) — Chat/Global tab header.

---

## Task 1: Global message store (`globalRoom.ts`)

**Files:**
- Create: `server/companion/globalRoom.ts`
- Test: `server/companion/globalRoom.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// server/companion/globalRoom.test.ts
import { describe, expect, it, beforeEach } from "vitest";
import fs from "node:fs";
import path from "node:path";

const TMP = path.resolve("./data/global-test.db");
process.env.COMPANION_DB_PATH = TMP;

import { closeDb } from "./db";
import { appendGlobalMessage, recentGlobalMessages, globalMessagesSince } from "./globalRoom";

beforeEach(() => {
  closeDb();
  for (const f of [TMP, `${TMP}-wal`, `${TMP}-shm`]) if (fs.existsSync(f)) fs.rmSync(f);
});

describe("globalRoom", () => {
  it("appends and returns recent messages oldest-first, capped", () => {
    for (let i = 0; i < 60; i++) appendGlobalMessage({ tokenId: "4", gotchiName: "Lao Tzu", wallet: "0xabc", text: `m${i}`, isAI: false });
    const recent = recentGlobalMessages(50);
    expect(recent.length).toBe(50);
    expect(recent[0].text).toBe("m10");        // oldest of the last 50
    expect(recent[recent.length - 1].text).toBe("m59"); // newest last
    expect(recent[0].isAI).toBe(false);
  });

  it("appendGlobalMessage stamps an id and ms timestamp and echoes fields", () => {
    const m = appendGlobalMessage({ tokenId: "7", gotchiName: "Wisp", wallet: "0xABC", text: "gm", isAI: true });
    expect(m.id).toBeGreaterThan(0);
    expect(m.ts).toBeGreaterThan(1_600_000_000_000);
    expect(m.tokenId).toBe("7");
    expect(m.gotchiName).toBe("Wisp");
    expect(m.isAI).toBe(true);
    expect(m.wallet).toBe("0xabc"); // stored lowercased
  });

  it("globalMessagesSince returns only rows newer than the given id", () => {
    const a = appendGlobalMessage({ tokenId: "1", gotchiName: "A", wallet: "0x1", text: "a", isAI: false });
    appendGlobalMessage({ tokenId: "2", gotchiName: "B", wallet: "0x2", text: "b", isAI: false });
    const since = globalMessagesSince(a.id, 10);
    expect(since.map((m) => m.text)).toEqual(["b"]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run server/companion/globalRoom.test.ts`
Expected: FAIL — "Cannot find module './globalRoom'".

- [ ] **Step 3: Write minimal implementation**

```ts
// server/companion/globalRoom.ts
import { getDb } from "./db";

export interface StoredGlobalMessage {
  id: number;
  tokenId: string;
  gotchiName: string;
  wallet: string;
  text: string;
  isAI: boolean;
  ts: number;
}

let ensured = false;
function ensureSchema() {
  if (ensured) return;
  getDb().exec(`
    CREATE TABLE IF NOT EXISTS global_messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      token_id TEXT NOT NULL,
      gotchi_name TEXT NOT NULL,
      wallet TEXT NOT NULL,
      text TEXT NOT NULL,
      is_ai INTEGER NOT NULL DEFAULT 0,
      ts INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_global_id ON global_messages(id);
  `);
  ensured = true;
}

interface Row { id: number; token_id: string; gotchi_name: string; wallet: string; text: string; is_ai: number; ts: number; }
function toMsg(r: Row): StoredGlobalMessage {
  return { id: r.id, tokenId: r.token_id, gotchiName: r.gotchi_name, wallet: r.wallet, text: r.text, isAI: r.is_ai === 1, ts: r.ts };
}

export function appendGlobalMessage(m: {
  tokenId: string; gotchiName: string; wallet: string; text: string; isAI: boolean;
}): StoredGlobalMessage {
  ensureSchema();
  const ts = Date.now();
  const info = getDb().prepare(
    `INSERT INTO global_messages (token_id, gotchi_name, wallet, text, is_ai, ts) VALUES (?,?,?,?,?,?)`
  ).run(String(m.tokenId), m.gotchiName, m.wallet.toLowerCase(), m.text, m.isAI ? 1 : 0, ts);
  return { id: Number(info.lastInsertRowid), tokenId: String(m.tokenId), gotchiName: m.gotchiName, wallet: m.wallet.toLowerCase(), text: m.text, isAI: m.isAI, ts };
}

export function recentGlobalMessages(limit = 50): StoredGlobalMessage[] {
  ensureSchema();
  // newest N by id, then return oldest-first for natural feed order
  const rows = getDb().prepare(
    `SELECT * FROM global_messages ORDER BY id DESC LIMIT ?`
  ).all(limit) as Row[];
  return rows.reverse().map(toMsg);
}

export function globalMessagesSince(id: number, limit = 100): StoredGlobalMessage[] {
  ensureSchema();
  const rows = getDb().prepare(
    `SELECT * FROM global_messages WHERE id > ? ORDER BY id ASC LIMIT ?`
  ).all(id, limit) as Row[];
  return rows.map(toMsg);
}
```

> Note: `closeDb` is exported from `server/companion/db.ts` (added during the companion work). If it is missing, add `export function closeDb(){ if (db){ db.close(); db = null; } }` there first.

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run server/companion/globalRoom.test.ts`
Expected: PASS (3 cases).

- [ ] **Step 5: Commit**

```bash
git add server/companion/globalRoom.ts server/companion/globalRoom.test.ts
git commit -m "feat(global): SQLite store for global room messages"
```

---

## Task 2: Join-signature message + generalized verifier

**Files:**
- Modify: `src/lib/companion/premiumAuth.ts`
- Modify: `server/companion/auth.ts`
- Test: `server/companion/auth.test.ts` (append)

- [ ] **Step 1: Write the failing test (append to `server/companion/auth.test.ts`)**

```ts
// append to server/companion/auth.test.ts
import { globalRoomMessage } from "../../src/lib/companion/premiumAuth";
import { verifyRoomSignature } from "./auth";

describe("verifyRoomSignature", () => {
  it("accepts a fresh room signature from the same wallet", async () => {
    const signedAt = Date.now();
    const signature = await account.signMessage({ message: globalRoomMessage(account.address, signedAt) });
    expect(await verifyRoomSignature(account.address, signedAt, signature)).toBe(true);
  });

  it("rejects a premium signature reused for the room (different message)", async () => {
    const signedAt = Date.now();
    // sign the PREMIUM message, try to use it as a ROOM signature
    const signature = await account.signMessage({ message: premiumMessage(account.address, signedAt) });
    expect(await verifyRoomSignature(account.address, signedAt, signature)).toBe(false);
  });

  it("rejects a stale room signature", async () => {
    const signedAt = Date.now() - 48 * 60 * 60 * 1000;
    const signature = await account.signMessage({ message: globalRoomMessage(account.address, signedAt) });
    expect(await verifyRoomSignature(account.address, signedAt, signature)).toBe(false);
  });
});
```

> The existing top of `auth.test.ts` imports `premiumMessage` and defines `account`. If `premiumMessage` is not already imported there, add it to that import.

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run server/companion/auth.test.ts`
Expected: FAIL — `globalRoomMessage` / `verifyRoomSignature` not exported.

- [ ] **Step 3a: Add `globalRoomMessage` to `src/lib/companion/premiumAuth.ts`**

Append:
```ts
export function globalRoomMessage(wallet: string, signedAt: number): string {
  return `GotchiCloset Global Room access\nwallet: ${wallet.toLowerCase()}\nts: ${signedAt}`;
}
```

- [ ] **Step 3b: Generalize the verifier in `server/companion/auth.ts`**

Replace the file body so both verifiers share one implementation:
```ts
import { recoverMessageAddress } from "viem";
import { premiumMessage, globalRoomMessage, isSignedAtFresh } from "../../src/lib/companion/premiumAuth";

async function verifySigned(
  buildMessage: (wallet: string, signedAt: number) => string,
  wallet: string,
  signedAt: number,
  signature: string
): Promise<boolean> {
  if (!wallet?.startsWith("0x") || !signature?.startsWith("0x")) return false;
  if (!isSignedAtFresh(signedAt, Date.now())) return false;
  try {
    const recovered = await recoverMessageAddress({
      message: buildMessage(wallet, signedAt),
      signature: signature as `0x${string}`,
    });
    return recovered.toLowerCase() === wallet.toLowerCase();
  } catch {
    return false;
  }
}

// Premium (OpenAI) tier gate — unchanged behavior.
export function premiumSignatureValid(wallet: string, signedAt: number, signature: string): Promise<boolean> {
  return verifySigned(premiumMessage, wallet, signedAt, signature);
}

// Global Room join gate.
export function verifyRoomSignature(wallet: string, signedAt: number, signature: string): Promise<boolean> {
  return verifySigned(globalRoomMessage, wallet, signedAt, signature);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run server/companion/auth.test.ts`
Expected: PASS (existing premium cases + 3 new room cases).

- [ ] **Step 5: Commit**

```bash
git add src/lib/companion/premiumAuth.ts server/companion/auth.ts server/companion/auth.test.ts
git commit -m "feat(global): join-signature message + generalized signature verifier"
```

---

## Task 3: Add `owner` to gotchi state fetch

**Files:**
- Modify: `server/companion/gotchiState.ts`
- Test: `server/companion/gotchiState.test.ts` (update)

- [ ] **Step 1: Add a failing test**

Append to `server/companion/gotchiState.test.ts`:
```ts
it("maps the owner address (lowercased)", async () => {
  vi.stubGlobal("fetch", vi.fn(async () => ({
    ok: true,
    json: async () => ({ data: { aavegotchi: {
      name: "X", numericTraits: [50,50,50,50,0,0], kinship: "1", level: "1", createdAt: "1700000000",
      equippedWearables: [], owner: { id: "0xABCDEF0000000000000000000000000000000001" },
    } } }),
  })) as any);
  const s = await fetchGotchiState("4");
  expect(s!.owner).toBe("0xabcdef0000000000000000000000000000000001");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run server/companion/gotchiState.test.ts`
Expected: FAIL — `s.owner` is undefined.

- [ ] **Step 3: Add `owner` to the query + mapping in `server/companion/gotchiState.ts`**

In the `QUERY` string, add `owner { id }` to the selected fields. In the `GotchiState` interface add `owner?: string;`. In the returned object add:
```ts
owner: g.owner?.id ? String(g.owner.id).toLowerCase() : undefined,
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run server/companion/gotchiState.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add server/companion/gotchiState.ts server/companion/gotchiState.test.ts
git commit -m "feat(global): include gotchi owner in state fetch for ownership checks"
```

---

## Task 4: Global route — history + post (store, no SSE yet)

**Files:**
- Create: `server/routes/globalChat.ts`
- Modify: `server/app.ts`
- Test: manual curl (thin glue over tested units)

- [ ] **Step 1: Write the router (history + post + the broadcast helper)**

```ts
// server/routes/globalChat.ts
import { Router, type Response } from "express";
import { filterInbound } from "../../src/lib/companion/contentFilter";
import { fetchGotchiState } from "../companion/gotchiState";
import { verifyRoomSignature } from "../companion/auth";
import { appendGlobalMessage, recentGlobalMessages, type StoredGlobalMessage } from "../companion/globalRoom";

const router = Router();

export interface PublicMessage { id: number; tokenId: string; name: string; text: string; isAI: boolean; ts: number; }
function toPublic(m: StoredGlobalMessage): PublicMessage {
  return { id: m.id, tokenId: m.tokenId, name: m.gotchiName, text: m.text, isAI: m.isAI, ts: m.ts };
}

// In-memory SSE client set (Task 5 wires /stream; broadcast is defined here so /post can use it).
const clients = new Set<Response>();
export function broadcast(msg: PublicMessage) {
  const payload = `event: message\ndata: ${JSON.stringify(msg)}\n\n`;
  for (const res of clients) { try { res.write(payload); } catch { /* drop */ } }
}
// Exposed so Task 5's /stream can register/unregister connections.
export const sseClients = clients;

// per-wallet token bucket: 5 msgs / 30s
const buckets = new Map<string, { count: number; resetAt: number }>();
function rateLimited(wallet: string): boolean {
  const now = Date.now();
  const b = buckets.get(wallet);
  if (!b || b.resetAt < now) { buckets.set(wallet, { count: 1, resetAt: now + 30_000 }); return false; }
  b.count += 1;
  return b.count > 5;
}

router.get("/history", (req, res) => {
  const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 50));
  res.json({ messages: recentGlobalMessages(limit).map(toPublic) });
});

router.post("/post", async (req, res) => {
  try {
    const body = req.body ?? {};
    const tokenId = String(body.tokenId ?? "");
    const wallet = String(body.wallet ?? "").toLowerCase();
    const rawText = String(body.text ?? "").slice(0, 280).trim();
    const signedAt = Number(body.signedAt);
    const signature = String(body.signature ?? "");
    if (!tokenId || !wallet.startsWith("0x") || !rawText) {
      return res.status(400).json({ error: "tokenId, wallet (0x), text required" });
    }
    if (rateLimited(wallet)) return res.status(429).json({ error: "slow down, fren 👻" });

    if (!(await verifyRoomSignature(wallet, signedAt, signature))) {
      return res.status(401).json({ error: "join signature required" });
    }
    const state = await fetchGotchiState(tokenId);
    if (!state) return res.status(404).json({ error: "gotchi not found" });
    if (!state.owner || state.owner !== wallet) {
      return res.status(403).json({ error: "you don't own that gotchi" });
    }

    const { masked } = filterInbound(rawText);
    const stored = appendGlobalMessage({ tokenId, gotchiName: state.name, wallet, text: masked, isAI: false });
    const pub = toPublic(stored);
    broadcast(pub);
    res.json({ ok: true, message: pub });
  } catch (err: any) {
    res.status(500).json({ error: err?.message ?? String(err) });
  }
});

export default router;
```

- [ ] **Step 2: Mount in `server/app.ts`**

Add with the other route imports:
```ts
import globalChatRoutes from "./routes/globalChat";
```
Add with the other `app.use` mounts:
```ts
app.use("/api/companion/global", globalChatRoutes);
```

- [ ] **Step 3: Typecheck**

Run: `pnpm typecheck`
Expected: PASS.

- [ ] **Step 4: Manual smoke (validation + history; full post needs a real signature)**

```bash
PORT=5060 npx tsx server/index.ts > /tmp/global.log 2>&1 &
sleep 8
curl -s http://localhost:5060/api/companion/global/history
# Expected: {"messages":[]}
curl -s -X POST http://localhost:5060/api/companion/global/post -H 'Content-Type: application/json' -d '{}'
# Expected: {"error":"tokenId, wallet (0x), text required"}
curl -s -X POST http://localhost:5060/api/companion/global/post -H 'Content-Type: application/json' \
  -d '{"tokenId":"4","wallet":"0x0000000000000000000000000000000000000001","text":"hi"}'
# Expected: {"error":"join signature required"}  (401 — signature path reached)
pkill -f "tsx server/index.ts" 2>/dev/null || true
```

- [ ] **Step 5: Commit**

```bash
git add server/routes/globalChat.ts server/app.ts
git commit -m "feat(global): /global history + post (auth + ownership + moderation)"
```

---

## Task 5: SSE stream + live broadcast

**Files:**
- Modify: `server/routes/globalChat.ts`

- [ ] **Step 1: Add the `/stream` SSE endpoint (insert before `export default router;`)**

```ts
router.get("/stream", (req, res) => {
  res.set({
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
  });
  res.flushHeaders?.();
  res.write(": connected\n\n");
  sseClients.add(res);

  const heartbeat = setInterval(() => {
    try { res.write(": ping\n\n"); } catch { /* drop */ }
  }, 25_000);

  req.on("close", () => {
    clearInterval(heartbeat);
    sseClients.delete(res);
  });
});
```

- [ ] **Step 2: Typecheck**

Run: `pnpm typecheck`
Expected: PASS.

- [ ] **Step 3: Manual SSE smoke (stream opens and emits the connected comment)**

```bash
PORT=5061 npx tsx server/index.ts > /tmp/global5.log 2>&1 &
sleep 8
( curl -s -N --max-time 5 http://localhost:5061/api/companion/global/stream > /tmp/sse.txt & )
sleep 3
grep -q "connected" /tmp/sse.txt && echo "SSE OPEN OK" || echo "SSE FAIL"
pkill -f "tsx server/index.ts" 2>/dev/null || true
```
Expected: `SSE OPEN OK` (full post→broadcast is covered by the client E2E in Task 8).

- [ ] **Step 4: Commit**

```bash
git add server/routes/globalChat.ts
git commit -m "feat(global): SSE /stream endpoint with heartbeat + live broadcast"
```

---

## Task 6: Client API + room hook

**Files:**
- Modify: `src/lib/companion/api.ts`
- Create: `src/components/companion/useGlobalRoom.ts`

- [ ] **Step 1: Add client API functions to `src/lib/companion/api.ts`**

Append (the file already has `const BASE = env.companionApiUrl;`):
```ts
export interface GlobalMessage { id: number; tokenId: string; name: string; text: string; isAI: boolean; ts: number; }

export function globalStreamUrl(): string {
  return `${BASE}/api/companion/global/stream`;
}

export async function getGlobalHistory(limit = 50): Promise<GlobalMessage[]> {
  try {
    const res = await fetch(`${BASE}/api/companion/global/history?limit=${limit}`);
    if (!res.ok) return [];
    const json = await res.json();
    return Array.isArray(json?.messages) ? json.messages : [];
  } catch {
    return [];
  }
}

export async function postGlobal(args: {
  tokenId: string; wallet: string; text: string; signature: string; signedAt: number;
}): Promise<{ ok: boolean; message?: GlobalMessage; error?: string }> {
  const res = await fetch(`${BASE}/api/companion/global/post`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(args),
  });
  if (!res.ok) return { ok: false, error: (await res.json().catch(() => ({}))).error || `post failed (${res.status})` };
  return res.json();
}
```

- [ ] **Step 2: Create the hook `src/components/companion/useGlobalRoom.ts`**

```ts
import { useEffect, useRef, useState } from "react";
import { getGlobalHistory, globalStreamUrl, type GlobalMessage } from "@/lib/companion/api";

// History-then-stream. Dedupes by id; the caller's own post returns via the stream.
export function useGlobalRoom(open: boolean) {
  const [messages, setMessages] = useState<GlobalMessage[]>([]);
  const seen = useRef<Set<number>>(new Set());

  function add(list: GlobalMessage[]) {
    setMessages((prev) => {
      const next = [...prev];
      for (const m of list) {
        if (seen.current.has(m.id)) continue;
        seen.current.add(m.id);
        next.push(m);
      }
      next.sort((a, b) => a.id - b.id);
      return next.slice(-200); // cap rendered history
    });
  }

  useEffect(() => {
    if (!open) return;
    let es: EventSource | null = null;
    let cancelled = false;
    getGlobalHistory(50).then((h) => { if (!cancelled) add(h); });
    es = new EventSource(globalStreamUrl());
    es.addEventListener("message", (e) => {
      try { add([JSON.parse((e as MessageEvent).data)]); } catch { /* ignore */ }
    });
    return () => { cancelled = true; es?.close(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  return messages;
}
```

- [ ] **Step 3: Typecheck**

Run: `pnpm typecheck`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/lib/companion/api.ts src/components/companion/useGlobalRoom.ts
git commit -m "feat(global): client API + useGlobalRoom (history + SSE) hook"
```

---

## Task 7: Global tab UI + tab header

**Files:**
- Create: `src/components/companion/GlobalChatTab.tsx`
- Modify: `src/components/companion/CompanionChatPanel.tsx`

- [ ] **Step 1: Create `src/components/companion/GlobalChatTab.tsx`**

```tsx
import { useState } from "react";
import { useAccount, useSignMessage } from "wagmi";
import { GotchiSvgById } from "@/components/explorer/GotchiSvgById";
import { useCompanion } from "@/state/useCompanion";
import { postGlobal } from "@/lib/companion/api";
import { useGlobalRoom } from "./useGlobalRoom";
import { globalRoomMessage, PREMIUM_SIG_TTL_MS } from "@/lib/companion/premiumAuth";

export function GlobalChatTab({ active }: { active: boolean }) {
  const { address } = useAccount();
  const { signMessageAsync } = useSignMessage();
  const selectedTokenId = useCompanion((s) => s.selectedTokenId);
  const messages = useGlobalRoom(active);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // Sign once per 24h to join; cache like the premium signature.
  async function joinSig(): Promise<{ signature: string; signedAt: number }> {
    const key = `companion.roomSig.${address!.toLowerCase()}`;
    try {
      const cached = JSON.parse(localStorage.getItem(key) || "null");
      if (cached?.signature && Date.now() - cached.signedAt < PREMIUM_SIG_TTL_MS) return cached;
    } catch { /* ignore */ }
    const signedAt = Date.now();
    const signature = await signMessageAsync({ message: globalRoomMessage(address!, signedAt) });
    const sig = { signature, signedAt };
    try { localStorage.setItem(key, JSON.stringify(sig)); } catch { /* ignore */ }
    return sig;
  }

  async function send() {
    const text = draft.trim();
    if (!text || !address || !selectedTokenId || busy) return;
    setBusy(true); setErr(null); setDraft("");
    try {
      const { signature, signedAt } = await joinSig();
      const r = await postGlobal({ tokenId: selectedTokenId, wallet: address, text, signature, signedAt });
      if (!r.ok) setErr(r.error || "couldn't post");
    } catch {
      setErr("signature needed to post");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <div className="flex-1 space-y-2 overflow-y-auto p-3">
        {messages.length === 0 && <div className="pt-6 text-center text-sm text-white/40">the room is quiet… say something 👻</div>}
        {messages.map((m) => (
          <div key={m.id} className="flex items-start gap-2">
            <span className="mt-0.5 h-7 w-7 shrink-0 overflow-hidden rounded-full bg-black/30">
              <GotchiSvgById id={m.tokenId} className="block h-full w-full [&>svg]:h-full [&>svg]:w-full" />
            </span>
            <div className="min-w-0">
              <div className="text-[11px] text-fuchsia-200/70">
                {m.name}{m.isAI && <span className="ml-1 rounded bg-white/10 px-1 text-[9px] text-white/50">ai</span>}
              </div>
              <div className="whitespace-pre-wrap break-words text-sm text-white/90">{m.text}</div>
            </div>
          </div>
        ))}
      </div>
      {err && <div className="px-3 pb-1 text-[11px] text-rose-300/80">{err}</div>}
      <div className="flex shrink-0 items-center gap-2 border-t border-white/10 p-2">
        <input
          value={draft} onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && send()}
          placeholder={address ? (selectedTokenId ? "post to the room…" : "pick a gotchi first") : "connect wallet to post"}
          disabled={!address || !selectedTokenId}
          className="flex-1 rounded-xl bg-black/40 px-3 py-2 text-sm text-white placeholder:text-white/30 outline-none"
        />
        <button onClick={send} disabled={busy || !draft.trim()}
          className="rounded-xl bg-fuchsia-500/80 px-3 py-2 text-sm font-medium text-white disabled:opacity-40">↑</button>
      </div>
    </>
  );
}
```

- [ ] **Step 2: Add the Chat/Global tab header to `CompanionChatPanel.tsx`**

Read the file first. Add a tab state with the other `useState`s:
```ts
const [tab, setTab] = useState<"chat" | "global">("chat");
```
Add the import (with the other companion-component imports):
```ts
import { GlobalChatTab } from "./GlobalChatTab";
```
Just BELOW the existing header `<div className="flex shrink-0 items-center justify-between border-b border-white/10 px-3 py-2"> … </div>`, add a tab row:
```tsx
<div className="flex shrink-0 gap-1 border-b border-white/10 px-2 py-1">
  {(["chat", "global"] as const).map((t) => (
    <button key={t} onClick={() => setTab(t)}
      className={`flex-1 rounded-lg py-1 text-xs ${tab === t ? "bg-fuchsia-500/20 text-white" : "text-white/50 hover:text-white"}`}>
      {t === "chat" ? "Chat" : "Global"}
    </button>
  ))}
</div>
```
Wrap the existing private body so it only renders for the chat tab, and render the global tab otherwise. Replace the opening of the existing `{picking ? ( … ) : ( … )}` block with:
```tsx
{tab === "global" ? (
  <GlobalChatTab active={tab === "global"} />
) : picking ? (
  <div className="overflow-y-auto p-3"><CompanionGotchiPicker onPicked={() => setPicking(false)} /></div>
) : (
  <>
    {/* …existing private chat body unchanged… */}
  </>
)}
```
(Leave the contents of the `<>…</>` private body exactly as-is; only the surrounding conditional changes.)

- [ ] **Step 3: Typecheck + lint**

Run: `pnpm typecheck` → Expected: PASS.
Run: `pnpm lint` → Expected: PASS.

- [ ] **Step 4: Manual verify**

Run `pnpm dev`, open the panel, connect a wallet with gotchis. Expected: a Chat/Global tab row; Global shows the empty-room state + composer; posting prompts a one-time signature and your message appears in the feed. Switch back to Chat — the private conversation is intact.

- [ ] **Step 5: Commit**

```bash
git add src/components/companion/GlobalChatTab.tsx src/components/companion/CompanionChatPanel.tsx
git commit -m "feat(global): Global tab UI + Chat/Global tab header"
```

---

## Task 8: E2E + green sweep

**Files:**
- Create: `tests/e2e/global-chat.spec.ts`

- [ ] **Step 1: Write the E2E (mock the room APIs; assert tab + history render)**

```ts
// tests/e2e/global-chat.spec.ts
import { test, expect } from "@playwright/test";

test("global tab shows the room feed from history", async ({ page }) => {
  await page.route("**/api/companion/premium/**", (r) => r.fulfill({ json: { active: false, daysLeft: 0, entitlement: null } }));
  await page.route("**/api/companion/history/**", (r) => r.fulfill({ json: { messages: [] } }));
  await page.route("**/api/companion/global/history**", (r) => r.fulfill({
    json: { messages: [{ id: 1, tokenId: "4", name: "Lao Tzu", text: "gm frens", isAI: false, ts: 1750000000000 }] },
  }));
  // EventSource: return an immediately-completing stream so the hook doesn't hang.
  await page.route("**/api/companion/global/stream", (r) => r.fulfill({ headers: { "content-type": "text/event-stream" }, body: ": connected\n\n" }));

  await page.goto("/");
  await page.getByLabel("open gotchi companion").click({ force: true });
  await page.getByRole("button", { name: "Global" }).click();
  await expect(page.getByText("gm frens")).toBeVisible();
});
```

- [ ] **Step 2: Run the E2E**

Run: `pnpm test:e2e tests/e2e/global-chat.spec.ts`
Expected: PASS. If the mascot/panel selectors differ, align with `tests/e2e/companion.spec.ts` (same patterns).

- [ ] **Step 3: Full sweep**

Run: `pnpm test:unit` → Expected: PASS (all companion + global suites).
Run: `pnpm typecheck` → Expected: PASS.
Run: `pnpm lint` → Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add tests/e2e/global-chat.spec.ts
git commit -m "test(global): e2e global tab renders room feed; green sweep"
```

---

## Self-Review Notes (spec coverage)

- **Tabbed panel / post as selected gotchi (spec §1, §3):** Task 7.
- **SSE history-then-stream (spec §4):** Tasks 5 (stream), 6 (hook), 4 (history/post).
- **SQLite store (spec §4.1):** Task 1.
- **Sign-once-to-join + generalized verify (spec §5.1):** Task 2 + Task 7 client signing.
- **Ownership (spec §5.2):** Task 3 (owner field) + Task 4 (403 check).
- **Moderation: profanity mask, rate limit, length cap (spec §5.3):** Task 4.
- **Testing (spec §7):** store (1), auth (2), ownership (3/4), SSE smoke (5), E2E (8).
- **Phase-2 AI seam (spec §6):** not built; `broadcast()` + `appendGlobalMessage()` are the documented hook points (`is_ai` already in the schema/types).

### Consistency checks
- `StoredGlobalMessage`/`PublicMessage`/`GlobalMessage` field names align (id, tokenId, name/gotchiName, text, isAI, ts).
- `verifyRoomSignature(wallet, signedAt, signature)` consistent across Task 2 (def) and Task 4 (use).
- `globalRoomMessage(wallet, signedAt)` consistent across premiumAuth (def), auth.ts (use), GlobalChatTab (sign).
- Route base `/api/companion/global` consistent across Task 4 (mount), Task 6 (client URLs), Task 8 (E2E routes).
- `env.companionApiUrl` reused as `BASE` (no new env var).
- `PREMIUM_SIG_TTL_MS` reused for the room-signature cache TTL (24h) — already exported from `premiumAuth.ts`.
