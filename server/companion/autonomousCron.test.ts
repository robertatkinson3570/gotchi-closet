import { expect, test } from "vitest";
import { runAutonomousPass } from "./autonomousCron";

test("acts only for enrolled wallets with an active goal", async () => {
  const acted: string[] = [];
  const deps = {
    getActiveGoals: () => [{ wallet: "0xaaa", tokenId: "1", goal: "keep_emptied" }, { wallet: "0xbbb", tokenId: "2", goal: "keep_emptied" }],
    isEnrolled: (w: string) => w === "0xaaa",
    runUpkeep: async (w: string) => { acted.push(w); return { ok: true, txHash: "0xtx" }; },
    log: () => {},
  };
  const s = await runAutonomousPass(deps as any);
  expect(acted).toEqual(["0xaaa"]); expect(s.acted).toBe(1);
});

test("no-op with zero enrollments (dormant until Steward AA live)", async () => {
  const s = await runAutonomousPass({ getActiveGoals: () => [{ wallet: "0xaaa", tokenId: "1", goal: "keep_emptied" }],
    isEnrolled: () => false, runUpkeep: async () => ({ ok: true }), log: () => {} } as any);
  expect(s.acted).toBe(0);
});
