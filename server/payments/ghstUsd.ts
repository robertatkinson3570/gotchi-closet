// GHST/USD for Wisp billing (the Holder plan pays in GHST at the LIVE rate,
// gvr docs/briefs/gotchi-desk-agent.md §8). There is no Chainlink GHST feed on
// Base, so the anchor is DeFiLlama (the same source GVR's ticker uses). A stale
// or missing price REFUSES to quote rather than mispricing: throws, and the
// route answers 502 "pricing unavailable" like the ETH path does.

export const GHST_BASE = (process.env.WISP_GHST_ADDRESS ||
  "0xcD2F22236DD9Dfe2356D7C543161D4d260FD9BcB") as `0x${string}`;
export const GHST_DECIMALS = 18;
const LLAMA_URL = `https://coins.llama.fi/prices/current/base:${GHST_BASE.toLowerCase()}?searchWidth=4h`;
const TTL_MS = 60_000;
/** A price older than this on DeFiLlama's side is not "live". */
const MAX_AGE_S = 6 * 3600;

let cache: { price: number; at: number } | null = null;

/** Parse DeFiLlama's payload: { coins: { "base:0x…": { price, timestamp } } }. */
export function parseLlamaGhst(json: unknown, nowS: number = Date.now() / 1000): number {
  const coins = (json as { coins?: Record<string, { price?: unknown; timestamp?: unknown }> } | null)?.coins ?? {};
  const row = Object.values(coins)[0];
  const price = Number(row?.price);
  const ts = Number(row?.timestamp);
  if (!(price > 0) || !Number.isFinite(price)) throw new Error("GHST price not live");
  if (Number.isFinite(ts) && ts > 0 && nowS - ts > MAX_AGE_S) throw new Error("GHST price stale");
  return price;
}

export async function ghstUsdPrice(now: number = Date.now(), f: typeof fetch = fetch): Promise<number> {
  if (cache && now - cache.at < TTL_MS) return cache.price;
  const res = await f(LLAMA_URL, { signal: AbortSignal.timeout(8000) });
  if (!res.ok) throw new Error(`GHST price ${res.status}`);
  const price = parseLlamaGhst(await res.json(), now / 1000);
  cache = { price, at: now };
  return price;
}

/** USD → GHST wei (18 decimals), rounded UP at the 6th GHST decimal (no float wei). */
export function usdToGhstWeiAt(usd: number, ghstUsd: number): bigint {
  if (!(ghstUsd > 0)) throw new Error("GHST price not live");
  const micro = BigInt(Math.ceil((usd / ghstUsd) * 1_000_000));
  return micro * 10n ** 12n;
}

export async function usdToGhstWei(usd: number): Promise<{ wei: bigint; ghstUsd: number }> {
  const ghstUsd = await ghstUsdPrice();
  return { wei: usdToGhstWeiAt(usd, ghstUsd), ghstUsd };
}
