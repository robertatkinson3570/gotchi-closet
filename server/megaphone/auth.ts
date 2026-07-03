// server/megaphone/auth.ts
// Admin-only auth for the Megaphone. EIP-191 signature recovery via viem, admin allowlist
// from env. Reuses the Game Center admin allowlist so the same wallets that curate games
// curate content — no second env var to keep in sync.
import { recoverMessageAddress } from "viem";
import { adminMessage, isSignedAtFresh } from "../../src/lib/megaphone/auth";

export function adminAddresses(): Set<string> {
  return new Set(
    (process.env.MEGAPHONE_ADMINS || process.env.GAME_CENTER_ADMINS || "")
      .split(",")
      .map((a) => a.trim().toLowerCase())
      .filter(Boolean)
  );
}

export function isAdmin(wallet: string): boolean {
  return adminAddresses().has(wallet.toLowerCase());
}

export async function verifyAdminSignature(wallet: string, signedAt: number, signature: string): Promise<boolean> {
  if (!isAdmin(wallet)) return false;
  if (!wallet?.startsWith("0x") || !signature?.startsWith("0x")) return false;
  if (!isSignedAtFresh(signedAt, Date.now())) return false;
  try {
    const recovered = await recoverMessageAddress({
      message: adminMessage(wallet, signedAt),
      signature: signature as `0x${string}`,
    });
    return recovered.toLowerCase() === wallet.toLowerCase();
  } catch {
    return false;
  }
}
