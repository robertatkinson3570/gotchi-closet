# Global Chat (Gotchi Room) — Design Spec

**Date:** 2026-06-18
**Status:** Approved (brainstorm) → ready for implementation plan
**Project:** gotchi-closet
**Builds on:** the Gotchi Companion feature (private 1:1 chat, personality engine, wallet-signature auth).

---

## 1. Summary

Add a **Global Room**: a shared, realtime chat where wallet-connected users post **as a gotchi they own** (sprite + name + trait flavor) and everyone sees messages live. It appears as a **second tab** in the existing companion panel next to the private **Chat** tab — the private 1:1 chat is unchanged.

Ships **human-only first**. **Ambient AI gotchis** (autonomous, *invoked* — never an always-on loop) are a designed-for phase-2 layer that posts through the exact same pipeline.

### Pillars
- **Additive:** the Global Room is a new tab + new units; it does not modify the private chat code.
- **One identity:** you post as your currently-selected companion gotchi (same gotchi as the Chat tab).
- **Provable identity:** sign once to join (reuses the companion's wallet-signature auth); you may only speak as gotchis your wallet owns.
- **Cost-safe AI (phase 2):** AI gotchis are invoked on triggers with a global rate cap, never a perpetual cron.

---

## 2. Scope

### In scope (this spec — the Global Room, human-only)
- Two-tab panel header (Chat | Global); Global tab body = the room.
- SSE realtime transport (history-then-stream on join).
- SQLite message store; post + history + stream endpoints.
- Sign-once-to-join auth + per-post ownership check + profanity masking + rate limit + length cap.

### Out of scope (phase 2 — Ambient AI gotchis; seam defined in §6)
- Autonomous AI gotchi messages and the `maybeInvokeAiReply` trigger.

### Explicitly not building (YAGNI)
- Multiple rooms/channels, DMs, reactions, threads, edit/delete, presence/typing indicators, moderation dashboard.

---

## 3. Architecture

```
┌───────────────────────── CLIENT (panel) ─────────────────────────┐
│  Tab header:  [ Chat ]  [ Global ]                                │
│   Chat   → existing CompanionChatPanel body (unchanged)           │
│   Global → GlobalChatTab                                          │
│             ├─ useGlobalRoom() hook                               │
│             │    GET /history  → paint feed                       │
│             │    EventSource /stream → live messages (dedupe id)  │
│             │    POST /post (text + join signature)               │
│             └─ renders feed: sprite + name + text + time (+ai tag)│
└───────────────────────────────────────────────────────────────────┘
                                  │  /api/companion/global/*
┌───────────────────────── SERVER (Express, VPS) ──────────────────┐
│  routes/globalChat.ts                                            │
│    POST /post   → verify sig (auth) → verify ownership           │
│                   → contentFilter → store → broadcast            │
│    GET  /history?limit                                            │
│    GET  /stream (SSE)  → in-memory client set, broadcast on post │
│  companion/globalRoom.ts (SQLite: global_messages)               │
│  reuses: companion/auth.ts, lib/companion/contentFilter.ts,      │
│          companion/gotchiState.ts (+owner), lib/companion/        │
│          premiumAuth.ts (globalRoomMessage)                      │
└───────────────────────────────────────────────────────────────────┘
```

### Units & responsibilities

| Unit | Location | Responsibility |
|---|---|---|
| `globalRoom.ts` | server | SQLite store: append, recent(N), since(id) |
| `globalChat.ts` (route) | server | post/history/stream; orchestrates auth, ownership, filter, store, broadcast |
| `globalRoomMessage()` | `src/lib/companion/premiumAuth.ts` | the signed "join the room" message string |
| `verifyRoomSignature()` | `server/companion/auth.ts` | generalize the existing signature verify to any message |
| owner field | `server/companion/gotchiState.ts` | add `owner` to the gotchi fetch (used for ownership) |
| `useGlobalRoom()` | client | history + EventSource stream + post |
| `GlobalChatTab` | client | the room feed + composer |
| tab header | `CompanionChatPanel.tsx` | Chat/Global switch (private body extracted unchanged) |

---

## 4. Data model & realtime flow

### 4.1 SQLite — `global_messages` (in the companion DB)
`id` INTEGER PK AUTOINCREMENT, `token_id` TEXT, `gotchi_name` TEXT, `wallet` TEXT, `text` TEXT, `is_ai` INTEGER (0/1), `ts` INTEGER (unix **ms**). Index on `id`.

`globalRoom.ts` exports:
- `appendGlobalMessage({tokenId, gotchiName, wallet, text, isAI}) → StoredGlobalMessage` (stamps id + ts).
- `recentGlobalMessages(limit=50) → StoredGlobalMessage[]` (chronological, oldest→newest).
- `globalMessagesSince(id, limit) → StoredGlobalMessage[]` (for reconnect catch-up).

### 4.2 Endpoints — `/api/companion/global`
- **`GET /history?limit=50`** → `{ messages: PublicMessage[] }` (oldest→newest).
- **`GET /stream`** (SSE) → server adds the response to an in-memory `Set`; sends `event: message` with `PublicMessage` JSON on each new post; heartbeat comment every ~25s; removed from the set on `close`.
- **`POST /post`** `{ tokenId, wallet, text, signature, signedAt }` → validate → store → broadcast → `{ ok: true, message }`.

`PublicMessage = { id, tokenId, name, text, isAI, ts }`. Author identity is the gotchi (sprite via `GotchiSvgById(tokenId)` + name); the raw wallet is not surfaced in the feed.

### 4.3 Client flow
Open Global tab → `GET /history` paints feed → open `EventSource('/stream')` → append live messages, **dedupe by `id`** (your own post returns via the stream — single source of truth, no optimistic drift). On stream error, EventSource auto-reconnects; optionally `GET /history` again to backfill. Posting calls `POST /post` with the cached join signature.

---

## 5. Auth, ownership & moderation

### 5.1 Sign-once-to-join (reuses companion auth)
- `globalRoomMessage(wallet, signedAt)` in `premiumAuth.ts` — distinct text from `premiumMessage` so signatures aren't cross-usable.
- Client signs once per session, caches `{signature, signedAt}` 24h in localStorage (mirrors the premium flow), sends both on each post.
- Server `verifyRoomSignature(wallet, signedAt, signature)` — the existing `recoverMessageAddress` + freshness check, parameterized by message builder.

### 5.2 Ownership (per post)
Server fetches the gotchi and requires `owner.toLowerCase() === wallet.toLowerCase()`, else **403**. Requires adding `owner { id }` to the `gotchiState.ts` subgraph query (returned as `owner: string`). Signature proves *who you are*; ownership proves *you may speak as that gotchi*.

### 5.3 Moderation
- **Profanity:** `filterInbound` masks; the **masked** text is stored/broadcast (mask-and-post, never silently dropped).
- **Rate limit:** per-wallet token bucket (~5 messages / 30s) — reuses the private route's bucket pattern.
- **Length cap:** text trimmed/limited to ~280 chars; empty rejected (400).

---

## 6. Phase-2 seam — Ambient AI gotchis (NOT built here)

Designed so it adds ~one function and an identity set, with **no change** to the room's data model, transport, or auth:
- **Invoked, never always-on:** triggers are (a) after a human post, a chance (~30%) to invoke one AI reply a few seconds later; (b) an optional "quiet-room" nudge only when someone is actively connected to `/stream`. No perpetual cron.
- **Identity:** pick an AI gotchi persona (a small operator-owned "house" set), run `buildPersonality`, generate a short line via the LLM (Groq free, template fallback).
- **Pipeline:** post via the same store + broadcast with `is_ai=1`.
- **Cost cap:** global limit (e.g. ≤1 AI message / 20s).
- **Hook point:** `maybeInvokeAiReply(context)` called at the end of a successful human `POST /post`.

---

## 7. Testing

- **`globalRoom.ts`:** append; `recent(N)` ordering (oldest→newest, capped); `since(id)` returns only newer rows.
- **Auth:** `verifyRoomSignature` accepts a fresh same-wallet signature, rejects stale / wrong-wallet / malformed (extends existing `auth.test.ts`).
- **Ownership:** post rejected (403) when wallet ≠ gotchi owner (mocked `gotchiState`).
- **Moderation:** profanity masked in stored message; rate-limit trips after N; over-length rejected.
- **SSE integration:** a `POST /post` is delivered to a connected `/stream` client.
- **Client E2E (Playwright):** Global tab renders history; a broadcast message appears; switching to Chat preserves the private conversation.

---

## 8. Build order

1. `globalRoom.ts` store + tests.
2. `gotchiState.ts` add `owner`; `premiumAuth.ts` add `globalRoomMessage`; `auth.ts` `verifyRoomSignature` + tests.
3. `globalChat.ts` route (post/history/stream) + mount + moderation; manual SSE smoke.
4. Client: `useGlobalRoom` hook + `GlobalChatTab` + tab header in the panel.
5. E2E + polish (sprite rendering, ai tag, reconnect backfill).
6. (Phase 2) `maybeInvokeAiReply` + AI identity set.

Each step is independently testable; a working human-only Global Room exists after step 4.
