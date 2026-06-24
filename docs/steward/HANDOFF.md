# Steward — implementation handoff (as-built 2026-06-24)

Where the feature stands so any agent/human can pick it up. Branch: **`feat/steward`** (PR #2 → `main`).
Everything below is implemented and green: `pnpm typecheck` 0 · `npx eslint . --ext ts,tsx` 0 ·
`npx vitest run` 425 pass · deterministic e2e (`npx playwright test`) 46 pass.

The original spec is `2026-06-23-steward-design.md` (+ the 4 plan files); this doc records what actually
shipped, including decisions the spec left open and everything added during review.

## What it does
Put a soul-bearing gotchi "to work" maintaining the whole estate, hands-off: auto-**pet** all gotchis,
**channel** all parcels (highest-kinship gotchi → highest-level altar, same rotation as Land Management),
and **empty reservoirs** on a schedule. Non-custodial, player-funded gas, revocable. A new `/steward` page +
backend + cron, MCP tools, and companion integration.

## Architecture as-built
- **Custody / execution — two modes (`enrollment.auth_mode`):**
  - **`session` (default):** EIP-7702 upgrades the owner's EOA to a **Nexus** smart account (same address,
    assets never move) + an **ERC-7579 smart session** (Rhinestone `@rhinestone/sdk@1.9.2`) scoped to EXACTLY
    `interact` / `channelAlchemica` / `claimAllAvailableAlchemica`. The cron signs one batched userOp with the
    session key; **gas comes from the player's own EOA** (the 7702 account IS the EOA), operator pays nothing.
  - **`operator` (Ledger-friendly fallback, pet-only):** one normal `setPetOperatorForAll(relayer,true)` approval
    (any wallet incl. Ledger, no 7702); a relayer (`STEWARD_PET_RELAYER_KEY`) calls `interact()` for the owner.
    The relayer can do nothing else and pays the (pennies) gas — the deliberate trade for a no-7702 path.
    Channel/claim are NOT available in operator mode.
- **Soul-cert gate:** a gotchi must hold an on-chain SoulSeal to be hired (read-only check; SoulSeal v2 only
  lets the lender seal, so a sealed token implies the owner did the cert). Borrowers can't seal.
- **Lent gotchis:** the lender can steward their lent-out gotchis — included in the snapshot via
  `user.gotchisLentOut`, still **petted**, but **excluded from channeling** (a lent gotchi reverts
  `channelAlchemica`). Marked "Rented out" on cards.
- **Single batched userOp per run; no-op + reverting work skipped** (pre-submit `eth_call` simulation).

## File map
Backend `server/steward/`:
- `abi.ts` — verified Base diamond addresses + `interact`/`channelAlchemica`/`claimAllAvailableAlchemica` +
  `setPetOperatorForAll`/`isPetOperatorForAll`.
- `db.ts` — enrollment + log store. Chore-exclusivity; **session key encrypted at rest** (`server/soul/crypto`),
  redacted from public reads (`listEnrollmentsForRun` is the only decrypting accessor); revoke **destroys the key**;
  `auth_mode` column (+ idempotent migration).
- `dueWork.ts` — pure due-work engine (pet/channel/claim), cooldown-gated, highest-kinship→highest-altar channel
  rotation, skips lent gotchis for channeling. Unit-tested.
- `encode.ts` — WorkPlan → batched calls (pure).
- `runner.ts` — orchestration with injected deps + optional `simulate` (drop reverting calls). Unit-tested.
- `chain.ts` — on-chain snapshot (subgraph enumerate incl. lent-out + viem reads: kinship, lastChanneled,
  altar, claimable) + `simulateCalls` (pre-submit revert filter). **Live.**
