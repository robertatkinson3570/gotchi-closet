# /dress page audit — 2026-07-02

Four parallel read-only audit passes (respec math, trait/BRS calculations,
inventory/multi-wallet, UI flows). The respec pass verified findings against the
live Base diamond with read-only `eth_call`s on three real gotchis (#23795,
#14140, #17944) and the core subgraph; the traits pass cross-checked the official
aavegotchi-core-subgraph source and wiki.

Empirical facts established on-chain (these anchor several findings):

- `/api/gotchis/base-traits` → `getGotchiBaseNumericTraits` returns **true birth
  traits** (sumAbs(current − birth) === subgraph `usedSkillPoints` on all samples).
- The chain does **not** clamp traits to 0–99 (observed base traits 101 and −15).
- Earned skill points ≠ floor(level/3) (level-61 gotchi with 29 points). The only
  reliable pool is on-chain `usedSkillPoints + availableSkillPoints`.

## CRITICAL

**C1. Locked builds wiped from localStorage on every page mount / wallet change.**
`DressPage.tsx:125-128` runs `setLoadedAddress(ownersKey)` then `setGotchis([])`;
`setGotchis` (`useAppStore.ts:137-149`) runs `cleanupStaleLockedBuilds` against the
empty id set and **persists** the emptied map. Lock 10 builds → F5 → all gone.
Also: cleanup validates against wallet gotchis only, so locks on manual gotchis
(explicitly supported by `toggleLockSet`) are purged on every refetch; and
`ExplorerPage.tsx:245-252` ("mine" mode) pushes a narrower gotchi set into the
same store, another wipe vector.
*Fix:* skip cleanup/persist while the incoming list is empty or loading; include
manual gotchi ids in the keep-set.

## HIGH

**H1. Set bonuses stack; official rule is single best set.** `rarity.ts:143-152,
217-258` sums every matched set. The official subgraph picks one best set
(longest `wearableIds`, ties → later set id). `data/wearableSets.json` has 29
subset pairs (Aagent ⊂ Super Aagent, …), so superset outfits trigger 2–3 sets
locally → inflated BRS in the local path, and even the unchanged-outfit path adds
locally-stacked `setFlatBrs` on top of subgraph trait numbers. Unequip+re-equip
the same item makes displayed BRS jump with zero outfit change.
*Fix:* `pickBestSet` mirroring the subgraph; use it for flat + trait mods; keep
the all-matches list for display only.

**H2. Respec pool understates spendable points.** `respec.ts:30-33,129` uses only
`usedSkillPoints` (the refund) and ignores unspent `availableSkillPoints` (5 spent
+ 3 unspent → sim offers 5, chain allows 8). Same bug in `WardrobeLabPage.tsx:185`.
*Fix:* read `availableSkillPoints` on-chain (ABI already in
`GotchiActionsPanel.tsx:48-50`); pool = used + available. Never derive from level.

**H3. Respec BRS display assumes every past point was +1 BRS.**
`GotchiCard.tsx:100-115` computes `traitBase − totalSP + brsDelta`; points spent
across the 49↔50 boundary (worth 0) or toward 50 (worth −1) skew all three
displayed BRS numbers, up to 2× the points spent toward the middle.
*Fix:* correction = `sumTraitBrs(simBase[0..3]) − sumTraitBrs(currentBase[0..3])`.

**H4. No source for unequipped wallet inventory.** `selectors.ts:9-19` counts only
wearables equipped on loaded gotchis; nothing in the dress flow reads
`itemBalances`. Wallet-held wearables are invisible to the Owned panel and to
Mommy Dress Me (silently worse optimizations); unequipping an item in the dapp
makes it vanish from GotchiCloset.
*Fix:* read on-chain `itemBalances(address)` per merged wallet and add to owned
counts (equipped items are not in itemBalances — add, don't max). Also feeds the
Save feature's classifier.

**H5. Mommy's respec never reaches the trait card or Lock&Set.**
`EditorPanel.tsx:484-514` stores `respecAllocated` only in `mommyResult`; the main
trait card ignores it (banner and card disagree on screen) and Lock&Set persists
`respecAllocated: null` — the locked build silently drops the respec the "+X BRS"
banner promised.
*Fix:* commit `result.respecAllocated` into `committedRespecs` and feed the
displayed trait computation.

**H6. Apply-set hand-slot collisions.** `EditorPanel.tsx:50-67`: `"either"`
placement unhandled → a set with two dual-hand pieces stacks both on slot 4 (one
overwrites the other, set bonus may not activate); missing cache entries are
silently skipped (partial application, no toast); no ownership check.

**H7. Manual gotchis corrupt owned counts.** `selectors.ts:70-71`: any searched
gotchi's equipped items count as "owned" by the viewer; a gotchi both manual and
in a wallet is double-counted (dress two gotchis with one copy).
*Fix:* dedupe by id; decide explicitly whether manual gotchis contribute to
inventory (recommend: no, preview-only).

## MEDIUM

**M1. Respec baseline race: pre-fetch/failed window is unphysical.**
`respec.ts:63-66,116-127`: until birth traits arrive (or forever, if the fetch
fails — errors only `console.error`), the sim uses *current* traits as baseline
while granting the full refund pool — allocations the chain can never produce.
`usingFallback` can never be true (`baseNumericTraits` is never populated by any
fetcher), so the warning tooltip is dead code.
*Fix:* disable +/− until fetched birth traits exist; surface fetch errors.

**M2. Committed respec is `target − current`, must be `target − birth` for the
chain.** `GotchiCard.tsx:202` + `EditorPanel.tsx:250,267`. Harmless today
(display-only), but replaying it after `resetSkillPoints` — exactly what the Save
feature does — would set wrong traits on any gotchi with prior spends.
*Fix:* persist `respec.allocated` (vs birth); prerequisite for Save.

**M3. Mobile EquipModal bypasses rules.** `EquipModal.tsx:21-35`: no
`handPlacement` check (left-only items equippable to right hand on mobile) and
always targets `editorInstances[0]` regardless of which gotchi the user is
editing; silent no-op when the editor is empty. Four divergent hand-placement
implementations exist (DressPage, SlotGrid, autoDressEngine, EquipModal).
*Fix:* one shared `canEquip(wearable, slot)` helper used by all paths + correct
instance targeting.

**M4. `equipWearable` has zero count enforcement.** `useAppStore.ts:221-249`: one
owned copy can be equipped in both hands and in multiple editor copies of the
same gotchi; avail badges are cosmetic (cards always draggable). Mommy enforces
counts; manual equip doesn't — inconsistent invariants.

**M5. Locked + in-editor double reservation.** `selectors.ts:74-75`: a gotchi both
locked and open in the editor is subtracted twice → singly-owned items show
avail 0; in DEV, Mommy throws "not in owned inventory" (error toast) on such
gotchis; in PROD it under-optimizes. Related: the DEV invariant check in
`EditorPanel.tsx:485-495` is a silent no-op for the user (modal closes, nothing
happens).

**M6. Lock persistence fragile by design.** Storage key = the composite
`"connected|w1|w2"` string (`DressPage.tsx:123`, `lockedBuilds.ts:15-18`) —
adding/removing any wallet strands all saved locks under the old key.
*Fix:* key locks per stable wallet, not per combination.

**M7. Error banner sticks; toasts repeat.** `DressPage.tsx:130-158`: `appError` is
only cleared when all wallets are removed — a transient subgraph error leaves the
red banner forever; the destructive toast re-fires on every query update while
the error persists.
*Fix:* clear on success; toast only on error transitions.

**M8. Explorer spend validation ignores negative costs.**
`GotchiActionsPanel.tsx:143`: `spSum = Σ max(0, v)`, chain charges `Σ |v|` —
`+2,−3` with 2 available passes the UI and reverts on-chain; pure-negative spends
(valid on-chain) are blocked.

**M9. Orphaned editor state.** Removing a wallet or manual gotchi never removes
its editor instances (stale gotchis keep consuming avail counts); per-instance
maps (`committedRespecs`, `mommyResult`, …) are never cleaned on instance removal.

**M10. Latent trait-path traps** (currently unreachable, will bite on partial
fetches): `getCanonicalModifiedTraits` prefers wearables-only subgraph traits over
local wearables+sets (`traits.ts:39-67`); Mommy's result banner eval mixes
old-outfit subgraph traits with the new outfit (`EditorPanel.tsx:390-401`);
`respec.ts` `computeWearableDelta` is dead code that would double-count sets if
ever wired up.

## LOW

- `respec.ts:116` slices fetched birth traits to length 4 → `simBase` eyes are 0;
  cancels out in today's delta math but wrong for any future 6-trait consumer.
- `rarity.ts:158-171` prefers the rarity-string round-trip over the authoritative
  `rarityScoreModifier` (no-op today; inverts cleanly).
- Catwalk reduced-motion path skips the entire show instantly; empty-list modal
  renders a bare black stage (defensive gaps).
- No "undo Mommy": pre-Mommy build is captured but only used for the delta label;
  Restore returns to the on-chain outfit, losing hand-tuned builds.
- Mobile drag-and-drop can never complete (panels in mutually exclusive tabs) —
  the tap path is the only mobile flow, see M3.
- `cacheGet` TTL check is dead code; wearables/sets error toasts are near-dead
  paths (fetchers fall back internally).
- Tests encoding wrong expectations: `respec.test.ts:8-15` codifies H2;
  conformance tests assert only "6 finite numbers"; no superset-outfit fixture
  (would have caught H1); no hand-placement or count-semantics tests.
- `data-modified-score` test hook carries total BRS, not modified trait score.
- `useSortedGotchis` runs full BRS breakdowns inside a sort comparator (perf nit).

## Verified correct (what's already solid)

- Base BRS formula (`t<50 → 100−t, else t+1`), applied to modified traits before
  the ≥50 split, no clamping — matches chain behavior exactly (boundary-tested).
- Wearable trait-modifier order/application; flat tiers 1/2/5/10/20/50; set
  trait-delta construction (`bonusDifference + brsBonus`), set data transformation
  faithful (spot-checked Aagent, APY Visionary).
- Aging table matches the official wiki verbatim; highest-milestone (not sum);
  off by default, matching the dapp.
- `/api/gotchis/base-traits` returns true birth traits (proven on-chain);
  abs-sum point accounting and ± gating match `spendSkillPoints` semantics;
  eyes untouchable; ABI shapes all correct.
- Rofl-patch mechanism (ids 151–156) correctly forces the local trait path.
- Multi-wallet merge/dedupe for the carousel; per-owner query caching; manual
  wallet management; dual-wield trait counting (once per slot); `isBaseEquipment`
  gating; auto-dress engine's locked-slot and count enforcement, determinism, and
  BRS-delta conformance (fixture-tested); double-click guards; catwalk a11y
  (focus, scroll lock, escape).

## Recommended fix order

1. C1 (lock wipe — data loss happening today)
2. H1 (best-set rule — wrong BRS shown; core parity requirement)
3. H2+H3+M1+M2 (respec accuracy bundle — parity requirement + Save prerequisite)
4. H4 (itemBalances inventory — UX correctness + Save prerequisite)
5. H5 (Mommy respec propagation)
6. H7+M4+M5 (inventory count integrity)
7. H6+M3 (equip-path consistency via one shared helper)
8. M6 (lock keying), M7 (error UX), M8 (explorer spend), M9 (orphans)
9. Lows as time allows; test hardening alongside each fix.
