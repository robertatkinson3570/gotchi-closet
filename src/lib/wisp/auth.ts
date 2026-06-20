// Shared Wisp account-management auth message. The client signs this exact string;
// the server recovers the signer and matches the wallet. Pure module (no viem/DOM)
// so the server can import it relatively. Reuses the companion freshness window.

import { isSignedAtFresh } from "../companion/premiumAuth";

export { isSignedAtFresh };

/** The message a wallet signs to prove ownership of its Wisp account. */
export function wispManageMessage(wallet: string, signedAt: number): string {
  return `Wisp — manage account\nwallet: ${wallet.toLowerCase()}\nts: ${signedAt}`;
}
