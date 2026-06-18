import { recoverMessageAddress } from "viem";
import { premiumMessage, globalRoomMessage, isSignedAtFresh } from "../../src/lib/companion/premiumAuth";

async function verifySigned(
  buildMessage: (wallet: string, signedAt: number) => string,
  wallet: string,
  signedAt: number,
  signature: string
): Promise<boolean> {
  if (!wallet?.startsWith("0x") || !signature?.startsWith("0x")) return false;
  if (!isSignedAtFresh(signedAt, Date.now())) return false;
  try {
    const recovered = await recoverMessageAddress({
      message: buildMessage(wallet, signedAt),
      signature: signature as `0x${string}`,
    });
    return recovered.toLowerCase() === wallet.toLowerCase();
  } catch {
    return false;
  }
}

// Premium (OpenAI) tier gate — unchanged behavior.
export function premiumSignatureValid(wallet: string, signedAt: number, signature: string): Promise<boolean> {
  return verifySigned(premiumMessage, wallet, signedAt, signature);
}

// Global Room join gate.
export function verifyRoomSignature(wallet: string, signedAt: number, signature: string): Promise<boolean> {
  return verifySigned(globalRoomMessage, wallet, signedAt, signature);
}
