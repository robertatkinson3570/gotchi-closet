import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { tmpdir } from "node:os";
import { join } from "node:path";
import express from "express";
import type { Server } from "node:http";

process.env.COMPANION_DB_PATH = join(tmpdir(), `companion-history-test-${process.pid}.db`);
process.env.COMPANION_WRITE_KEY = "svc-test-key-0123456789";

import companionRoutes from "./companion";
import { closeDb, appendMessage, getRecentMessages } from "../companion/db";
import { createAccount, activatePlan } from "../mcp/accounts";
import { saveGrant } from "../mcp/grants";
import { issueSessionToken } from "../companion/walletProof";

let server: Server;
let base: string;
const W = "0x3333333333333333333333333333333333333333";
const grantW = (key: string) => saveGrant(key, { wallet: W, domain: "app.example", grantedAt: Date.now(), expiresAt: Date.now() + 86_400_000 });
const signedIn = () => ({ "x-wisp-session": issueSessionToken(W, Date.now() + 86_400_000) });

async function post(path: string, body: unknown, headers: Record<string, string> = {}) {
  const res = await fetch(`${base}${path}`, { method: "POST", headers: { "Content-Type": "application/json", ...headers }, body: JSON.stringify(body) });
  return { status: res.status, json: await res.json() };
}
async function get(path: string, headers: Record<string, string> = {}) {
  const res = await fetch(`${base}${path}`, { headers });
  return { status: res.status, json: await res.json() };
}

beforeAll(async () => {
  const app = express();
  app.use(express.json());
  app.use("/api/companion", companionRoutes);
  await new Promise<void>((resolve) => {
    server = app.listen(0, () => {
      const addr = server.address();
      base = `http://127.0.0.1:${typeof addr === "object" && addr ? addr.port : 0}`;
      resolve();
    });
  });
});
afterAll(() => { server?.close(); closeDb(); });

/** KEEPER GOTCHI (08-wisp-chat.md §8.2, §8.5): the shared log's write door and its reader. */
describe("POST /history", () => {
  it("with the service key appends the turns as gvr (the closet tag is allowed, a wsp_ tag is not)", async () => {
    const r = await post("/api/companion/history", {
      wallet: W, tokenId: "9638",
      turns: [{ role: "user", content: "hello from the game", ts: 1_700_000_000_000 }, { role: "assistant", content: "boo from grimtwo" }],
    }, { Authorization: `Bearer ${process.env.COMPANION_WRITE_KEY}` });
    expect(r.status).toBe(200);
    expect(r.json).toEqual({ ok: true, written: 2, client: "gvr" });
    const rows = getRecentMessages(W, "9638", 10);
    expect(rows.map((m) => [m.role, m.content, m.client])).toEqual([["user", "hello from the game", "gvr"], ["assistant", "boo from grimtwo", "gvr"]]);
    expect(rows[0]!.ts).toBe(1_700_000_000_000);
    const bad = await post("/api/companion/history", { wallet: W, tokenId: "9638", turns: [{ role: "user", content: "x", client: "wsp_ab12cd34" }] }, { Authorization: `Bearer ${process.env.COMPANION_WRITE_KEY}` });
    expect(bad.status).toBe(400);
  });

  it("with a paid Wisp key the wallet granted appends as wsp_<first8> whatever client the body claims; no grant is 403; a free key is 403; a bad key or no key is 401", async () => {
    const a = createAccount();
    activatePlan({ apiKey: a.apiKey, plan: "studio", months: 1, asset: "usdc", amountWei: 1n, txHash: "0xh1" });
    expect((await post("/api/companion/history", { wallet: W, tokenId: "9638", turns: [{ role: "user", content: "x" }] }, { Authorization: `Bearer ${a.apiKey}` })).status).toBe(403);
    grantW(a.apiKey);
    const r = await post("/api/companion/history", { wallet: W, tokenId: "9638", turns: [{ role: "user", content: "from the app", client: "gvr" }] }, { Authorization: `Bearer ${a.apiKey}` });
    expect(r.status).toBe(200);
    expect(r.json).toEqual({ ok: true, written: 1, client: a.apiKey.slice(0, 12) });
    const free = createAccount();
    expect((await post("/api/companion/history", { wallet: W, tokenId: "9638", turns: [{ role: "user", content: "x" }] }, { Authorization: `Bearer ${free.apiKey}` })).status).toBe(403);
    expect((await post("/api/companion/history", { wallet: W, tokenId: "9638", turns: [{ role: "user", content: "x" }] }, { Authorization: "Bearer wsp_nope" })).status).toBe(401);
    expect((await post("/api/companion/history", { wallet: W, tokenId: "9638", turns: [{ role: "user", content: "x" }] }, { Authorization: "Bearer wrong-service-key" })).status).toBe(401);
    expect((await post("/api/companion/history", { wallet: W, tokenId: "9638", turns: [{ role: "user", content: "x" }] })).status).toBe(401);
    // and nothing from the refused calls landed
    expect(getRecentMessages(W, "9638", 10).filter((m) => m.content === "x")).toEqual([]);
  });

  it("refuses a malformed body (bad wallet, no turns, a bad role, 21 turns) with 400", async () => {
    const h = { Authorization: `Bearer ${process.env.COMPANION_WRITE_KEY}` };
    expect((await post("/api/companion/history", { wallet: "0x12", tokenId: "9638", turns: [{ role: "user", content: "x" }] }, h)).status).toBe(400);
    expect((await post("/api/companion/history", { wallet: W, tokenId: "9638", turns: [] }, h)).status).toBe(400);
    expect((await post("/api/companion/history", { wallet: W, tokenId: "9638", turns: [{ role: "system", content: "x" }] }, h)).status).toBe(400);
    expect((await post("/api/companion/history", { wallet: W, tokenId: "9638", turns: Array.from({ length: 21 }, () => ({ role: "user", content: "x" })) }, h)).status).toBe(400);
  });
});

