// Ported VERBATIM from GVR `packages/shared/src/analystAuth.ts` (keeper-gotchi
// Slice 06, B1 and B2 of the 2026-09-17 fix pass). Shared between client (signs)
// and server (only forwards -- GVR is the one that actually verifies this
// signature); keep this format identical to GVR's copy or a drifted string
// makes every read 401 on GVR's side. Pure module (no viem/DOM) so the server
// can import it relatively, same as actionAuth.ts / premiumAuth.ts.

export const KEEPER_PURPOSES = ["standing", "koinly", "ask", "feedback", "register"] as const;
export type KeeperPurpose = (typeof KEEPER_PURPOSES)[number];

/** A read signature is good for 30 minutes; the paid ask lives 5 (B2: a captured ask
 *  signature spends Holder turns). */
export const KEEPER_READ_SIG_TTL_MS = 30 * 60 * 1000;
export const KEEPER_ASK_SIG_TTL_MS = 5 * 60 * 1000;
export function keeperSigTtlMs(purpose: KeeperPurpose): number {
  return purpose === "ask" || purpose === "register" ? KEEPER_ASK_SIG_TTL_MS : KEEPER_READ_SIG_TTL_MS;
}

/** B2: each GVR route accepts only its own purpose; the text is GVR's byte for byte. */
export function keeperReadMessage(wallet: string, signedAt: number, purpose: KeeperPurpose): string {
  return `GVR Keeper: read my standing report\nwallet: ${wallet.toLowerCase()}\nts: ${signedAt}\npurpose: ${purpose}`;
}

/** GVR's GET routes take the proof in this header (kept out of access logs): signedAt.signature */
export const KEEPER_SIG_HEADER = "x-keeper-signature";
export function keeperSigHeaderValue(sig: { signedAt: number; signature: string }): string {
  return `${sig.signedAt}.${sig.signature}`;
}

/** B1 (GVR QA H-05) and B2 changed the signed text; a signature cached under the old text
 *  fails once on GVR, and the panels drop it and re-sign. One cache per purpose. */
export const KEEPER_SIG_CACHE_KEY = (wallet: string, purpose: KeeperPurpose) => `companion.keeperSig.${purpose}.${wallet.toLowerCase()}`;
export function forgetKeeperSig(wallet: string, purpose: KeeperPurpose): void {
  try { localStorage.removeItem(KEEPER_SIG_CACHE_KEY(wallet, purpose)); } catch { /* privacy mode */ }
}
