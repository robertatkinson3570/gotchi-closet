// Shared between client (signs) and server (verifies). Keep this format identical on
// both sides — the signature only validates if the exact same string is signed and
// recovered. Pure module (no viem/DOM) so the server can import it relatively.

export const PREMIUM_SIG_TTL_MS = 24 * 60 * 60 * 1000; // a signature is good for 24h

export function premiumMessage(wallet: string, signedAt: number): string {
  return `GotchiCloset Companion — premium access\nwallet: ${wallet.toLowerCase()}\nts: ${signedAt}`;
}

export function isSignedAtFresh(signedAt: number, now: number): boolean {
  return (
    Number.isFinite(signedAt) &&
    signedAt <= now + 60_000 && // allow 1 min clock skew
    now - signedAt <= PREMIUM_SIG_TTL_MS
  );
}