describe("GET /history/:tokenId/:wallet?client=", () => {
  it("returns client per message, filters by ?client=, and all/absent returns every client", async () => {
    appendMessage(W, "77", "user", "closet turn");
    appendMessage(W, "77", "user", "gvr turn", "gvr");
    appendMessage(W, "77", "user", "app turn", "wsp_ab12cd34");
    const all = await get(`/api/companion/history/77/${W}`, signedIn());
    expect(all.json.messages).toEqual([
      { role: "user", content: "closet turn", client: "closet" }, { role: "user", content: "gvr turn", client: "gvr" }, { role: "user", content: "app turn", client: "wsp_ab12cd34" },
    ]);
    expect((await get(`/api/companion/history/77/${W}?client=all`, signedIn())).json.messages).toHaveLength(3);
    expect((await get(`/api/companion/history/77/${W}?client=gvr`, signedIn())).json.messages).toEqual([{ role: "user", content: "gvr turn", client: "gvr" }]);
    expect((await get(`/api/companion/history/77/${W}?client=wsp_ab12cd34`, signedIn())).json.messages.map((m: { content: string }) => m.content)).toEqual(["app turn"]);
    expect((await get(`/api/companion/history/77/${W}?client=evil`, signedIn())).status).toBe(400);
  });

  it("a keyed reader needs the chat plan AND the wallet's grant: granted paid key reads, ungranted 403, free key 403, bad key 401", async () => {
    const a = createAccount();
    activatePlan({ apiKey: a.apiKey, plan: "holder", months: 1, asset: "ghst", amountWei: 1n, txHash: "0xh2" });
    expect((await get(`/api/companion/history/77/${W}`, { Authorization: `Bearer ${a.apiKey}` })).status).toBe(403);
    grantW(a.apiKey);
    expect((await get(`/api/companion/history/77/${W}`, { Authorization: `Bearer ${a.apiKey}` })).status).toBe(200);
    expect((await get(`/api/companion/history/77/${W}`, { Authorization: `Bearer ${createAccount().apiKey}` })).status).toBe(403);
    expect((await get(`/api/companion/history/77/${W}`, { Authorization: "Bearer wsp_nope" })).status).toBe(401);
  });

  it("without a key, only a session for THAT wallet or the service key reads; nobody else", async () => {
    expect((await get(`/api/companion/history/77/${W}`)).status).toBe(401);
    const otherSession = { "x-wisp-session": issueSessionToken("0x9999999999999999999999999999999999999999", Date.now() + 86_400_000) };
    expect((await get(`/api/companion/history/77/${W}`, otherSession)).status).toBe(401);
    expect((await get(`/api/companion/history/77/${W}`, { "x-wisp-session": "ws1.forged" })).status).toBe(401);
    expect((await get(`/api/companion/history/77/${W}`, signedIn())).status).toBe(200);
    expect((await get(`/api/companion/history/77/${W}`, { Authorization: `Bearer ${process.env.COMPANION_WRITE_KEY}` })).status).toBe(200);
  });

  it("the action log is the wallet's too: session or service key only", async () => {
    expect((await get(`/api/companion/actions/${W}/77`)).status).toBe(401);
    expect((await get(`/api/companion/actions/${W}/77`, signedIn())).status).toBe(200);
    expect((await get(`/api/companion/actions/${W}/77`, { Authorization: `Bearer ${process.env.COMPANION_WRITE_KEY}` })).status).toBe(200);
  });
});
