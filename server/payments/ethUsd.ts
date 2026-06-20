// USD <-> crypto conversion for Wisp billing. ETH is priced via the Base
// Chainlink ETH/USD aggregator (USD-denominated plans, settled in ETH); USDC is 1:1.
//
// SAFETY: if the feed read fails we THROW — never fall back to a guessed price
// (mispricing = lost or refunded revenue). The aggregator address is overridable
// via env and should be verified on-chain before production use.

import { createPublicClient, http } from "viem";
import { base } from "viem/chains";

const RPC_URL = process.env.BASE_RPC_URL || "https://mainnet.base.org";

// Chainlink ETH/USD on Base. VERIFY on-chain before relying on it in production.
const ETH_USD_FEED = (process.env.WISP_ETH_USD_FEED ||
  "0x71041dddad3595F9CEd3DcCFBe3D1F4b0a16Bb70") as `0x${string}`;

const AGG_ABI = [
  {
    name: "latestRoundData",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [
      { name: "roundId", type: "uint80" },
      { name: "answer", type: "int256" },
      { name: "startedAt", type: "uint256" },
      { name: "updatedAt", type: "uint256" },
      { name: "answeredInRound", type: "uint80" },
    ],
  },
  { name: "decimals", type: "function", stateMutability: "view", inputs: [], outputs: [{ type: "uint8" }] },
] as const;

let client: ReturnType<typeof createPublicClient> | null = null;
function c() {
  if (!client) client = createPublicClient({ chain: base, transport: http(RPC_URL, { timeout: 4000, retryCount: 1 }) });
  return client;
}

let cache: { price: number; at: number } | null = null;
const TTL_MS = 60_000;

/** Current USD per 1 ETH from the Chainlink feed (cached 60s). Throws on a bad read. */
export async function ethUsdPrice(now: number = Date.now()): Promise<number> {
  if (cache && now - cache.at < TTL_MS) return cache.price;
  const [round, dec] = await Promise.all([
    c().readContract({ address: ETH_USD_FEED, abi: AGG_ABI, functionName: "latestRoundData" }),
    c().readContract({ address: ETH_USD_FEED, abi: AGG_ABI, functionName: "decimals" }),
  ]);
  const answer = (round as readonly unknown[])[1] as bigint;
  const price = Number(answer) / 10 ** Number(dec);
  if (!(price > 0) || !Number.isFinite(price)) throw new Error("invalid ETH/USD feed answer");
  cache = { price, at: now };
  return price;
}

/** USD amount -> wei of ETH at the current oracle price. */
export async function usdToEthWei(usd: number): Promise<bigint> {
  const price = await ethUsdPrice();
  const eth = usd / price;
  return BigInt(Math.round(eth * 1e18));
}

/** USD amount -> USDC base units (6 decimals), 1:1. */
export function usdToUsdcUnits(usd: number): bigint {
  return BigInt(Math.round(usd * 1e6));
}
