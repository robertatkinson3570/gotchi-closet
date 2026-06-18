import { describe, expect, it, beforeEach } from "vitest";
import fs from "node:fs";
import path from "node:path";

// Use a dedicated test DB so tests never touch production data.
const TMP = path.resolve("./data/arena-test.db");
process.env.COMPANION_DB_PATH = TMP;

// Import db + cache AFTER setting the env var so the path is picked up.
import { closeDb, getDb } from "../companion/db";
import {
  getCachedReply,
  putCachedReply,
  bumpVisitor,
  resetSchemaFlag,
} from "./arenaCache";

beforeEach(() => {
  // Close and delete the test DB before each test so state is clean.
  closeDb();
  resetSchemaFlag();
  for (const f of [TMP, `${TMP}-wal`, `${TMP}-shm`]) {
    if (fs.existsSync(f)) fs.rmSync(f);
  }
});

// ---------------------------------------------------------------------------
// Chat cache
// ---------------------------------------------------------------------------

describe("chat cache", () => {
  it("returns null on a miss", () => {
    const reply = getCachedReply("1", "hash_abc");
    expect(reply).toBeNull();
  });

  it("put/get roundtrip: retrieves the stored reply", () => {
    putCachedReply("42", "hash_xyz", "Hello, spirit!");
    const reply = getCachedReply("42", "hash_xyz");
    expect(reply).toBe("Hello, spirit!");
  });

  it("different tokenIds are stored independently", () => {
    putCachedReply("1", "same_hash", "reply for gotchi 1");
    putCachedReply("2", "same_hash", "reply for gotchi 2");
    expect(getCachedReply("1", "same_hash")).toBe("reply for gotchi 1");
    expect(getCachedReply("2", "same_hash")).toBe("reply for gotchi 2");
  });

  it("overwrite: second put replaces the first", () => {
    putCachedReply("7", "h1", "original");
    putCachedReply("7", "h1", "updated");
    expect(getCachedReply("7", "h1")).toBe("updated");
  });
});

// ---------------------------------------------------------------------------
// Visitor cap
// ---------------------------------------------------------------------------

describe("visitor cap", () => {
  const WINDOW = 24 * 60 * 60 * 1000; // 24 h

  it("does NOT trip on first N calls (N = max)", () => {
    const max = 5;
    for (let i = 0; i < max; i++) {
      const over = bumpVisitor("ip_a", max, WINDOW);
      expect(over).toBe(false);
    }
  });

  it("DOES trip on the (N+1)th call", () => {
    const max = 5;
    for (let i = 0; i < max; i++) {
      bumpVisitor("ip_b", max, WINDOW);
    }
    const over = bumpVisitor("ip_b", max, WINDOW);
    expect(over).toBe(true);
  });

  it("different visitors have independent counters", () => {
    const max = 3;
    // Exhaust visitor A
    for (let i = 0; i < max; i++) bumpVisitor("ip_c", max, WINDOW);
    bumpVisitor("ip_c", max, WINDOW); // trip A

    // Visitor B should still be free
    expect(bumpVisitor("ip_d", max, WINDOW)).toBe(false);
  });

  it("resets after the window expires (via DB manipulation)", () => {
    const max = 2;

    // Exhaust the counter normally (3 calls: 2 ok + 1 over)
    bumpVisitor("ip_e", max, WINDOW);
    bumpVisitor("ip_e", max, WINDOW);
    expect(bumpVisitor("ip_e", max, WINDOW)).toBe(true); // over cap

    // Force-expire the row: set reset_at to a value in the past so the next
    // bumpVisitor call sees now >= reset_at and resets.
    getDb().prepare(
      `UPDATE public_visitor_usage SET reset_at = 1 WHERE visitor = ?`
    ).run("ip_e");

    // Next call should see the expired window and reset count to 1 — not capped
    const afterExpiry = bumpVisitor("ip_e", max, WINDOW);
    expect(afterExpiry).toBe(false); // count reset to 1 <= max(2)
  });
});
