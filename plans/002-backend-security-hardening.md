# Plan 002: Backend auth & payment hardening (single-use signatures, chainId, payment confirmations, IP rate-limit)

> **Executor instructions**: Follow this plan step by step. Run every verification command and confirm the expected result before moving on. If anything in "STOP conditions" occurs, stop and report — do not improvise. When done, update this plan's row in `plans/README.md`.
>
> **Drift check (run first)**: `git diff --stat 192d483..HEAD -- server/companion/auth.ts src/lib/companion/premiumAuth.ts server/lending/verifyPayment.ts server/routes/companion.ts server/routes/roast.ts server/routes/globalChat.ts` — if any in-scope file changed, compare the "Current state" excerpts to live code; on mismatch, STOP.

## Status
- **Priority**: P1
- **Effort**: M
- **Risk**: MED
- **Depends on**: none
- **Category**: security
- **Planned at**: commit `192d483`, 2026-06-19

## Why this matters
The premium/global auth signature is valid for a 24h window with **no single-use guard**, so if a user's signature leaks, an attacker can replay it to spend that user's purchased credits or post as them (griefing — note: it cannot drain the operator's LLM key, because premium calls also burn a credit). The signed message has **no chainId**, a cross-chain replay gap if the service is ever deployed elsewhere. GHST payment verification confirms the Transfer event but **not confirmation depth**, leaving a small reorg window. And rate limits are keyed only by the self-reported wallet, so an attacker rotates wallets to bypass them and abuse the free Groq key. These are bounded today but should be closed before the premium tier is promoted.

## Current state (verified against live code at 192d483)
- `src/lib/companion/premiumAuth.ts:7-9` — message has wallet + ts only, no chainId, no nonce:
  ```ts
  export function premiumMessage(wallet: string, signedAt: number): string {
    return `GotchiCloset Companion — premium access\nwallet: ${wallet.toLowerCase()}\nts: ${signedAt}`;
  }
  ```
  `isSignedAtFresh` (lines 11-17) only checks the 24h TTL window.
- `server/companion/auth.ts:4-21` — `verifySigned` recovers the address and checks freshness; there is **no record of used signatures**. Same module backs both premium and global-room gates.
- `server/lending/verifyPayment.ts:36-66` — reads the receipt, checks `status === "success"` and a matching GHST Transfer (from/to/value exact), returns `blockNumber` but **never compares it to the chain head** (no confirmation check).
- `server/routes/companion.ts:27-34` — `rateLimited(wallet)` is an in-memory `Map` keyed by `wallet` (30 / 10 min). `server/routes/roast.ts` and `server/routes/globalChat.ts` have the same in-memory, wallet-keyed pattern. Confirm with `grep -n "new Map" server/routes/*.ts`.
- **NOTE — not a bug (do not "fix"):** `server/routes/companion.ts:118-151` `/premium/claim` is unsigned, but `verifyGhstPayment` requires `expectedFrom == wallet` and `addCredits(wallet, …)` credits that same payer wallet idempotently by `txHash`. A front-runner therefore credits the rightful payer, not themselves. This was audited and rejected as a non-issue; do not add a signature to `/premium/claim` under this plan.

Repo conventions: pure shared signing helpers live in `src/lib/companion/premiumAuth.ts` and are imported by the server (keep client/server message strings byte-identical or signatures break). DB access uses `better-sqlite3` prepared statements (see `server/companion/db.ts`). Tests use `vitest` (see `server/companion/auth.test.ts`).

## Commands you will need
| Purpose | Command | Expected |
|---|---|---|
| Typecheck | `npx tsc --noEmit` | exit 0 |
| Tests | `npx vitest run server/companion server/lending` | all pass |
| Lint | `npx eslint . --ext ts,tsx` | exit 0 |

## Scope
**In scope:**
- `src/lib/companion/premiumAuth.ts` (add chainId + a nonce field to the message)
- `server/companion/auth.ts` (enforce single-use)
- `server/companion/db.ts` (a small `used_signatures` table + helper) — or a new `server/companion/nonceStore.ts` matching the existing store style
- `server/lending/verifyPayment.ts` (confirmation-depth check)
- `server/routes/companion.ts`, `server/routes/roast.ts`, `server/routes/globalChat.ts` (add IP keying to the limiter)
- New/updated `*.test.ts` beside each changed module
- The client caller that builds the signature (find it: `grep -rn "premiumMessage\|globalRoomMessage" src/`) — update in lockstep with the message format

**Out of scope (do NOT touch):**
- `/premium/claim` signature (see NOTE above — rejected finding).
- Moving rate-limits to Redis/shared store — keep the in-memory Map; this plan only adds IP as a second key. (Shared-store is a separate plan.)
- The on-chain SoulSeal flow.

## Git workflow
- Branch: `advisor/002-security-hardening`
- One commit per step; match `git log` subject style.
- Do NOT push/PR unless instructed.

## Steps

### Step 1: Add chainId + nonce to the signed message (client + server in lockstep)
In `src/lib/companion/premiumAuth.ts`, change both `premiumMessage` and `globalRoomMessage` to include a `chainId: 8453` line and accept a `nonce: string` argument that is included in the message. Keep the format a single canonical string. Example:
```ts
export function premiumMessage(wallet: string, signedAt: number, nonce: string): string {
  return `GotchiCloset Companion — premium access\nchainId: 8453\nwallet: ${wallet.toLowerCase()}\nts: ${signedAt}\nnonce: ${nonce}`;
}
```
Update every client caller found via grep to generate a random `nonce` (e.g. `crypto.randomUUID()`) and send it alongside `signedAt`/`signature`.

**Verify**: `npx tsc --noEmit` → exit 0 (all callers updated).

### Step 2: Persist used signatures and reject reuse
Add a `used_signatures` table (columns: `sig_hash TEXT PRIMARY KEY`, `wallet TEXT`, `used_at INTEGER`) in `server/companion/db.ts` following the existing `CREATE TABLE IF NOT EXISTS` pattern, plus `markSignatureUsed(sigHash, wallet): boolean` (returns false if already present) and a periodic cleanup of rows older than the TTL. In `server/companion/auth.ts`, after a signature recovers successfully, compute a hash of the signature string and call `markSignatureUsed`; if it returns false, treat the signature as invalid (return false). Hash with `node:crypto` `createHash("sha256")` — store the hash, never the raw signature.

**Verify**: `npx vitest run server/companion/auth.test.ts` → pass, including the new reuse-rejection test from the Test plan.

### Step 3: Require confirmation depth in payment verification
In `server/lending/verifyPayment.ts`, after a matching Transfer is found, fetch the current block via the same viem client (`getBlockNumber()`) and require `head - receipt.blockNumber >= MIN_CONFIRMATIONS` (define `const MIN_CONFIRMATIONS = 5n` near the top; Base is ~2s blocks). If not enough confirmations, return `{ ok: false, error: "insufficient confirmations" }`. Keep all existing checks.

**Verify**: `npx vitest run server/lending` → pass, including the new "rejects too-recent tx" test.

### Step 4: Add IP keying to the rate limiters
In each of `server/routes/companion.ts`, `roast.ts`, `globalChat.ts`, key the limiter on **both** the wallet and the request IP (use `req.ip`; ensure `app.set("trust proxy", 1)` is set in `server/app.ts` if behind a proxy — check first, add only if missing). Enforce whichever limit trips first (per-wallet AND a per-IP cap, e.g. 100/10min/IP for companion). Keep the existing per-wallet limit unchanged.

**Verify**: `npx vitest run server/routes` (if route tests exist) or the limiter unit test you add → pass.

## Test plan
- `server/companion/auth.test.ts` (extend): a valid signature is accepted once and **rejected on second use**; a signature built without the new `chainId`/`nonce` format is rejected; freshness still enforced. Model after existing cases in this file.
- `server/lending/verifyPayment.test.ts` (create): mock the viem client's `getTransactionReceipt` + `getBlockNumber`; assert: valid+confirmed accepted; valid but `head - blockNumber < MIN_CONFIRMATIONS` rejected; reverted rejected; wrong from/to/value rejected; non-GHST emitter ignored. Model the mocking after `server/roast/engine.test.ts`.
- Limiter: a small unit test that the per-IP cap trips independently of wallet rotation.
- Verification: `npx vitest run server/companion server/lending` → all pass, including the new tests.

## Done criteria
ALL must hold:
- [ ] `npx tsc --noEmit` exits 0
- [ ] `npx vitest run server/companion server/lending` exits 0 with the new tests present and passing
- [ ] `npx eslint . --ext ts,tsx` exits 0
- [ ] `grep -n "nonce" src/lib/companion/premiumAuth.ts` shows nonce in the message; every client caller passes one (no tsc errors)
- [ ] No raw signature or private key string is logged or stored (only sha256 hashes) — `grep -rn "signature" server/companion/auth.ts` shows only hashing
- [ ] No files outside the in-scope list modified (`git status`)
- [ ] `plans/README.md` row updated

## STOP conditions
- Client and server message strings cannot be kept byte-identical (e.g. the client signer lives somewhere you can't safely edit) — STOP; a format mismatch silently breaks ALL premium/global auth.
- Adding `getBlockNumber()` doubles RPC latency unacceptably for the claim path — report; a cached head read may be needed.
- `req.ip` is always `::1`/undefined (no `trust proxy`) — report before guessing the proxy config.
- You find a second code path that builds these signed messages not covered by the grep — STOP and report.

## Maintenance notes
- The `used_signatures` table grows; the cleanup job must run (or add a TTL index) — reviewer should confirm cleanup is wired.
- If the app moves to multiple backend instances, the in-memory limiter AND the `used_signatures` table (if kept in per-instance SQLite) must move to a shared store — that's the separate "shared rate-limit/store" plan.
- Reviewer scrutiny: confirm the message-format change shipped to the client in the same release, or existing signatures will all fail.
