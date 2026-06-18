# Gotchi Management Extras — Design Spec

**Date:** 2026-06-18
**Status:** Draft → ready to build (ABIs verified)
**Project:** gotchi-closet
**Reference:** `2026-06-18-dapp-parity-overview.md`

Closes the remaining owned-gotchi management actions the dapp has that we don't.
All on the **aavegotchiDiamond** unless noted. All ABIs verified from the dapp config.

---

## 1. Features

### A. Open Portal & Summon
The flagship missing flow. A closed portal (ERC721 cat 0) is opened, revealing 10
candidate ghosts; you pick one and summon it (staking collateral).

- `openPortals(uint256[] _tokenIds)` — opens (VRF reveal).
- `portalAavegotchiTraits(uint256 _tokenId)` — read the **10 options** (traits +
  collateral + minimum stake) to display the picker.
- `claimAavegotchi(uint256 _tokenId, uint256 _option, uint256 _stakeAmount)` — summon
  option `0..9`, staking `_stakeAmount` of that option's collateral.

Flow: Open -> poll `portalAavegotchiTraits` until populated (VRF) -> show 10 ghost cards
with traits/BRS/collateral -> user picks + sets stake (>= minimum) -> approve collateral
ERC20 -> `claimAavegotchi`.

### B. Set Pet Operator
- `setPetOperatorForAll(address _operator, bool _approved)` — approve another address
  (a "pet bot" / friend) to pet all your gotchis. Toggle + address input.

### C. Rename / Naming
- `setAavegotchiName(uint256 _tokenId, string _name)` — we may already do rename via a
  different path; confirm and consolidate. Name must be unique/allowed (contract
  validates; surface reverts). (`gotchiDomainDiamond` `0xF6c1b83977…d498` may govern
  name registration — verify whether naming goes through it on Base.)

### D. Channel / Claim Alchemica
- `claimAvailableAlchemica(uint256 _realmId, uint256 _gotchiId, bytes _signature)` —
  claims a gotchi's available alchemica from a parcel. **Requires a backend signature**
  (the dapp's alchemica API signs the claim). This is gotchiverse-coupled.
- Scope decision: v1 = **show claimable alchemica** (read from gotchiverse/alchemica
  subgraph) and link out, OR implement the signed claim if we can reproduce/relay the
  signer. Channeling proper (cooldown-based spillover) is gotchiverse gameplay — likely
  out of v1; document the seam.

---

## 2. Placement (existing surfaces)

All of A–C go into the existing **gotchi manage modal** (`GotchiActionsPanel`):
- "Open Portal" appears when the selected token is a **closed/open portal** (the manage
  modal is opened from the Explorer owned grid, which already shows portals).
- "Set Pet Operator" -> an account-level toggle (also fits the owned overview / a small
  Settings affordance, since it's per-wallet not per-gotchi).
- Rename -> consolidate with existing rename.
- Claim alchemica -> a row in the manage modal when the gotchi has claimable alchemica.

No new routes.

---

## 3. Images (verified)
- Portal + the 10 options: portal/ghost SVGs via `aavegotchi-portal-svgs-base` subgraph
  and/or diamond `getAavegotchiSvg`; the summon options render from `portalAavegotchiTraits`
  (traits -> our `/api/gotchis/preview`). Fallback to portal icon.
- Alchemica: FUD/FOMO/ALPHA/KEK token icons.

---

## 4. Verify-then-build
1. `openPortals([id])`, `claimAavegotchi(id,0,minStake)` — eth_call from a portal owner
   (business revert = correct). Confirm `portalAavegotchiTraits` return shape (decode
   the 10 options: traits[6], collateral, minimumStake).
2. `setPetOperatorForAll(addr,true)` — eth_call (should succeed/sim-pass).
3. `setAavegotchiName` — confirm path (diamond vs gotchiDomainDiamond) before wiring.
4. `claimAvailableAlchemica` — determine the signature source; if not reproducible,
   ship read-only "claimable" display + deep link.

---

## 5. Build phases
1. Open Portal & Summon (highest value; self-contained).
2. Set Pet Operator (tiny).
3. Rename consolidation.
4. Alchemica claim (read-only first; signed claim if feasible).

## 6. Acceptance (incl. dapp confirmation)
- Open+summon a portal end-to-end (testnet/sim or a real owned portal); the 10 options
  shown **match the dapp's summon screen** for the same portal id.
- Pet-operator approval reflected on-chain (`isPetOperatorForAll` read-back).
- Claimable-alchemica figures **match the dapp** for a known gotchi/parcel.
- 0 console errors; portal/ghost art renders with fallback.

## 7. Open questions
- Alchemica claim signature source (dapp backend) — replicable?
- Naming via diamond vs `gotchiDomainDiamond` on Base.
- `portalAavegotchiTraits` exact tuple decoding.
