import { useQuery } from "@tanstack/react-query";

const GHST_BASE = "0xcd2f22236dd9dfe2356d7c543161d4d260fd9bcb";

/** GHST spot price in USD via DefiLlama. Returns 0 while loading or on failure. */
export function useGhstUsd() {
  return useQuery({
    queryKey: ["ghst-usd"],
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<number> => {
      try {
        const r = await fetch(`https://coins.llama.fi/prices/current/base:${GHST_BASE}?searchWidth=4h`);
        const j = await r.json();
        return Number(j?.coins?.[`base:${GHST_BASE}`]?.price ?? 0);
      } catch {
        return 0;
      }
    },
  });
}

export type GhstTicker = { price: number; change24h: number | null };

export type AlchPrice = { symbol: string; usd: number; change24h: number | null };

// Alchemica + GLTR CoinGecko ids. DefiLlama has no feed for the Base
// deployments (FUD 0x2028…fF4, FOMO 0xA321…b58, ALPHA 0x15e7…947,
// KEK 0xE52b…0e5, GLTR 0x4D14…c9D), so USD comes from these listings.
const ALCH_IDS: { id: string; symbol: string }[] = [
  { id: "aavegotchi-fud", symbol: "FUD" },
  { id: "aavegotchi-fomo", symbol: "FOMO" },
  { id: "aavegotchi-alpha", symbol: "ALPHA" },
  { id: "aavegotchi-kek", symbol: "KEK" },
  { id: "gax-liquidity-token-reward", symbol: "GLTR" },
];

/**
 * USD prices for the four alchemica tokens + GLTR, one batched CoinGecko
 * call. Only mounted when the ticker panel is open, so it costs nothing
 * until the user expands it. Tokens with no price are dropped.
 */
export function useAlchemicaUsd() {
  return useQuery({
    queryKey: ["alchemica-usd"],
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<AlchPrice[]> => {
      try {
        const ids = ALCH_IDS.map((a) => a.id).join(",");
        const r = await fetch(`https://api.coingecko.com/api/v3/simple/price?ids=${ids}&vs_currencies=usd&include_24hr_change=true`);
        const j = await r.json();
        return ALCH_IDS
          .map(({ id, symbol }) => ({
            symbol,
            usd: Number(j?.[id]?.usd ?? 0),
            change24h: j?.[id]?.usd_24h_change == null ? null : Number(j[id].usd_24h_change),
          }))
          .filter((p) => p.usd > 0);
      } catch {
        return [];
      }
    },
  });
}

/**
 * GHST price + 24h change for the footer ticker. CoinGecko carries the 24h
 * delta; on failure fall back to the DefiLlama spot price with no delta so
 * the chip still renders a price.
 */
export function useGhstTicker() {
  return useQuery({
    queryKey: ["ghst-ticker"],
    staleTime: 5 * 60_000,
    refetchInterval: 5 * 60_000,
    queryFn: async (): Promise<GhstTicker> => {
      try {
        const r = await fetch("https://api.coingecko.com/api/v3/simple/price?ids=aavegotchi&vs_currencies=usd&include_24hr_change=true");
        const j = await r.json();
        const price = Number(j?.aavegotchi?.usd ?? 0);
        if (price > 0) return { price, change24h: Number(j?.aavegotchi?.usd_24h_change ?? 0) };
      } catch { /* fall through to llama */ }
      try {
        const r = await fetch(`https://coins.llama.fi/prices/current/base:${GHST_BASE}?searchWidth=4h`);
        const j = await r.json();
        return { price: Number(j?.coins?.[`base:${GHST_BASE}`]?.price ?? 0), change24h: null };
      } catch {
        return { price: 0, change24h: null };
      }
    },
  });
}
