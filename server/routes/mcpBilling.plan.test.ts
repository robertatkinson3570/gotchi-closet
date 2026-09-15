import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { tmpdir } from "node:os";
import { join } from "node:path";
import express from "express";
import type { Server } from "node:http";

// Isolate to a throwaway DB so this test never touches dev data.
process.env.COMPANION_DB_PATH = join(tmpdir(), `wisp-plan-route-test-${process.pid}.db`);

import billingRoutes from "./mcpBilling";
import { activatePlan, createAccount, getPlanAccountByWallet, lastPaymentMonths } from "../mcp/accounts";
import { closeDb, getDb } from "../companion/db";

let server: Server;
let base: string;

beforeAll(async () => {
  const app = express();
  app.use(express.json());
  app.use("/api/mcp", billingRoutes);
  await new Promise<void>((resolve) => {
    server = app.listen(0, () => {
      const addr = server.address();
      base = `http://127.0.0.1:${typeof addr === "object" && addr ? addr.port : 0}`;
      resolve();
    });
  });
});

afterAll(() => {
  server?.close();
  closeDb();
});

const DAY = 86_400_000;
const wallet = (n: number) => `0x${n.toString(16).padStart(40, "0")}`;
const plan = async (w: string) => (await fetch(`${base}/api/mcp/plan/${w}`)).json();
const setExpiry = (apiKey: string, ms: number) => getDb().prepare(`UPDATE wisp_accounts SET expires_at = ? WHERE api_key = ?`).run(ms, apiKey);

/** GET /api/mcp/plan/:wallet for GVR's renewal reminder (GVR docs/briefs/wisp-renewals.md §2). */
describe("GET /api/mcp/plan/:wallet", () => {
  it("never paid: free, expiry 0, nothing ended, no period (no notice in GVR)", async () => {
    expect(await plan(wallet(1))).toEqual({ wallet: wallet(1), plan: "free", expiresAt: 0, storedPlan: "free", endedAt: 0, periodMonths: 0 });
    createAccount(wallet(2)); // a free key only
    expect(await plan(wallet(2))).toEqual({ wallet: wallet(2), plan: "free", expiresAt: 0, storedPlan: "free", endedAt: 0, periodMonths: 0 });
  });

  it("active: the plan, its expiry and the months of the payment that bought it", async () => {
    const a = createAccount(wallet(3));
    const acct = activatePlan({ apiKey: a.apiKey, plan: "holder", months: 1, asset: "ghst", amountWei: 1n, txHash: "0xplan-active" });
    expect(await plan(wallet(3))).toEqual({ wallet: wallet(3), plan: "holder", expiresAt: acct.expiresAt, storedPlan: "holder", endedAt: 0, periodMonths: 1 });
  });

  it("lapsed: plan and expiresAt keep their meaning (free, 0); endedAt names the past expiry", async () => {
    const a = createAccount(wallet(4));
    activatePlan({ apiKey: a.apiKey, plan: "holder", months: 12, asset: "ghst", amountWei: 1n, txHash: "0xplan-lapsed" });
    const ended = Date.now() - 2 * DAY;
    setExpiry(a.apiKey, ended);
    expect(await plan(wallet(4))).toEqual({ wallet: wallet(4), plan: "free", expiresAt: 0, storedPlan: "holder", endedAt: ended, periodMonths: 12 });
  });

  it("a newer FREE key for the wallet (a cancelled Pay, or anyone's POST /account) no longer hides the paid plan", async () => {
    const w = wallet(5);
    const paid = createAccount(w);
    const acct = activatePlan({ apiKey: paid.apiKey, plan: "holder", months: 1, asset: "ghst", amountWei: 1n, txHash: "0xplan-shadow" });
    const r = await fetch(`${base}/api/mcp/account`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ wallet: w }) });
    expect(r.status).toBe(200);
    const read = await plan(w);
    expect(read.plan).toBe("holder");
    expect(read.expiresAt).toBe(acct.expiresAt);
  });

  it("two paid accounts: the one with the latest expiry carries the plan, with its own period", () => {
    const w = wallet(6);
    const monthly = createAccount(w);
    activatePlan({ apiKey: monthly.apiKey, plan: "holder", months: 1, asset: "ghst", amountWei: 1n, txHash: "0xplan-two-a" });
    const yearly = createAccount(w);
    activatePlan({ apiKey: yearly.apiKey, plan: "holder", months: 12, asset: "ghst", amountWei: 1n, txHash: "0xplan-two-b" });
    setExpiry(monthly.apiKey, Date.now() + DAY);
    expect(getPlanAccountByWallet(w)!.apiKey).toBe(yearly.apiKey);
    expect(lastPaymentMonths(yearly.apiKey)).toBe(12);
    expect(lastPaymentMonths(monthly.apiKey)).toBe(1);
    expect(lastPaymentMonths("wsp_none")).toBe(0);
  });

  it("still refuses a malformed wallet", async () => {
    expect((await fetch(`${base}/api/mcp/plan/nope`)).status).toBe(400);
  });
});
