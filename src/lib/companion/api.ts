import type { Tier } from "./types";

export interface ChatResponse { reply: string; deflected: boolean; tier?: Tier; }

export async function postChat(tokenId: string, wallet: string, message: string): Promise<ChatResponse> {
  const res = await fetch("/api/companion/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ tokenId, wallet, message }),
  });
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || `chat failed (${res.status})`);
  return res.json();
}

export async function getPremium(wallet: string): Promise<{ active: boolean; daysLeft: number }> {
  const res = await fetch(`/api/companion/premium/${wallet}`);
  return res.json();
}

export async function claimPremium(wallet: string, days: number, txHash: string) {
  const res = await fetch("/api/companion/premium/claim", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ wallet, days, txHash }),
  });
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || `claim failed (${res.status})`);
  return res.json();
}
