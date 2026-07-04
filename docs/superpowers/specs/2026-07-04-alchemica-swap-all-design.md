# Alchemica "swap all to GHST" — design

**Date:** 2026-07-04
**Status:** Approved, pending implementation plan

## Problem

Aavegotchi's Base ecosystem yields 4 alchemica tokens (FUD, FOMO, ALPHA, KEK) from land channelling/reservoirs. A player who wants GHST has no fast way to liquidate all four at once — they'd need to manually swap each on an external DEX. `/get-tokens` already offers an in-app pay→GHST swap (`SwapCard`, LiFi aggregator), but nothing alchemica-specific.

## Goal

On `/get-tokens` (Swap tab), show the connected wallet's alchemica balances and let them swap everything to GHST with one click, which fires up to 4 swap transactions (plus a same-token approval tx the first time any token is swapped) in sequence.

## Component & placement

New `AlchemicaSwapCard` in `src/components/swap/AlchemicaSwapCard.tsx`, rendered on `GetTokensPage.tsx`'s "Swap" tab, directly above the existing `SwapCard`. Uses the existing `ALCHEMICA_TOKENS_BASE` list (`src/lib/lending/contracts.ts:79-84` — FUD/FOMO/ALPHA/KEK, canonical order, Base addresses already verified) — no new token constants.

## Data flow — balances

One `useReadContracts` multicall (same pattern as `useLandAlchemica.ts`) reads `balanceOf(address)` for all 4 tokens in a single call. All 4 alchemica tokens use 18 decimals (confirmed in `LandAlchemicaBar.tsx:9`, same as GHST) — no per-token decimals lookup needed.

- Rows with `balance === 0n` are filtered out of the displayed list entirely (not shown greyed out).
- Disconnected wallet: render `ConnectButton` (same as `SwapCard`).
- Connected, all 4 balances zero: show a small "No alchemica to swap" empty state; the swap button is hidden (nothing to swap).
- Connected, some balances nonzero: show one row per held token — symbol + formatted balance — plus the "Swap all ALCH → GHST" button below the list.

## Swap execution

Extract the LiFi quote/approve/send flow currently inlined in `SwapCard.doSwap` (`src/components/swap/SwapCard.tsx:124-150`) into shared helpers in a new `src/lib/swap/lifi.ts`:

- `fetchLifiQuote({ fromToken, toToken, fromAmountWei, fromAddress })` — wraps the `li.quest/v1/quote` call, returns the parsed `Quote` shape (`toAmount`, `toAmountMin`, `approvalAddress`, `tx`, `gasUsd`, `tool`) or throws on no-route.
- `executeLifiSwap({ quote, fromToken, amountWei, address, publicClient, writeContractAsync, sendTransactionAsync })` — approves (if allowance < amount) then sends the swap tx, awaiting both receipts.

`SwapCard` is refactored to call these instead of its inline logic (behavior unchanged — this is a pure extraction, verified by keeping `SwapCard`'s existing manual-swap flow working identically).

`AlchemicaSwapCard`'s "Swap all ALCH → GHST" click handler, for each held token in FUD → FOMO → ALPHA → KEK order:

1. Set that row's status to `quoting`; call `fetchLifiQuote` for the token's full held balance → GHST.
2. If quote fails: mark row `failed` with the error message, continue to the next token.
3. Otherwise set status to `approving`/`swapping` as appropriate and call `executeLifiSwap`.
4. On success: mark row `done` with the GHST amount received (from `quote.toAmount`), add to a running total.
5. On failure/rejection: mark row `failed` with `parseRevert(e)`, continue to the next token (skip-and-continue — one bad token never blocks the rest).

No upfront quote-preview step — clicking the button starts execution immediately (click-and-go). While running, the button shows progress ("Swapping 2 of 3…") and is disabled to prevent double-firing.

## Post-run

After the sequence finishes (all held tokens attempted):

- Refetch all 4 alchemica balances (multicall) and the header GHST balance (existing `WalletChip` polls every 30s regardless, but trigger an immediate refetch via query invalidation so the UI doesn't wait).
- Toast a summary: `"Swapped 3/3 — received ~12.4 GHST total"` on full success, or `"Swapped 2/3 — FOMO failed: <short reason>"` when something skipped.
- Per-row status (✓ / ✗ + reason) stays visible until the next balance refresh replaces the row (e.g. a successfully-swapped token drops off the list once its balance reads back as 0).

## Error handling

Reuses `parseRevert()` (`src/lib/lending/parseRevert.ts`) for human-readable revert/rejection messages, same as the rest of the lending/swap surface. A LiFi "no route found" response is treated identically to an on-chain revert for this purpose — it fails that row and the sequence moves on.

## Testing

No component-level test — matches existing convention (`SwapCard` itself has no test; this is wallet-interaction UI that can't be meaningfully unit-tested without a mocked wallet/RPC). The extracted `src/lib/swap/lifi.ts` gets a unit test for its pure parts (quote URL/param construction, response parsing) in `src/lib/swap/lifi.test.ts`, following the style of `src/lib/pulse/aggregate.test.ts`.

## Out of scope

- Wallet-chip popover / GHST-balance-click UI explored earlier in this session — dropped in favor of a dedicated `/get-tokens` card.
- Quote preview / confirm-before-send step.
- Configurable swap order or partial-amount swaps (always swaps the full held balance of each token).
