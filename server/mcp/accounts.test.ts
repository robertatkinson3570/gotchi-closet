import { describe, it, expect, afterAll } from "vitest";
import { tmpdir } from "node:os";
import { join } from "node:path";

// Isolate to a throwaway DB so this test never touches dev data.
process.env.COMPANION_DB_PATH = join(tmpdir(), `wisp-accounts-test-${process.pid}.db`);

import { createAccount, getAccountByKey, activatePlan, effectivePlan, consumeRequest, consumeChat, chatUsageOf, setContext, normaliseContext, nextUtcMidnight, bestPaidAccountByWallet, accountsByWallet } from "./accounts";
import { PLAN_LIMITS } from "../../src/lib/wisp/pricing";
import { closeDb, getDb } from "../companion/db";

afterAll(() => closeDb());

/** A key whose paid period ENDED: activatePlan can only extend from now, so
 *  the lapse is written straight into the private test DB (never prod data). */
function lapse(apiKey: string, now: number) {
  getDb().prepare(`UPDATE wisp_accounts SET expires_at = ? WHERE api_key = ?`).run(now - 1, apiKey);
}

describe("wisp accounts ledger", () => {
  it("mints a unique, prefixed api key on the free plan", () => {
    const a = createAccount("0xABCdef0000000000000000000000000000000001");
    const b = createAccount();
    expect(a.apiKey).toMatch(/^wsp_[0-9a-f]{48}$/);
    expect(a.apiKey).not.toBe(b.apiKey);
    expect(a.plan).toBe("free");
    expect(a.ownerWallet).toBe("0xabcdef0000000000000000000000000000000001");
    expect(b.ownerWallet).toBeNull();
  });

  it("activates a plan idempotently — the same tx can't be credited twice", () => {
    const a = createAccount();
    const after = activatePlan({ apiKey: a.apiKey, plan: "pro", months: 3, asset: "eth", amountWei: 1n, txHash: "0xtx1" });
    expect(after.plan).toBe("pro");
    expect(after.expiresAt).toBeGreaterThan(Date.now());
    expect(() =>
      activatePlan({ apiKey: a.apiKey, plan: "pro", months: 3, asset: "eth", amountWei: 1n, txHash: "0xtx1" })
    ).toThrow(/already credited/);
  });

  it("effectivePlan reverts to free after the prepaid period lapses", () => {
    const a = createAccount();
    activatePlan({ apiKey: a.apiKey, plan: "studio", months: 1, asset: "usdc", amountWei: 1n, txHash: "0xtx2" });
    const acct = getAccountByKey(a.apiKey)!;
    expect(effectivePlan(acct, Date.now())).toBe("studio");
    expect(effectivePlan(acct, acct.expiresAt + 1)).toBe("free");
  });
});

describe("wisp rate limiting (the plan limits actually work)", () => {
  it("free plan allows up to its daily limit, then blocks", () => {
    const a = createAccount();
    const first = consumeRequest(a.apiKey);
    expect(first.allowed).toBe(true);
    expect(first.plan).toBe("free");
    expect(first.limitPerDay).toBe(1000);
    // consume up to the daily cap (we already spent 1)
    for (let i = 1; i < first.limitPerDay; i++) consumeRequest(a.apiKey);
    const over = consumeRequest(a.apiKey); // (limit + 1)th request
    expect(over.allowed).toBe(false);
    expect(over.reason).toMatch(/daily/);
  });

  it("a paid plan lifts the limit (and lapses back to free on expiry)", () => {
    const a = createAccount();
    activatePlan({ apiKey: a.apiKey, plan: "pro", months: 1, asset: "eth", amountWei: 1n, txHash: "0xrl1" });
    const r = consumeRequest(a.apiKey);
    expect(r.allowed).toBe(true);
    expect(r.plan).toBe("pro");
    expect(r.limitPerDay).toBe(25000);
    // after expiry, consumeRequest sees the free limit
    const acct = getAccountByKey(a.apiKey)!;
    expect(consumeRequest(a.apiKey, acct.expiresAt + 1).limitPerDay).toBe(1000);
  });

  it("rejects an invalid api key", () => {
    const r = consumeRequest("wsp_does_not_exist");
    expect(r.allowed).toBe(false);
    expect(r.reason).toMatch(/invalid/);
  });
});

/** KEEPER GOTCHI (08-wisp-chat.md §8.2, §8.5): hosted chat is metered on its
 *  own counter, the grant is chatPerDay > 0, a lapsed plan refuses as "plan
 *  lapsed", the day rolls at UTC midnight, and the burst cap bounds a minute. */
