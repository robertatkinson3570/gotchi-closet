// server/steward/validate.ts
import type { Chores } from "./db";

export interface EnrollInput {
  owner: string; gotchiId: number; chores: Chores; intervalSec: number;
  smartAccount?: string; sessionKey?: string;
}
export type ParseResult = { ok: true; value: EnrollInput } | { ok: false; error: string };

export function parseEnrollBody(b: any): ParseResult {
  if (typeof b?.owner !== "string" || !b.owner.startsWith("0x")) return { ok: false, error: "owner required" };
  if (typeof b?.gotchiId !== "number" || !Number.isFinite(b.gotchiId)) return { ok: false, error: "gotchiId must be a number" };
  const c = b?.chores;
  if (!c || typeof c !== "object") return { ok: false, error: "chores required" };
  const chores: Chores = { pet: !!c.pet, channel: !!c.channel, claim: !!c.claim };
  if (!chores.pet && !chores.channel && !chores.claim) return { ok: false, error: "at least one chore required" };
  const intervalSec = typeof b?.intervalSec === "number" ? b.intervalSec : 28800;
  return {
    ok: true,
    value: {
      owner: b.owner, gotchiId: b.gotchiId, chores, intervalSec,
      smartAccount: typeof b.smartAccount === "string" ? b.smartAccount : undefined,
      sessionKey: typeof b.sessionKey === "string" ? b.sessionKey : undefined,
    },
  };
}
