// server/steward/service.ts
// Read-only preview of what each active steward WOULD do right now (no submission).
// Reuses the Plan-1 due-work engine; snapshot reads are injected so it's unit-tested.
import { listEnrollments } from "./db";
import { computeWork, type ChainSnapshot, type WorkPlan } from "./dueWork";
import { workPlanToCalls, type Call } from "./encode";

export interface PreviewDeps { snapshotFor: (owner: string) => Promise<ChainSnapshot>; }
export interface EnrollmentPreview { id: number; gotchiId: number; chores: any; plan: WorkPlan; }

export async function previewOwner(owner: string, deps: PreviewDeps, now: number): Promise<EnrollmentPreview[]> {
  const active = listEnrollments(owner).filter((e) => e.status === "active");
  if (!active.length) return [];
  const snap = await deps.snapshotFor(owner);
  return active.map((e) => ({ id: e.id, gotchiId: e.gotchiId, chores: e.chores, plan: computeWork(e.chores, snap, now) }));
}

// Path 2 ("prepare + one-click"): compute ALL the owner's due upkeep across the whole wallet
// (no enrollment, no session key) and return the encoded calls so the owner's OWN wallet can
// execute them and pay its own gas. Lent-out (escrowed) gotchis are dropped from petting since
// the owner's plain EOA can't interact() them; channeling already excludes them.
export interface UpkeepResult {
  summary: { pet: number; channel: number; claim: number };
  calls: Call[];
}
export async function upkeepFor(owner: string, deps: PreviewDeps, now: number): Promise<UpkeepResult> {
  const snap = await deps.snapshotFor(owner);
  const plan = computeWork({ pet: true, channel: true, claim: true }, snap, now);
  const lent = new Set(snap.gotchis.filter((g) => g.lentOut).map((g) => g.id));
  const filtered: WorkPlan = { ...plan, pet: plan.pet.filter((id) => !lent.has(id)) };
  const claimerGotchiId = snap.gotchis.find((g) => !g.lentOut)?.id;
  const calls = workPlanToCalls(filtered, { claimerGotchiId });
  return {
    summary: { pet: filtered.pet.length, channel: filtered.channel.length, claim: filtered.claim.length },
    calls,
  };
}
