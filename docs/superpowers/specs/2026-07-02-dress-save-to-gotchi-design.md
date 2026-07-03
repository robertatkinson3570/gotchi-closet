# /dress — Save to Gotchi (on-chain), respec save, buy-on-save + accuracy parity

Date: 2026-07-02
Status: draft — pending user approval

## Goal

The /dress page is today a pure simulator. Add a small, unobtrusive **Save** action per
editor gotchi that commits the simulated outfit (and committed respec) to the chain,
and make the page's numbers **exactly** match the subgraph / explorer owner tab —
what the simulator shows for traits/BRS is precisely what the chain will show after
the save.

## Scope

1. **Save button** (per editor instance, in `EditorPanel`) — appears only when:
   - the gotchi belongs to the **connected** wallet (watch-only wallets and manual
     gotchis never get a Save button),
   - wallet is on Base,
   - the gotchi is not lent out / rented (lending lock),
   - the outfit differs from the on-chain `equippedWearables` **or** a respec was
     committed in the simulator.
   Small button, no layout changes ("do not jack up UI").

2. **Steal flow** — if an outfit wearable is currently equipped on another gotchi
   owned by the connected wallet, saving unequips it there first. The confirm step
   warns: "Removes {wearable} from {gotchi} (#id)".

3. **Respec on save** — a committed simulator respec executes as
   `resetSkillPoints(tokenId)` + `spendSkillPoints(tokenId, int16[4])`.
   The confirm step states the respec count and that respecs after the first
   charge a contract-enforced fee (same data the explorer modal shows).

4. **Buy-on-save (Baazaar)** — if an outfit wearable is neither in the wallet nor
   on any owned gotchi but has an active Baazaar listing, the save flow buys the
   cheapest listing first (existing `useMarketplaceBuy` approve+execute path).
   Listings are re-quoted at save time; the confirm step shows the live price.
   If a listing disappears between confirm and execution, the flow stops with a
   clear error and nothing else is signed.

5. **Accuracy parity (hard requirement)** — spirit points, traits, and BRS shown on
   /dress must match the subgraph and the explorer/owner tab; the simulated
   post-save traits must equal the actual on-chain values after saving. After a
   save, all affected queries are invalidated so the page reflects chain reality.

6. **Full page audit** — respec math and every /dress behavior audited
   (4 parallel audit passes: respec, traits/BRS, inventory/multi-wallet, UI flows);
   findings reported with severity, confirmed bugs fixed with this work.

## Save plan (deterministic classifier)

New pure module `src/lib/savePlan.ts`:

```
planSave({
  targetGotchiId, desiredSlots(8), currentSlots(8),
  walletBalances,            // on-chain itemBalances(address)
  ownedGotchis,              // connected wallet's gotchis + their equipped arrays
  committedRespec,           // int16[4] | null
  listingsByWearable,        // cheapest active ERC1155 listing per needed id
}) => Step[]
```

Each needed wearable resolves, in priority order:
1. already on the target gotchi → no-op
2. wallet balance (`itemBalances`) → covered
3. equipped on another owned, non-locked gotchi → `unequip` step (one
   `equipWearables` tx per source gotchi, removing only the stolen ids)
4. active Baazaar listing → `buy` step (approve GHST if needed + execute)
5. otherwise → save blocked; the button explains which wearable is unobtainable

Step order: **buys → respec (reset, spend) → unequips → final equip**.
Every step waits for its receipt before the next; a failure aborts the remainder
with the failed step named. Duplicate ids (e.g. same weapon in both hands) are
counted, not deduped — 2 needed means balance ≥ 2 or two sources.

`planSave` is pure and fully unit-tested (the tx executor is a thin hook,
`useSaveOutfit`, reusing the exact wagmi patterns of `EquipWearablesModal`,
`GotchiActionsPanel.run`, and `useMarketplaceBuy`).

## UI

- `SaveOutfitButton` (new, small) rendered in the editor card's action column,
  visible only when eligible + dirty. Label: "Save on-chain".
- Click → compact confirm popover listing the exact steps (buy prices, steal
  warnings, respec fee note, tx count), then a one-line progress indicator
  ("Step 2/4 — removing Santa Hat from #1234…"), then success/error line.
  No new modals beyond this popover; no layout shifts.

## Ownership & data sources

- Connected-owned gotchi ids: `DressPage` already has `connectedResult.gotchis`;
  it stores that id set (new store field `connectedOwnedIds`) so `EditorPanel`
  can gate the button. Contract reverts remain the final authority.
- Wallet-held wearables: on-chain `itemBalances(address)` (same read the explorer
  modal uses) — fetched on demand when a Save button is visible.
- Respec inputs: birth traits via `/api/gotchis/base-traits`, spendable total =
  on-chain `availableSkillPoints` + refunded spent points (audit will confirm the
  simulator's current `usedSkillPoints`-only math and fix any divergence).
- Post-save: invalidate `qk.gotchis(owner)` for all loaded wallets, item balances,
  and explorer detail queries; the editor instance rebases onto the fresh
  on-chain state (dirty flag clears itself because current == desired).

## Error handling

- Wallet not connected / wrong chain → button hidden (not disabled clutter).
- Revert mid-sequence → `parseRevert` message, remaining steps cancelled, page
  refetches so partial progress (e.g. bought but not equipped) is visible truthfully.
- Listing sold out → abort before any equip/steal tx; wearable stays simulated.

## Testing

- Unit: `savePlan.test.ts` — classification priorities, duplicate ids, locked
  source gotchis, blocked saves, step ordering.
- Unit: respec parity — simulator output equals contract math (int16 semantics,
  eyes untouched, abs-sum point budget) for fixture gotchis.
- E2E smoke (existing Playwright setup): button visibility gating; confirm popover
  contents for a steal + buy scenario (mocked chain reads).
- Manual verification: save an outfit + respec on a real gotchi, then compare
  /dress, explorer owner tab, and subgraph values — all three must agree.

## Non-goals

- No redesign of the dress page layout.
- Watch-only wallets / manual gotchis stay simulator-only.
- No batching via multicall in v1 (sequential txs are simpler and match the
  explorer's proven pattern).
