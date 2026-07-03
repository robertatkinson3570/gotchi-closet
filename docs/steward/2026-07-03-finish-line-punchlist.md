# Steward — finish-line punch-list (2026-07-03)

Goal (owner's words): *"Allow owner to hire their gotchi to automate petting, emptying parcels, lending, etc.
on a cron they choose, running on my VPS, with their gas not mine."*

That is **Path 1** (EIP-7702 session-key automation via `RecruitWizard` + the steward cron). It is code-complete
and green, but gated OFF at both layers: `VITE_STEWARD_AUTOMATION` unset (UI) and the steward env keys
(`RHINESTONE_API_KEY` / `STEWARD_BUNDLER_URL` / `STEWARD_PET_RELAYER_KEY`) unset in `deploy/docker-compose.yml`
(so the VPS cron never wakes — `cron.ts` is gated behind them).

## The gas wall (why this stalled) — READ FIRST
"With their gas, not mine" on an operator-triggered VPS cron is **only** possible with account abstraction. A plain
EOA/relayer transaction always debits gas from whoever signs+sends it — that's the operator (you). The single
mechanism that lets the operator *submit* a transaction whose gas is paid by the *player* is an ERC-4337/EIP-7702
**userOp through a bundler**: the session key signs, but gas debits the player's own 7702 smart-account balance.
That is exactly what `server/steward/aa.ts` (Rhinestone) implements — and exactly the piece that is unverified (A1).
The two existing modes:
- **`session` (7702 userOp):** player pays gas from their EOA float. ✅ matches the goal. Needs a bundler + Rhinestone.
- **`operator` (relayer):** the relayer (you) pays gas, pet-only. ❌ this is the wall — it uses YOUR gas.
There is no third option. Player-funded automation ⇒ the 7702 path must be verified and turned on.

Findings from a 3-way parallel audit (backend correctness · live Path-2 · custody/security), deduped and ranked.
Severity: **BLOCKER** ships nothing until fixed · **HIGH** fix before flipping automation on · **MED/LOW** follow-up.

> **STATUS UPDATE (2026-07-03, same day):** B1, B2, B3, B5, B6, B7, C1, C2, C3, C4, C5, C6, C7 are **FIXED**
> and verified (tsc 0 · vitest 633 pass · eslint 0 · steward API e2e 11/11). Owner-pays is now enforced at the
> API: operator-mode enrollments are rejected unless a relayer key is deliberately configured. Remaining:
> **A1** (Base Sepolia 7702 verification — needs owner-supplied free-tier Rhinestone/Pimlico key + faucet
> wallet; see `docs/steward/SEPOLIA-VERIFY.md`), **B4** (move Rhinestone auth off VITE_ to server-minted JWT —
> do together with A1 since it changes the same client path), **D** (lending chore decision), **E** (low-sev
> housekeeping).

---

## A. The one true blocker to the goal — on-chain verification (needs YOUR resources)

**A1 — The 7702 session-key custody boundary is UNVERIFIED on-chain.** `server/steward/aa.ts`, `HANDOFF.md:77-79`.
The scope (3 selectors: `interact` / `channelAlchemica` / `claimAllAvailableAlchemica`) is *cryptographically*
bound — the owner signs the session digest via `experimental_signEnableSession`, so the server can't widen it
without invalidating the signature. But whether Rhinestone's SmartSession module actually *enforces* that
(target, selector) restriction on Base has **never been executed**. Until a Base Sepolia run proves a scoped key
is rejected when it calls anything outside the 3 selectors — AND that gas debits the player, not the relayer — the
"it can ONLY pet/channel/claim" + "their gas not mine" promises are assertions written from docs.
**Needs (only you can supply):** a Rhinestone/Pimlico API key + bundler URL, a funded Base Sepolia wallet, and a
7702-capable signer (Ledger does NOT support 7702 — use MetaMask/Rabby for the enable step). Then: enroll → run
cron once → confirm real `interact`/`channel`/`claim` txs, **gas paid from the player's balance not ours**, an
out-of-scope call is rejected, and revoke kills the key.

Everything in B and C below I can do now with no external dependency.

---

## B. Must-fix BEFORE flipping automation on (these go live the moment Path 1 is on)

**B1 — [BLOCKER] All management endpoints are unauthenticated + keyed by a sequential id.**
`server/routes/steward.ts:96-137`, mount `server/app.ts:97`. `pause`/`resume`/`revoke`/`edit-chores`/`run-now` only
check `getEnrollment(id)` existence; ids are `AUTOINCREMENT` and are handed out by `GET /status?owner=`. An anon
attacker POSTs `{id:1}`, `{id:2}`, … to `/revoke` → `setStatus` nulls `session_key` → **irreversibly destroys every
owner's scoped key**; victims must re-enroll and re-sign on-chain. Enroll itself is signature-gated, so the missing
auth on mutations is clearly an oversight. **Fix:** require an owner signature (reuse `enrollAuth` shape) on every
mutation; scope reads to the authenticated owner.

**B2 — [HIGH] One hung network read wedges the whole cron permanently.**
`server/steward/cron.ts:49-73` + `chain.ts:28-33`. `runAllDue` awaits each enrollment sequentially with no
per-enrollment timeout; `sg()` uses bare `fetch` with no AbortController. One stalled subgraph connection → the
`await` never resolves → `finally { running=false }` never runs → `running` stays `true` forever → every later tick
logs "skipping" and does nothing. Automation silently dies for all owners until process restart. **Fix:** AbortSignal
timeout on the subgraph fetch + a per-enrollment timeout wrapper; reset `running` defensively.

**B3 — [HIGH] `SOUL_ENCRYPTION_KEY` unset silently falls back to a public repo constant.**
`server/soul/crypto.ts:23` (`sha256("gotchi-soul-dev-key-constant-v1")`, one `console.warn`, no boot fail). `db.ts:121`
encrypts every session private key with it. A DB backup/leak with the env var forgotten decrypts every key with a
constant that's in the source. **Fix:** hard-fail on missing/short key when `NODE_ENV==='production'`.

**B4 — [HIGH] Rhinestone API key ships in the client bundle.**
`src/lib/steward/aaClient.ts:29` (`VITE_RHINESTONE_API_KEY`). Anyone can grep the deployed JS and abuse the quota /
bundler. Not a theft path (userOps stay session-scoped) but an abuse/billing + Rhinestone-account risk. **Fix:**
server-minted JWT (HANDOFF next-step #2); drop the `VITE_` exposure.

**B5 — [MED] `STEWARD_DEV_OPEN_ENROLL=1` has no `NODE_ENV` guard.**
`server/routes/steward.ts:23`. A single env line skips owner-signature verify AND the soul-cert gate. **Fix:** ignore
the flag when `NODE_ENV==='production'`.

**B6 — [MED] Operator-mode revoke is ineffective.**
`server/steward/cron.ts:23-32,55-57`. `runOperatorPet` has no `status==='active'` gate (unlike `runEnrollment`), so a
revoked/paused operator enrollment still gets petted whenever the owner has any other active enrollment. Also revoke
never calls `setPetOperatorForAll(relayer,false)`, so the on-chain approval lives forever. Bounded (relayer can only
`interact`, burns its own gas) but "revocable" is false here. **Fix:** gate on status; prompt on-chain approval removal
on revoke. *(Operator mode uses the operator's gas = the wall; if it stays hidden the status gate should still land.)*

**B7 — [MED] Simulation swallows RPC errors as "would revert" → skips real upkeep for a full interval.**
`server/steward/chain.ts:85` (`catch {}`) can't tell a revert from a 429/blip. On a transient RPC failure all calls
drop, `runEnrollment` records the run and advances `lastRunAt`, so nothing is petted/channeled and it won't retry for
≥8h. Related: petting is a single batched `interact([...ids])` — one reverting id zeroes petting for the whole wallet
(operator mode has no simulate at all). **Fix:** distinguish revert vs infra error; don't advance `lastRunAt` on infra
failure; consider per-id pet resilience.

---

## C. Live-now bugs in the SHIPPED Estate Upkeep (Path 2) — affect real users today, independent of Path 1

**C1 — [HIGH] Partial-run failure never refetches → replays already-done calls and wedges.**
`src/components/steward/EstateUpkeep.tsx:43-48`. Invalidate/refetch only on the success path; `catch`/`finally` do
nothing. Reject tx 3 of 8 → calls 1-2 are mined but `data.calls` still holds all 8 → "Run upkeep" again replays from
call 1 → the already-channeled parcel reverts, aborting before the still-pending work. **Fix:** invalidate after each
confirmed tx (or at minimum in `finally`).

**C2 — [HIGH] The "HARD safety" selector allowlist doesn't pin `to`.**
`EstateUpkeep.tsx:37-38` checks only the 4-byte selector, then signs `to: c.to` unmodified. A malformed/MITM'd
`/upkeep` response can point `to` at an arbitrary contract whose selector collides with one of the 3 (4-byte
collisions are trivial to mint). No ETH value is sent, but combined with any pre-existing token approval to that `to`
it's exploitable — and the comment claims a guarantee it doesn't provide. **Fix:** allowlist `(to, selector)` pairs
against the two known diamonds from `sessionSpec.ts`.

**C3 — [MED/HIGH] Any `/upkeep` error makes the whole card silently vanish.**
`EstateUpkeep.tsx:53` (`if (!data) return null`). The route 502s on RPC failure (`routes/steward.ts:65-67`) and on the
all-lent-out claim case (`encode.ts:33-34`, `service.ts:31`). `isError` is never surfaced → the panel just disappears,
looking broken. **Fix:** render an error+retry state; fix the all-lent 502 (finding C6).

**C4 — [MED] Mid-run account switch keeps signing the previous account's plan.** `EstateUpkeep.tsx:30-42` closes over
stale `data`/account; switching accounts mid-loop submits the old account's calls → reverts/wasted gas. **Fix:** re-check
`owner`/account each iteration and abort on change.

**C5 — [MED] No chain re-check inside the loop.** `EstateUpkeep.tsx:38` hardcodes `chain: base`; a network switch mid-run
throws a cryptic error. **Fix:** re-check chain per iteration.

**C6 — [LOW/MED] `/upkeep` 502s when claim is due but every gotchi is lent-out** instead of returning the pet/channel
calls it could. `service.ts:31-32` + `encode.ts:33-34`. **Fix:** degrade gracefully (skip claim, keep pet/channel).

**C7 — [LOW] `waitForTransactionReceipt` has no timeout** (`EstateUpkeep.tsx:40`) → a replaced/dropped tx hangs the loop
with `busy` stuck; **`publicClient?.` optional-chaining** silently skips confirmation if undefined; **`switchChain`
rejection is swallowed** (`:77`).

---

## D. New scope you asked for — "lending" as a chore (DECISION NEEDED)

Today's chores are pet / channel / claim only. There's already a *separate* lending auto-relist cron
(`server/lending/relist.ts` + `cron.ts`). "Automate lending" inside Steward means adding a 4th chore — but listing a
rental is a value/asset action, which **widens the session key beyond the 3 read-safe selectors** and breaks the
"it can ONLY pet/channel/claim, never list/sell" custody promise the wizard makes today. Options:
1. Keep lending as its own relayer cron (already exists), surfaced on the Steward page but not inside the scoped key.
2. Add a `list`/`addGotchiListings` selector to the session scope — re-audit custody, update the wizard's "can NEVER
   list" copy, re-verify on-chain. Bigger blast radius if the scope enforcement (A1) is ever wrong.
Recommend **(1)** unless you specifically want rental listing under the session key. Note: rental relisting fees/gas —
decide whether that too must be player-funded (it's currently a relayer cron = operator gas).

---

## E. Housekeeping (LOW)
- `chain.ts:41,46` subgraph enumeration truncates whales (`aavegotchis first:200`, `parcels first:500`, no pagination).
- `enrollAuth.ts` signature binds no nonce/chainId (15-min replay window; low impact — on-chain power still gated).
- `cron.ts:45` in-memory `failures`/`lastManualRun` maps never pruned; enroll `SELECT`-then-`INSERT` has no unique
  constraint (safe single-process, races multi-process).

---

## Recommended sequencing
1. **Now (no external deps):** land B1 (blocker) + B2/B3/B4/B5 + C1/C2/C3. This makes the surface safe to expose and
   fixes the live Path-2 bugs real users hit today.
2. **You line up:** Rhinestone/Pimlico key + funded Base Sepolia wallet + a 7702 wallet → we run A1 verification and
   PROVE gas debits the player, not you (kills the gas wall).
3. **After A1 passes:** flip `VITE_STEWARD_AUTOMATION=1` + set the steward env in `docker-compose.yml`, ship the wizard.
4. **Decide D** (lending scope) — recommend keeping it as the existing separate relayer cron.
