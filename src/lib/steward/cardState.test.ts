// src/lib/steward/cardState.test.ts
import { describe, it, expect } from "vitest";
import { deriveCardState, freeChores } from "./cardState";

const active = (gotchiId: number, chores: any) => ({ gotchiId, status: "active", chores });

describe("deriveCardState", () => {
  it("is on-duty when the gotchi has an active enrollment", () => {
    expect(deriveCardState({ id: 7, hasSoul: true }, [active(7, { pet: true, channel: false, claim: false })])).toBe("on-duty");
  });
  it("is soul-idle when it has a soul but no active enrollment", () => {
    expect(deriveCardState({ id: 7, hasSoul: true }, [])).toBe("soul-idle");
  });
  it("is no-soul when it lacks a soul cert", () => {
    expect(deriveCardState({ id: 7, hasSoul: false }, [])).toBe("no-soul");
  });
  it("ignores revoked enrollments", () => {
    expect(deriveCardState({ id: 7, hasSoul: true }, [{ gotchiId: 7, status: "revoked", chores: { pet: false, channel: false, claim: false } }])).toBe("soul-idle");
  });
});

describe("freeChores", () => {
  it("marks every chore free when there are no active enrollments", () => {
    expect(freeChores([])).toEqual({ pet: true, channel: true, claim: true });
  });
  it("marks a chore taken when an active enrollment holds it", () => {
    expect(freeChores([active(1, { pet: true, channel: false, claim: false })])).toEqual({ pet: false, channel: true, claim: true });
  });
  it("aggregates across multiple active stewards", () => {
    expect(freeChores([
      active(1, { pet: true, channel: false, claim: false }),
      active(2, { pet: false, channel: true, claim: false }),
    ])).toEqual({ pet: false, channel: false, claim: true });
  });
});
