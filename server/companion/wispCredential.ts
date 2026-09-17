// KEEPER GOTCHI (08-wisp-chat.md §8.2): the second credential on the chat
// door. A request that carries NO Authorization header is Closet's own
// unkeyed path (its web client, and GVR's closet rail proxying with the same
// body) and is not touched here. A request that carries one is a third
// party identifying itself: `Bearer wsp_…` resolves to its Wisp account, the
// internal service key (COMPANION_WRITE_KEY, held by GVR as
// GVR_COMPANION_WRITE_KEY) is the history write-back's door, and anything
// else is refused as a missing key. The unkeyed path is not "session-proven"
// in any stronger sense than it was before this slice: Closet's /chat has no
// wallet proof of its own (the v1 note at the top of routes/companion.ts),
// and closing that door is the owner's decision, not this file's.

import { timingSafeEqual } from "node:crypto";
import { getAccountByKey, type WispAccount } from "../mcp/accounts";

export type Credential =
  | { kind: "none" }
  | { kind: "wisp"; apiKey: string; account: WispAccount }
  | { kind: "service" }
  | { kind: "bad"; reason: string };

export function serviceKey(env: NodeJS.ProcessEnv = process.env): string {
  return (env.COMPANION_WRITE_KEY || "").trim();
}

function sameSecret(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length > 0 && x.length === y.length && timingSafeEqual(x, y);
}

/** Reads only the Authorization header (or `?key=`, the MCP endpoint's other
 *  spelling, for GET routes). Never the body. */
export function credentialOf(req: { headers?: Record<string, unknown>; query?: Record<string, unknown> }, env: NodeJS.ProcessEnv = process.env): Credential {
  const header = String(req.headers?.authorization ?? "");
  const bearer = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
  const queryKey = typeof req.query?.key === "string" ? req.query.key.trim() : "";
  const token = bearer || queryKey;
  if (!header && !queryKey) return { kind: "none" };
  if (!token) return { kind: "bad", reason: "Authorization must be Bearer wsp_…" };
  if (token.startsWith("wsp_")) {
    const account = getAccountByKey(token);
    return account ? { kind: "wisp", apiKey: token, account } : { kind: "bad", reason: "invalid api key" };
  }
  const svc = serviceKey(env);
  if (svc && sameSecret(token, svc)) return { kind: "service" };
  return { kind: "bad", reason: "not a Wisp key" };
}

export const WISP_KEY_REQUIRED = "Wisp key required";
