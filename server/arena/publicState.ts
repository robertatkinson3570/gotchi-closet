import { fetchGotchiState } from "../companion/gotchiState";

export interface PublicGotchi {
  tokenId: string;
  name: string;
  traits: number[];
  owner: string | undefined;
  kinship: number;
  level: number;
}

interface CacheEntry {
  data: PublicGotchi;
  expiresAt: number;
}

const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes
const cache = new Map<string, CacheEntry>();

export async function fetchPublicGotchi(tokenId: string): Promise<PublicGotchi | null> {
  const now = Date.now();
  const cached = cache.get(tokenId);
  if (cached && cached.expiresAt > now) return cached.data;

  const state = await fetchGotchiState(tokenId);
  if (!state) return null;

  const data: PublicGotchi = {
    tokenId,
    name: state.name,
    // Use the most-equipped-aware traits (public-safe: just numbers)
    traits: state.withSetsNumericTraits ?? state.modifiedNumericTraits ?? state.numericTraits,
    owner: state.owner,
    kinship: state.kinship ?? 0,
    level: state.level ?? 1,
  };

  cache.set(tokenId, { data, expiresAt: now + CACHE_TTL_MS });
  return data;
}

/** Exposed for tests — clears the in-process cache. */
export function clearPublicStateCache(): void {
  cache.clear();
}
