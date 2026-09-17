import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { tmpdir } from "node:os";
import { join } from "node:path";
import express from "express";
import type { Server } from "node:http";

process.env.COMPANION_DB_PATH = join(tmpdir(), `wallet-proof-routes-test-${process.pid}.db`);

const llm = vi.hoisted(() => ({ complete: vi.fn(async () => "never"), completeWithTools: vi.fn(async () => ({ text: "never", toolCall: null })) }));
vi.mock("../companion/llmProvider", () => ({ complete: llm.complete, completeWithTools: llm.completeWithTools }));
vi.mock("../companion/gotchiState", () => ({
  fetchGotchiState: vi.fn(async (id: string) => ({ name: `Gotchi #${id}`, numericTraits: [50, 80, 20, 60, 0, 0], kinship: 500, level: 5, createdAt: 1_600_000_000, equippedWearables: [], owner: "0x0000000000000000000000000000000000000abc" })),
}));

import { privateKeyToAccount } from "viem/accounts";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import companionRoutes from "./companion";
import mcpBillingRoutes from "./mcpBilling";
import { createAccount, rotateKey } from "../mcp/accounts";
import { createWispMcpServer } from "../mcp/server";
import { hasGrant } from "../mcp/grants";
import { appendMessage, upsertFact, closeDb } from "../companion/db";

const holder = privateKeyToAccount("0x7c852118294e51e653712a81e05800f419141751be58f605c371e15141b007a6");
const W = holder.address.toLowerCase();

let server: Server;
let base: string;