- `aa.ts` — **SESSION submitter** (Rhinestone 7702 + smart session). **Live seam, testnet-pending.**
- `petRelayer.ts` — **OPERATOR pet relayer** (verifies `isPetOperatorForAll`, then `interact`). **Live seam.**
- `service.ts` — per-owner work preview (MCP). `soulStats.ts` — single-source soul level/xp/memories.
- `cron.ts` — wakes due enrollments (session → runner+submitter; operator → relayer pet), overlap lock +
  per-enrollment exponential backoff. Gated behind `STEWARD_BUNDLER_URL` OR `STEWARD_PET_RELAYER_KEY`.
- `validate.ts` — enroll body parse (operator ⇒ pet-only).
Routes `server/routes/steward.ts` — `enroll` (verifies owner signature + soul cert, skippable via
`STEWARD_DEV_OPEN_ENROLL`), `status`/`log`/`pause`/`resume`/`revoke`/`edit-chores`, `souls`, `soul`, `pet-operator`.
MCP `server/mcp/{server,tools}.ts` — `steward_status` / `steward_log` / `steward_preview` / `steward_run_now`.
Frontend:
- `src/pages/StewardPage.tsx` — grid (ordered soul-cert → BRS), card-state routing, opens the companion with a
  playful greeting, binds the AA client fns.
- `src/components/steward/{StewardCard,RecruitWizard,ManageView}.tsx` — compact explorer-style cards (real
  on-chain SVG, soul-cert + Rented-out badges); 4-step wizard (explains each step + the session-vs-operator
  choice + a Ledger note; companion narrates each step); dashboard (On-duty-since, this-week totals, next-run,
  edit-chores, SoulDepthMeter, log, time-out/fire).
- `src/lib/steward/` — `cardState`, `api`, `sessionSpec` (the shared 3-selector scope), `enrollAuth` (shared
  signed message), `aaClient` (`issueSessionKey`/`fundGasFloat`/`approveGaslessPetting`), `logSummary`.
- `src/hooks/useSteward.ts` — react-query hooks (`useStewardStatus/Log/Mutations/SoulStats/GotchiSouls`).
- `src/state/useCompanion.ts` + `components/companion/*` — `openWith`/`say`/`script` so the gotchi chats through
  recruiting; `src/lib/companion/knowledge.ts` teaches the chat what Steward is.
- `src/components/soul/SoulCertificate.tsx` — Export/Verify gated until sealed; borrower → "contact owner".

## Env (set on the VPS for prod; see `.env.example`)
- `STEWARD_BUNDLER_URL`, `RHINESTONE_API_KEY` / `VITE_RHINESTONE_API_KEY` — session (7702) mode.
- `STEWARD_PET_RELAYER_KEY` — operator (Ledger) mode relayer (funded with a little Base ETH).
- `SOUL_SEAL_ADDRESS` (cert reads) + `SOUL_ATTESTOR_KEY` (sealing writes) — already used by the soul feature.
- `STEWARD_RPC_URL` (optional). `STEWARD_DEV_OPEN_ENROLL=1` — **local/e2e only**, skips enroll auth; MUST be unset in prod.

## ✅ Verified vs ⚠️ NOT verified
- ✅ All pure logic + stores + routes + MCP + UI compile/test/lint green; API e2e covers the full enroll lifecycle.
- ⚠️ **On-chain AA is UNVERIFIED** — the 7702 session enable + scoped submit (`aa.ts`, `aaClient.issueSessionKey`),
  the operator relayer (`petRelayer.ts`), and Ledger's EIP-7702 support all need a **Base Sepolia** run with a
  funded wallet + Rhinestone/Pimlico key. The SDK calls are written from current docs but not executed.
- ⚠️ Rhinestone API key is currently client-exposed (`VITE_`); move to its `jwt-server` token mode before prod.
- No wallet-mocked UI e2e yet (cards/wizard need a connected wallet).

## Next steps
1. Base Sepolia: enroll a test wallet (session + operator), run the cron once, confirm real txs + that
   **gas came from the player/relayer, not us**; confirm the session key is scoped + revoke kills it.
2. Switch Rhinestone auth to server-minted JWT.
3. Optional: wallet-mock Playwright e2e for the recruit/manage UI.
