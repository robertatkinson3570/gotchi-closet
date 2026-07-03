// src/lib/megaphone/auth.ts
// Pure message builders shared by client (signs) and server (verifies). The exact string
// must match on both sides. Freshness/TTL is reused from the companion module, same as the
// Game Center, so there is a single definition of signature staleness.
export { isSignedAtFresh, PREMIUM_SIG_TTL_MS as SIG_TTL_MS } from "../companion/premiumAuth";

export function adminMessage(wallet: string, signedAt: number): string {
  return `GotchiCloset Megaphone — admin\nwallet: ${wallet.toLowerCase()}\nts: ${signedAt}`;
}
