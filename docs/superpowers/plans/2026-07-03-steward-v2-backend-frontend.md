# Steward v2 — Backend + Frontend Integration Plan (Plans 2 & 3)

> Turnkey remaining work after **Plan 1 (GasTank contract, DONE)**. These steps need the GasTank
> **deployed to a chain** (Base Sepolia first) to verify end-to-end, so they're gated on the deploy.
> Spec: `docs/superpowers/specs/2026-07-03-steward-v2-delegated-automation-design.md`.

## Already DONE on branch `feat/steward-v2-gastank`
- `contracts/GasTank.sol` + Foundry tests (19 green) + README + security review/fixes.
- `server/steward/dueWork.ts` — `channelScope` option (steward-gotchi-only vs all-gotchis). Tested.
- `server/steward/gating.ts` — `gasPriceTooHigh` + `floatCoversRun` pure gating. Tested.

## Gate: deploy GasTank to Base Sepolia (operator, one-time)
`forge create contracts/GasTank.sol:GasTank --constructor-args 0xA99c4B08201F2913Db8D28e71d020c4298F29dBF 0x4B0040c3646D3c44B8a28Ad7055cfCF536c05372 --rpc-url https://sepolia.base.org --private-key <funded deployer>`
→ `setOperator(<relayer addr>, true)` → set `STEWARD_GASTANK_ADDRESS` in `.env`. (Sepolia has different
diamond addresses; for a pure contract-mechanics test any two addresses work, but a real end-to-end run
needs mainnet-forked or mainnet.)

---

# Plan 2 — Backend integration

## Task 2.1: enrollment fields (channelScope, gasCap, whitelistId)
**Files:** `server/steward/db.ts` (+ `db.test.ts`), `server/steward/validate.ts` (+ test).
- Add columns to `steward_enrollments`: `channel_scope TEXT` (default `'allGotchis'`), `gas_cap_wei TEXT`
  (stringified bigint, the owner's on-chain per-run cap for display), `whitelist_id INTEGER` (the Realm
  whitelist created at enroll). Use the existing idempotent-migration pattern (ALTER guarded by a column
  check, plus the column in CREATE TABLE) exactly like `auth_mode` was added.
- Extend `parseEnrollBody` to accept + validate `channelScope ∈ {stewardGotchiOnly, allGotchis}` (default
  allGotchis) and optional `whitelistId`.
- TDD: db round-trips the new fields; validate rejects a bad channelScope; existing tests stay green.

## Task 2.2: GasTank run encoder
**Files:** create `server/steward/gasTank.ts` (+ `gasTank.test.ts`).
- Reuse `encode.ts`'s `workPlanToCalls(plan)` → `Call[] {to,data}`. Add
  `encodeGasTankRun(owner, calls, counts)`: `encodeFunctionData` against a minimal GasTank ABI
  (`run(address,(address,bytes)[],uint16,uint16,uint16)`) with `counts = {pet, channel, claim}` = the
  WorkPlan array lengths. Pure → unit-test the produced calldata selector + decoded args round-trip.
- Export `GASTANK_ABI` (run + deposit + withdraw + setCapPerRun + balanceOf + capPerRun + Reimbursed event).

## Task 2.3: submitter — swap the 7702 path for GasTank
**Files:** `server/steward/cron.ts`, new submitter beside `aa.ts` (or repurpose it).
- New `makeGasTankSubmitter()`: the operator relayer sends ONE tx to `STEWARD_GASTANK_ADDRESS` calling
  `run(owner, calls, pet, channel, claim)`. Relayer key = existing `STEWARD_PET_RELAYER_KEY` (already funded
  + allowlisted via `setOperator`). Reuse the pre-submit `simulateContract` from `chain.ts`.
- In `cron.ts runOne`: before submitting, read the current base fee + the owner's `balanceOf(owner)` and
  `capPerRun(owner)` from the GasTank, and gate with `gasPriceTooHigh` / `floatCoversRun` (skip + log a
  reason otherwise). Pass `channelScope`/`stewardGotchiId` from the enrollment into `computeWork`.
- Gate the whole steward cron behind `STEWARD_GASTANK_ADDRESS` (like it was gated behind the bundler URL).
- Verify on a mainnet fork (anvil): whitelist GasTank for a test owner, fund their float, run the cron once,
  assert the actions executed and `Reimbursed` fired with `weiCharged ≤ tx gas`.

## Task 2.4: receipts ledger (Reimbursed events → API)
**Files:** `server/routes/steward.ts`, a small reader in `server/steward/chain.ts` or `gasTank.ts`.
- `GET /api/steward/receipts?owner=` → read `Reimbursed(owner indexed, ...)` logs from the GasTank via
  `getLogs` (topic-filtered by owner), decode into `{ ts, txHash, gasUsed, weiCharged, pet, channel, claim }`,
  newest first. Cache lightly. Also expose `GET /api/steward/float?owner=` → `{ balanceWei, capWei }` from
  `balanceOf`/`capPerRun`. TDD the decode with a fixture log.

---

# Plan 3 — Frontend

## Task 3.1: delegation setup in the wizard (replaces the 7702 authorize step)
**Files:** `src/lib/steward/delegation.ts` (new, pure encoders + tests), `src/components/steward/RecruitWizard.tsx`.
- Pure `delegation.ts`: builders for the three approval txs — `setPetOperatorForAll(GASTANK,true)` (Aavegotchi
  diamond), `createWhitelist("gc-steward",[GASTANK])` (Aavegotchi WhitelistFacet), and
  `setParcelsAccessRightWithWhitelists(realmIds, actions, accessRights=2, whitelistIds)` (Realm) — arrays
  flattened one-per-(parcel,action). Unit-test the encodings. NOTE the whitelist id must be read from the
  `createWhitelist` receipt (WhitelistCreated event or `getWhitelistsLength`) before the access-rights tx.
- Wizard step order: pick chores → (channel) pick scope (steward gotchi / all) → sign approvals (only the
  ones the chosen chores need) → `GasTank.setCapPerRun(cap)` + `deposit()` a float → enroll POST. Any wallet,
  no 7702. Ledger note: petting needs only the pet-operator approval; channel/claim need the whitelist +
  access-rights txs.

## Task 3.2: dashboard — float + receipts + revoke
**Files:** `src/components/steward/ManageView.tsx`, `src/hooks/useSteward.ts`.
- Show GasTank float (`/float`) with top-up (`deposit`) and **withdraw** buttons; the receipts ledger
  (`/receipts`) rendered as "Run {date}: pet N · channel N · claim N → {ETH} ⛽ [basescan↗]", reconciling to
  on-chain `Reimbursed`.
- **Revoke** = `setPetOperatorForAll(GASTANK,false)` + reset parcel access rights to owner-only +
  `withdraw(full balance)` + server `revoke`. Two independent kill switches (Realm access + the float).

## Task 3.3: flip it on
- Testnet smoke test with a real wallet (the thing 7702 couldn't do): complete the wizard, confirm a cron
  run executed and YOUR float paid, withdraw the remainder.
- Then `VITE_STEWARD_AUTOMATION=1` + `VITE_STEWARD_GASTANK_ADDRESS` on Vercel; `STEWARD_GASTANK_ADDRESS` on
  the VPS. Reveal nav (`VITE_STEWARD_NAV=1`) when ready.

## Before mainnet (from the security review)
Fix the two documented GasTank limitations (bind charged owner ↔ actual calls; aggregate/rate-limit) and get
a professional audit — it holds real user ETH.
