// Ported VERBATIM from GVR `packages/shared/src/analystAuth.ts` (keeper-gotchi
// Slice 06). Shared between client (signs) and server (only forwards -- GVR is
// the one that actually verifies this signature); keep this format identical
// to GVR's copy or a signature that verifies there fails to verify... nowhere,
// since Closet never re-derives it -- but a drifted string would still make
// every read 401 on GVR's side. Pure module (no viem/DOM) so the server can
// import it relatively, same as actionAuth.ts / premiumAuth.ts.

export const KEEPER_READ_SIG_TTL_MS = 30 * 60 * 1000; // a signature is good for 30 minutes

export function keeperReadMessage(wallet: string, signedAt: number): string {
  return `GVR Keeper — read my standing report\nwallet: ${wallet.toLowerCase()}\nts: ${signedAt}`;
}
