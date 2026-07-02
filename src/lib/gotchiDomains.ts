import type { PublicClient } from "viem";
import { GOTCHI_DOMAIN_DIAMOND_BASE } from "@/lib/lending/contracts";

// .gotchi name service reverse resolution (the dapp shows "ztef.gotchi"
// instead of 0x… wherever an address has a primary domain). reverseNameOf
// was verified on-chain 2026-07-02: reverseNameOf(0xa98e…6905) -> "ztef.gotchi".
const DOMAIN_ABI = [
  {
    name: "reverseNameOf",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "_address", type: "address" }],
    outputs: [{ name: "", type: "string" }],
  },
] as const;

// Session cache; "" means "looked up, no domain" so we never re-query misses.
const cache = new Map<string, string>();

/**
 * Resolve .gotchi primary domains for a set of addresses in one multicall.
 * Returns only the addresses that HAVE a domain (lowercased addr -> name).
 */
export async function resolveGotchiDomains(client: PublicClient, addresses: (string | undefined)[]): Promise<Map<string, string>> {
  const wanted = [...new Set(
    addresses
      .filter((a): a is string => !!a && /^0x[0-9a-fA-F]{40}$/.test(a))
      .map((a) => a.toLowerCase())
  )];
  const missing = wanted.filter((a) => !cache.has(a));
  if (missing.length > 0) {
    try {
      const results = await client.multicall({
        contracts: missing.map((a) => ({
          address: GOTCHI_DOMAIN_DIAMOND_BASE,
          abi: DOMAIN_ABI,
          functionName: "reverseNameOf" as const,
          args: [a as `0x${string}`],
        })),
        allowFailure: true,
      });
      missing.forEach((a, i) => {
        const r = results[i];
        cache.set(a, r.status === "success" ? String(r.result ?? "") : "");
      });
    } catch {
      /* RPC hiccup — leave uncached so a later call retries */
    }
  }
  const out = new Map<string, string>();
  for (const a of wanted) {
    const d = cache.get(a);
    if (d) out.set(a, d);
  }
  return out;
}

/** Cache-only lookup (after a resolve has run); undefined = no domain known. */
export function gotchiDomainSync(address?: string): string | undefined {
  if (!address) return undefined;
  return cache.get(address.toLowerCase()) || undefined;
}
