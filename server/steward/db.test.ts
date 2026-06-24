// server/steward/db.test.ts
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  getStewardDb, closeStewardDb, enroll, listEnrollments, getEnrollment,
  setStatus, editChores, claimedChores, ChoreConflictError,
} from "./db";

const ALL = { pet: true, channel: true, claim: true };

beforeEach(() => { process.env.STEWARD_DB_PATH = ":memory:"; getStewardDb(); });
afterEach(() => { closeStewardDb(); });

describe("steward db chore-exclusivity", () => {
  it("enrolls a steward as active and stores its chores", () => {
    const e = enroll({ owner: "0xAbC", gotchiId: 42, chores: { pet: true, channel: false, claim: false }, intervalSec: 28800 });
    expect(e.status).toBe("active");
    expect(e.owner).toBe("0xabc"); // lowercased
    expect(e.chores).toEqual({ pet: true, channel: false, claim: false });
    expect(listEnrollments("0xABC")).toHaveLength(1);
  });

  it("clamps interval to the 8h floor", () => {
    const e = enroll({ owner: "0x1", gotchiId: 1, chores: { pet: true, channel: false, claim: false }, intervalSec: 60 });
    expect(e.intervalSec).toBe(8 * 60 * 60);
  });

  it("lets two stewards split non-overlapping chores", () => {
    enroll({ owner: "0x1", gotchiId: 1, chores: { pet: true, channel: false, claim: false }, intervalSec: 28800 });
    const zeke = enroll({ owner: "0x1", gotchiId: 2, chores: { pet: false, channel: true, claim: true }, intervalSec: 28800 });
    expect(zeke.status).toBe("active");
    expect([...claimedChores("0x1")].sort()).toEqual(["channel", "claim", "pet"]);
  });

  it("rejects a second steward that re-claims an owned chore", () => {
    enroll({ owner: "0x1", gotchiId: 1, chores: { pet: true, channel: false, claim: false }, intervalSec: 28800 });
    expect(() =>
      enroll({ owner: "0x1", gotchiId: 2, chores: { pet: true, channel: true, claim: false }, intervalSec: 28800 })
    ).toThrowError(ChoreConflictError);
  });

  it("blocks any new steward once one holds all three chores", () => {
    enroll({ owner: "0x1", gotchiId: 1, chores: ALL, intervalSec: 28800 });
    expect(() =>
      enroll({ owner: "0x1", gotchiId: 2, chores: { pet: false, channel: false, claim: true }, intervalSec: 28800 })
    ).toThrowError(ChoreConflictError);
  });

  it("frees chores when a steward is revoked", () => {
    const a = enroll({ owner: "0x1", gotchiId: 1, chores: ALL, intervalSec: 28800 });
    setStatus(a.id, "revoked");
    expect(claimedChores("0x1").size).toBe(0);
    const b = enroll({ owner: "0x1", gotchiId: 2, chores: ALL, intervalSec: 28800 });
    expect(b.status).toBe("active");
  });

  it("editChores re-checks exclusivity but ignores the steward's own current chores", () => {
    const a = enroll({ owner: "0x1", gotchiId: 1, chores: { pet: true, channel: false, claim: false }, intervalSec: 28800 });
    enroll({ owner: "0x1", gotchiId: 2, chores: { pet: false, channel: true, claim: false }, intervalSec: 28800 });
    // a may add claim (free) but not channel (taken by gotchi 2)
    expect(editChores(a.id, { pet: true, channel: false, claim: true }).chores.claim).toBe(true);
    expect(() => editChores(a.id, { pet: true, channel: true, claim: true })).toThrowError(ChoreConflictError);
  });

  it("getEnrollment round-trips", () => {
    const e = enroll({ owner: "0x9", gotchiId: 7, chores: { pet: true, channel: false, claim: false }, intervalSec: 43200 });
    expect(getEnrollment(e.id)?.gotchiId).toBe(7);
    expect(getEnrollment(999_999)).toBeNull();
  });
});
