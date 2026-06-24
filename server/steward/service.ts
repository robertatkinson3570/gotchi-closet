// server/steward/service.ts
// Read-only preview of what each active steward WOULD do right now (no submission).
// Reuses the Plan-1 due-work engine; snapshot reads are injected so it's unit-tested.
import { listEnrollments } from "./db";
import { computeWork, type ChainSnapshot, type WorkPlan } from "./dueWork";

export interface PreviewDeps { snapshotFor: (owner: string) => Promise<ChainSnapshot>; }
export interface EnrollmentPreview { id: number; gotchiId: number; chores: any; plan: WorkPlan; }

export async function previewOwner(owner: string, deps: PreviewDeps, now: number): Promise<EnrollmentPreview[]> {
  const active = listEnrollments(owner).filter((e) => e.status === "active");
  if (!active.length) return [];
  const snap = await deps.snapshotFor(owner);
  return active.map((e) => ({ id: e.id, gotchiId: e.gotchiId, chores: e.chores, plan: computeWork(e.chores, snap, now) }));
}
