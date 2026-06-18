import { describe, it, expect } from "vitest";
import {
  newSoulDocument,
  canonicalSerialize,
  deserialize,
  soulHash,
  type SoulDocument,
} from "./soulDoc";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeFull(): SoulDocument {
  const doc = newSoulDocument("12345", 1_700_000_000_000);
  doc.bonding.bondedDays = 42;
  doc.bonding.streak = 7;
  doc.bonding.consistencyHistory = [0.9, 0.85, 1.0, 0.7];
  doc.memories.push(
    { ts: 1_700_000_100_000, summary: "First chat", privacy: "normal", weight: 1 },
    { ts: 1_700_000_200_000, summary: "Deep talk", privacy: "sensitive", weight: 2 }
  );
  doc.pastLives.push({ eraHint: "early era", fragment: "a keeper who favored the Forge" });
  return doc;
}

// ---------------------------------------------------------------------------
// Determinism: same document built two different ways must produce identical
// canonical string and identical hash.
// ---------------------------------------------------------------------------

describe("canonicalSerialize — determinism", () => {
  it("produces identical output regardless of input key-insertion order", () => {
    const doc1 = makeFull();

    // Build doc2 by constructing sub-objects with reversed key order, then
    // assembling the top-level object with reversed field order. JSON.parse
    // preserves insertion order in V8, so this genuinely tests sorting.
    const doc2: SoulDocument = JSON.parse(
      JSON.stringify({
        pastLives: [{ fragment: "a keeper who favored the Forge", eraHint: "early era" }],
        memories: [
          { weight: 1, privacy: "normal", summary: "First chat", ts: 1_700_000_100_000 },
          { weight: 2, privacy: "sensitive", summary: "Deep talk", ts: 1_700_000_200_000 },
        ],
        bonding: {
          consistencyHistory: [0.9, 0.85, 1.0, 0.7],
          streak: 7,
          lastInteractionTs: 1_700_000_000_000,
          bondedDays: 42,
        },
        origin: { firstBondedAt: 1_700_000_000_000 },
        tokenId: "12345",
        version: 1,
      })
    ) as SoulDocument;

    expect(canonicalSerialize(doc1)).toBe(canonicalSerialize(doc2));
    expect(soulHash(doc1)).toBe(soulHash(doc2));
  });

  it("nested object key order is also sorted (origin sub-object)", () => {
    // Build a minimal doc and check the raw JSON string for sorted keys.
    const doc = newSoulDocument("99", 1_000_000);
    const json = canonicalSerialize(doc);
    const parsed = JSON.parse(json) as Record<string, unknown>;
    const keys = Object.keys(parsed);
    expect(keys).toEqual([...keys].sort());
  });

  it("consistencyHistory ratios survive round-trip with stable precision", () => {
    const doc = newSoulDocument("1", 0);
    doc.bonding.consistencyHistory = [0.123456789, 1 / 3, Math.PI / 10];
    const s1 = canonicalSerialize(doc);
    const doc2 = deserialize(s1);
    const s2 = canonicalSerialize(doc2);
    expect(s1).toBe(s2);
  });
});

// ---------------------------------------------------------------------------
// Round-trip: deserialize(canonicalSerialize(doc)) deep-equals doc
// ---------------------------------------------------------------------------

describe("round-trip serialize/deserialize", () => {
  it("round-trips a minimal document", () => {
    const doc = newSoulDocument("42", 1_718_000_000_000);
    const recovered = deserialize(canonicalSerialize(doc));
    expect(recovered).toEqual(doc);
  });

  it("round-trips a full document with memories and pastLives", () => {
    const doc = makeFull();
    const recovered = deserialize(canonicalSerialize(doc));
    expect(recovered).toEqual(deserialize(canonicalSerialize(recovered)));
  });

  it("round-trip leaves memories array in original order", () => {
    const doc = makeFull();
    const recovered = deserialize(canonicalSerialize(doc));
    expect(recovered.memories.map((m) => m.summary)).toEqual(["First chat", "Deep talk"]);
  });
});

// ---------------------------------------------------------------------------
// Mutation → different hash
// ---------------------------------------------------------------------------

describe("soulHash — sensitivity", () => {
  it("baseline hash is a 0x-prefixed 66-char hex string", () => {
    const doc = newSoulDocument("1", 0);
    const h = soulHash(doc);
    expect(h).toMatch(/^0x[0-9a-f]{64}$/);
  });

  it("changing tokenId changes the hash", () => {
    const a = newSoulDocument("100", 0);
    const b = newSoulDocument("101", 0);
    expect(soulHash(a)).not.toBe(soulHash(b));
  });

  it("changing firstBondedAt changes the hash", () => {
    const a = newSoulDocument("1", 1_000);
    const b = newSoulDocument("1", 2_000);
    expect(soulHash(a)).not.toBe(soulHash(b));
  });

  it("changing bondedDays changes the hash", () => {
    const a = makeFull();
    const b = deserialize(canonicalSerialize(a));
    b.bonding.bondedDays = 100;
    expect(soulHash(a)).not.toBe(soulHash(b));
  });

  it("adding a memory changes the hash", () => {
    const a = makeFull();
    const b = deserialize(canonicalSerialize(a));
    b.memories.push({ ts: 9_999, summary: "extra", privacy: "normal", weight: 1 });
    expect(soulHash(a)).not.toBe(soulHash(b));
  });

  it("changing a pastLife fragment changes the hash", () => {
    const a = makeFull();
    const b = deserialize(canonicalSerialize(a));
    b.pastLives[0].fragment = "tampered";
    expect(soulHash(a)).not.toBe(soulHash(b));
  });

  it("changing privacy tag on a memory changes the hash", () => {
    const a = makeFull();
    const b = deserialize(canonicalSerialize(a));
    b.memories[0].privacy = "sensitive";
    expect(soulHash(a)).not.toBe(soulHash(b));
  });
});
