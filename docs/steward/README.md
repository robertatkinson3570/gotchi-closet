# Steward — feature docs

> **Picking this up?** Start with **[HANDOFF.md](./HANDOFF.md)** — the as-built status (what shipped on
> `feat/steward`, file map, env, what's verified vs testnet-pending). The spec below is the original design;
> its "As-built (2026-06-24)" section records where it diverged.

**Steward** = put a soul-bearing gotchi "to work" maintaining your whole Aavegotchi estate, hands-off:
auto-**pet** all gotchis, auto-**channel** all parcels, auto-**empty reservoirs**. Non-custodial, the player
pays all gas (EIP-7702 session key + paymaster), runs on the VPS. See the spec for the full rationale.

## Read in this order

1. **[2026-06-23-steward-design.md](./2026-06-23-steward-design.md)** — the spec. Why now (Base agentic
   economy), the proven on-chain facts, the custody/gas model, the page UX, scope, open decisions. **Read this first.**
2. The four implementation plans, executed **in order** (each ships working, testable software on its own):

| # | Plan | Builds |
|---|------|--------|
| 1 | [plan-1-core](./2026-06-23-steward-plan-1-core.md) | `server/steward/{abi,db,dueWork}.ts` — verified ABIs, enrollment store with chore-exclusivity, pure due-work engine. No chain writes. Fully unit-tested. |
| 2 | [plan-2-execution](./2026-06-23-steward-plan-2-execution.md) | encode + runner (injected deps) + chain reader + EIP-7702 session-key submitter + cron + REST routes. |
| 3 | [plan-3-frontend](./2026-06-23-steward-plan-3-frontend.md) | beast-mode page: card grid (3 states), 4-step recruit wizard, manage/dashboard. |
| 4 | [plan-4-mcp-soul](./2026-06-23-steward-plan-4-mcp-soul.md) | expose steward actions as MCP tools (dogfood) + single-source soul XP shared with the companion chat. |

## How to execute a plan

Each plan is self-contained, bite-sized TDD (red → green → commit) with exact file paths, complete code, run
commands, and expected output. Use **superpowers:subagent-driven-development** (fresh subagent per task,
review between tasks) or **superpowers:executing-plans** (inline with checkpoints).

## Ground truth already verified (Base 8453, 2026-06-23)
- `interact` / `channelAlchemica` / `claimAllAvailableAlchemica` selectors live on the diamonds.
- Channel + claim accept a `"0x"` signature (Pixelcraft backend signer removed on the geist build).
- Channel + claim are gated by `LibRealm: Access Right - Only Owner` → the automation must execute **as the
  owner's own account** (hence EIP-7702 session keys). Owner-path claim returned NO REVERT on a real parcel.

## Key invariants (don't break)
- The session key can do **only** pet/channel/claim; it can never transfer, sell, list, or spend.
- The **player pays 100% of gas**; the operator pays none.
- Each chore (pet|channel|claim) belongs to **at most one active steward per owner**; all 3 held → no new steward.
- Cheapest gas: one batched userOp per run, fire at the cooldown floor, never submit a no-op.
