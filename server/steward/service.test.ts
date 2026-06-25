// server/steward/service.test.ts
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { previewOwner, upkeepFor } from "./service";
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

describe("upkeepFor (Path 2, no enrollment needed)", () => {
  it("computes whole-wallet due work + encodes calls; excludes lent gotchis from pet", async () => {
    const snapshotFor = vi.fn(async () => ({
      gotchis: [
        { id: 7, lastInteracted: 0, lastChanneled: 0 },
        { id: 8, lastInteracted: 0, lastChanneled: 0, lentOut: true }, // escrowed: owner can't pet
      ],
      parcels: [],
    }));
    const out = await upkeepFor("0x1", { snapshotFor }, NOW);
    expect(out.summary.pet).toBe(1); // only gotchi 7, not the lent-out 8
    expect(out.calls.length).toBe(1); // one interact() call
    expect(out.calls[0].to).toMatch(/^0x/);
  });

  it("returns nothing to do when no work is due", async () => {
    const snapshotFor = vi.fn(async () => ({
      gotchis: [{ id: 7, lastInteracted: NOW, lastChanneled: NOW }],
      parcels: [],
    }));
    const out = await upkeepFor("0x1", { snapshotFor }, NOW);
    expect(out.summary).toEqual({ pet: 0, channel: 0, claim: 0 });
    expect(out.calls).toEqual([]);
  });
});
