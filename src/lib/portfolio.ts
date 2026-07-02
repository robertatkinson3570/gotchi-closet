/**
 * Rough "floor value" of a wallet's Aavegotchi holdings — the way the
 * community hand-estimates it (gotchis at floor price + liquid GHST).
 * Deliberately conservative: trait/wearable/kinship premiums are ignored.
 */

/** Wei (1e18) string/bigint → GHST number. Returns 0 for null/garbage/negative. */
export function weiToGhst(wei: string | bigint | null | undefined): number {
  if (wei == null) return 0;
  const n = Number(wei);
  return Number.isFinite(n) && n >= 0 ? n / 1e18 : 0;
}

export type PortfolioInputs = {
  /** Owned + lent-out gotchis (lent gotchis sit in escrow but are still yours). */
  gotchiCount: number;
  /** priceInWei of the cheapest active Baazaar gotchi listing, or null if none. */
  gotchiFloorWei: string | null;
  /** Wallet GHST balance in wei. */
  ghstWei: bigint;
};

/** Total rough floor value in GHST units. */
export function portfolioFloorGhst(p: PortfolioInputs): number {
  const count = Number.isFinite(p.gotchiCount) && p.gotchiCount > 0 ? p.gotchiCount : 0;
  return count * weiToGhst(p.gotchiFloorWei) + weiToGhst(p.ghstWei);
}
