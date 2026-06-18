import { env } from "@/lib/env";

export interface SoulDepthData {
  tokenId: string;
  name: string;
  depth: number;
  level: string;
  breakdown: {
    kinshipXp: number;
    consistency: number;
    soulAge: number;
    memory: number;
  };
  soulAgeDays: number;
  streak: number;
  kinship: number;
  memories: number;
  pastLives: number;
}

export async function getSoulDepth(
  tokenId: string
): Promise<SoulDepthData | null> {
  try {
    const base = env.companionApiUrl;
    const url = base
      ? `${base}/api/soul/${tokenId}`
      : `/api/soul/${tokenId}`;
    const res = await fetch(url);
    if (!res.ok) return null;
    return (await res.json()) as SoulDepthData;
  } catch {
    return null;
  }
}
