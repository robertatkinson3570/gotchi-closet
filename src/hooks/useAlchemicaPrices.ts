import { useQuery } from "@tanstack/react-query";
import { qk } from "@/lib/queryKeys";
import { ALCHEMICA_BASE, ALCHEMICA_PRICES_GHST_FALLBACK, type AlchemicaPrices } from "@/lib/lending/alchemica";

// GHST on Base
const GHST_BASE = "0xcD2F22236DD9Dfe2356D7C543161D4d260FD9BcB".toLowerCase();

const LLAMA_PRICES_URL = "https://coins.llama.fi/prices/current/";

async function fetchAlchemicaPrices(): Promise<AlchemicaPrices> {
  try {
    const tokens = [
      `base:${ALCHEMICA_BASE.fud}`,
      `base:${ALCHEMICA_BASE.fomo}`,
      `base:${ALCHEMICA_BASE.alpha}`,
      `base:${ALCHEMICA_BASE.kek}`,
      `base:${GHST_BASE}`,
    ].join(",");
    const res = await fetch(`${LLAMA_PRICES_URL}${tokens}?searchWidth=4h`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = await res.json();
    const coins = json?.coins ?? {};
    const usd = (addr: string) => Number(coins[`base:${addr}`]?.price ?? 0);

    const ghstUsd = usd(GHST_BASE);
    if (!ghstUsd) {
      // GHST price missing — can't convert to GHST-equivalent reliably
      return ALCHEMICA_PRICES_GHST_FALLBACK;
    }
    const fudUsd = usd(ALCHEMICA_BASE.fud);
    const fomoUsd = usd(ALCHEMICA_BASE.fomo);
    const alphaUsd = usd(ALCHEMICA_BASE.alpha);
    const kekUsd = usd(ALCHEMICA_BASE.kek);

    // Convert each alchemica USD price to GHST units
    return {
      fud: fudUsd > 0 ? fudUsd / ghstUsd : ALCHEMICA_PRICES_GHST_FALLBACK.fud,
      fomo: fomoUsd > 0 ? fomoUsd / ghstUsd : ALCHEMICA_PRICES_GHST_FALLBACK.fomo,
      alpha: alphaUsd > 0 ? alphaUsd / ghstUsd : ALCHEMICA_PRICES_GHST_FALLBACK.alpha,
      kek: kekUsd > 0 ? kekUsd / ghstUsd : ALCHEMICA_PRICES_GHST_FALLBACK.kek,
    };
  } catch (err) {
    console.warn("[useAlchemicaPrices] fallback to placeholder:", err);
    return ALCHEMICA_PRICES_GHST_FALLBACK;
  }
}

export function useAlchemicaPrices() {
  const { data, isLoading } = useQuery({
    queryKey: qk.alchemicaPrices(),
    queryFn: fetchAlchemicaPrices,
    staleTime: 5 * 60_000,
    gcTime: 5 * 60_000,
  });
  const prices = data ?? ALCHEMICA_PRICES_GHST_FALLBACK;
  return {
    prices,
    loading: isLoading,
    isLive: data != null && data !== ALCHEMICA_PRICES_GHST_FALLBACK,
  };
}
