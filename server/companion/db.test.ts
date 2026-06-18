import { describe, expect, it, beforeEach } from "vitest";
import fs from "node:fs";
import path from "node:path";

const TMP = path.resolve("./data/companion-test.db");
process.env.COMPANION_DB_PATH = TMP;

import {
  appendMessage, getRecentMessages, upsertFact, getFacts,
  grantPremium, getEntitlement, isPremiumActive, closeDb,
} from "./db";

beforeEach(() => {
  closeDb();
  for (const f of [TMP, `${TMP}-wal`, `${TMP}-shm`]) if (fs.existsSync(f)) fs.rmSync(f);
});

describe("memory", () => {
  it("stores and returns recent messages newest-last, capped", () => {
    for (let i = 0; i < 25; i++) appendMessage("0xabc", "4821", "user", `m${i}`);
    const recent = getRecentMessages("0xabc", "4821", 20);
    expect(recent.length).toBe(20);
    expect(recent[recent.length - 1].content).toBe("m24");
  });

  it("caps facts per gotchi at 10 (drops oldest)", () => {
    for (let i = 0; i < 12; i++) upsertFact("0xabc", "4821", `fact ${i}`);
    expect(getFacts("0xabc", "4821").length).toBeLessThanOrEqual(10);
  });
});

describe("entitlements", () => {
  it("grants premium and reports active until expiry", () => {
    const future = Date.now() + 86400_000;
    grantPremium("0xABC", future, "0xtx1");
    expect(isPremiumActive("0xabc")).toBe(true); // case-insensitive wallet
    expect(getEntitlement("0xabc")?.tier).toBe("premium");
  });

  it("reports inactive once expired", () => {
    grantPremium("0xdef", Date.now() - 1000, "0xtx2");
    expect(isPremiumActive("0xdef")).toBe(false);
  });
});
