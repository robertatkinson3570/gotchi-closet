import { env } from "@/lib/env";

// Roast Arena routes live on the same Express server as the companion.
const BASE = env.companionApiUrl;

// ---------------------------------------------------------------------------
// Shared types
// ---------------------------------------------------------------------------

export interface RoastQueueEntry {
  tokenId: string;
  name: string;
  wins: number;
  losses: number;
  xp: number;
}

export interface RoastTranscriptLine {
  side: "a" | "b";
  round: number;
  text: string;
}

export interface RoastBattle {
  id: string;
  aToken: string;
  aName: string;
  bToken: string;
  bName: string;
  winnerToken: string;
  transcript: RoastTranscriptLine[];
  verdict: string;
  aScore: number;
  bScore: number;
  createdAt: string;
}

export interface RoastStatRow {
  tokenId: string;
  gotchiName: string;
  wins: number;
  losses: number;
  xp: number;
}

// ---------------------------------------------------------------------------
// Read endpoints (public)
// ---------------------------------------------------------------------------

export async function getRoastQueue(): Promise<RoastQueueEntry[]> {
  try {
    const res = await fetch(`${BASE}/api/roast/queue`);
    if (!res.ok) return [];
    const json = await res.json();
    return Array.isArray(json?.queue) ? json.queue : [];
  } catch {
    return [];
  }
}

export async function getRoastBattle(id: string): Promise<RoastBattle | null> {
  try {
    const res = await fetch(`${BASE}/api/roast/battle/${id}`);
    if (!res.ok) return null;
    const json = await res.json();
    return json?.battle ?? null;
  } catch {
    return null;
  }
}

export async function getRoastBattles(tokenId: string): Promise<RoastBattle[]> {
  try {
    const res = await fetch(`${BASE}/api/roast/battles?tokenId=${encodeURIComponent(tokenId)}`);
    if (!res.ok) return [];
    const json = await res.json();
    return Array.isArray(json?.battles) ? json.battles : [];
  } catch {
    return [];
  }
}

export async function getLeaderboard(limit = 50): Promise<RoastStatRow[]> {
  try {
    const res = await fetch(`${BASE}/api/roast/leaderboard?limit=${limit}`);
    if (!res.ok) return [];
    const json = await res.json();
    return Array.isArray(json?.rows) ? json.rows : [];
  } catch {
    return [];
  }
}

// ---------------------------------------------------------------------------
// Write endpoints (require wallet signature)
// ---------------------------------------------------------------------------

interface AuthArgs {
  wallet: string;
  signature: string;
  signedAt: number;
}

export async function enterQueue(args: { tokenId: string } & AuthArgs): Promise<{ ok: boolean; error?: string }> {
  const res = await fetch(`${BASE}/api/roast/queue`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(args),
  });
  if (!res.ok) return { ok: false, error: (await res.json().catch(() => ({}))).error || `enter failed (${res.status})` };
  return res.json();
}

export async function leaveQueue(args: { tokenId: string } & AuthArgs): Promise<{ ok: boolean; error?: string }> {
  const res = await fetch(`${BASE}/api/roast/queue/leave`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(args),
  });
  if (!res.ok) return { ok: false, error: (await res.json().catch(() => ({}))).error || `leave failed (${res.status})` };
  return res.json();
}

export async function startBattle(
  args: { challengerTokenId: string; opponentTokenId: string } & AuthArgs
): Promise<{ ok: boolean; battleId?: string; error?: string }> {
  const res = await fetch(`${BASE}/api/roast/battle`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(args),
  });
  if (!res.ok) return { ok: false, error: (await res.json().catch(() => ({}))).error || `battle failed (${res.status})` };
  const json = await res.json();
  return { ok: true, battleId: json.battleId };
}
