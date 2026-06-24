// server/steward/service.test.ts
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { previewOwner } from "./service";
import { getStewardDb, closeStewardDb, enroll, setStatus } from "./db";

const NOW = 1_000_000_000;
beforeEach(() => { process.env.STEWARD_DB_PATH = ":memory:"; getStewardDb(); });
afterEach(() => { closeStewardDb(); });

describe("previewOwner", () => {
  it("returns a work plan per active enrollment without submitting anything", async () => {
    enroll({ owner: "0x1", gotchiId: 7, chores: { pet: true, channel: false, claim: false }, intervalSec: 28800 });
    const snapshotFor = vi.fn(async () => ({ gotchis: [{ id: 7, lastInteracted: 0, lastChanneled: 0 }], parcels: [] }));
    const out = await previewOwner("0x1", { snapshotFor }, NOW);
    expect(out).toHaveLength(1);
    expect(out[0].gotchiId).toBe(7);
    expect(out[0].plan.pet).toEqual([7]); // pet due
    expect(snapshotFor).toHaveBeenCalledWith("0x1");
  });

  it("skips paused enrollments", async () => {
    const e = enroll({ owner: "0x1", gotchiId: 7, chores: { pet: true, channel: false, claim: false }, intervalSec: 28800 });
    setStatus(e.id, "paused");
    const out = await previewOwner("0x1", { snapshotFor: vi.fn(async () => ({ gotchis: [], parcels: [] })) }, NOW);
    expect(out).toEqual([]);
  });
});
