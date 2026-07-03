# Explorer Equip modal — live traits (Phase 1)

**Date:** 2026-07-03
**Status:** approved, building
**Scope:** Explorer → owner tab → Manage → Equip wearables

## Problem

The dress page ([EditorPanel.tsx](../../../src/components/gotchi/EditorPanel.tsx)) shows live
traits (NRG/AGG/SPK/BRN base→modified with per-slot breakdown), a BRS summary, and best-set
detection that recompute as you swap wearables. The explorer's Equip modal
([EquipWearablesModal.tsx](../../../src/components/explorer/EquipWearablesModal.tsx)) has the
live SVG preview, owned-balance slot pickers, outfit manager, and on-chain save — but shows
**zero traits**. Users can't see what a change does to the gotchi's stats.

## Goal (Phase 1)

Bring the dress page's **trait + BRS display** into the Equip modal, for the single gotchi being
managed. Everything recomputes live as slots change. Respec, Mommy Dress Me™, and Lock & Set are
explicitly **out of scope** — deferred to a later phase behind a shared-component refactor.

## Design

### Trait engine — reuse, no new logic
Inside the modal:
- `const wearablesById = useWearablesById()` (zustand is global; no provider needed).
- In a `useMemo` keyed on `slots`, call the existing pure
  `computeInstanceTraits({ baseTraits: numericTraits, equippedBySlot: paddedSlots, wearablesById })`.
- It returns `finalTraits`, `traitBase`, `wearableFlat`, `setFlatBrs`, `totalBrs`, `wearableDelta`,
  `setTraitModsDelta`, `bestSet` — the same numbers the dress page renders. Recomputes on every
  slot change for free because `slots` is our state.

### Rendering (left column, under the SVG preview)
- New presentational **`LiveTraitPanel`** — four rows, each `base (modified)` with the small
  `W:+n` / `S:+n` per-slot breakdown. Modeled on `GotchiCard`'s trait rows minus the respec
  controls (those rows are tangled with respec state, so we factor a clean component instead of
  bending `GotchiCard`). Modal-only for now; the dress page can adopt it later.
- Reuse **`BrsSummary`** for the "Rarity Score X (base Y)" line.
- Live **active-set badge** from `bestSet` (shows when the current outfit completes a set).
- The `BestSetsPanel` recommender is **left out** of Phase 1 (avoids pulling in dress-page filter
  semantics).

### Rarity reconciliation (age offset)
`computeInstanceTraits` needs `blocksElapsed` for the age component, which the modal doesn't get.
Rather than plumb it, compute a one-time **age offset at open**:

```
offset = Number(withSetsRarityScore) − computeInstanceTraits(currentOnChainOutfit).totalBrs
displayedTotal = liveTotal + offset
```

At baseline (slots unchanged) the displayed Rarity exactly matches the manage modal's number, and
it tracks correctly as you dress. Needs `baseRarityScore` + `withSetsRarityScore` passed in as
**optional** props (the manage modal already fetches both via its `detail` query → `ag`). If
absent, degrade to a traits+gear total without the age component.

## Files

- **New** `src/components/gotchi/LiveTraitPanel.tsx` — presentational trait rows.
- **Edit** `src/components/explorer/EquipWearablesModal.tsx` — wire the memo, render panel +
  `BrsSummary` + active-set badge, accept optional rarity props.
- **Edit** `src/components/explorer/GotchiActionsPanel.tsx` — pass `ag.baseRarityScore` /
  `ag.withSetsRarityScore` at the `<EquipWearablesModal>` call site.

## Out of scope (later phases)
Respec (skill-point spend), Mommy Dress Me™ auto-dress, Lock & Set. These are store-coupled and
warrant extracting a shared per-instance dresser used by both the dress page and this modal.
