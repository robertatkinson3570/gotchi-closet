import { env } from "@/lib/env";
import type { Tier, ChatMessage } from "./types";
import { SESSION_HEADER } from "@/lib/wisp/walletProof";

export interface ChatResponse {
  reply: string;
  deflected: boolean;
  tier?: Tier;
  needsActionAuth?: boolean;
  action?: { ok: boolean; reason?: string; txHash?: string; detail?: string };
  navigate?: string;
  prepareUpkeep?: boolean;
  /** false: the server did not treat this wallet as signed in, so nothing was remembered. */
  memory?: boolean;
}

// Companion routes live on the Express server (VPS in prod). `companionApiUrl` is
// the server origin in prod and empty in dev (where the Vite /api proxy forwards).
const BASE = env.companionApiUrl;

// WALLET PROOF: a Sign-In with Ethereum session lets the server read and keep
// this wallet's chat history. Without one, chat still works, with no memory.
const sessionKey = (wallet: string) => `companion.session.${wallet.toLowerCase()}`;

/** The stored session token for this wallet, when it has not expired. */
export function companionSession(wallet: string | undefined): string | null {
  if (!wallet) return null;
  try {
    const token = localStorage.getItem(sessionKey(wallet));
    const exp = Number(token?.split(".")[2]);
    if (token && exp > Date.now() + 60_000) return token;
    if (token) localStorage.removeItem(sessionKey(wallet));
  } catch { /* storage blocked */ }
  return null;
}

export function forgetCompanionSession(wallet: string): void {
  try { localStorage.removeItem(sessionKey(wallet)); } catch { /* storage blocked */ }
}

function sessionHeaders(wallet: string): Record<string, string> {
  const token = companionSession(wallet);
  return token ? { [SESSION_HEADER]: token } : {};
}

/** Ask the wallet to sign in so the gotchi remembers. Throws when the user declines or the server refuses. */
export async function signInCompanion(wallet: string, sign: (message: string) => Promise<string>): Promise<void> {
  const prep = await fetch(`${BASE}/api/companion/session/prepare`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ wallet, domain: window.location.host, uri: window.location.origin }),
  });
  const p = await prep.json().catch(() => ({}));
  if (!prep.ok || typeof p.message !== "string") throw new Error(p.error || `sign-in failed (${prep.status})`);
  const signature = await sign(p.message);
  const res = await fetch(`${BASE}/api/companion/session`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message: p.message, signature }),
  });
  const s = await res.json().catch(() => ({}));
  if (!res.ok || typeof s.token !== "string") throw new Error(s.error || `sign-in failed (${res.status})`);
  try { localStorage.setItem(sessionKey(wallet), s.token); } catch { /* storage blocked: memory lasts this page only */ }
}

export interface AppGrant { app: string; domain: string; grantedAt: number; expiresAt: number; }

/** Apps this signed-in wallet has let into its chat history. */
export async function getAppGrants(wallet: string): Promise<AppGrant[]> {
  const headers = sessionHeaders(wallet);
  if (!headers[SESSION_HEADER]) return [];
  try {
    const res = await fetch(`${BASE}/api/companion/grants`, { headers });
    if (!res.ok) return [];
    const json = await res.json();
    return Array.isArray(json?.grants) ? json.grants : [];
  } catch {
    return [];
  }
}

export async function revokeAppGrant(wallet: string, app: string): Promise<boolean> {
  try {
    const res = await fetch(`${BASE}/api/companion/grants/${encodeURIComponent(app)}`, { method: "DELETE", headers: sessionHeaders(wallet) });
    return res.ok;
  } catch {
    return false;
  }
}

export async function postChat(
  tokenId: string,
  wallet: string,
  message: string,
  auth?: { signature: string; signedAt: number },
  actionAuth?: { actionSignature: string; actionSignedAt: number }
): Promise<ChatResponse> {
  const res = await fetch(`${BASE}/api/companion/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...sessionHeaders(wallet) },
    body: JSON.stringify({ tokenId, wallet, message, ...(auth ?? {}), ...(actionAuth ?? {}) }),
  });
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || `chat failed (${res.status})`);
  return res.json();
}

// KEEPER GOTCHI (07-analyst-chat.md §7.3): the "Ask your gotchi" turn. The
// reply carries GVR's cites and confidence; 402 { refused: "holder" } and
// 429 { tier: "capped" } are answers, not errors, so the panel can say them.
export type AnalystCite = { query_id: string; as_of_block: string | null; chain_id: number[]; metric: string; verified: string | null; params: Record<string, unknown> };
export type AnalystAskReply = {
  reply: string; route: string; cites: AnalystCite[]; voiced: boolean; confidence: "verified" | "open"; rail: string; tier: string; refusal?: string; check?: string;
};
export type AnalystAskResult =
  | { kind: "ok"; body: AnalystAskReply }
  | { kind: "holder"; reply: string; plan: string }
  | { kind: "capped"; reply: string }
  | { kind: "error"; status: number; error: string };

/** 00-overview.md §8, verbatim and in order; the first line is the EU AI Act Article 50 line. */
export const ANALYST_DISCLAIMERS: readonly string[] = [
  "You are talking to an AI. Your gotchi is a program that reads public blockchain data.",
  "Your gotchi is not an investment, tax or legal adviser. It explains what it can see and models what you ask. It does not recommend buying, selling or holding anything, and it does not predict prices.",
  "Tax figures are a model from your own transaction history using the method shown. They are not filed anywhere. Check them with a tax professional.",
  "Every number links to the block and query it came from. Prices are from public feeds and can be stale.",
];

export async function postAnalystAsk(
  tokenId: string,
  wallet: string,
  message: string,
  auth: { signedAt: number; signature: string },
  history: ChatMessage[] = [],
): Promise<AnalystAskResult> {
  const res = await fetch(`${BASE}/api/companion/ask`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ tokenId, wallet, message, history: history.slice(-6), ...auth }),
    signal: AbortSignal.timeout(80_000),
  });
  const json: any = await res.json().catch(() => ({}));
  if (res.status === 402 && json.refused === "holder") return { kind: "holder", reply: String(json.reply ?? ""), plan: String(json.plan ?? "") };
  if (res.status === 429 && json.tier === "capped") return { kind: "capped", reply: String(json.reply ?? "") };
  if (!res.ok || typeof json.reply !== "string") return { kind: "error", status: res.status, error: String(json.error ?? `ask failed (${res.status})`) };
  return { kind: "ok", body: json as AnalystAskReply };
}

export async function getHistory(tokenId: string, wallet: string): Promise<ChatMessage[]> {
  try {
    const headers = sessionHeaders(wallet);
    if (!headers[SESSION_HEADER]) return [];
    const res = await fetch(`${BASE}/api/companion/history/${tokenId}/${wallet}`, { headers });
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
    const headers = sessionHeaders(wallet);
    if (!headers[SESSION_HEADER]) return [];
    const res = await fetch(`${BASE}/api/companion/actions/${wallet}/${tokenId}`, { headers });
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

// Set/toggle a standing autonomous goal. Requires the 24h action signature (owner-signed):
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
