# Steward v2 — delegated estate automation (no 7702)

**Status:** design / spec. Supersedes the Phase-1 EIP-7702 session-key approach for the *browser* entry
point. Date: 2026-07-03.

## Why this exists
Phase-1 Steward automated pet/channel/claim via an EIP-7702 session key. The contract logic was proven
on-chain, but the **browser entry point is fundamentally blocked**: injected wallets (MetaMask/Rabby)
cannot sign an EIP-7702 authorization over JSON-RPC (viem: "Account type json-rpc is not supported";
maintainers: impossible until an ERC exists). So a real user can't set it up.

**Steward v2 drops 7702 entirely.** Instead the owner grants three plain, revocable **delegations** any
wallet can sign, and a small **GasTank** contract holds the owner's gas and enforces scope. All three
chores are delegatable with mechanisms that already exist on Base and were **verified on-chain 2026-07-03**
(anvil fork of Base mainnet):
- **Pet** → `setPetOperatorForAll(operator, true)` (already used by every autopet service).
- **Channel + Claim** → Realm access rights: `createWhitelist([operator])` +
  `setParcelsAccessRightWithWhitelists(parcels, [0=channel, 1=reservoir], [2=whitelisted, 2], [wlId,wlId])`.
  Proven: a whitelisted non-owner passes `verifyAccessRight` for BOTH channel and reservoir; a random
  address stays blocked; `claimAllAvailableAlchemica` sends alchemica **to the owner** (no theft vector).

## Custody guarantees (the three hard rules)
1. **Owner pays exact gas.** The GasTank reimburses the relayer at most `gasUsed × tx.gasprice` from the
   owner's own deposited balance — metered in-contract, so there is no room for a markup.
2. **Operator custodies nothing.** Gotchis/parcels never move (pure delegation). The gas float lives in the
   GasTank contract, **withdrawable by the owner anytime** — never in an operator wallet.
3. **Selling is safe.** The cron reads live on-chain ownership each run; assets the owner no longer holds
   drop out and are skipped. Revoking (reset access rights / setPetOperatorForAll false / withdraw) kills it.

## Competitive context (researched 2026-07-03)
gotchi.world = **petting only**, daily **prepaid non-refundable** subscription (a fee = their profit).
`orden-gg/autopet` = contract-as-pet-operator + subscription — proves the contract-operator pattern is
safe and battle-tested. Every other tool is petting-only. **Nobody delegates channel + claim, nobody offers
withdrawable escrow, nobody passes gas through at cost with receipts.** Those three are Steward v2's edge.

## Architecture

