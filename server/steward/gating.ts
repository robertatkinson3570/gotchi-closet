// server/steward/gating.ts
// Pure run-gating decisions for the Steward v2 cron. No I/O — the caller supplies the
// current base fee, the operator's configured ceiling, the owner's GasTank float, and the
// run's worst-case cost (the owner's on-chain per-run cap). Kept pure so it's unit-tested.

// Skip a run when the network base fee is above the operator's ceiling. A zero ceiling
// (unset) means "no ceiling" — never skip on price.
export function gasPriceTooHigh(currentBaseFeeWei: bigint, ceilingWei: bigint): boolean {
  if (ceilingWei === 0n) return false;
  return currentBaseFeeWei > ceilingWei;
}

// Only run when the owner's GasTank float can cover the worst-case cost of this run — which
// is exactly their on-chain per-run cap (the GasTank never charges more than the cap). A zero
// worst-case (no cap set) means we cannot bound the spend, so skip.
export function floatCoversRun(ownerFloatWei: bigint, worstCaseCostWei: bigint): boolean {
  if (worstCaseCostWei === 0n) return false;
  return ownerFloatWei >= worstCaseCostWei;
}
