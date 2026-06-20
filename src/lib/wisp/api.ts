// Client calls to the Wisp billing API (server: server/routes/mcpBilling.ts).
import { env } from "@/lib/env";

const apiBase = () => env.companionApiUrl || "";

export async function createWispAccount(wallet?: string): Promise<{ apiKey: string; plan: string }> {
  const res = await fetch(`${apiBase()}/api/mcp/account`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ wallet: wallet ?? "" }),
  });
  if (!res.ok) throw new Error("could not create account");
  return res.json();
}

export interface WispQuote {
  usd: number;
  asset: "eth" | "usdc";
  amountWei?: string; // eth
  amountUnits?: string; // usdc (6 decimals)
  receivingWallet: `0x${string}`;
}

export async function getWispQuote(
  plan: string,
  months: number,
  asset: "eth" | "usdc"
): Promise<WispQuote> {
  const res = await fetch(`${apiBase()}/api/mcp/quote?plan=${plan}&months=${months}&asset=${asset}`);
  if (!res.ok) throw new Error((await res.json().catch(() => ({})))?.error || "quote failed");
  return res.json();
}

export async function buyWispPlan(args: {
  apiKey: string;
  plan: string;
  months: number;
  asset: "eth" | "usdc";
  txHash: string;
  wallet?: string;
}): Promise<{ ok: boolean; plan: string; expiresAt: number }> {
  const res = await fetch(`${apiBase()}/api/mcp/buy`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(args),
  });
  if (!res.ok) throw new Error((await res.json().catch(() => ({})))?.error || "purchase failed");
  return res.json();
}