async function call(method: string, path: string, body?: unknown, headers: Record<string, string> = {}) {
  const res = await fetch(`${base}${path}`, {
    method,
    headers: { ...(body === undefined ? {} : { "Content-Type": "application/json" }), ...headers },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: res.status, json: await res.json() };
}

beforeAll(async () => {
  const app = express();
  app.use(express.json());
  app.use("/api/companion", companionRoutes);
  app.use("/api/mcp", mcpBillingRoutes);
  await new Promise<void>((resolve) => {
    server = app.listen(0, () => {
      const addr = server.address();
      base = `http://127.0.0.1:${typeof addr === "object" && addr ? addr.port : 0}`;
      resolve();
    });
  });
  appendMessage(W, "3560", "user", "the private turn");
  upsertFact(W, "3560", "my name is Private");
});
afterAll(() => { server?.close(); closeDb(); });

describe("a Gotchi Closet session, end to end", () => {
  it("prepare, sign in the wallet, get a token, read the history with it", async () => {
    const prep = await call("POST", "/api/companion/session/prepare", { wallet: W, domain: "gotchicloset.com", uri: "https://gotchicloset.com/companion" });
    expect(prep.status).toBe(200);
    const signature = await holder.signMessage({ message: prep.json.message });
    const s = await call("POST", "/api/companion/session", { message: prep.json.message, signature });
    expect(s.status).toBe(200);
    expect(s.json.wallet).toBe(W);
    const history = await call("GET", `/api/companion/history/3560/${W}`, undefined, { "x-wisp-session": s.json.token });
    expect(history.status).toBe(200);
    expect(history.json.messages.map((m: { content: string }) => m.content)).toEqual(["the private turn"]);
    const replay = await call("POST", "/api/companion/session", { message: prep.json.message, signature });
    expect(replay.status).toBe(401);
  });

  it("a site that is not Gotchi Closet cannot ask for a session", async () => {
    const prep = await call("POST", "/api/companion/session/prepare", { wallet: W, domain: "evil.example", uri: "https://evil.example" });
    expect(prep.status).toBe(400);
  });
});

describe("a Wisp grant, end to end", () => {
  it("the app prepares, the holder signs, the key can read; the holder sees and revokes it with their session", async () => {
    const acct = createAccount();
    const auth = { Authorization: `Bearer ${acct.apiKey}` };
    expect((await call("GET", `/api/companion/history/3560/${W}`, undefined, auth)).status).toBe(403);

    const prep = await call("POST", "/api/mcp/grants/prepare", { wallet: W, domain: "haunthollow.example", uri: "https://haunthollow.example/play", days: 30 }, auth);
    expect(prep.status).toBe(200);
    expect(prep.json.message).toContain("haunthollow.example wants you to sign in");
    expect(prep.json.message).toContain(`urn:wisp:key:${acct.apiKey.slice(0, 12)}`);
    const signature = await holder.signMessage({ message: prep.json.message });
    const g = await call("POST", "/api/mcp/grants", { message: prep.json.message, signature }, auth);
    expect(g.status).toBe(200);
    expect(g.json).toMatchObject({ wallet: W, domain: "haunthollow.example" });
    expect(g.json.expiresAt - g.json.grantedAt).toBe(30 * 86_400_000);
    expect((await call("GET", "/api/mcp/grants", undefined, auth)).json.grants.map((x: { wallet: string }) => x.wallet)).toEqual([W]);

    // another key cannot use this holder's grant message
    const other = createAccount();
    const stolen = await call("POST", "/api/mcp/grants", { message: prep.json.message, signature }, { Authorization: `Bearer ${other.apiKey}` });
    expect(stolen.status).toBe(401);

    // rotation keeps the grant with the account
    const rotated = rotateKey(acct.apiKey);
    expect(hasGrant(rotated.apiKey, W)).toBe(true);
    expect(hasGrant(acct.apiKey, W)).toBe(false);

    // the holder lists and revokes from their own session
    const sp = await call("POST", "/api/companion/session/prepare", { wallet: W, domain: "gotchicloset.com", uri: "https://gotchicloset.com" });
    const token = (await call("POST", "/api/companion/session", { message: sp.json.message, signature: await holder.signMessage({ message: sp.json.message }) })).json.token;
    const mine = await call("GET", "/api/companion/grants", undefined, { "x-wisp-session": token });
    expect(mine.json.grants.map((x: { app: string; domain: string }) => [x.app, x.domain])).toEqual([[rotated.apiKey.slice(0, 12), "haunthollow.example"]]);
    const gone = await call("DELETE", `/api/companion/grants/${rotated.apiKey.slice(0, 12)}`, undefined, { "x-wisp-session": token });
    expect(gone.json).toEqual({ ok: true, revoked: 1 });
    expect(hasGrant(rotated.apiKey, W)).toBe(false);
    expect((await call("GET", "/api/companion/grants", undefined, {})).status).toBe(401);
  });

  it("the grant routes need a Wisp key", async () => {
    expect((await call("POST", "/api/mcp/grants/prepare", { wallet: W, domain: "a.example", uri: "https://a.example" })).status).toBe(401);
    expect((await call("GET", "/api/mcp/grants")).status).toBe(401);
  });
});

describe("the MCP tools over a Wisp key", () => {
  async function connect(apiKey?: string) {
    const [clientSide, serverSide] = InMemoryTransport.createLinkedPair();
    await createWispMcpServer(apiKey === undefined ? {} : { apiKey }).connect(serverSide);
    const client = new Client({ name: "test", version: "0" });
    await client.connect(clientSide);
    return client;
  }
  const text = (r: unknown) => ((r as { content: { text: string }[] }).content[0]!.text);

  it("get_history and the steward reads refuse a wallet that granted nothing; steward_run_now is not offered", async () => {
    const key = createAccount().apiKey;
    const c = await connect(key);
    const names = (await c.listTools()).tools.map((t) => t.name);
    expect(names).toContain("get_history");
    expect(names).not.toContain("steward_run_now");
    const h = await c.callTool({ name: "get_history", arguments: { tokenId: "3560", wallet: W } });
    expect(h.isError).toBe(true);
    expect(text(h)).toMatch(/has not granted/);
    const st = await c.callTool({ name: "steward_status", arguments: { owner: W } });
    expect(st.isError).toBe(true);
    const ctx = await c.callTool({ name: "build_chat_context", arguments: { tokenId: "3560", message: "hi", wallet: W } });
    expect(ctx.isError).toBe(true);
  });

  it("with a grant, get_history reads; build_chat_context carries the history but never the private facts", async () => {
    const { saveGrant } = await import("../mcp/grants");
    const key = createAccount().apiKey;
    saveGrant(key, { wallet: W, domain: "a.example", grantedAt: Date.now(), expiresAt: Date.now() + 86_400_000 });
    const c = await connect(key);
    const h = await c.callTool({ name: "get_history", arguments: { tokenId: "3560", wallet: W } });
    expect(h.isError).toBeFalsy();
    expect(text(h)).toContain("the private turn");
    const ctx = await c.callTool({ name: "build_chat_context", arguments: { tokenId: "3560", message: "hi", wallet: W } });
    expect(ctx.isError).toBeFalsy();
    expect(text(ctx)).toContain("the private turn");
    expect(text(ctx)).not.toContain("my name is Private");
  });

  it("the local stdio server (no key) is unchanged: steward_run_now is offered", async () => {
    const c = await connect();
    expect((await c.listTools()).tools.map((t) => t.name)).toContain("steward_run_now");
  });
});
