import { Interface } from "ethers";
import pLimit from "p-limit";
import { getServerEnv } from "../../api/_env";

const BASE_RPC_URLS = [
  "https://mainnet.base.org",
  "https://base.llamarpc.com",
  "https://base.drpc.org",
  "https://base-mainnet.public.blastapi.io",
  "https://1rpc.io/base",
  "https://base.meowrpc.com",
];

const { diamondAddress: BASE_DIAMOND_ADDRESS } = getServerEnv();

const SVG_FACET_ABI = [
  "function getAavegotchiSvg(uint256 _tokenId) external view returns (string)",
  "function previewAavegotchi(uint256 _hauntId, address _collateralType, int16[6] _numericTraits, uint16[16] _equippedWearables) external view returns (string)",
];

const SVG_CACHE_TTL = 60 * 60 * 1000;
const SVG_FETCH_TIMEOUT = 8000;
const MAX_RPC_ATTEMPTS = 3;
const BATCH_SIZE = 10;
const PARALLEL_BATCHES = 3;

const callLimit = pLimit(6);
const thumbLimit = pLimit(4);

type CacheEntry = { svg: string; timestamp: number };
type RpcHealth = { failures: number; lastSuccess: number };
type RpcPayload = { method: string; params: unknown[] };

const svgCache = new Map<string, CacheEntry>();
const thumbCache = new Map<string, CacheEntry>();
const rpcHealth = new Map<number, RpcHealth>();
const inFlight = new Map<string, Promise<string>>();

const stats = {
  cacheHits: 0,
  cacheMisses: 0,
  thumbHits: 0,
  thumbMisses: 0,
  lastRpcUrl: "",
};

const svgFacet = new Interface(SVG_FACET_ABI);

function cacheGet(cache: Map<string, CacheEntry>, key: string): string | null {
  const entry = cache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.timestamp > SVG_CACHE_TTL) {
    cache.delete(key);
    return null;
  }
  return entry.svg;
}

function cacheSet(cache: Map<string, CacheEntry>, key: string, svg: string) {
  cache.set(key, { svg, timestamp: Date.now() });
}

function getHealth(index: number): RpcHealth {
  return rpcHealth.get(index) || { failures: 0, lastSuccess: 0 };
}

function markSuccess(index: number) {
  rpcHealth.set(index, { failures: 0, lastSuccess: Date.now() });
  stats.lastRpcUrl = BASE_RPC_URLS[index] || "";
}

function markFailure(index: number) {
  const current = getHealth(index);
  rpcHealth.set(index, {
    failures: current.failures + 1,
    lastSuccess: current.lastSuccess,
  });
}

function getHealthyRpcUrls(): string[] {
  return BASE_RPC_URLS.map((url, index) => ({
    url,
    index,
    health: getHealth(index),
  }))
    .sort((a, b) => {
      if (a.health.failures !== b.health.failures) {
        return a.health.failures - b.health.failures;
      }
      return b.health.lastSuccess - a.health.lastSuccess;
    })
    .map((entry) => entry.url);
}

async function callRpc<T>(url: string, payload: RpcPayload): Promise<T> {
  const controller = new AbortController();
  let timeoutId: NodeJS.Timeout | undefined;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => {
      controller.abort();
      reject(new Error("RPC timeout"));
    }, SVG_FETCH_TIMEOUT);
  });
  const id = Math.floor(Math.random() * 100000);
  try {
    const fetchPromise = fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id,
        method: payload.method,
        params: payload.params,
      }),
      signal: controller.signal,
    });

    const response = await Promise.race([fetchPromise, timeoutPromise]);

    if (!response.ok) {
      const errorBody = await response.text();
      throw new Error(`RPC HTTP error ${response.status} from ${url}: ${errorBody}`);
    }

    const json = await response.json();
    if (json.error) {
      throw new Error(`RPC error from ${url}: ${json.error.message}`);
    }
    return json.result as T;
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
  }
}

