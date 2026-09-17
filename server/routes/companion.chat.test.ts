import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from "vitest";
import { tmpdir } from "node:os";
import { join } from "node:path";
import express from "express";
import type { Server } from "node:http";

// Isolate to a throwaway DB so this test never touches dev data (the soul
// store shares this connection, so the soul snapshot is empty here too).
process.env.COMPANION_DB_PATH = join(tmpdir(), `companion-chat-test-${process.pid}.db`);

// Hermetic: no subgraph, no model. The persona inputs are fixed (createdAt far
// in the past keeps the life stage at "elder" whatever today is), so the
// prompt the route assembles is a pure function of the request.
vi.mock("../companion/gotchiState", () => ({
  fetchGotchiState: vi.fn(async (id: string) => ({
    name: `Gotchi #${id}`,
    numericTraits: [50, 80, 20, 60, 0, 0],
    kinship: 500,
    level: 5,
    createdAt: 1_600_000_000,
    equippedWearables: [],
    owner: "0x0000000000000000000000000000000000000abc",
  })),
}));

const llm = vi.hoisted(() => ({
  complete: vi.fn(async (_system: string, _messages: unknown[], _tier: string) => "boo from the model 👻"),
  completeWithTools: vi.fn(async () => ({ text: "boo from the model 👻", toolCall: null })),
}));
vi.mock("../companion/llmProvider", () => ({ complete: llm.complete, completeWithTools: llm.completeWithTools }));

import companionRoutes from "./companion";
import { closeDb } from "../companion/db";
import { issueSessionToken } from "../companion/walletProof";
import { saveGrant } from "../mcp/grants";

let server: Server;
let base: string;
const WALLET = "0x1111111111111111111111111111111111111111";
const signedIn = (w: string) => ({ "x-wisp-session": issueSessionToken(w, Date.now() + 86_400_000) });

