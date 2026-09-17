import { describe, it, expect, afterAll } from "vitest";
import { tmpdir } from "node:os";
import { join } from "node:path";

process.env.COMPANION_DB_PATH = join(tmpdir(), `wisp-partner-test-${process.pid}.db`);

import { createAccount, activatePlan, setPartner, listPartners, accountsByPrefix, consumeChat, consumeRequest, chatAllowed, getAccountByKey } from "./accounts";
import { PARTNER_LIMITS, PLAN_LIMITS } from "../../src/lib/wisp/pricing";
import { closeDb } from "../companion/db";

afterAll(() => closeDb());

const T = Date.UTC(2026, 8, 17, 12, 0, 0);
const minute = (i: number) => T + i * 61_000;

describe("partner keys: free for the developer, the player's plan decides", () => {
  it("only the owner's setPartner turns a free key into a partner; list and prefix lookup find it", () => {
    const a = createAccount();
    expect(chatAllowed(getAccountByKey(a.apiKey)!)).toBe(false);
    setPartner(a.apiKey, true, "Haunt Hollow");
    const p = getAccountByKey(a.apiKey)!;
    expect(p.partner).toBe(true);
    expect(chatAllowed(p)).toBe(true);
    expect(listPartners().map((x) => x.apiKey)).toContain(a.apiKey);
    expect(accountsByPrefix(a.apiKey.slice(0, 12)).map((x) => x.apiKey)).toEqual([a.apiKey]);
    setPartner(a.apiKey, false);
    expect(chatAllowed(getAccountByKey(a.apiKey)!)).toBe(false);
  });

  it("a granted player without a plan gets the free allowance, then is told a plan is required", () => {
    const key = createAccount().apiKey;
    setPartner(key, true);
    const wallet = "0x1000000000000000000000000000000000000001";
    for (let i = 0; i < PARTNER_LIMITS.playerFreePerDay; i++) {
      const r = consumeChat(key, minute(i), { wallet, proven: true });
      expect(r.allowed).toBe(true);
      expect(r.plan).toBe("partner");
    }
    const over = consumeChat(key, minute(99), { wallet, proven: true });
    expect(over).toMatchObject({ allowed: false, reason: "player plan required", playerLimitPerDay: PARTNER_LIMITS.playerFreePerDay });
  });

  it("a granted player whose own wallet holds a paid Wisp plan gets the paid allowance", () => {
    const key = createAccount().apiKey;
    setPartner(key, true);
    const wallet = "0x2000000000000000000000000000000000000002";
    const own = createAccount(wallet);
    activatePlan({ apiKey: own.apiKey, plan: "holder", months: 12, asset: "ghst", amountWei: 1n, txHash: "0xpartner-holder" });
    const r = consumeChat(key, minute(0), { wallet, proven: true });
    expect(r).toMatchObject({ allowed: true, playerUsedToday: 1, playerLimitPerDay: PARTNER_LIMITS.playerPaidPerDay });
  });

  it("SEC-23: a free key minted on the paying player's wallet does not downgrade the allowance to the free one", async () => {
    const key = createAccount().apiKey;
    setPartner(key, true);
    const wallet = "0x2000000000000000000000000000000000000023";
    const own = createAccount(wallet);
    activatePlan({ apiKey: own.apiKey, plan: "holder", months: 12, asset: "ghst", amountWei: 1n, txHash: "0xpartner-holder-23" });
    await new Promise((r) => setTimeout(r, 5)); // a later created_at, as an attacker's mint would have
    createAccount(wallet);
    const r = consumeChat(key, minute(0), { wallet, proven: true });
    expect(r).toMatchObject({ allowed: true, playerUsedToday: 1, playerLimitPerDay: PARTNER_LIMITS.playerPaidPerDay });
  });

  it("the player allowance is shared across every partner app", () => {
    const k1 = createAccount().apiKey;
    const k2 = createAccount().apiKey;
    setPartner(k1, true);
    setPartner(k2, true);
    const wallet = "0x3000000000000000000000000000000000000003";
    consumeChat(k1, minute(0), { wallet, proven: true });
    expect(consumeChat(k2, minute(1), { wallet, proven: true }).playerUsedToday).toBe(2);
  });

  it("players who have not granted the key share the key's guest pool, and never touch a real player's allowance", () => {
    const key = createAccount().apiKey;
    setPartner(key, true);
    const holder = "0x4000000000000000000000000000000000000004";
    const r = consumeChat(key, minute(0), { wallet: holder, proven: false });
    expect(r).toMatchObject({ allowed: true, playerUsedToday: 1, playerLimitPerDay: PARTNER_LIMITS.guestPerDay });
    expect(consumeChat(key, minute(1), { wallet: holder, proven: true }).playerUsedToday).toBe(1);
  });

  it("the burst cap still guards the shared model per key", () => {
    const key = createAccount().apiKey;
    setPartner(key, true);
    let last = consumeChat(key, T, { wallet: "0x5000000000000000000000000000000000000005", proven: false });
    for (let i = 0; i < PARTNER_LIMITS.chatPerMinute; i++) last = consumeChat(key, T, { wallet: "0x5000000000000000000000000000000000000005", proven: false });
    expect(last).toMatchObject({ allowed: false, reason: "chat burst cap reached" });
  });

  it("a partner key's MCP tool calls use the partner request allowance, never lapse", () => {
    const key = createAccount().apiKey;
    setPartner(key, true);
    const r = consumeRequest(key, T);
    expect(r).toMatchObject({ allowed: true, plan: "partner", limitPerDay: PARTNER_LIMITS.requestsPerDay });
    expect(PARTNER_LIMITS.requestsPerDay).toBeGreaterThan(PLAN_LIMITS.free.requestsPerDay);
  });

  it("a non-partner key is metered exactly as before", () => {
    const key = createAccount().apiKey;
    expect(consumeChat(key, T, { wallet: "0x6000000000000000000000000000000000000006", proven: true })).toMatchObject({ allowed: false, reason: "chat not in plan", plan: "free" });
  });
});
