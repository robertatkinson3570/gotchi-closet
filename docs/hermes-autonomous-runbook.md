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
