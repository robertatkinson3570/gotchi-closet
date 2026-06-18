import { describe, expect, it, beforeEach } from "vitest";
import fs from "node:fs";
import path from "node:path";

// Set DB path BEFORE any module imports that touch the db.
const TMP = path.resolve("./data/soul-store-test.db");
process.env.COMPANION_DB_PATH = TMP;

import { closeDb, getDb } from "../companion/db";
import { newSoulDocument, soulHash, type SoulDocument } from "./soulDoc";
import {
  getSoulDoc,
  saveSoulDoc,
  getCached,
  setOwner,
  recordSeal,
  getSeals,
} from "./soulStore";

// ---------------------------------------------------------------------------
// Test isolation: reset DB before every test
// ---------------------------------------------------------------------------

beforeEach(() => {
  closeDb();
  for (const f of [TMP, `${TMP}-wal`, `${TMP}-shm`]) {
    if (fs.existsSync(f)) fs.rmSync(f);
  }
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeDoc(tokenId = "42"): SoulDocument {
  const doc = newSoulDocument(tokenId, Date.now() - 7 * 86_400_000);
  doc.bonding.bondedDays = 7;
  doc.bonding.streak = 5;
  doc.bonding.consistencyHistory = [0.8, 0.9, 1.0];
  doc.memories = [
    { ts: Date.now() - 3000, summary: "We explored the Forge together.", privacy: "normal", weight: 2 },
    { ts: Date.now() - 1000, summary: "A quiet moment — the gotchi seemed thoughtful.", privacy: "sensitive", weight: 1 },
  ];
  doc.pastLives = [
    { eraHint: "early days", fragment: "A keeper who favored the Portal." },
  ];
  return doc;
}

const CACHED = { depth: 42.5, soulAgeDays: 7, pastLivesCount: 1 };

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("soulStore — saveSoulDoc / getSoulDoc", () => {
  it("saves a document and retrieves an exact deep-equal copy", () => {
    const doc = makeDoc("1");
    saveSoulDoc("1", "0xABCD", doc, CACHED);
    const loaded = getSoulDoc("1");
    expect(loaded).not.toBeNull();
    expect(loaded).toEqual(doc);
  });

  it("returns null for a tokenId that has never been saved", () => {
    expect(getSoulDoc("nonexistent-9999")).toBeNull();
  });

  it("upserts — second save overwrites and round-trips the new document", () => {
    const doc = makeDoc("2");
    saveSoulDoc("2", "0xABCD", doc, CACHED);
    doc.bonding.bondedDays = 14;
    doc.bonding.streak = 10;
    saveSoulDoc("2", "0xABCD", doc, { ...CACHED, depth: 55, soulAgeDays: 14 });
    const loaded = getSoulDoc("2");
    expect(loaded?.bonding.bondedDays).toBe(14);
    expect(loaded?.bonding.streak).toBe(10);
  });
});

describe("soulStore — blob is opaque", () => {
  it("stored blob_cipher does not contain the plaintext memory summary", () => {
    const doc = makeDoc("3");
    const knownSummary = "We explored the Forge together.";
    saveSoulDoc("3", "0xABCD", doc, CACHED);

    // Read the raw cipher directly from SQLite.
    const row = getDb()
      .prepare(`SELECT blob_cipher FROM souls WHERE token_id = ?`)
      .get("3") as { blob_cipher: string };

    expect(row.blob_cipher).not.toContain(knownSummary);
    // Also confirm decoded base64 buffer doesn't have it as UTF-8 text.
    const raw = Buffer.from(row.blob_cipher, "base64").toString("utf8");
    expect(raw).not.toContain(knownSummary);
  });
});

describe("soulStore — getCached", () => {
  it("returns cached fields without needing to decrypt", () => {
    const doc = makeDoc("4");
    saveSoulDoc("4", "0xWallet", doc, CACHED);
    const cached = getCached("4");
    expect(cached).not.toBeNull();
    expect(cached!.ownerWallet).toBe("0xwallet");
    expect(cached!.depthCached).toBeCloseTo(42.5);
    expect(cached!.soulAgeDays).toBe(7);
    expect(cached!.pastLivesCount).toBe(1);
    expect(cached!.blobHash).toBe(soulHash(doc));
    expect(cached!.updatedAt).toBeGreaterThan(0);
  });

  it("returns null when tokenId has no row", () => {
    expect(getCached("no-such-token")).toBeNull();
  });
});

describe("soulStore — setOwner", () => {
  it("updates the owner wallet for an existing row", () => {
    const doc = makeDoc("5");
    saveSoulDoc("5", "0xOldOwner", doc, CACHED);
    setOwner("5", "0xNewOwner");
    const cached = getCached("5");
    expect(cached!.ownerWallet).toBe("0xnewowner");
  });

  it("lowercases the wallet address on setOwner", () => {
    const doc = makeDoc("6");
    saveSoulDoc("6", null, doc, CACHED);
    setOwner("6", "0xMIXEDCASEWALLET");
    expect(getCached("6")!.ownerWallet).toBe("0xmixedcasewallet");
  });
});

describe("soulStore — recordSeal / getSeals", () => {
  it("persists a seal record and retrieves it", () => {
    const doc = makeDoc("7");
    const hash = soulHash(doc);
    saveSoulDoc("7", "0xSeller", doc, CACHED);
    recordSeal({
      tokenId: "7",
      ownerWallet: "0xSeller",
      blobHash: hash,
      depth: 42.5,
      soulAgeDays: 7,
      txHash: "0xdeadbeef",
      blockNumber: 123456,
    });
    const seals = getSeals("7");
    expect(seals.length).toBe(1);
    const s = seals[0];
    expect(s.tokenId).toBe("7");
    expect(s.ownerWallet).toBe("0xseller");
    expect(s.blobHash).toBe(hash);
    expect(s.depth).toBeCloseTo(42.5);
    expect(s.soulAgeDays).toBe(7);
    expect(s.txHash).toBe("0xdeadbeef");
    expect(s.blockNumber).toBe(123456);
    expect(s.sealedAt).toBeGreaterThan(0);
  });

  it("returns empty array for a tokenId with no seals", () => {
    expect(getSeals("no-seals-token")).toEqual([]);
  });

  it("orders multiple seals newest first", async () => {
    saveSoulDoc("8", null, makeDoc("8"), CACHED);
    recordSeal({ tokenId: "8", txHash: "0xfirst" });
    // Small delay to ensure different sealed_at ms values.
    await new Promise((r) => setTimeout(r, 5));
    recordSeal({ tokenId: "8", txHash: "0xsecond" });
    await new Promise((r) => setTimeout(r, 5));
    recordSeal({ tokenId: "8", txHash: "0xthird" });
    const seals = getSeals("8");
    expect(seals.length).toBe(3);
    expect(seals[0].txHash).toBe("0xthird");
    expect(seals[1].txHash).toBe("0xsecond");
    expect(seals[2].txHash).toBe("0xfirst");
  });

  it("does not mix seals across different tokenIds", () => {
    saveSoulDoc("9", null, makeDoc("9"), CACHED);
    saveSoulDoc("10", null, makeDoc("10"), CACHED);
    recordSeal({ tokenId: "9", txHash: "0xnine" });
    recordSeal({ tokenId: "10", txHash: "0xten" });
    expect(getSeals("9").map((s) => s.txHash)).toEqual(["0xnine"]);
    expect(getSeals("10").map((s) => s.txHash)).toEqual(["0xten"]);
  });
});
