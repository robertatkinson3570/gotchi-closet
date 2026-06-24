// server/steward/validate.ts
import type { Chores, AuthMode } from "./db";

export interface EnrollInput {
  owner: string; gotchiId: number; chores: Chores; intervalSec: number;
  smartAccount?: string; sessionKey?: string;
  ownerSig?: string; signedAt?: number; authMode?: AuthMode;
}
export type ParseResult = { ok: true; value: EnrollInput } | { ok: false; error: string };

export function parseEnrollBody(b: any): ParseResult {
  if (typeof b?.owner !== "string" || !b.owner.startsWith("0x")) return { ok: false, error: "owner required" };
  if (typeof b?.gotchiId !== "number" || !Number.isFinite(b.gotchiId)) return { ok: false, error: "gotchiId must be a number" };
  const c = b?.chores;
  if (!c || typeof c !== "object") return { ok: false, error: "chores required" };
  const chores: Chores = { pet: !!c.pet, channel: !!c.channel, claim: !!c.claim };
  if (!chores.pet && !chores.channel && !chores.claim) return { ok: false, error: "at least one chore required" };
  const authMode: AuthMode = b?.authMode === "operator" ? "operator" : "session";
  // The operator (setPetOperatorForAll) path can ONLY pet — channel/claim need a 7702 session key.
  if (authMode === "operator" && (chores.channel || chores.claim)) {
    return { ok: false, error: "operator mode supports petting only; use a session key for channel/claim" };
  }
  const intervalSec = typeof b?.intervalSec === "number" ? b.intervalSec : 28800;
  return {
    ok: true,
    value: {
      owner: b.owner, gotchiId: b.gotchiId, chores, intervalSec, authMode,
      smartAccount: typeof b.smartAccount === "string" ? b.smartAccount : undefined,
      sessionKey: typeof b.sessionKey === "string" ? b.sessionKey : undefined,
      ownerSig: typeof b.ownerSig === "string" ? b.ownerSig : undefined,
      signedAt: typeof b.signedAt === "number" ? b.signedAt : undefined,
    },
  };
}
