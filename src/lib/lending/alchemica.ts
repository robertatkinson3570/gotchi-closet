// Alchemica token addresses on Base (provided by user)
export const ALCHEMICA_BASE = {
  fud: "0x2028b4043e6722Ea164946c82fe806c4a43a0fF4" as const,
  fomo: "0xA32137bfb57d2b6A9Fd2956Ba4B54741a6D54b58" as const,
  alpha: "0x15e7CaC885e3730ce6389447BC0f7AC032f31947" as const,
  kek: "0xE52b9170fF4ece4C35E796Ffd74B57Dec68Ca0e5" as const,
};

// Per-haunt baseline channelling yield (alchemica per channel attempt).
// Source: Aavegotchi protocol — channelling caps per haunt, averaged across parcels.
// These are conservative averages assuming a Reasonable parcel.
export const CHANNELLING_YIELD_BY_HAUNT: Record<
  number,
  { fud: number; fomo: number; alpha: number; kek: number }
> = {
  1: { fud: 80, fomo: 40, alpha: 20, kek: 10 },
  2: { fud: 60, fomo: 30, alpha: 15, kek: 8 },
};

// Fallback rough GHST-equivalent prices for alchemica.
// Wire this to a real DEX pool query when ready (Uniswap V3 quoter on Base).
// These are placeholders — update when on-chain prices are integrated.
export const ALCHEMICA_PRICES_GHST_FALLBACK: {
  fud: number;
  fomo: number;
  alpha: number;
  kek: number;
} = {
  fud: 0.005,
  fomo: 0.01,
  alpha: 0.05,
  kek: 0.5,
};

// Channelling cooldown: borrower can channel once per 24h.
export const CHANNELLING_COOLDOWN_SEC = 86400;

export type AlchemicaPrices = typeof ALCHEMICA_PRICES_GHST_FALLBACK;

/**
 * Approximate channelling output multiplier from kinship.
 * Aavegotchi's alchemica payout scales with kinship; baseline kinship is 50.
 * Formula here is a clamped linear approximation:
 *   k=50  -> 1.0x   (baseline)
 *   k=100 -> 1.25x
 *   k=200 -> 1.75x
 *   k=250+ -> 2.0x  (cap)
 *   k<50  -> down to 0.5x at k=0 (penalty for low kinship)
 */
export function kinshipMultiplier(kinship: number): number {
  if (!Number.isFinite(kinship) || kinship <= 0) return 1;
  const raw = 1 + (kinship - 50) * 0.005;
  return Math.max(0.5, Math.min(2.0, raw));
}

// Estimate the GHST-equivalent value of alchemica from N channels.
// `kinship` (default 50, the baseline) scales the per-channel output.
export function estimateChannellingValueGhst(
  hauntId: number,
  numChannels: number,
  prices: AlchemicaPrices = ALCHEMICA_PRICES_GHST_FALLBACK,
  kinship: number = 50
): number {
  const yieldPerChannel =
    CHANNELLING_YIELD_BY_HAUNT[hauntId] ?? CHANNELLING_YIELD_BY_HAUNT[2];
  const perChannelGhst =
    yieldPerChannel.fud * prices.fud +
    yieldPerChannel.fomo * prices.fomo +
    yieldPerChannel.alpha * prices.alpha +
    yieldPerChannel.kek * prices.kek;
  return perChannelGhst * numChannels * kinshipMultiplier(kinship);
}

// How many channels could happen during a period (1 per 24h cooldown).
export function maxChannelsInPeriod(periodSec: number): number {
  return Math.max(1, Math.floor(periodSec / CHANNELLING_COOLDOWN_SEC));
}
