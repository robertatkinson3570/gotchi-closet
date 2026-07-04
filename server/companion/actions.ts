// Hermes "Act" executor. Runs a gotchi's DUE Steward upkeep (pet / channel / claim, per
// its enrollment) via the SAME VPS path the cron uses — non-custodial, allowlist-scoped
// on-chain, so it can never move funds. The caller MUST have already verified that `wallet`
// is the on-chain owner of the gotchi. All I/O is injected so this is unit-tested with fakes.

export interface ActionDeps {
  listEnrollments: (owner: string) => Array<{ id: number; owner: string; gotchiId: number; status: string }>;
  runOne: (e: any, nowSec: number, opts: { force?: boolean }) => Promise<{ ran: boolean; txHash?: string; reason?: string }>;
  hasCredits: (wallet: string) => boolean;
  burnCredit: (wallet: string) => boolean;
  logAction: (wallet: string, tokenId: string, kind: string, detail: string, txHash: string | null) => void;
}

export interface ActionResult {
  ok: boolean;
  reason?: "not-enrolled" | "no-credits" | "no-work" | "inactive";
  txHash?: string;
  detail?: string;
}

export async function runUpkeep(wallet: string, tokenId: string, deps: ActionDeps): Promise<ActionResult> {
  const e = deps.listEnrollments(wallet).find((x) => x.gotchiId === Number(tokenId) && x.status === "active");
  if (!e) return { ok: false, reason: "not-enrolled" };
  if (!deps.hasCredits(wallet)) return { ok: false, reason: "no-credits" };
  const res = await deps.runOne(e, Math.floor(Date.now() / 1000), { force: true });
  if (!res.ran) return { ok: false, reason: (res.reason as ActionResult["reason"]) ?? "no-work" };
  deps.burnCredit(wallet);
  const detail = `upkeep run for #${tokenId}`;
  deps.logAction(wallet, tokenId, "upkeep", detail, res.txHash ?? null);
  return { ok: true, txHash: res.txHash, detail };
}