describe("consumeChat (the hosted chat meter)", () => {
  const T = Date.parse("2026-09-16T10:00:00Z");

  it("counts separately from consumeRequest, and a tool call never spends a chat turn", () => {
    const a = createAccount();
    activatePlan({ apiKey: a.apiKey, plan: "holder", months: 1, asset: "ghst", amountWei: 1n, txHash: "0xc1" });
    for (let i = 0; i < 5; i++) consumeRequest(a.apiKey, T);
    const r = consumeChat(a.apiKey, T);
    expect(r).toMatchObject({ allowed: true, plan: "holder", chat: true, usedToday: 1, usedMinute: 1, limitPerDay: 200, limitPerMinute: 6, resetsAt: Date.parse("2026-09-17T00:00:00Z") });
    expect(consumeRequest(a.apiKey, T).usedToday).toBe(6); // the tool counter, untouched by chat
    expect(chatUsageOf(a.apiKey, T)).toEqual({ usedToday: 1, usedMonth: 1, usedMinute: 1 });
  });

  it("free refuses (chat not in plan) and bumps nothing; an invalid key refuses too", () => {
    const a = createAccount();
    const r = consumeChat(a.apiKey, T);
    expect(r).toMatchObject({ allowed: false, plan: "free", chat: false, reason: "chat not in plan", usedToday: 0, limitPerDay: 0 });
    expect(chatUsageOf(a.apiKey, T)).toEqual({ usedToday: 0, usedMonth: 0, usedMinute: 0 });
    expect(consumeChat("wsp_nope", T)).toMatchObject({ allowed: false, reason: "invalid api key", chat: false });
  });

  it("a lapsed pro refuses with reason 'plan lapsed' (it fell to free, and free has chatPerDay 0)", () => {
    const a = createAccount();
    activatePlan({ apiKey: a.apiKey, plan: "pro", months: 1, asset: "eth", amountWei: 1n, txHash: "0xc2" });
    expect(consumeChat(a.apiKey, T).allowed).toBe(true);
    lapse(a.apiKey, T);
    const r = consumeChat(a.apiKey, T);
    expect(r).toMatchObject({ allowed: false, plan: "free", chat: false, reason: "plan lapsed", limitPerDay: 0, resetsAt: nextUtcMidnight(T) });
    expect(chatUsageOf(a.apiKey, T).usedToday).toBe(1); // the refusal did not count
  });

  it("the burst cap: the seventh holder turn in one UTC minute is refused, spends no day turn, and the next minute is open again", () => {
    const a = createAccount();
    activatePlan({ apiKey: a.apiKey, plan: "holder", months: 1, asset: "ghst", amountWei: 1n, txHash: "0xc3" });
    for (let i = 0; i < 6; i++) expect(consumeChat(a.apiKey, T + i * 1000).allowed).toBe(true);
    const over = consumeChat(a.apiKey, T + 7000);
    expect(over).toMatchObject({ allowed: false, reason: "chat burst cap reached", usedMinute: 7, usedToday: 6, limitPerMinute: 6, resetsAt: Date.parse("2026-09-16T10:01:00Z") });
    const next = consumeChat(a.apiKey, T + 60_000);
    expect(next).toMatchObject({ allowed: true, usedMinute: 1, usedToday: 7 });
  });

  it("the daily cap: turn N+1 is refused with the clean shape, and the day rolls at UTC midnight", () => {
    const a = createAccount();
    activatePlan({ apiKey: a.apiKey, plan: "pro", months: 1, asset: "eth", amountWei: 1n, txHash: "0xc4" });
    const cap = PLAN_LIMITS.pro.chatPerDay;
    const perMinute = PLAN_LIMITS.pro.chatPerMinute;
    // Spread under the burst cap: a fresh minute every `perMinute` turns.
    for (let i = 0; i < cap; i++) {
      const r = consumeChat(a.apiKey, T + Math.floor(i / perMinute) * 60_000);
      expect(r.allowed, `turn ${i + 1}`).toBe(true);
    }
    const lastMinute = T + Math.floor(cap / perMinute) * 60_000;
    const over = consumeChat(a.apiKey, lastMinute);
    expect(over).toMatchObject({ allowed: false, plan: "pro", reason: "daily chat cap reached", usedToday: cap + 1, limitPerDay: cap, resetsAt: Date.parse("2026-09-17T00:00:00Z") });
    // 23:59:59Z is still today; 00:00:00Z is a new day.
    expect(consumeChat(a.apiKey, Date.parse("2026-09-16T23:59:59Z")).allowed).toBe(false);
    const rolled = consumeChat(a.apiKey, Date.parse("2026-09-17T00:00:00Z"));
    expect(rolled).toMatchObject({ allowed: true, usedToday: 1 });
  });
});

