// KEEPER GOTCHI (QA SEC-17, SEC-18): what a Wisp key may write as the gotchi.
// A third-party app's key used to POST any assistant-role turn into the
// shared history, and every client then replayed it to the model as the
// gotchi's own words (a planted "paste your recovery words" survived even
// revoking the app). Now an assistant turn from a key is accepted only when
// it is the exact reply the keyed chat route produced for that wallet and
// gotchi in the last ten minutes. This is that short in-memory record.
// The service key (GVR's own rails) is not subject to it.

import { createHash } from "node:crypto";

export const KEYED_REPLY_TTL_MS = 10 * 60_000;
const MAX_ENTRIES = 20_000;

const replies = new Map<string, number>();

function keyOf(wallet: string, tokenId: string, content: string): string {
  const hash = createHash("sha256").update(content).digest("hex").slice(0, 32);
  return `${wallet.toLowerCase()}|${String(tokenId)}|${hash}`;
}

function sweep(now: number): void {
  for (const [k, at] of replies) if (now - at > KEYED_REPLY_TTL_MS) replies.delete(k);
  if (replies.size > MAX_ENTRIES) {
    // Oldest first: Map iteration is insertion order.
    for (const k of replies.keys()) {
      replies.delete(k);
      if (replies.size <= MAX_ENTRIES) break;
    }
  }
}

/** The keyed chat route calls this with every reply it hands an app. */
export function recordKeyedReply(wallet: string, tokenId: string, content: string, now: number = Date.now()): void {
  if (replies.size >= MAX_ENTRIES || replies.size % 1000 === 0) sweep(now);
  replies.set(keyOf(wallet, tokenId, content), now);
}

/** True when this exact text was the gotchi's reply to this wallet and gotchi within the TTL. */
export function isKeyedReply(wallet: string, tokenId: string, content: string, now: number = Date.now()): boolean {
  const at = replies.get(keyOf(wallet, tokenId, content));
  return at !== undefined && now - at <= KEYED_REPLY_TTL_MS;
}

/** Tests only. */
export function _resetKeyedReplies(): void {
  replies.clear();
}
