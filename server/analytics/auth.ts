// server/analytics/auth.ts
import { recoverMessageAddress } from "viem";
import { siteAdminMessage, isSignedAtFresh } from "../../src/lib/analytics/auth";

// Default owners. Baked in so prod works with zero config; override with SITE_ADMINS.
const DEFAULT_ADMINS = [
  "0xe0d4f8f6f04a42aed5a7ea4f68bc612e6a54a3c2",
  "0xc4cb6cb969e8b4e309ab98e4da51b77887afad96",
];

export function adminAddresses(): Set<string> {
  const raw = process.env.SITE_ADMINS;
  const list = raw
    ? raw.split(",").map((a) => a.trim().toLowerCase()).filter(Boolean)
    : DEFAULT_ADMINS;
  return new Set(list);
}

export function isAdmin(wallet: string): boolean {
  return adminAddresses().has(wallet.toLowerCase());
}

export async function verifyAdminSignature(
  wallet: string,
  signedAt: number,
  signature: string
): Promise<boolean> {
  if (!isAdmin(wallet)) return false;
  if (!wallet?.startsWith("0x") || !signature?.startsWith("0x")) return false;
  if (!isSignedAtFresh(signedAt, Date.now())) return false;
  try {
    const recovered = await recoverMessageAddress({
      message: siteAdminMessage(wallet, signedAt),
      signature: signature as `0x${string}`,
    });
    return recovered.toLowerCase() === wallet.toLowerCase();
  } catch {
    return false;
  }
}
