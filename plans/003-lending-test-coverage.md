# Plan 003: Characterization tests for the untested lending money/on-chain logic

> **Executor instructions**: Follow this plan step by step. Run every verification command and confirm the result before moving on. If anything in "STOP conditions" occurs, stop and report. When done, update this plan's row in `plans/README.md`. This plan adds tests ONLY — do not change `server/lending/*.ts` behavior; if a test reveals a bug, report it rather than fixing it here.
>
> **Drift check (run first)**: `git diff --stat 192d483..HEAD -- server/lending` — if any lending file changed, re-read it before writing tests against it.

## Status
- **Priority**: P1
- **Effort**: M
- **Risk**: LOW (tests only)
- **Depends on**: none (complements 002, which adds the confirmation check that verifyPayment tests should then cover)
- **Category**: tests
- **Planned at**: commit `192d483`, 2026-06-19

## Why this matters
`server/lending/` handles GHST payments, subscription crediting, and on-chain relist transactions, yet has **zero test files** (every other backend domain — companion, soul, roast, arena — is covered). A regression in payment verification, subscription expiry math, or the auto-renew cron's expiry gating silently costs users money or wastes operator gas. Characterization tests lock in current behavior so the upcoming hardening (plan 002) and any refactor are safe.

## Current state
Untested files (confirm with `ls server/lending/ && find server/lending -name '*.test.ts'` → no test files):
- `server/lending/verifyPayment.ts` — `verifyGhstPayment({txHash, expectedFrom, expectedTo, expectedValueWei})`; reads receipt via a module-level viem `createPublicClient`, matches a GHST `Transfer` event (from/to/value exact, emitter == GHST). Returns `{ok:true, from, to, valueWei, blockNumber}` or `{ok:false, error}`.
- `server/lending/db.ts` — `creditSubscription(...)` (idempotency via `payment_tx_log`, expiry extended from `max(now, current expires_at)`), plus `isSubscriptionActive`, `listEnabledTemplates`. Confirm exact exported names with `grep -n "export " server/lending/db.ts`.
- `server/lending/subscriptionPricing.ts` — `ghstToWei(float)` string-splits to an 18-decimal bigint; `expectedWeiForMonths`. Confirm with `grep -n "export " server/lending/subscriptionPricing.ts`.
- `server/lending/relist.ts` — `initWallet()` (reads `AUTORENEW_HOT_WALLET_KEY` env → viem account; returns boolean), `getActiveLendingState(tokenId)` (subgraph query → `none|open|rented_active|rented_expired`), `maybeRelist()` (state machine → addGotchiListing / claimAndEnd).
- `server/lending/cron.ts` — iterates enabled templates, calls `isSubscriptionActive` before `maybeRelist`.

Conventions: tests are `vitest`, colocated as `<file>.test.ts`. DB tests isolate by using a temp DB and closing it per test — model after `server/roast/store.test.ts` and `server/soul/transfer.test.ts`. External I/O (viem client, subgraph `fetch`) is mocked with `vi.mock`/`vi.spyOn` — model after `server/roast/engine.test.ts` and `server/companion/gotchiState.test.ts`. Use `vi.useFakeTimers()` for time-dependent expiry tests.

## Commands you will need
| Purpose | Command | Expected |
|---|---|---|
| Run lending tests | `npx vitest run server/lending` | all pass |
| Typecheck | `npx tsc --noEmit` | exit 0 |

## Scope
**In scope (create these test files only):**
- `server/lending/verifyPayment.test.ts`
- `server/lending/db.test.ts`
- `server/lending/subscriptionPricing.test.ts`
- `server/lending/relist.test.ts`
- `server/lending/cron.test.ts`

**Out of scope:**
- Any change to `server/lending/*.ts` source (tests only — see executor instructions).
- Route-handler integration tests for `server/routes/lendingAutoRenew.ts` (valuable but a separate, larger plan).

## Git workflow
- Branch: `advisor/003-lending-tests`
- One commit per test file; match `git log` subject style.
- Do NOT push/PR unless instructed.

## Steps