async function callWithRpcRotation(callData: string, cacheKey: string): Promise<string> {
  if (inFlight.has(cacheKey)) {
    return inFlight.get(cacheKey)!;
  }

  const promise = callLimit(async () => {
    const ordered = getHealthyRpcUrls();
    const attempts = ordered.slice(0, MAX_RPC_ATTEMPTS);
    let lastError: Error | null = null;

    for (const url of attempts) {
      const index = BASE_RPC_URLS.indexOf(url);
      try {
        const result = await callRpc<string>(url, {
          method: "eth_call",
          params: [
            {
              to: BASE_DIAMOND_ADDRESS,
              data: callData,
            },
            "latest",
          ],
        });
        markSuccess(index);
        return result;
      } catch (error) {
        markFailure(index);
        lastError = error as Error;
      }
    }

    throw lastError || new Error("All RPC attempts failed");
  });

  inFlight.set(cacheKey, promise);
  return promise.finally(() => {
    inFlight.delete(cacheKey);
  });
}

export function getPlaceholderSvg(seed: string): string {
  const hue =
    seed.split("").reduce((acc, c) => acc + c.charCodeAt(0), 0) % 360;
  return `
    <svg viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg">
      <rect width="64" height="64" fill="hsl(${hue} 50% 96%)"/>
      <circle cx="32" cy="28" r="16" fill="hsl(${hue} 40% 85%)"/>
      <circle cx="26" cy="26" r="3" fill="hsl(${hue} 40% 30%)"/>
      <circle cx="38" cy="26" r="3" fill="hsl(${hue} 40% 30%)"/>
      <path d="M22 36c4-4 16-4 20 0" stroke="hsl(${hue} 40% 30%)" stroke-width="3" stroke-linecap="round" fill="none"/>
    </svg>
  `;
}

function normalizeTraits(traits: number[]): number[] {
  const normalized = new Array(6).fill(0);
  for (let i = 0; i < 6; i++) {
    const value = Number(traits[i]) || 0;
    normalized[i] = Math.max(-32768, Math.min(32767, Math.round(value)));
  }
  return normalized;
}

function normalizeWearables(wearableIds: number[]): number[] {
  const normalized = new Array(16).fill(0);
  for (let i = 0; i < Math.min(16, wearableIds.length); i++) {
    const value = Number(wearableIds[i]) || 0;
    normalized[i] = Math.max(0, Math.min(65535, Math.round(value)));
  }
  return normalized;
}

function hashInputs(values: unknown[]): string {
  const raw = JSON.stringify(values);
  let hash = 5381;
  for (let i = 0; i < raw.length; i++) {
    hash = (hash * 33) ^ raw.charCodeAt(i);
  }
  return (hash >>> 0).toString(16);
}

function isValidSvg(svg: string | undefined | null) {
  return typeof svg === "string" && svg.length > 100;
}

export async function getGotchiSvg(tokenId: string): Promise<string> {
  const cacheKey = `gotchi:${tokenId}`;
  const cached = cacheGet(svgCache, cacheKey);
  if (cached) {
    stats.cacheHits += 1;
    return cached;
  }
  stats.cacheMisses += 1;

  try {
    const callData = svgFacet.encodeFunctionData("getAavegotchiSvg", [
      BigInt(tokenId),
    ]);
    const result = await callWithRpcRotation(callData, cacheKey);
    const decoded = svgFacet.decodeFunctionResult("getAavegotchiSvg", result)[0];
    if (isValidSvg(decoded)) {
      cacheSet(svgCache, cacheKey, decoded);
      return decoded;
    }
  } catch {
    // fall through
  }

  const fallback = getPlaceholderSvg(cacheKey);
  cacheSet(svgCache, cacheKey, fallback);
  return fallback;
}

export async function getGotchiSvgs(
  tokenIds: string[]
): Promise<Record<string, string>> {
  const results: Record<string, string> = {};
  const missing: string[] = [];

  for (const tokenId of tokenIds) {
    const cacheKey = `gotchi:${tokenId}`;
    const cached = cacheGet(svgCache, cacheKey);
    if (cached) {
      stats.cacheHits += 1;
      results[tokenId] = cached;
    } else {
      stats.cacheMisses += 1;
      missing.push(tokenId);
    }
  }

  if (missing.length === 0) return results;

  await fetchAllSvgsParallel(missing, results);
  return results;
}