### A. On-chain delegation (owner one-time, any wallet)
A short sequence of normal txs in the recruit wizard, scaled to chosen chores:
- pet → `setPetOperatorForAll(GASTANK, true)` on the Aavegotchi diamond.
- channel/claim → `createWhitelist("gc-steward", [GASTANK])` (Aavegotchi diamond WhitelistFacet) then
  `setParcelsAccessRightWithWhitelists(realmIds, actions, [2,…], [wlId,…])` on the Realm diamond, with the
  arrays flattened to one entry per (parcel, action) tuple (contract requires equal lengths — "Mismatched
  arrays" otherwise).
- gas → `GasTank.deposit()` a float.

### B. GasTank contract (the one genuinely new piece)
An escrow **and** a scoped forwarder. Non-custodial, profit-impossible-by-construction.
- `deposit()` payable / `withdraw(amount)` — owner funds and pulls their **own** balance anytime.
- `run(owner, Call[] calls)` — callable only by an allowlisted operator relayer. It:
  1. rejects any call whose `(target, selector)` is not in the on-chain allowlist — exactly
     `AAVEGOTCHI_DIAMOND.interact`, `REALM_DIAMOND.channelAlchemica`, `REALM_DIAMOND.claimAllAvailableAlchemica`
     (the scope guarantee is enforced by the contract, not just the backend);
  2. executes the calls (msg.sender = GasTank, which the owner whitelisted, so access passes);
  3. meters `gasUsed` **inside the call** (gasleft before/after the executed actions), computes
     `cost = min(gasUsed × tx.gasprice, ownerCapPerRun, ownerBalance)`, debits the owner's balance, and
     pays `cost` to the relayer. Because in-contract `gasUsed` is a strict **subset** of the whole tx's
     gas (it excludes the 21k intrinsic + calldata + the refund transfer itself), the reimbursement is
     **always ≤ what the relayer actually paid** — profit is impossible by construction, and the operator
     absorbs the small unmetered intrinsic overhead as the cost of that guarantee (pennies on Base).
  4. emits **`Reimbursed(owner, gasUsed, weiCharged, pet, channel, claim)`** — the on-chain receipt.
- `setOwnerCapPerRun(max)` — owner-set ceiling so a buggy/hostile operator can't drain the float; run
  reverts (and is skipped) if it would exceed the cap or the balance.
- Owner can withdraw + the actions stop working the instant they reset access rights — two independent kill
  switches (contract-level and Realm-level).

**Reimbursement is capped at cost by contract math**, and every charge is a public event. The dashboard
renders these events as a ledger — "Run {date}: pet 8 · channel 3 · claim 2 → 0.0000041 ETH ⛽ [basescan↗]" —
so an owner can prove on-chain that what left their balance equals the gas the tx burned. Zero markup,
provable, not promised.

### C. Backend — ~80% reused from Phase-1 Steward
Reused unchanged: `dueWork.ts` (cooldown gating, **highest-kinship → highest-level-altar** channel
rotation — identical to Land Management's channel-all, already coded), `chain.ts` (snapshot: ownership,
kinship, altars, cooldowns, claimable), `encode.ts` (WorkPlan → calls), the enrollment DB, and the routes.
Changes:
- **Submission:** replace the 7702 bundler (`aa.ts`) with a `GasTank.run(owner, calls)` call from the
  operator relayer. Simpler — a normal contract call, no bundler, no userOps, no attestation.
- **Cron gating (your two rules):** skip a run when Base **base fee is above a configurable threshold**
  (retry when it calms); skip when the owner's **GasTank balance is below** a run's worst-case cost (flag a
  top-up). Pre-submit `eth_call` simulation still drops any action that would revert.
- **Channel scope option:** the channel chore carries `channelScope ∈ {stewardGotchiOnly, allGotchis}`,
  default `allGotchis` (max yield). `stewardGotchiOnly` filters the channeler set to the steward gotchi;
  `allGotchis` uses the full highest-kin→highest-altar rotation. Lent-out gotchis are excluded from
  channeling (they revert) but still petted.

### D. Frontend — the recruit wizard minus the 7702 wall
- **Wizard:** pick chores + interval → (channel) pick scope (steward gotchi / all gotchis) → sign the
  delegation approvals (setPetOperator, createWhitelist, setAccessRights — a few normal txs) → deposit a gas
  float → on duty. Works with any wallet incl. Ledger.
- **Dashboard:** on-duty status, this-week totals, next run, gas-float balance + top-up/withdraw, and the
  **receipts ledger** (from `Reimbursed` events). One-tap **Revoke** = reset access rights + setPetOperator
  false + withdraw.

## Data model (enrollment, additive to the existing store)
- existing: owner, steward gotchi, chores{pet,channel,claim}, intervalSec, status, lastRunAt.
- new: `channelScope`, `gasCapPerRun` (mirror of the owner's on-chain cap for display), `whitelistId`.

## Out of scope
Swapping alchemica→GHST, buying, rentals automation, any value-moving action beyond claim-to-owner. The
GasTank never custodies NFTs. No 7702, no bundler, no paid vendor.

## Risks / open decisions
1. **GasTank holds user funds → it must be audited** before mainnet. This is the one heavy, real-risk piece;
   everything else is reuse. Keep it minimal (deposit/withdraw/run/cap + events) to shrink the surface.
2. **Operator allowlist trust:** the relayer can trigger runs but can only make the 3 scoped calls and can
   only pull ≤ metered gas ≤ owner cap. Worst case = nuisance runs that cost the owner (capped) gas; no theft.
3. **Access-rights persistence on transfer:** if an owner sells a parcel with access still whitelisted, the
   new owner inherits stale access — but the cron only acts on *enrolled* owners' *currently-owned* parcels,
   so it won't touch it; and claim pays the current owner anyway. Document; optionally auto-reset on unenroll.
4. **Whitelist address cap / gas of setup:** batching setAccessRights across many parcels; chunk if needed.

## Verification / definition of done
- Contract: full unit tests (deposit/withdraw/cap/scope-rejection/metered-reimbursement); the reimbursed
  amount is always ≤ actual tx gas in tests; scope allowlist rejects any non-{interact,channel,claim} call.
- On-chain (Base Sepolia or fork): enroll → run → confirm channel/claim/pet executed as the GasTank,
  alchemica went to the owner, and the `Reimbursed` event equals the tx gas; withdraw returns the float.
- Backend: `dueWork` scope option + gas-price gating + balance gating unit-tested; cron submits via GasTank.
- Frontend: wizard completes the delegation + deposit with a normal injected wallet (the thing 7702 couldn't);
  dashboard ledger reconciles to on-chain `Reimbursed` events; revoke provably stops all three chores.
