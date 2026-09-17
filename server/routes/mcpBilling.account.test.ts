import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { tmpdir } from "node:os";
import { join } from "node:path";
import express from "express";
import type { Server } from "node:http";

process.env.COMPANION_DB_PATH = join(tmpdir(), `mcp-account-test-${process.pid}.db`);

import mcpBillingRoutes from "./mcpBilling";
import { closeDb } from "../companion/db";
import { activatePlan, createAccount } from "../mcp/accounts";

let server: Server;
let base: string;
async function call(method: string, path: string, body?: unknown, headers: Record<string, string> = {}) {
  const res = await fetch(`${base}${path}`, { method, headers: { "Content-Type": "application/json", ...headers }, ...(body !== undefined ? { body: JSON.stringify(body) } : {}) });
  return { status: res.status, json: await res.json() };
}

beforeAll(async () => {
  const app = express();
  app.use(express.json());
  app.use("/api/mcp", mcpBillingRoutes);
  await new Promise<void>((resolve) => {
    server = app.listen(0, () => {
      const addr = server.address();
      base = `http://127.0.0.1:${typeof addr === "object" && addr ? addr.port : 0}`;
      resolve();
    });
  });
});
afterAll(() => { server?.close(); closeDb(); });

/** KEEPER GOTCHI (08-wisp-chat.md §8.2): the plan grant on the account summary, and the context PATCH. */
describe("GET/PATCH /api/mcp/account", () => {
  it("the summary carries chat (the grant) and the day's chat use; free says chat false, a paid plan says true", async () => {
    const free = createAccount();
    const f = await call("GET", "/api/mcp/account", undefined, { Authorization: `Bearer ${free.apiKey}` });
    expect(f.status).toBe(200);
    expect(f.json).toMatchObject({ plan: "free", chat: false, chatPerDay: 0, chatUsedToday: 0, context: null });
    expect(f.json).not.toHaveProperty("apiKey");
    const paid = createAccount();
    activatePlan({ apiKey: paid.apiKey, plan: "pro", months: 1, asset: "eth", amountWei: 1n, txHash: "0xa1" });
    const p = await call("GET", `/api/mcp/account/${paid.apiKey}`);
    expect(p.json).toMatchObject({ plan: "pro", chat: true, chatPerDay: 2000, chatPerMinute: 12 });
    expect((await call("GET", "/api/mcp/account")).status).toBe(401);
    expect((await call("GET", "/api/mcp/account", undefined, { Authorization: "Bearer wsp_nope" })).status).toBe(401);
  });

  it("PATCH sets the context by key and 400s a bad one naming the field", async () => {
    const a = createAccount();
    const ok = await call("PATCH", "/api/mcp/account", { context: { appName: "Gotchi Garden", kbLines: ["Seeds cost 5 GHST"], navMap: { Greenhouse: "/greenhouse" } } }, { Authorization: `Bearer ${a.apiKey}` });
    expect(ok.status).toBe(200);
    expect(ok.json.context).toEqual({ appName: "Gotchi Garden", kbLines: ["Seeds cost 5 GHST"], navMap: { greenhouse: "/greenhouse" } });
    const bad = await call("PATCH", "/api/mcp/account", { context: { appUrl: "https://x" } }, { Authorization: `Bearer ${a.apiKey}` });
    expect(bad.status).toBe(400);
    expect(bad.json.error).toMatch(/appName/);
    expect((await call("PATCH", "/api/mcp/account", { context: { appName: "x" } })).status).toBe(401);
    expect((await call("PATCH", "/api/mcp/account", {}, { Authorization: `Bearer ${a.apiKey}` })).status).toBe(400);
  });
});
