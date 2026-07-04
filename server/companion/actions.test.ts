import { describe, it, expect } from "vitest";
import { runUpkeep } from "./actions";

describe("runUpkeep", () => {
  it("no active enrollment → not-enrolled, does not burn", async () => {
    const deps = {
      listEnrollments: () => [],
      runOne: async () => ({ ran: true, txHash: "0x" }),
      hasCredits: () => true, burnCredit: () => true, logAction: () => {},
    };
    const r = await runUpkeep("0xabc", "7", deps as any);
    expect(r.ok).toBe(false);
    expect(r.reason).toBe("not-enrolled");
  });

  it("enrolled + credits → runs, burns, logs", async () => {
    let burned = false, logged = false;
    const e = { id: 1, owner: "0xabc", gotchiId: 7, status: "active" };
    const deps = {
      listEnrollments: () => [e],
      runOne: async () => ({ ran: true, txHash: "0xtx" }),
      hasCredits: () => true,
      burnCredit: () => { burned = true; return true; },
      logAction: () => { logged = true; },
    };
    const r = await runUpkeep("0xabc", "7", deps as any);
    expect(r.ok).toBe(true);
    expect(r.txHash).toBe("0xtx");
    expect(burned).toBe(true);
    expect(logged).toBe(true);
  });

  it("no credits → no-credits, does not run", async () => {
    let ran = false;
    const e = { id: 1, owner: "0xabc", gotchiId: 7, status: "active" };
    const deps = {
      listEnrollments: () => [e],
      runOne: async () => { ran = true; return { ran: true }; },
      hasCredits: () => false, burnCredit: () => true, logAction: () => {},
    };
    const r = await runUpkeep("0xabc", "7", deps as any);
    expect(r.ok).toBe(false);
    expect(r.reason).toBe("no-credits");
    expect(ran).toBe(false);
  });
});
