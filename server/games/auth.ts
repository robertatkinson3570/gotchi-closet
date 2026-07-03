// server/games/auth.ts
import { recoverMessageAddress } from "viem";
import { submitMessage, adminMessage, isSignedAtFresh } from "../../src/lib/games/auth";

async function verify(
  build: (wallet: string, signedAt: number) => string,
  wallet: string,
  signedAt: number,
  signature: string
): Promise<boolean> {
  if (!wallet?.startsWith("0x") || !signature?.startsWith("0x")) return false;
  if (!isSignedAtFresh(signedAt, Date.now())) return false;
  try {
    const recovered = await recoverMessageAddress({
      message: build(wallet, signedAt),
      signature: signature as `0x${string}`,
    });
    return recovered.toLowerCase() === wallet.toLowerCase();
  } catch {
    return false;
  }
}

export function adminAddresses(): Set<string> {
  return new Set(
    (process.env.GAME_CENTER_ADMINS || "")
      .split(",")
      .map((a) => a.trim().toLowerCase())
      .filter(Boolean)
  );
}

export function isAdmin(wallet: string): boolean {
  return adminAddresses().has(wallet.toLowerCase());
}

export function verifySubmitSignature(wallet: string, signedAt: number, signature: string): Promise<boolean> {
  return verify(submitMessage, wallet, signedAt, signature);
}

export async function verifyAdminSignature(wallet: string, signedAt: number, signature: string): Promise<boolean> {
  if (!isAdmin(wallet)) return false;
  return verify(adminMessage, wallet, signedAt, signature);
}
