// Who may read or write a wallet's companion history:
//   * the service key (GVR, which proved the wallet at sign-in);
//   * a Gotchi Closet session token for that wallet (x-wisp-session);
//   * a Wisp key the wallet has granted (mcp/grants.ts).
// Anything else is a guest: chat still answers, but nothing is read or kept.

import { SESSION_HEADER } from "../../src/lib/wisp/walletProof";
import { sessionWallet } from "./walletProof";

export const WALLET_PROOF_REQUIRED = "wallet proof required: sign in so your gotchi can remember your chats";
export const NO_WALLET_GRANT = "this wallet has not granted this app access to its chat history";

export function sessionWalletOf(req: { headers?: Record<string, unknown> }): string | null {
  return sessionWallet(req.headers?.[SESSION_HEADER]);
}
