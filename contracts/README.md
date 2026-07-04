# SoulSeal Contract

A minimal Base (chain ID 8453) contract that anchors Aavegotchi soul scores on-chain via EIP-712 typed-data attestations.

## EIP-712 Domain

```json
{
  "name": "GotchiClosetSoulSeal",
  "version": "1",
  "chainId": 8453,
  "verifyingContract": "<deployed address>"
}
```

## Typed Data — SealPayload

```
SealPayload {
  uint256 tokenId
  bytes32 soulHash
  uint16  depthBips
  uint16  soulAgeDays
  uint256 nonce
}
```

- **tokenId** — Aavegotchi token ID
- **soulHash** — keccak256 of the canonical soul document (see `server/soul/soulDoc.ts`)
- **depthBips** — soul depth × 100 (e.g. depth 72.50 → 7250 bips; max 10000)
- **soulAgeDays** — bonded days at time of sealing
- **nonce** — monotone nonce (server uses `Date.now()`)

## Constructor Arguments

```
constructor(address attestor, address aavegotchiDiamond)
```

| Arg | Description |
|-----|-------------|
| `attestor` | Server address whose private key signs `SealPayload` structs. Corresponds to `SOUL_ATTESTOR_KEY` in `.env`. |
| `aavegotchiDiamond` | Aavegotchi diamond on Base. Default: `0xA99c4B08201F2913Db8D28e71d020c4298F29dBF` |

## Deploy Note

No Solidity toolchain is included in this repo. The operator deploys with their own tooling (e.g. `forge create`, `hardhat run`, Remix, etc.). After deployment, set `SOUL_SEAL_ADDRESS` in the server `.env` to the deployed contract address.

## Seal Flow

1. Server computes `soulHash` and `depthBips` from the live soul document.
2. Client calls `POST /api/soul/:tokenId/seal` → server returns `{ payload, attestorSig, contract }`.
3. User submits `seal(tokenId, soulHash, depthBips, soulAgeDays, nonce, attestorSig)` from their wallet.
4. Contract verifies attestor signature + gotchi ownership, then stores the `SealRecord`.

## GasTank Contract

Non-custodial gas escrow + scoped forwarder for Steward v2 estate automation. Lets an operator run an
owner's pet/channel/claim actions while the owner pays exactly-metered gas from a withdrawable deposit.

### Constructor
`constructor(address aavegotchiDiamond, address realmDiamond)` — deployer becomes `admin` (manages the
operator allowlist). Base: `0xA99c4B08201F2913Db8D28e71d020c4298F29dBF` / `0x4B0040c3646D3c44B8a28Ad7055cfCF536c05372`.

### Owner functions (any wallet)
- `deposit()` payable — add to your own gas float.
- `withdraw(uint256)` — pull your float back anytime (non-custodial).
- `setCapPerRun(uint256)` — REQUIRED max wei reimbursable per run. `0` = paused (a run reverts `"cap not set"`);
  a positive cap must be set before automation can charge you.

### Admin
- `setOperator(address, bool)` — allow/deny a relayer to call `run`.

### run(owner, Call[] calls, pet, channel, claim) — operator only
Executes ONLY `interact` (Aavegotchi `0x22c67519`) / `channelAlchemica` (Realm `0x8027870e`) /
`claimAllAvailableAlchemica` (Realm `0xbc6dc2f0`) as `msg.sender` (the contract, which the owner has
whitelisted on-chain via `setPetOperatorForAll` + `setParcelsAccessRightWithWhitelists`). Reverts on any
other (target, selector), empty calls, or an unset cap. Reimburses the operator
`min(meteredGas × tx.gasprice, ownerCap, ownerBalance)` — always ≤ the gas actually burned — and emits
`Reimbursed(owner, operator, gasUsed, weiCharged, pet, channel, claim)` as the on-chain receipt
(`weiCharged == gasUsed × tx.gasprice` when under the cap/balance, so it reconciles exactly).

### Fund-safety properties (verified by `contracts/test/GasTank.t.sol`)
- Non-custodial: owners withdraw their full balance anytime.
- No profit: reimbursement is metered-gas-bounded (a strict subset of the tx's gas), capped, and
  balance-clamped — proven by a fuzz invariant.
- Scope: only the three (diamond, selector) pairs execute; wrong selector OR wrong target reverts.
- Reentrancy-guarded (deposit/withdraw/run share a lock; CEI ordering).

### Known limitations — MUST address before mainnet (holds real ETH → get a professional audit)
1. **owner↔calls decoupling (HIGH):** `run` charges `balanceOf[owner]` but does not verify on-chain that
   the `calls` pertain to `owner`'s gotchis/parcels. A compromised/rogue *operator* (the admin-allowlisted
   relayer) could charge any funded owner for unrelated work, bounded by that owner's cap + balance. Not an
   external exploit (only allowlisted operators can call `run`), but fix before mainnet — e.g. bind calls to
   `owner` (decode + verify token/parcel ownership) or require an owner-signed authorization per run.
2. **cap is per-run, not aggregate (MEDIUM):** the mandatory cap bounds a single run; a compromised operator
   could still drain an owner across many runs up to their balance. Add a per-owner per-window budget or a
   min-interval cooldown before mainnet.
3. Ship **testnet-first**; run the full flow on Base Sepolia and get `GasTank.sol` audited before it holds
   real user ETH.

### Deploy
No JS toolchain change. Build + deploy with forge:
`forge create contracts/GasTank.sol:GasTank --constructor-args <aave> <realm> --rpc-url <base> --private-key <deployer>`.
Then `setOperator(<relayer>, true)` and set `STEWARD_GASTANK_ADDRESS` in the server `.env` (used by the
backend plan). Owners must `setCapPerRun(...)` a positive value + `deposit()` before automation runs.
