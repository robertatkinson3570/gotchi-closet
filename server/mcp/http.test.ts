import { describe, it, expect, afterAll } from "vitest";
import { tmpdir } from "node:os";
import { join } from "node:path";

// Isolate to a throwaway DB so this test never touches dev data.
process.env.COMPANION_DB_PATH = join(tmpdir(), `wisp-http-test-${process.pid}.db`);

import { wispMcpHttpHandler } from "./http";
import { createAccount, consumeRequest } from "./accounts";
import { PLAN_LIMITS } from "../../src/lib/wisp/pricing";
import { closeDb } from "../companion/db";

afterAll(() => closeDb());

// Minimal Express req/res doubles. The gate (401/missing, 401/invalid, 429/over)
// returns before any MCP transport is constructed, so these stubs are enough.
function makeRes(): any {
  return {
    statusCode: 0,
    body: undefined as any,
    headersSent: false,
    headers: {} as Record<string, unknown>,
    // Express surface — used by the gate's early-return error responses.
    status(c: number) { this.statusCode = c; return this; },
    json(o: any) { this.body = o; this.headersSent = true; return this; },
    on() { return this; },
    // Node ServerResponse surface — only touched if a request gets past the gate
    // into the MCP transport (e.g. the handshake test). No-ops keep it quiet.
    setHeader(k: string, v: unknown) { this.headers[k] = v; },
    getHeader(k: string) { return this.headers[k]; },
    removeHeader(k: string) { delete this.headers[k]; },
    writeHead(c: number) { this.statusCode = c; this.headersSent = true; return this; },
    write() { return true; },
    end() { this.headersSent = true; return this; },
    flushHeaders() {},
  };
}
function makeReq(over: Record<string, unknown>): any {
  return { method: "POST", headers: {}, query: {}, body: {}, ...over };
}

describe("wisp HTTP MCP gate (limits enforced at the endpoint)", () => {
  it("rejects a request with no API key (401)", async () => {
    const res = makeRes();
    await wispMcpHttpHandler(makeReq({ body: { method: "tools/call" } }), res);
    expect(res.statusCode).toBe(401);
    expect(res.body.error.message).toMatch(/Missing Wisp API key/);
  });

  it("rejects an invalid API key (401)", async () => {
    const res = makeRes();
    await wispMcpHttpHandler(
      makeReq({ headers: { authorization: "Bearer wsp_not_a_real_key" }, body: { method: "tools/call" } }),
      res
    );
    expect(res.statusCode).toBe(401);
    expect(res.body.error.message).toMatch(/Invalid Wisp API key/);
  });

  it("returns 429 once a valid key exceeds its plan's daily limit", async () => {
    const a = createAccount();
    // Burn the whole free daily allowance so the handler's call tips it over.
    for (let i = 0; i < PLAN_LIMITS.free.requestsPerDay; i++) consumeRequest(a.apiKey);
    const res = makeRes();
    await wispMcpHttpHandler(
      makeReq({ headers: { authorization: `Bearer ${a.apiKey}` }, body: { method: "tools/call" } }),
      res
    );
    expect(res.statusCode).toBe(429);
    expect(res.body.error.code).toBe(-32002);
    expect(res.body.error.data.plan).toBe("free");
    expect(res.body.error.data.limitPerDay).toBe(PLAN_LIMITS.free.requestsPerDay);
  });

  it("does not meter non-tool methods (handshake) against the limit", async () => {
    const a = createAccount();
    // Exhaust the daily allowance, then send a non-call method. The gate must NOT
    // 429 it (handshake/list are free), so it proceeds past the gate.
    for (let i = 0; i < PLAN_LIMITS.free.requestsPerDay + 5; i++) consumeRequest(a.apiKey);
    const res = makeRes();
    await wispMcpHttpHandler(
      makeReq({ headers: { authorization: `Bearer ${a.apiKey}` }, body: { method: "initialize" } }),
      res
    );
    expect(res.statusCode).not.toBe(429);
  });
});