### Step 1: `subscriptionPricing.test.ts` (pure, easiest first)
Cover `ghstToWei`: `1 → 10^18`, `2.5 → 2.5e18`, `4.5 → 4.5e18`, fraction-only `0.5`, trailing zero `10.0`, `0`, and a >18-decimal input is truncated not crashed. Assert `expectedWeiForMonths` round-trips against the configured tiers. Model after `server/companion/pricing.test.ts`.
**Verify**: `npx vitest run server/lending/subscriptionPricing.test.ts` → pass.

### Step 2: `verifyPayment.test.ts`
`vi.mock` the viem client (or inject) so `getTransactionReceipt` returns crafted receipts. Cases: valid GHST Transfer (correct from/to/value, case-insensitive addresses) → `ok:true`; null receipt → `tx not found`; `status:"reverted"` → `tx reverted`; wrong from / wrong to / off-by-one value → no-match error; Transfer from a non-GHST address ignored; a receipt with multiple logs picks the matching one. (If plan 002 has landed, also assert the confirmation-depth rejection.) Model the viem mock after `server/companion/gotchiState.test.ts`.
**Verify**: `npx vitest run server/lending/verifyPayment.test.ts` → pass.

### Step 3: `db.test.ts` (subscription credit/expiry idempotency)
Temp-DB isolation per test (copy the setup from `server/roast/store.test.ts`). With `vi.useFakeTimers()`: new subscription sets `expires_at = now + months*30*86400`; crediting an **active** sub extends from the old expiry (no gap); crediting an **expired** sub extends from `now`; the exact-equal `expires_at == now` boundary is treated as expired; a duplicate `tx_hash` throws "already credited"; `months_paid_total` increments. Assert `isSubscriptionActive` agrees with the boundary.
**Verify**: `npx vitest run server/lending/db.test.ts` → pass.

### Step 4: `relist.test.ts` (state machine + wallet init)
Mock `getActiveLendingState`'s subgraph `fetch` and the viem wallet client. Cover: `initWallet()` false when `AUTORENEW_HOT_WALLET_KEY` is unset (cron must not start); state `none` → addGotchiListing; `open`/`rented_active` → no tx ("already-active"); `rented_expired` → claimAndEnd then relist; a write that reverts surfaces an error string. Do not put any real private key in the test — use a throwaway/hardhat-style key constant as the other tests do.
**Verify**: `npx vitest run server/lending/relist.test.ts` → pass.

### Step 5: `cron.test.ts` (expiry gating)
Call the cron handler directly with mocked `listEnabledTemplates`, `isSubscriptionActive`, and `maybeRelist`. Assert: `maybeRelist` is called only for tokens with an active subscription; templates with no/expired subscription are skipped (counter increments); a failed relist records `last_error` but the loop continues.
**Verify**: `npx vitest run server/lending/cron.test.ts` → pass.

## Test plan
(Embedded in the steps above.) Net new: 5 test files, ~50–60 cases. No source changes.

## Done criteria
ALL must hold:
- [ ] `npx vitest run server/lending` exits 0 with the 5 new files present and passing
- [ ] `npx tsc --noEmit` exits 0
- [ ] `git status` shows only the 5 new test files added (no source modified)
- [ ] No real private keys or secrets appear in any test file (`grep -rn "PRIVATE\|0x[a-fA-F0-9]\{64\}" server/lending/*.test.ts` → only obvious throwaway test keys)
- [ ] `plans/README.md` row updated

## STOP conditions
- A test reveals current behavior is actually buggy (e.g. expiry math wrong, a payment edge accepted that shouldn't be) — write the test as `it.fails`/`it.skip` with a clear comment and STOP to report the bug; do not silently change source to make a green test.
- A lending module cannot be unit-tested without a real RPC/subgraph and there is no injection seam — report (the source may need a small DI seam, which is a separate plan).

## Maintenance notes
- These are characterization tests (they encode *current* behavior). When plan 002 adds the confirmation-depth check, update `verifyPayment.test.ts` accordingly.
- Reviewer should confirm the mocks don't make real network calls (tests must pass offline / in CI).
