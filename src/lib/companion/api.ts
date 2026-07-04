import { env } from "@/lib/env";
import type { Tier, ChatMessage } from "./types";

export interface ChatResponse {
  reply: string;
  deflected: boolean;
  tier?: Tier;
  needsActionAuth?: boolean;
  action?: { ok: boolean; reason?: string; txHash?: string; detail?: string };
  navigate?: string;
  prepareUpkeep?: boolean;
}

// Companion routes live on the Express server (VPS in prod). `companionApiUrl` is
// the server origin in prod and empty in dev (where the Vite /api proxy forwards).
const BASE = env.companionApiUrl;

export async function postChat(
  tokenId: string,
  wallet: string,
  message: string,
  auth?: { signature: string; signedAt: number },
  actionAuth?: { actionSignature: string; actionSignedAt: number }
): Promise<ChatResponse> {
  const res = await fetch(`${BASE}/api/companion/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ tokenId, wallet, message, ...(auth ?? {}), ...(actionAuth ?? {}) }),
  });
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || `chat failed (${res.status})`);
  return res.json();
}

export async function getHistory(tokenId: string, wallet: string): Promise<ChatMessage[]> {
  try {
    const res = await fetch(`${BASE}/api/companion/history/${tokenId}/${wallet}`);
    if (!res.ok) return [];
    const json = await res.json();
    return Array.isArray(json?.messages) ? json.messages : [];
  } catch {
    return [];
  }
}

export interface CompanionAction { kind: string; detail: string; txHash: string | null; ts: number; }

// Recent on-chain actions Hermes took for this gotchi+owner (newest-last). Used for the
// "while you were away…" report when autonomous auto-upkeep ran between visits.
export async function getRecentActions(wallet: string, tokenId: string): Promise<CompanionAction[]> {
  try {
    const res = await fetch(`${BASE}/api/companion/actions/${wallet}/${tokenId}`);
    if (!res.ok) return [];
    const json = await res.json();
    return Array.isArray(json?.actions) ? json.actions : [];
  } catch {
    return [];
  }
}

export interface Goal { wallet: string; tokenId: string; goal: string; enabled: boolean; }

export async function getGoals(wallet: string): Promise<Goal[]> {
  try {
    const res = await fetch(`${BASE}/api/companion/goals/${wallet}`);
    if (!res.ok) return [];
    const json = await res.json();
    return Array.isArray(json?.goals) ? json.goals : [];
  } catch {
    return [];
  }
}

// Set/toggle a standing autonomous goal. Requires the 24h action signature (owner-signed) —
// an enabled goal authorizes autonomous gas spend, so pass actionAuth from ensureActionAuth.
export async function setGoal(
  wallet: string,
  tokenId: string,
  goal: string,
  enabled: boolean,
  actionAuth: { actionSignature: string; actionSignedAt: number }
): Promise<{ ok: boolean; goals?: Goal[]; error?: string }> {
  const res = await fetch(`${BASE}/api/companion/goals`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ wallet, tokenId, goal, enabled, ...actionAuth }),
  });
  if (!res.ok) return { ok: false, error: (await res.json().catch(() => ({}))).error || `setGoal failed (${res.status})` };
  return res.json();
}

export async function getPremium(wallet: string): Promise<{ active: boolean; credits: number }> {
  const res = await fetch(`${BASE}/api/companion/premium/${wallet}`);
  return res.json();
}

export async function claimPremium(wallet: string, ghst: number, txHash: string) {
  const res = await fetch(`${BASE}/api/companion/premium/claim`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ wallet, ghst, txHash }),
  });
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || `claim failed (${res.status})`);
  return res.json();
}

export interface GlobalMessage { id: number; tokenId: string; name: string; text: string; isAI: boolean; ts: number; }

export function globalStreamUrl(): string {
  return `${BASE}/api/companion/global/stream`;
}

export async function getGlobalHistory(limit = 50): Promise<GlobalMessage[]> {
  try {
    const res = await fetch(`${BASE}/api/companion/global/history?limit=${limit}`);
    if (!res.ok) return [];
    const json = await res.json();
    return Array.isArray(json?.messages) ? json.messages : [];
  } catch {
    return [];
  }
}

export async function postGlobal(args: {
  tokenId: string; wallet: string; text: string; signature: string; signedAt: number;
}): Promise<{ ok: boolean; message?: GlobalMessage; error?: string }> {
  const res = await fetch(`${BASE}/api/companion/global/post`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(args),
  });
  if (!res.ok) return { ok: false, error: (await res.json().catch(() => ({}))).error || `post failed (${res.status})` };
  return res.json();
}
