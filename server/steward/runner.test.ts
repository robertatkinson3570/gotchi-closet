// server/steward/runner.test.ts
import { describe, it, expect, vi } from "vitest";
import { runEnrollment, type RunnerDeps } from "./runner";
import type { Enrollment } from "./db";

const NOW = 1_000_000_000;
const base: Enrollment = {
  id: 1, owner: "0x1", gotchiId: 7, chores: { pet: true, channel: false, claim: true },
  intervalSec: 28800, smartAccount: "0xsa", sessionKey: "0xsk", status: "active",
  createdAt: 0, lastRunAt: NOW - 28800 - 1, // due
};

function deps(over: Partial<RunnerDeps> = {}): RunnerDeps {
  return {
    snapshotFor: vi.fn(async () => ({
      gotchis: [{ id: 7, lastInteracted: 0, lastChanneled: 0 }],
      parcels: [{ id: 10, altarLevel: 0, lastChanneled: 0, lastClaimed: 0, claimable: [10n ** 18n, 0n, 0n, 0n] }],
    })),
    submit: vi.fn(async () => "0xhash"),
    log: vi.fn(),
    recordRun: vi.fn(),
    ...over,
  };
}

describe("runEnrollment", () => {
  it("skips when not yet due (now - lastRunAt < interval)", async () => {
    const d = deps();
    const r = await runEnrollment({ ...base, lastRunAt: NOW - 100 }, d, NOW);
    expect(r).toEqual({ ran: false, reason: "not-due" });
    expect(d.submit).not.toHaveBeenCalled();
  });

  it("force (manual run-now) bypasses the not-due gate but still does the work", async () => {
    const d = deps();
    const r = await runEnrollment({ ...base, lastRunAt: NOW - 100 }, d, NOW, { force: true });
    expect(r.ran).toBe(true);
    expect(d.submit).toHaveBeenCalledTimes(1);
  });

  it("skips and records the run when there is no work to do", async () => {
    const d = deps({
      snapshotFor: vi.fn(async () => ({
        gotchis: [{ id: 7, lastInteracted: NOW, lastChanneled: NOW }],
        parcels: [{ id: 10, altarLevel: 0, lastChanneled: 0, lastClaimed: NOW, claimable: [0n, 0n, 0n, 0n] }],
      })),
    });
    const r = await runEnrollment(base, d, NOW);
    expect(r).toEqual({ ran: false, reason: "no-work" });
    expect(d.submit).not.toHaveBeenCalled();
    expect(d.recordRun).toHaveBeenCalledWith(1, NOW);
  });

  it("submits one batched userOp, logs it, and records the run when work exists", async () => {
    const d = deps();
    const r = await runEnrollment(base, d, NOW);
    expect(r.ran).toBe(true);
    expect(d.submit).toHaveBeenCalledTimes(1);
    const calls = (d.submit as any).mock.calls[0][1];
    expect(Array.isArray(calls)).toBe(true);
    expect(calls.length).toBeGreaterThan(0);
    expect(d.log).toHaveBeenCalled();
    expect(d.recordRun).toHaveBeenCalledWith(1, NOW);
  });

  it("skips paused/revoked enrollments", async () => {
    const d = deps();
    expect((await runEnrollment({ ...base, status: "paused" }, d, NOW)).ran).toBe(false);
    expect(d.submit).not.toHaveBeenCalled();
  });

  it("never submits when simulation drops every call", async () => {
    const d = deps({ simulate: vi.fn(async () => []) });
    const r = await runEnrollment(base, d, NOW);
    expect(r).toEqual({ ran: false, reason: "no-work" });
    expect(d.submit).not.toHaveBeenCalled();
    expect(d.recordRun).toHaveBeenCalledWith(1, NOW);
  });

  it("submits only the calls that pass simulation", async () => {
    const sim = vi.fn(async (_e: any, calls: any[]) => calls.slice(0, 1));
    const d = deps({ simulate: sim });
    const r = await runEnrollment(base, d, NOW);
    expect(r.ran).toBe(true);
    expect(sim).toHaveBeenCalled();
    expect((d.submit as any).mock.calls[0][1]).toHaveLength(1);
  });
});
