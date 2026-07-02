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
