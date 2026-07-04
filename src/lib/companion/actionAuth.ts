// Shared between client (signs) and server (verifies). Keep this format identical on
// both sides — the signature only validates if the exact same string is signed and
// recovered. Pure module (no viem/DOM) so the server can import it relatively.
//
// Proves the chat wallet controls its address, so Hermes may command VPS-side Steward
// actions for it and spend its own credits. Mirrors premiumAuth.ts.

export const ACTION_SIG_TTL_MS = 24 * 60 * 60 * 1000; // a signature is good for 24h

export function actionMessage(wallet: string, signedAt: number): string {
  return `GotchiCloset Hermes — authorize actions\nwallet: ${wallet.toLowerCase()}\nts: ${signedAt}`;
}
