# Steward — Executor Agent Prompt

Paste the block below into a fresh executor agent (new Claude Code session or subagent) to build the feature.

```
You are implementing the "Steward" feature in the gotchi-closet repo
(C:\Cursor\gotchi-closet). All design + plans live in docs/steward/.

START HERE
1. Read docs/steward/README.md, then docs/steward/2026-06-23-steward-design.md
   (the spec) in full before writing any code.
2. Execute the four plans IN ORDER. Do not start a plan until the previous one
   is green:
     - docs/steward/2026-06-23-steward-plan-1-core.md
     - docs/steward/2026-06-23-steward-plan-2-execution.md
     - docs/steward/2026-06-23-steward-plan-3-frontend.md
     - docs/steward/2026-06-23-steward-plan-4-mcp-soul.md

HOW TO WORK
- First create an isolated git worktree/branch for this feature.
- Each plan is bite-sized TDD. Follow every step literally: write the failing
  test, RUN it and confirm it fails, write the minimal code, RUN it and confirm
  it passes, then commit. Do not skip the "confirm it fails" step. Do not batch
  multiple tasks into one commit.
- This repo uses pnpm + vitest. Tests: `npx vitest run <path>`. Typecheck:
  `pnpm typecheck`. Lint: `npx eslint . --ext ts,tsx`. Follow existing repo
  patterns (see server/companion/db.ts, server/lending/relist.ts,
  src/lib/lending/contracts.ts, server/mcp/tools.ts).
- After each plan, the full suite + typecheck + lint must be green before moving on.

HARD INVARIANTS (never violate; these are STOP conditions if you can't hold them)
- The session key may do ONLY pet/channel/claim. It can never transfer, sell,
  list, or spend. If a design widens that, STOP and report.
- The PLAYER pays 100% of gas via their own EIP-7702 account + paymaster float.
  The operator pays nothing. If any path makes us pay user gas, STOP.
- Each chore (pet|channel|claim) belongs to at most one active steward per owner;
  once one steward holds all 3, no new steward can enroll.
- Cheapest gas: one batched userOp per run, fire at the cooldown floor, never
  submit a no-op transaction.

TWO KNOWN UNKNOWNS (handle explicitly, don't paper over)
- The AA stack (Plan 2 aa.ts / Plan 3 wizard) is the one real integration risk.
  Pin the permissionless.js version you install and verify the EIP-7702 +
  smart-session API against current Pimlico docs. Keep all version-specific code
  in the single seam the plan calls out (aa.ts:load7702SessionAccount and the
  wizard's issueSessionKey). Verify on Base Sepolia before mainnet.
- Petting: `interact` is permissionless on this Base build, but before relying on
  that, confirm a non-owner `interact` actually advances kinship (state diff). If
  it does not, use the setPetOperatorForAll operator route (selectors verified in
  plans/006-gasless-petting.md).

GROUND TRUTH (already verified live on Base 8453, 2026-06-23 — in the spec)
- interact / channelAlchemica / claimAllAvailableAlchemica selectors are live.
- channel + claim accept a "0x" signature (backend signer removed on geist build).
- channel + claim are gated by "LibRealm: Access Right - Only Owner", so the
  automation MUST execute as the owner's own account (that's why we use 7702
  session keys, not a third-party relayer). Owner-path claim returned NO REVERT
  on a real parcel.

OUTPUT
- Work plan-by-plan, task-by-task, committing as you go. After each plan, post a
  short status: what shipped, test/typecheck/lint results, and anything you had
  to deviate on (especially AA-SDK specifics). If a STOP condition triggers, stop
  and report instead of working around it.
```
