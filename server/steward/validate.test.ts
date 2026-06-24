// server/steward/validate.test.ts
import { describe, it, expect } from "vitest";
import { parseEnrollBody } from "./validate";

describe("parseEnrollBody", () => {
  it("accepts a valid body", () => {
    const r = parseEnrollBody({
      owner: "0xAbC", gotchiId: 7, chores: { pet: true, channel: false, claim: true },
      intervalSec: 28800, smartAccount: "0xsa", sessionKey: "0xsk",
    });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.gotchiId).toBe(7);
  });

  it("rejects when no chores are enabled", () => {
    const r = parseEnrollBody({ owner: "0x1", gotchiId: 1, chores: { pet: false, channel: false, claim: false }, intervalSec: 28800 });
    expect(r.ok).toBe(false);
  });

  it("rejects a missing owner / non-numeric gotchiId", () => {
    expect(parseEnrollBody({ gotchiId: 1, chores: { pet: true, channel: false, claim: false }, intervalSec: 28800 }).ok).toBe(false);
    expect(parseEnrollBody({ owner: "0x1", gotchiId: "x", chores: { pet: true, channel: false, claim: false }, intervalSec: 28800 }).ok).toBe(false);
  });
});