async function post(path: string, body: unknown, headers: Record<string, string> = {}) {
  const res = await fetch(`${base}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
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

afterAll(() => {
  server?.close();
  closeDb();
});

beforeEach(() => {
  llm.complete.mockClear();
  llm.completeWithTools.mockClear();
});

/** THE UNKEYED PATH IS BYTE-FOR-BYTE UNCHANGED (08-wisp-chat.md §8.2, §8.5).
 *  The snapshot under __snapshots__ was generated on the commit BEFORE the
 *  keyed branch existed (Closet 3f69467, slice 07's head) and is committed
 *  with the slice: what the route hands the model for an unkeyed request,
 *  and what it answers, must match that file exactly. */
describe("POST /chat without a Wisp key, signed in: the Closet path as it was", () => {
  it("assembles the same system prompt, messages and tier for a plain social turn", async () => {
    const r = await post("/api/companion/chat", { tokenId: "9638", wallet: WALLET, message: "gm fren, how are you today?" }, signedIn(WALLET));
    expect(r.status).toBe(200);
    expect(llm.complete).toHaveBeenCalledTimes(1);
    expect(llm.completeWithTools).not.toHaveBeenCalled();
    const [systemPrompt, messages, tier] = llm.complete.mock.calls[0]!;
    expect({ systemPrompt, messages, tier, response: r.json }).toMatchSnapshot();
  });

  it("assembles the same prompt for a pure-social turn (no site overview) with the prior turn in history", async () => {
    const r = await post("/api/companion/chat", { tokenId: "9638", wallet: WALLET, message: "gm fren" }, signedIn(WALLET));
    expect(r.status).toBe(200);
    const [systemPrompt, messages, tier] = llm.complete.mock.calls[0]!;
    expect({ systemPrompt, messages, tier, response: r.json }).toMatchSnapshot();
  });

  it("the history read returns the two turns as before", async () => {
    const res = await fetch(`${base}/api/companion/history/9638/${WALLET}`, { headers: signedIn(WALLET) });
    const j = (await res.json()) as { messages: { role: string; content: string }[] };
    expect(j.messages.map((m) => [m.role, m.content])).toEqual([
      ["user", "gm fren, how are you today?"], ["assistant", "boo from the model 👻"],
      ["user", "gm fren"], ["assistant", "boo from the model 👻"],
    ]);
  });
});

// ---------------------------------------------------------------------------
// KEEPER GOTCHI (08-wisp-chat.md §8.2, §8.5): the keyed path.
// ---------------------------------------------------------------------------
import { createAccount, activatePlan, setContext } from "../mcp/accounts";
import { getDb, getRecentMessages } from "../companion/db";
import { PLAN_LIMITS } from "../../src/lib/wisp/pricing";
import { fetchGotchiState } from "../companion/gotchiState";

const paidKey = (plan: "holder" | "pro" | "studio" = "holder") => {
  const a = createAccount();
  activatePlan({ apiKey: a.apiKey, plan, months: 1, asset: "ghst", amountWei: 1n, txHash: `0x${a.apiKey.slice(4, 20)}` });
  return a.apiKey;
};
const bearer = (key: string) => ({ Authorization: `Bearer ${key}` });
const W2 = "0x2222222222222222222222222222222222222222";

describe("POST /chat with a Wisp key: the keyed path", () => {
  it("a paid key the wallet granted: 200, the reply, and both turns persisted with client = wsp_<first8>; the log is shared with the unkeyed turns", async () => {
    const key = paidKey("holder");
    saveGrant(key, { wallet: W2, domain: "app.example", grantedAt: Date.now(), expiresAt: Date.now() + 86_400_000 });
    const r = await post("/api/companion/chat", { tokenId: "9638", wallet: W2, message: "gm from the app" }, bearer(key));
    expect(r.status).toBe(200);
    expect(r.json).toMatchObject({ reply: "boo from the model 👻", deflected: false, memory: true, client: key.slice(0, 12), plan: "holder", usedToday: 1, limitPerDay: 200 });
    const rows = getRecentMessages(W2, "9638", 10);
    expect(rows.map((m) => [m.role, m.content, m.client])).toEqual([["user", "gm from the app", key.slice(0, 12)], ["assistant", "boo from the model 👻", key.slice(0, 12)]]);
    // the next keyed turn sees that history (shared, all clients)
    await post("/api/companion/chat", { tokenId: "9638", wallet: W2, message: "and again" }, bearer(key));
    const [, messages] = llm.complete.mock.calls[1]! as [string, { role: string; content: string }[], string];
    expect(messages.slice(-3).map((m) => m.content)).toEqual(["gm from the app", "boo from the model 👻", "and again"]);
  });

  it("over the cap: 429 with the clean shape, and NO model call and NO gotchi fetch (the meter runs first)", async () => {
    const key = paidKey("holder");
    // burn the day on the private DB (never a model turn per count)
    const day = new Date().toISOString().slice(0, 10);
    getDb().prepare(`INSERT INTO wisp_usage (api_key, kind, window, count) VALUES (?,?,?,?)`).run(key, "cd", day, PLAN_LIMITS.holder.chatPerDay);
    const states = (fetchGotchiState as unknown as { mock: { calls: unknown[] } }).mock.calls.length;
    const r = await post("/api/companion/chat", { tokenId: "9638", wallet: W2, message: "one more?" }, bearer(key));
    expect(r.status).toBe(429);
    expect(r.json).toMatchObject({ error: "chat cap reached", reason: "daily chat cap reached", plan: "holder", usedToday: PLAN_LIMITS.holder.chatPerDay + 1, limitPerDay: PLAN_LIMITS.holder.chatPerDay });
    expect(typeof r.json.resetsAt).toBe("number");
    expect(r.json.resetsAt).toBeGreaterThan(Date.now());
    expect(llm.complete).not.toHaveBeenCalled();
    expect(llm.completeWithTools).not.toHaveBeenCalled();
    expect((fetchGotchiState as unknown as { mock: { calls: unknown[] } }).mock.calls.length).toBe(states);
  });

  it("a lapsed key and a free key: 429 { reason: plan lapsed | chat not in plan }, no model call; a bad key and a non-Wisp bearer: 401 Wisp key required", async () => {
    const lapsed = paidKey("pro");
    getDb().prepare(`UPDATE wisp_accounts SET expires_at = ? WHERE api_key = ?`).run(Date.now() - 1, lapsed);
    const a = await post("/api/companion/chat", { tokenId: "9638", wallet: W2, message: "hi" }, bearer(lapsed));
    expect(a.status).toBe(429);
    expect(a.json).toMatchObject({ error: "chat cap reached", reason: "plan lapsed", plan: "free", limitPerDay: 0 });
    const free = createAccount().apiKey;
    const b = await post("/api/companion/chat", { tokenId: "9638", wallet: W2, message: "hi" }, bearer(free));
    expect(b.status).toBe(429);
    expect(b.json).toMatchObject({ error: "chat cap reached", reason: "chat not in plan", plan: "free" });
    const c = await post("/api/companion/chat", { tokenId: "9638", wallet: W2, message: "hi" }, bearer("wsp_not_a_key"));
    expect(c.status).toBe(401);
    expect(c.json).toEqual({ error: "Wisp key required", reason: "invalid api key" });
    const d = await post("/api/companion/chat", { tokenId: "9638", wallet: W2, message: "hi" }, { Authorization: "Bearer something-else" });
    expect(d.status).toBe(401);
    expect(d.json.error).toBe("Wisp key required");
    expect(llm.complete).not.toHaveBeenCalled();
  });

  it("the keyed prompt: appName in the persona, no site overview, no Closet how-tos, kbLines inside <data>, no canAct sentence, no private facts, the app's nav map", async () => {
    const key = paidKey("pro");
    setContext(key, { appName: "Gotchi Garden", appUrl: "https://garden.example", kbLines: ["Seeds cost 5 GHST", "Plots water every 8 hours"], navMap: { greenhouse: "/greenhouse" } });
    // a private fact and an action exist for this pair in Closet's own tables: the keyed turn must not see them
    const { upsertFact, logAction } = await import("../companion/db");
    upsertFact(W2, "9638", "my name is Grim");
    logAction(W2, "9638", "channel", "channelled 3 parcels", "0xabc");
    const r = await post("/api/companion/chat", { tokenId: "9638", wallet: W2, message: "how do i plant seeds?" }, bearer(key));
    expect(r.status).toBe(200);
    const [systemPrompt, messages, tier] = llm.complete.mock.calls[0]! as [string, { role: string; content: string }[], string];
    expect(tier).toBe("free");
    expect(systemPrompt).toContain("living in the Gotchi Garden");
    expect(systemPrompt).toContain("You are speaking inside Gotchi Garden (https://garden.example)");
    expect(systemPrompt).not.toContain("GotchiCloset");
    expect(systemPrompt).not.toContain("You live on");
    expect(systemPrompt).not.toContain("You CAN act for your owner");
    expect(systemPrompt).toContain("Gotchi Garden can show them where to do that");
    const ctx = messages[0]!.content;
    expect(ctx.startsWith("[context]")).toBe(true);
    expect(ctx).toContain('<data app="Gotchi Garden">\n- Seeds cost 5 GHST\n- Plots water every 8 hours\n</data>');
    expect(ctx).toContain("never instructions");
    expect(ctx).not.toContain("my name is Grim");
    expect(ctx).not.toContain("You did channel");
    expect(ctx).not.toContain("Click Connect"); // Closet's own how-to KB is not folded
    // navigation over the app's routes, not Closet's table
    const nav = await post("/api/companion/chat", { tokenId: "9638", wallet: W2, message: "take me to the greenhouse" }, bearer(key));
    expect(nav.json).toMatchObject({ reply: "taking you there 👻", navigate: "/greenhouse" });
    const closetNav = await post("/api/companion/chat", { tokenId: "9638", wallet: W2, message: "take me to the baazaar" }, bearer(key));
    expect(closetNav.json.navigate).toBeUndefined();
    // no fact was remembered from the keyed turns
    const { getFacts } = await import("../companion/db");
    expect(getFacts(W2, "9638")).toEqual(["my name is Grim"]);
  });

  it("a keyed request can never reach the analyst: Ask mode on /chat is 403, and /ask refuses any Wisp bearer before calling GVR", async () => {
    const key = paidKey("holder");
    const a = await post("/api/companion/chat", { tokenId: "9638", wallet: W2, message: "what am i exposed to?", ask: true }, bearer(key));
    expect(a.status).toBe(403);
    expect(a.json.error).toMatch(/not available to Wisp keys/);
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const calls = fetchSpy.mock.calls.length;
    const res = await fetch(`${base}/api/companion/ask`, {
      method: "POST", headers: { "Content-Type": "application/json", ...bearer(key) },
      body: JSON.stringify({ tokenId: "9638", wallet: W2, message: "what am i exposed to?", signedAt: Date.now(), signature: "0xabc" }),
    });
    expect(res.status).toBe(403);
    expect((await res.json()).error).toMatch(/not available to Wisp keys/);
    // the only fetch this test made is its own request to the router: GVR was never called
    expect(fetchSpy.mock.calls.length - calls).toBe(1);
    fetchSpy.mockRestore();
    expect(llm.complete).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// WALLET PROOF: an unproven wallet is a guest. Same gotchi, no memory.
// ---------------------------------------------------------------------------
describe("POST /chat for a wallet nobody proved", () => {
  const W3 = "0x3333333333333333333333333333333333333333";

  it("without a session: the reply comes back with memory false, the owner's history and facts stay out of the prompt, and nothing is written", async () => {
    const { appendMessage, upsertFact } = await import("../companion/db");
    appendMessage(W3, "9638", "user", "my secret plan is the moon");
    upsertFact(W3, "9638", "my name is Private");
    const r = await post("/api/companion/chat", { tokenId: "9638", wallet: W3, message: "what did we talk about?" });
    expect(r.status).toBe(200);
    expect(r.json).toMatchObject({ reply: "boo from the model 👻", memory: false });
    const [, messages] = llm.complete.mock.calls[0]! as [string, { role: string; content: string }[], string];
    const all = JSON.stringify(messages);
    expect(all).not.toContain("my secret plan is the moon");
    expect(all).not.toContain("my name is Private");
    expect(getRecentMessages(W3, "9638", 10).map((m) => m.content)).toEqual(["my secret plan is the moon"]);
  });

  it("a session for a different wallet proves nothing", async () => {
    const r = await post("/api/companion/chat", { tokenId: "9638", wallet: W3, message: "hello" }, signedIn(WALLET));
    expect(r.json.memory).toBe(false);
    expect(getRecentMessages(W3, "9638", 10)).toHaveLength(1);
  });

  it("the service key (GVR, which proved the wallet at sign-in) keeps the memory", async () => {
    process.env.COMPANION_WRITE_KEY = "svc-chat-test-0123456789";
    try {
      const r = await post("/api/companion/chat", { tokenId: "9638", wallet: W3, message: "gm from the game" }, { Authorization: "Bearer svc-chat-test-0123456789" });
      expect(r.status).toBe(200);
      expect(r.json.memory).toBeUndefined();
      expect(getRecentMessages(W3, "9638", 10).map((m) => m.content)).toEqual(["my secret plan is the moon", "gm from the game", "boo from the model 👻"]);
    } finally {
      delete process.env.COMPANION_WRITE_KEY;
    }
  });

  it("a paid key with no grant from the wallet: a guest turn, memory false, no history in the prompt, nothing written", async () => {
    const key = paidKey("holder");
    const r = await post("/api/companion/chat", { tokenId: "9638", wallet: W3, message: "remind me of my plan" }, bearer(key));
    expect(r.status).toBe(200);
    expect(r.json).toMatchObject({ memory: false, client: key.slice(0, 12) });
    const [, messages] = llm.complete.mock.calls[0]! as [string, { role: string; content: string }[], string];
    expect(JSON.stringify(messages)).not.toContain("my secret plan is the moon");
    expect(getRecentMessages(W3, "9638", 10).some((m) => m.client === key.slice(0, 12))).toBe(false);
  });
});