async function fetchAllSvgsParallel(
  tokenIds: string[],
  results: Record<string, string>
) {
  const batches: string[][] = [];
  for (let i = 0; i < tokenIds.length; i += BATCH_SIZE) {
    batches.push(tokenIds.slice(i, i + BATCH_SIZE));
  }

  for (let i = 0; i < batches.length; i += PARALLEL_BATCHES) {
    const wave = batches.slice(i, i + PARALLEL_BATCHES);
    await Promise.all(
      wave.map(async (batch) => {
        await Promise.all(
          batch.map(async (tokenId) => {
            try {
              const svg = await getGotchiSvg(tokenId);
              results[tokenId] = svg;
            } catch {
              const fallback = ghostSvg(`gotchi:${tokenId}`);
              cacheSet(svgCache, `gotchi:${tokenId}`, fallback);
              results[tokenId] = fallback;
            }
          })
        );
      })
    );
  }
}

export async function previewGotchiSvg(input: {
  hauntId: number;
  collateral: string;
  numericTraits: number[];
  wearableIds: number[];
}): Promise<string> {
  const normalizedTraits = normalizeTraits(input.numericTraits);
  const normalizedWearables = normalizeWearables(input.wearableIds);
  const cacheKey = `preview:${hashInputs([
    input.hauntId,
    input.collateral,
    normalizedTraits,
    normalizedWearables,
  ])}`;
  const cached = cacheGet(svgCache, cacheKey);
  if (cached) {
    stats.cacheHits += 1;
    return cached;
  }
  stats.cacheMisses += 1;

  try {
    const callData = svgFacet.encodeFunctionData("previewAavegotchi", [
      BigInt(input.hauntId),
      input.collateral,
      normalizedTraits,
      normalizedWearables,
    ]);
    const result = await callWithRpcRotation(callData, cacheKey);
    const decoded =
      svgFacet.decodeFunctionResult("previewAavegotchi", result)[0];
    if (isValidSvg(decoded)) {
      cacheSet(svgCache, cacheKey, decoded);
      return decoded;
    }
  } catch {
    // fall through
  }

  const fallback = getPlaceholderSvg(cacheKey);
  cacheSet(svgCache, cacheKey, fallback);
  return fallback;
}

export async function getWearableThumbs(input: {
  hauntId: number;
  collateral: string;
  numericTraits: number[];
}, wearableIds: number[]): Promise<Record<number, string>> {
  const thumbs: Record<number, string> = {};
  const normalizedTraits = normalizeTraits(input.numericTraits);
  const uniqueWearables = Array.from(new Set(wearableIds))
    .map((value) => Number(value) || 0)
    .filter((id) => id > 0);

  const tasks = uniqueWearables.map((wearableId) =>
    thumbLimit(async () => {
      const wearableValues = new Array(16).fill(0).map((_, idx) =>
        idx === 0 ? wearableId : 0
      );

      const cacheKey = `thumb:${hashInputs([
        input.hauntId,
        input.collateral,
        normalizedTraits,
      ])}:${wearableId}`;
      const cached = cacheGet(thumbCache, cacheKey);
      if (cached) {
        stats.thumbHits += 1;
        thumbs[wearableId] = cached;
        return;
      }
      stats.thumbMisses += 1;

      try {
        const callData = svgFacet.encodeFunctionData("previewAavegotchi", [
          BigInt(input.hauntId),
          input.collateral,
          normalizedTraits,
          normalizeWearables(wearableValues),
        ]);
        const result = await callWithRpcRotation(callData, cacheKey);
        const decoded =
          svgFacet.decodeFunctionResult("previewAavegotchi", result)[0];
        if (isValidSvg(decoded)) {
          cacheSet(thumbCache, cacheKey, decoded);
          thumbs[wearableId] = decoded;
          return;
        }
      } catch {
        // fall through
      }

      const fallback = getPlaceholderSvg(cacheKey);
      cacheSet(thumbCache, cacheKey, fallback);
      thumbs[wearableId] = fallback;
    })
  );

  await Promise.all(tasks);
  return thumbs;
}

export function getDebugStats() {
  return {
    cacheHits: stats.cacheHits,
    cacheMisses: stats.cacheMisses,
    thumbHits: stats.thumbHits,
    thumbMisses: stats.thumbMisses,
    lastRpcUrl: stats.lastRpcUrl,
    svgCacheSize: svgCache.size,
    thumbCacheSize: thumbCache.size,
    rpcHealth: BASE_RPC_URLS.map((url, index) => ({
      url,
      ...getHealth(index),
    })),
  };
}

