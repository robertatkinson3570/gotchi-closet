import { describe, it, expect, beforeEach, vi, type MockedFunction } from "vitest";
import fs from "node:fs";
import path from "node:path";

// ---------------------------------------------------------------------------
// Set DB path BEFORE any module that touches the DB is imported.
// ---------------------------------------------------------------------------
const TMP = path.resolve("./data/transfer-test.db");
process.env.COMPANION_DB_PATH = TMP;

// ---------------------------------------------------------------------------
// Mock external I/O BEFORE importing transfer.ts
// ---------------------------------------------------------------------------
vi.mock("../companion/llmProvider", () => ({
  complete: vi.fn(),
}));

vi.mock("../companion/gotchiState", () => ({
  fetchGotchiState: vi.fn(),
}));

import { closeDb } from "../companion/db";
import { complete } from "../companion/llmProvider";
import { fetchGotchiState } from "../companion/gotchiState";
import { newSoulDocument, type Episode, type SoulDocument } from "./soulDoc";
import { getSoulDoc, saveSoulDoc, getCached } from "./soulStore";
import { distillToEchoes, onTransfer, reconcileSoul } from "./transfer";

const mockComplete = complete as MockedFunction<typeof complete>;
const mockFetchGotchiState = fetchGotchiState as MockedFunction<typeof fetchGotchiState>;

