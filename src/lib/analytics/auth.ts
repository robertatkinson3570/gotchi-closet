// src/lib/analytics/auth.ts
// Pure builder shared by the client (signs) and server (verifies). The exact string
// must match on both sides or the recovered address won't equal the claimed wallet.
export { isSignedAtFresh, PREMIUM_SIG_TTL_MS as SIG_TTL_MS } from "../companion/premiumAuth";

export function siteAdminMessage(wallet: string, signedAt: number): string {
  return `GotchiCloset site admin\nwallet: ${wallet.toLowerCase()}\nts: ${signedAt}`;
}
