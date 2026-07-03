// src/lib/games/auth.ts
// Pure builders shared by the client (signs) and server (verifies). The exact string
// must match on both sides or the recovered address won't equal the claimed wallet.
// TTL/freshness is reused from the companion module to avoid a second definition.
export { isSignedAtFresh, PREMIUM_SIG_TTL_MS as SIG_TTL_MS } from "../companion/premiumAuth";

export function submitMessage(wallet: string, signedAt: number): string {
  return `GotchiCloset Game Center — submit\nwallet: ${wallet.toLowerCase()}\nts: ${signedAt}`;
}

export function adminMessage(wallet: string, signedAt: number): string {
  return `GotchiCloset Game Center — admin\nwallet: ${wallet.toLowerCase()}\nts: ${signedAt}`;
}
