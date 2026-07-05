// server/analytics/store.test.ts
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { closeDb, insertEvent, listEvents, listVisitors, pruneOld } from "./store";

let tmpDir: string;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "analytics-test-"));
  process.env.ANALYTICS_DB_PATH = path.join(tmpDir, "analytics.db");
});

afterEach(() => {
  closeDb();
  delete process.env.ANALYTICS_DB_PATH;
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

const base = {
  visitor_id: "v1",
  wallet: null as string | null,
  ip: "1.2.3.4",
  path: "/explorer",
  event_type: "pageview" as const,
  user_agent: "UA",
};

describe("insertEvent + listEvents", () => {
  it("stores and returns events within the window, newest first", () => {
    const now = Date.now();
    insertEvent({ ...base, created_at: now - 1000 });
    insertEvent({ ...base, path: "/pulse", created_at: now });
    const rows = listEvents({ sinceMs: now - 10_000 });
    expect(rows).toHaveLength(2);
    expect(rows[0].path).toBe("/pulse"); // newest first
    expect(rows[0].ip).toBe("1.2.3.4");
  });

  it("excludes events older than the window", () => {
    const now = Date.now();
    insertEvent({ ...base, created_at: now - 100_000 });
    expect(listEvents({ sinceMs: now - 10_000 })).toHaveLength(0);
  });
});

describe("listVisitors", () => {
  it("aggregates one row per visitor with latest wallet and counts", () => {
    const now = Date.now();
    insertEvent({ ...base, created_at: now - 2000 });
    insertEvent({ ...base, wallet: "0xabc", event_type: "connect", created_at: now - 1000 });
    insertEvent({ ...base, visitor_id: "v2", created_at: now });
    const visitors = listVisitors({ sinceMs: now - 10_000 });
    const v1 = visitors.find((v) => v.visitor_id === "v1")!;
    expect(v1.wallet).toBe("0xabc"); // latest non-null wallet backfills the session
    expect(v1.events).toBe(2);
    expect(visitors).toHaveLength(2);
  });
});

describe("pruneOld", () => {
  it("deletes rows older than the cutoff and keeps recent ones", () => {
    const now = Date.now();
    insertEvent({ ...base, created_at: now - 100 });
    insertEvent({ ...base, created_at: now - 200_000 });
    const deleted = pruneOld(now - 10_000);
    expect(deleted).toBe(1);
    expect(listEvents({ sinceMs: now - 1_000_000 })).toHaveLength(1);
  });
});
