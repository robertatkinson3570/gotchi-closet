import { recoverMessageAddress } from "viem";
import { premiumMessage, isSignedAtFresh } from "../../src/lib/companion/premiumAuth";

// Verifies that `wallet` actually signed the premium-access message at `signedAt`.
// EOA signatures only (personal_sign / recoverMessageAddress); smart-contract wallets
// fall back to the free tier. Used to gate the OpenAI tier so a caller can't claim
// another address's premium entitlement by putting it in the request body.
export async function premiumSignatureValid(
  wallet: string,
  signedAt: number,
  signature: string
): Promise<boolean> {
  if (!wallet?.startsWith("0x") || !signature?.startsWith("0x")) return false;
  if (!isSignedAtFresh(signedAt, Date.now())) return false;
  try {
    const recovered = await recoverMessageAddress({
      message: premiumMessage(wallet, signedAt),
      signature: signature as `0x${string}`,
    });
    return recovered.toLowerCase() === wallet.toLowerCase();
  } catch {
    return false;
  }
}
