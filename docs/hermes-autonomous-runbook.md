# Hermes Autonomous — delegated-signing go-live runbook

Bringing the autonomous cron (`server/companion/autonomousCron.ts`) from **dormant** to **live**.
Until every step below is done, the cron is a safe no-op: it starts only when `HERMES_AUTONOMOUS=1`,
and even then acts **only** for wallets that granted a Steward session key (zero enrollments ⇒ no-op).

> **Safety invariant (never violate):** the autonomous path's only actuator is `runUpkeep` →
> the Steward session key, on-chain-scoped to `pet` / `channel` / `claim`. It can never transfer,
> approve, or move funds. Anything that widens this scope is a bug — stop and revert.

Cross-refs: `steward-aa-phase1-state` memory, `deploy/docker-compose.yml`, `server/steward/*`,
`.github/workflows/deploy-autorenew.yml`.

## Preconditions
- Steward AA Phase 1 proven on Base mainnet (it is — see `steward-aa-phase1-state`).
- `STEWARD_ATTESTER` already attested live (`0x74B1…`).
- Never fund the burned wallets `0x8551` / `0x1216`.

## 1. Bundler
Bring up the Alto bundler from `deploy/docker-compose.yml`:
- Set `STEWARD_BUNDLER_URL` and fund `STEWARD_BUNDLER_EXECUTOR_KEY` with a **small Base ETH float**
  (it fronts each `handleOps` and is reimbursed in-protocol; the player pays the real userOp gas).
- Without the executor key the alto container restart-loops — confirm it's healthy before proceeding.

## 2. Flags (GitHub secrets → deploy workflow sync)
Set these repo secrets so the deploy workflow writes them into the VPS `.env`:
- `VITE_STEWARD_AUTOMATION=1` — turns on the Steward automation UI / enroll path.
- `HERMES_AUTONOMOUS=1` — starts the autonomous cron at boot (synced by
  `.github/workflows/deploy-autorenew.yml`; unset ⇒ stays OFF).
Push to `main` (or re-run the deploy workflow) to sync + rebuild.
Confirm in the VPS boot log: `[hermes] autonomous cron started`.

## 3. Enroll (per owner — one-time)
Each owner enrolls once through the existing Steward enroll flow: **one wallet signature** granting
the session key scoped to `pet`/`channel`/`claim`. No enrollment ⇒ no autonomy for that wallet.
The owner also sets a standing goal (`keep_emptied`) via the chat **Auto-collect** toggle
(`POST /api/companion/goals`, owner-signed with the 24h action signature).

## 4. Verify
- Trigger one autonomous pass on a **test wallet** (wait for a `*/30` tick, or invoke
  `runAutonomousPass(liveDeps())` manually in a REPL against the live DB).
- `GET /api/companion/actions/:wallet/:tokenId` shows a fresh `auto-upkeep` entry.
- On next chat-panel open, the "while you were away…" greeting appears.
- **Safety check:** confirm the session key CANNOT call any non-allowlisted selector — attempt a
  disallowed call and confirm it reverts / is rejected. If any funds-moving selector succeeds, the
  invariant is broken — kill `HERMES_AUTONOMOUS`, revoke the key, and investigate before re-enabling.

## Rollback
- Fast kill: unset `HERMES_AUTONOMOUS` (or set `0`) and redeploy → cron stops at next boot.
- Per-wallet: owner revokes the Steward enrollment (status → `revoked`) → `isEnrolled` false ⇒ skipped.
- Goals persist independently; disabling a goal (`enabled=false`) also removes it from the active set.

---

# Session log — 2026-07-05

Full record of the session that verified go-live readiness and shipped the free-tier / persona
changes. Kept here per request so this runbook is the single source of truth for the autonomous work.

## A. Go-live readiness — LIVE-VERIFIED this session
Not handoff assumptions — each row was checked against prod today.

| Runbook step | State | Evidence |
|--------------|-------|----------|
| 1. Bundler | **Configured, runtime unverifiable remotely** | `deploy/docker-compose.yml`: Alto bound to `http://alto:3000` on the internal compose network, **no published host port**; `STEWARD_BUNDLER_EXECUTOR_KEY` secret set. Container health/funding only visible via hPanel (SSH refused). |
| 2. Flags | **Both set ✅** | GH secret `HERMES_AUTONOMOUS` set (2026-07-04); `VITE_STEWARD_AUTOMATION` set in **Vercel Production** (16h before check) via `vercel env ls production`. |
| — API live | **✅** | `GET /api/steward/pet-operator` → `{operator:"0xFfaD5434d5f53d94310852be1B495d02161Ac06B",configured:true}`. |
| 3. Enroll | **ZERO enrollments — cron is a confirmed no-op** | `GET /api/steward/status?owner=0xc4Cb…AaD96` → `{"enrollments":[]}`. |
| — prepare-sign path | **Working** | `GET /api/steward/upkeep?owner=0xc4Cb…` → `summary {pet:7,channel:0,claim:0}`, real `interact` call (selector `0x22c67519`) to Aavegotchi diamond `0xA99c4B…`. |
| 4. Safety verify | **Code-half DONE; on-chain half PENDING** | See §B. |

## B. Safety invariant §4 — code-layer half now guarded
`server/steward/encode.ts` `workPlanToCalls` can only ever emit `interact` (pet) /
`channelAlchemica` / `claimAllAvailableAlchemica` — no funds-moving path exists in the encoder.
Pinned by a regression test (`server/steward/encode.test.ts`, commit `f4f767d`): every emitted
selector must be one of those three and must NOT be `transfer`/`transferFrom`/`approve`/
`setApprovalForAll`/`safeTransferFrom`. Cross-checked: the live `/upkeep` call above emits exactly
the allowlisted `interact` selector. **The on-chain half of §4 (submit a disallowed selector from a
real session key on Base and confirm it reverts) still requires an enrolled wallet key — cannot be
done without the owner signing.**

## C. What remains to flip autonomy on (needs the owner's wallet — not scriptable here)
1. **Enroll one gotchi** via the now-live `/steward` wizard (one EIP-712 owner signature + 7702
   session-key grant). On success `/api/steward/status?owner=<you>` flips `[]` → active, and the
   cron acts on the next `*/30` tick.
2. **On-chain safety verify** (§4 above) from the enrolled session key.
- After enrollment, live verification IS scriptable: poll `/api/steward/status` for the active row,
  then watch `/api/companion/actions/:wallet/:tokenId` for the first `auto-upkeep` entry.

## D. Companion changes shipped this session (context — not autonomy-related)
Free-tier token budget + persona quality; all merged to `main` and deployed:
- **Token trim** (PR #10, `68faa3e`): `max_tokens 450→320` in `complete()`/`completeWithTools()`; chat history window `20→8`.
- **Conditional `SITE_OVERVIEW`** (PR #10, `f92d198`): the ~221-token nav map now injects only on site/how-to messages (`buildPersonality` gained optional `includeSiteOverview`, default true; `/chat` gates it). Measured 221 tokens saved per social turn.
- **Persona warmth guardrail** (`65abcc9`): high-SPK "eerie oracle" gotchis (SPK ≥ 75) get a "playfully spooky, never cold/cryptic/alien" line so they stay warm/helpful; 0 extra tokens for all other gotchis.
- **Safety-invariant test** (`f4f767d`): §B above.

> Note: `docs/2026-07-04-companion-hermes-session-handoff.md` §5 (in-progress/next steps) is now
> stale — items 5.1–5.3 are shipped (above) and 5.4 is tracked here.