describe("the per-key app context (08-wisp-chat.md §8.2)", () => {
  it("stores a validated context and reads it back on the account", () => {
    const a = createAccount();
    expect(getAccountByKey(a.apiKey)!.context).toBeNull();
    const after = setContext(a.apiKey, {
      appName: "  Gotchi  Garden ", appUrl: "https://garden.example",
      kbLines: ["Gardens water every 8 hours", "Seeds cost 5 GHST <script>"],
      navMap: { Garden: "/garden", "my plots": "https://garden.example/plots" },
    });
    expect(after.context).toEqual({
      appName: "Gotchi Garden", appUrl: "https://garden.example",
      kbLines: ["Gardens water every 8 hours", "Seeds cost 5 GHST script"],
      navMap: { garden: "/garden", "my plots": "https://garden.example/plots" },
    });
    expect(getAccountByKey(a.apiKey)!.context).toEqual(after.context);
  });

  it("refuses what cannot enter a prompt: no appName, a non-http URL, too many lines, a bad nav path, an unknown key", () => {
    expect(() => normaliseContext({})).toThrow(/appName/);
    expect(() => normaliseContext({ appName: "x", appUrl: "javascript:alert(1)" })).toThrow(/appUrl/);
    expect(() => normaliseContext({ appName: "x", kbLines: Array.from({ length: 21 }, () => "l") })).toThrow(/kbLines/);
    expect(() => normaliseContext({ appName: "x", kbLines: ["", "ok"] })).toThrow(/kbLines/);
    expect(() => normaliseContext({ appName: "x", navMap: { garden: "garden" } })).toThrow(/navMap\.garden/);
    expect(() => normaliseContext({ appName: "x", navMap: { "<b>": "/x" } })).toThrow(/navMap key/);
    expect(() => setContext("wsp_nope", { appName: "x" })).toThrow(/account not found/);
    // a 300-char line is cut to 200, and newlines become spaces
    const c = normaliseContext({ appName: "x", kbLines: ["a\nb " + "c".repeat(300)] });
    expect(c.kbLines![0]!.length).toBe(200);
    expect(c.kbLines![0]!.startsWith("a b ")).toBe(true);
  });
});

describe("SEC-23: the plan a wallet holds is the best active paid plan across every account, never the newest row", () => {
  const W = "0x5e5e000000000000000000000000000000000023";
  it("a free key minted later on the wallet does not hide the holder plan; studio beats pro; the latest expiry wins among equals", async () => {
    const holder = createAccount(W);
    activatePlan({ apiKey: holder.apiKey, plan: "holder", months: 1, asset: "ghst", amountWei: 1n, txHash: "0xsec23-h" });
    await new Promise((r) => setTimeout(r, 5));
    createAccount(W); // the unsigned mint from the attacker, with a later created_at
    expect(bestPaidAccountByWallet(W)!.apiKey).toBe(holder.apiKey);
    expect(accountsByWallet(W)).toHaveLength(2);
    const pro = createAccount(W);
    activatePlan({ apiKey: pro.apiKey, plan: "pro", months: 12, asset: "eth", amountWei: 1n, txHash: "0xsec23-p" });
    const studio = createAccount(W);
    activatePlan({ apiKey: studio.apiKey, plan: "studio", months: 1, asset: "eth", amountWei: 1n, txHash: "0xsec23-s" });
    expect(bestPaidAccountByWallet(W)!.apiKey).toBe(studio.apiKey);
    const studio2 = createAccount(W);
    activatePlan({ apiKey: studio2.apiKey, plan: "studio", months: 2, asset: "eth", amountWei: 1n, txHash: "0xsec23-s2" });
    expect(bestPaidAccountByWallet(W)!.apiKey).toBe(studio2.apiKey);
    // a lapsed plan is not active: the wallet with only lapsed paid rows and a free row has no paid plan
    const W2 = "0x5e5e000000000000000000000000000000000024";
    const lapsed = createAccount(W2);
    activatePlan({ apiKey: lapsed.apiKey, plan: "pro", months: 1, asset: "eth", amountWei: 1n, txHash: "0xsec23-l" });
    expect(bestPaidAccountByWallet(W2, Date.now() + 40 * 86_400_000)).toBeNull();
    expect(bestPaidAccountByWallet("0x5e5e000000000000000000000000000000000099")).toBeNull();
  });
});