// ---------------------------------------------------------------------------
// Test isolation: wipe DB before every test
// ---------------------------------------------------------------------------
beforeEach(() => {
  closeDb();
  for (const f of [TMP, `${TMP}-wal`, `${TMP}-shm`]) {
    if (fs.existsSync(f)) fs.rmSync(f);
  }
  vi.clearAllMocks();
  // Default: LLM returns a safe third-person fragment
  mockComplete.mockResolvedValue("a past keeper wandered in shadow…");
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeDoc(tokenId = "99", extras?: Partial<SoulDocument>): SoulDocument {
  const doc = newSoulDocument(tokenId, Date.now() - 10 * 86_400_000);
  doc.bonding.bondedDays = 10;
  doc.bonding.streak = 7;
  doc.bonding.consistencyHistory = [0.8, 0.9, 1.0];
  doc.bonding.lastInteractionTs = Date.now() - 1000;
  return Object.assign(doc, extras);
}

const CACHED_BASE = { depth: 30, soulAgeDays: 10, pastLivesCount: 0 };

// ---------------------------------------------------------------------------
// distillToEchoes — PII scrub + privacy
// ---------------------------------------------------------------------------

describe("distillToEchoes — PII scrub", () => {
  it("removes 0x wallet address from echo fragment", async () => {
    const memories: Episode[] = [
      { ts: Date.now(), summary: "They sent 5 GHST to 0xAbcdef1234567890abcdef1234567890abcdef12.", privacy: "normal", weight: 1 },
    ];
    const echoes = await distillToEchoes(memories);
    expect(echoes.length).toBe(1);
    // The wallet address must not appear anywhere in the fragment
    expect(echoes[0].fragment).not.toMatch(/0x[0-9a-fA-F]{6,}/i);
  });

  it("removes capitalized proper name tokens from echo fragment", async () => {
    // LLM mock returns the scrubbed input so we can inspect what Layer 1 produced
    mockComplete.mockImplementation(async (_sys, msgs) => {
      // Echo back what was sent so we can check Layer 1 output
      const content = (msgs[0] as { role: string; content: string }).content;
      return `a past keeper: ${content}`;
    });
    const memories: Episode[] = [
      { ts: Date.now(), summary: "Alice visited the Forge today.", privacy: "normal", weight: 1 },
    ];
    const echoes = await distillToEchoes(memories);
    expect(echoes[0].fragment).not.toContain("Alice");
  });

  it("removes phone-like long digit runs", async () => {
    mockComplete.mockImplementation(async (_sys, msgs) => {
      const content = (msgs[0] as { role: string; content: string }).content;
      return `a past keeper: ${content}`;
    });
    const memories: Episode[] = [
      { ts: Date.now(), summary: "Called them at 5551234567 last night.", privacy: "normal", weight: 1 },
    ];
    const echoes = await distillToEchoes(memories);
    expect(echoes[0].fragment).not.toContain("5551234567");
  });

  it("removes @handle references", async () => {
    mockComplete.mockImplementation(async (_sys, msgs) => {
      const content = (msgs[0] as { role: string; content: string }).content;
      return `a past keeper: ${content}`;
    });
    const memories: Episode[] = [
      { ts: Date.now(), summary: "Sent a message to @CryptoWhale about the portal.", privacy: "normal", weight: 1 },
    ];
    const echoes = await distillToEchoes(memories);
    expect(echoes[0].fragment).not.toContain("@CryptoWhale");
  });

  it("drops sensitive episodes entirely — they produce no echoes", async () => {
    const memories: Episode[] = [
      { ts: Date.now(), summary: "Normal memory about the Forge.", privacy: "normal", weight: 1 },
      { ts: Date.now(), summary: "Secret: wallet seed phrase is hunters2.", privacy: "sensitive", weight: 1 },
    ];
    const echoes = await distillToEchoes(memories);
    // Only 1 echo — the sensitive one is dropped
    expect(echoes.length).toBe(1);
    // The sensitive content must not appear anywhere
    for (const echo of echoes) {
      expect(echo.fragment).not.toContain("seed phrase");
      expect(echo.fragment).not.toContain("hunters2");
    }
  });

  it("produces no echoes from an all-sensitive list", async () => {
    const memories: Episode[] = [
      { ts: Date.now(), summary: "Private stuff 1.", privacy: "sensitive", weight: 1 },
      { ts: Date.now(), summary: "Private stuff 2.", privacy: "sensitive", weight: 2 },
    ];
    const echoes = await distillToEchoes(memories);
    expect(echoes.length).toBe(0);
  });

  it("produces no echoes from an empty list", async () => {
    const echoes = await distillToEchoes([]);
    expect(echoes.length).toBe(0);
  });

  it("echo fragments are third-person — no first-person 'I ' or 'my '", async () => {
    mockComplete.mockResolvedValue("a past keeper once wandered in the dark.");
    const memories: Episode[] = [
      { ts: Date.now(), summary: "I walked through the portal with my gotchi.", privacy: "normal", weight: 1 },
    ];
    const echoes = await distillToEchoes(memories);
    for (const echo of echoes) {
      expect(echo.fragment).not.toMatch(/\bI\b/);
      expect(echo.fragment).not.toMatch(/\bmy\b/i);
    }
  });

  it("falls back to a generic fragment when LLM returns null", async () => {
    mockComplete.mockResolvedValue(null);
    const memories: Episode[] = [
      { ts: Date.now(), summary: "Normal memory.", privacy: "normal", weight: 1 },
    ];
    const echoes = await distillToEchoes(memories);
    expect(echoes.length).toBe(1);
    expect(echoes[0].fragment.length).toBeGreaterThan(0);
    // Should be the fallback string
    expect(echoes[0].fragment).toContain("past keeper");
  });

  it("all echoes carry eraHint 'a past life'", async () => {
    const memories: Episode[] = [
      { ts: Date.now(), summary: "Normal memory.", privacy: "normal", weight: 1 },
      { ts: Date.now(), summary: "Another memory.", privacy: "normal", weight: 1 },
    ];
    const echoes = await distillToEchoes(memories);
    for (const echo of echoes) {
      expect(echo.eraHint).toBe("a past life");
    }
  });

  it("caps echoes at 12 and blurs overflow into first echo", async () => {
    const memories: Episode[] = Array.from({ length: 15 }, (_, i) => ({
      ts: Date.now() + i,
      summary: `Memory number ${i + 1}.`,
      privacy: "normal" as const,
      weight: 1,
    }));
    const echoes = await distillToEchoes(memories);
    expect(echoes.length).toBeLessThanOrEqual(12);
    // The blur echo covers the overflow
    expect(echoes[0].eraHint).toMatch(/keeper|past/i);
  });

  it("seeded wallet + name + number + handle ALL absent from any echo fragment", async () => {
    // Return the scrubbed text so we can inspect Layer 1 output via Layer 2
    mockComplete.mockImplementation(async (_sys, msgs) => {
      const content = (msgs[0] as { role: string; content: string }).content;
      return `past keeper recalls: ${content}`;
    });

    const wallet = "0xDeAdBeEf1234567890abcdef1234567890AbCdEf";
    const name = "Alice";
    const phone = "5551234567";
    const handle = "@CryptoGhost";

    const memories: Episode[] = [
      {
        ts: Date.now(),
        summary: `${name} sent 10 GHST from ${wallet} and texted ${handle} at ${phone}.`,
        privacy: "normal",
        weight: 1,
      },
    ];
    const echoes = await distillToEchoes(memories);
    expect(echoes.length).toBeGreaterThan(0);
    for (const echo of echoes) {
      expect(echo.fragment).not.toContain(wallet);
      expect(echo.fragment).not.toContain(wallet.toLowerCase());
      expect(echo.fragment).not.toContain(name);
      expect(echo.fragment).not.toContain(phone);
      expect(echo.fragment).not.toContain(handle);
      expect(echo.fragment).not.toContain("@CryptoGhost");
    }
  });
});

// ---------------------------------------------------------------------------
// onTransfer — state mutations + idempotency
// ---------------------------------------------------------------------------

describe("onTransfer — distillation, state mutation, and idempotency", () => {
  it("clears memories, grows pastLives, resets streak, preserves pedigree", async () => {
    const doc = makeDoc("42");
    doc.memories = [
      { ts: Date.now(), summary: "Normal memory about the Forge.", privacy: "normal", weight: 1 },
      { ts: Date.now(), summary: "Private thought.", privacy: "sensitive", weight: 1 },
    ];
    const firstBondedAt = doc.origin.firstBondedAt;
    const bondedDays = doc.bonding.bondedDays;
    saveSoulDoc("42", "0xoldowner", doc, CACHED_BASE);

    const result = await onTransfer("42", "0xNewOwner", 1000);
    expect(result).not.toBeNull();
    // 1 normal memory → 1 echo (sensitive dropped)
    expect(result!.distilled).toBe(1);

    const after = getSoulDoc("42");
    expect(after).not.toBeNull();

    // memories cleared
    expect(after!.memories).toEqual([]);

    // pastLives grew
    expect(after!.pastLives.length).toBeGreaterThan(0);

    // live-bond reset
    expect(after!.bonding.streak).toBe(0);
    expect(after!.bonding.consistencyHistory).toEqual([]);
    expect(after!.bonding.lastInteractionTs).toBe(0);

    // pedigree preserved
    expect(after!.origin.firstBondedAt).toBe(firstBondedAt);
    expect(after!.bonding.bondedDays).toBe(bondedDays);
  });

  it("is idempotent: calling onTransfer again with same (token,owner,block) returns null and does not double-distill", async () => {
    const doc = makeDoc("43");
    doc.memories = [
      { ts: Date.now(), summary: "A normal memory.", privacy: "normal", weight: 1 },
    ];
    saveSoulDoc("43", "0xold", doc, CACHED_BASE);

    const first = await onTransfer("43", "0xNewOwner", 2000);
    expect(first).not.toBeNull();
    expect(first!.distilled).toBe(1);

    const pastLivesAfterFirst = getSoulDoc("43")!.pastLives.length;

    const second = await onTransfer("43", "0xNewOwner", 2000);
    expect(second).toBeNull(); // idempotent — returns null

    const pastLivesAfterSecond = getSoulDoc("43")!.pastLives.length;
    expect(pastLivesAfterSecond).toBe(pastLivesAfterFirst); // no double-distill
  });

  it("returns { distilled: 0 } and does not throw for a soulless gotchi", async () => {
    const result = await onTransfer("nonexistent-999", "0xNewOwner", 3000);
    expect(result).toEqual({ distilled: 0 });
  });

  it("different block numbers are treated as distinct transfer events", async () => {
    const doc = makeDoc("44");
    doc.memories = [
      { ts: Date.now(), summary: "Another memory.", privacy: "normal", weight: 1 },
    ];
    saveSoulDoc("44", "0xold44", doc, CACHED_BASE);

    const r1 = await onTransfer("44", "0xA", 100);
    expect(r1).not.toBeNull();

    // Re-seed memories for the second transfer
    const doc2 = getSoulDoc("44")!;
    doc2.memories = [
      { ts: Date.now(), summary: "Post-transfer memory.", privacy: "normal", weight: 1 },
    ];
    saveSoulDoc("44", "0xA", doc2, CACHED_BASE);

    const r2 = await onTransfer("44", "0xB", 200);
    expect(r2).not.toBeNull();
    expect(r2!.distilled).toBe(1);
  });

  it("cached row is updated with new owner after transfer", async () => {
    const doc = makeDoc("45");
    doc.memories = [{ ts: Date.now(), summary: "A memory.", privacy: "normal", weight: 1 }];
    saveSoulDoc("45", "0xoldie", doc, CACHED_BASE);

    await onTransfer("45", "0xFreshOwner", 9999);

    const cached = getCached("45");
    expect(cached?.ownerWallet).toBe("0xfreshowner");
  });
});

// ---------------------------------------------------------------------------
// reconcileSoul — lazy transfer detection
// ---------------------------------------------------------------------------

describe("reconcileSoul", () => {
  it("triggers a transfer and returns true when on-chain owner differs from stored owner", async () => {
    const doc = makeDoc("50");
    doc.memories = [{ ts: Date.now(), summary: "A normal memory.", privacy: "normal", weight: 1 }];
    saveSoulDoc("50", "0xoriginalowner", doc, CACHED_BASE);

    // Mock: on-chain reports a different owner
    mockFetchGotchiState.mockResolvedValue({
      name: "Ghosty",
      numericTraits: [50, 50, 50, 50, 0, 0],
      equippedWearables: [],
      owner: "0xnewowner",
    });

    const result = await reconcileSoul("50");
    expect(result).toBe(true);

    // After reconcile the soul should be cleared of memories and under new owner
    const after = getSoulDoc("50");
    expect(after!.memories).toEqual([]);
    expect(getCached("50")?.ownerWallet).toBe("0xnewowner");
  });

  it("returns false and does nothing when owner is the same", async () => {
    const doc = makeDoc("51");
    doc.memories = [{ ts: Date.now(), summary: "A memory.", privacy: "normal", weight: 1 }];
    saveSoulDoc("51", "0xsameowner", doc, CACHED_BASE);

    mockFetchGotchiState.mockResolvedValue({
      name: "Ghosty",
      numericTraits: [50, 50, 50, 50, 0, 0],
      equippedWearables: [],
      owner: "0xsameowner",
    });

    const result = await reconcileSoul("51");
    expect(result).toBe(false);

    // Memories untouched
    const after = getSoulDoc("51");
    expect(after!.memories.length).toBe(1);
  });

  it("returns false when no soul row exists", async () => {
    mockFetchGotchiState.mockResolvedValue({
      name: "Ghost",
      numericTraits: [50, 50, 50, 50, 0, 0],
      equippedWearables: [],
      owner: "0xsomeone",
    });

    const result = await reconcileSoul("no-soul-token");
    expect(result).toBe(false);
  });

  it("returns false when gotchiState returns null", async () => {
    const doc = makeDoc("52");
    saveSoulDoc("52", "0xowner52", doc, CACHED_BASE);
    mockFetchGotchiState.mockResolvedValue(null);

    const result = await reconcileSoul("52");
    expect(result).toBe(false);
  });

  it("returns false when stored owner is null (soul created before first owner known)", async () => {
    const doc = makeDoc("53");
    saveSoulDoc("53", null, doc, CACHED_BASE);

    mockFetchGotchiState.mockResolvedValue({
      name: "Ghost",
      numericTraits: [50, 50, 50, 50, 0, 0],
      equippedWearables: [],
      owner: "0xsomeone",
    });

    // stored ownerWallet is null — should not trigger transfer
    const result = await reconcileSoul("53");
    expect(result).toBe(false);
  });
});
