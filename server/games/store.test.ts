// server/games/store.test.ts
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { closeDb, insertPending, listApproved, listPending, review, pendingCountForWallet, listForWallet, updateForWallet, deleteGame } from "./store";

let tmpDir: string;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "games-test-"));
  process.env.GAMES_DB_PATH = path.join(tmpDir, "games.db");
});

afterEach(() => {
  closeDb();
  delete process.env.GAMES_DB_PATH;
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

const sample = {
  title: "My Game",
  description: "fun",
  url: "https://example.com",
  category: "Games" as const,
  image_mime: "image/png",
  image_data: "aGVsbG8=",
  submitter_wallet: "0xabc",
};

describe("games store", () => {
  it("inserts pending and hides it from the public list", () => {
    insertPending(sample);
    expect(listApproved()).toHaveLength(0);
    expect(listPending()).toHaveLength(1);
  });

  it("approving publishes the entry", () => {
    const id = insertPending(sample);
    review(id, "approved", "0xadmin");
    const pub = listApproved();
    expect(pub).toHaveLength(1);
    expect(pub[0].title).toBe("My Game");
  });

  it("rejecting keeps it out of the public list", () => {
    const id = insertPending(sample);
    review(id, "rejected", "0xadmin");
    expect(listApproved()).toHaveLength(0);
    expect(listPending()).toHaveLength(0);
  });

  it("filters the public list by category", () => {
    review(insertPending(sample), "approved", "0xadmin");
    review(insertPending({ ...sample, title: "T", category: "Tools" }), "approved", "0xadmin");
    expect(listApproved("Games")).toHaveLength(1);
    expect(listApproved("Tools")).toHaveLength(1);
    expect(listApproved()).toHaveLength(2);
  });

  it("counts a wallet's pending rows", () => {
    insertPending(sample);
    insertPending(sample);
    expect(pendingCountForWallet("0xabc")).toBe(2);
    expect(pendingCountForWallet("0xdef")).toBe(0);
  });

  it("lists a wallet's own entries across every status", () => {
    review(insertPending(sample), "approved", "0xadmin");
    insertPending(sample); // pending
    insertPending({ ...sample, submitter_wallet: "0xother" });
    const mine = listForWallet("0xabc");
    expect(mine).toHaveLength(2);
    expect(mine.map((m) => m.status).sort()).toEqual(["approved", "pending"]);
  });

  it("owner edit updates fields and resets an approved entry to pending", () => {
    const id = insertPending(sample);
    review(id, "approved", "0xadmin");
    const ok = updateForWallet(id, "0xabc", { title: "Renamed", description: "d2", url: "https://b.com", category: "Tools" });
    expect(ok).toBe(true);
    expect(listApproved()).toHaveLength(0); // pulled from public grid
    const mine = listForWallet("0xabc");
    expect(mine[0].title).toBe("Renamed");
    expect(mine[0].status).toBe("pending");
    expect(mine[0].reviewed_by).toBeNull();
  });

  it("owner edit refuses a row owned by a different wallet", () => {
    const id = insertPending(sample);
    expect(updateForWallet(id, "0xnotowner", { title: "x", description: "y", url: "https://c.com", category: "Games" })).toBe(false);
  });

  it("delete removes the row entirely", () => {
    const id = insertPending(sample);
    deleteGame(id);
    expect(listForWallet("0xabc")).toHaveLength(0);
  });
});
