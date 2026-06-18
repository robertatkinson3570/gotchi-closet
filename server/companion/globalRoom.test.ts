import { describe, expect, it, beforeEach } from "vitest";
import fs from "node:fs";
import path from "node:path";

const TMP = path.resolve("./data/global-test.db");
process.env.COMPANION_DB_PATH = TMP;

import { closeDb } from "./db";
import { appendGlobalMessage, recentGlobalMessages, globalMessagesSince } from "./globalRoom";

beforeEach(() => {
  closeDb();
  for (const f of [TMP, `${TMP}-wal`, `${TMP}-shm`]) if (fs.existsSync(f)) fs.rmSync(f);
});

describe("globalRoom", () => {
  it("appends and returns recent messages oldest-first, capped", () => {
    for (let i = 0; i < 60; i++) appendGlobalMessage({ tokenId: "4", gotchiName: "Lao Tzu", wallet: "0xabc", text: `m${i}`, isAI: false });
    const recent = recentGlobalMessages(50);
    expect(recent.length).toBe(50);
    expect(recent[0].text).toBe("m10");        // oldest of the last 50
    expect(recent[recent.length - 1].text).toBe("m59"); // newest last
    expect(recent[0].isAI).toBe(false);
  });

  it("appendGlobalMessage stamps an id and ms timestamp and echoes fields", () => {
    const m = appendGlobalMessage({ tokenId: "7", gotchiName: "Wisp", wallet: "0xABC", text: "gm", isAI: true });
    expect(m.id).toBeGreaterThan(0);
    expect(m.ts).toBeGreaterThan(1_600_000_000_000);
    expect(m.tokenId).toBe("7");
    expect(m.gotchiName).toBe("Wisp");
    expect(m.isAI).toBe(true);
    expect(m.wallet).toBe("0xabc"); // stored lowercased
  });

  it("globalMessagesSince returns only rows newer than the given id", () => {
    const a = appendGlobalMessage({ tokenId: "1", gotchiName: "A", wallet: "0x1", text: "a", isAI: false });
    appendGlobalMessage({ tokenId: "2", gotchiName: "B", wallet: "0x2", text: "b", isAI: false });
    const since = globalMessagesSince(a.id, 10);
    expect(since.map((m) => m.text)).toEqual(["b"]);
  });
});
