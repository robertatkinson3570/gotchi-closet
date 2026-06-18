import { describe, it, expect, vi, beforeEach } from "vitest";
import { resolveBattle } from "./engine";

// ---------------------------------------------------------------------------
// Mock heavy I/O deps
// ---------------------------------------------------------------------------

vi.mock("../companion/gotchiState", () => ({
  fetchGotchiState: vi.fn(),
}));

vi.mock("../companion/llmProvider", () => ({
  complete: vi.fn(),
}));

vi.mock("../companion/db", () => ({
  burnCredit: vi.fn().mockReturnValue(true),
}));

vi.mock("./store", () => ({
  insertBattle: vi.fn().mockReturnValue(42),
  recordResult: vi.fn(),
  recentBattleCount: vi.fn().mockReturnValue(0),
}));

// ---------------------------------------------------------------------------
// Import mocked modules so we can control them per-test
// ---------------------------------------------------------------------------

import { fetchGotchiState } from "../companion/gotchiState";
import { complete } from "../companion/llmProvider";
import { burnCredit } from "../companion/db";
import { insertBattle, recordResult, recentBattleCount } from "./store";

// Typed handles
const mockFetch = vi.mocked(fetchGotchiState);
const mockComplete = vi.mocked(complete);
const mockBurnCredit = vi.mocked(burnCredit);
const mockInsertBattle = vi.mocked(insertBattle);
const mockRecordResult = vi.mocked(recordResult);
const mockRecentBattleCount = vi.mocked(recentBattleCount);

// ---------------------------------------------------------------------------
// Shared fixtures
// ---------------------------------------------------------------------------

const stateA = {
  name: "GhostA",
  numericTraits: [50, 80, 50, 50, 0, 0], // AGG=80 → Gladiator
  equippedWearables: [],
};

const stateB = {
  name: "GhostB",
  numericTraits: [50, 20, 50, 50, 0, 0], // AGG=20 → Zen
  equippedWearables: [],
};

const sideA = { tokenId: "1", wallet: "0xaaa", premiumEligible: false };
const sideB = { tokenId: "2", wallet: "0xbbb", premiumEligible: false };

const JUDGE_JSON = JSON.stringify({ winner: "a", aScore: 70, bScore: 45, verdict: "GhostA dominates." });

beforeEach(() => {
  vi.clearAllMocks();
  mockFetch.mockResolvedValueOnce(stateA as any).mockResolvedValueOnce(stateB as any);
  mockInsertBattle.mockReturnValue(42);
  mockRecentBattleCount.mockReturnValue(0);
});

// ---------------------------------------------------------------------------
// 1. Happy path — both free
// ---------------------------------------------------------------------------

describe("happy path: both free", () => {
  it("produces 6 transcript lines, correct winner, inserts one battle, records both results; burnCredit NOT called", async () => {
    // 6 roast lines then judge
    mockComplete
      .mockResolvedValueOnce("line a1")
      .mockResolvedValueOnce("line b1")
      .mockResolvedValueOnce("line a2")
      .mockResolvedValueOnce("line b2")
      .mockResolvedValueOnce("line a3")
      .mockResolvedValueOnce("line b3")
      .mockResolvedValueOnce(JUDGE_JSON); // judge

    const result = await resolveBattle(sideA, sideB);

    expect(result.transcript).toHaveLength(6);
    // sides alternate a,b,a,b,a,b
    expect(result.transcript.map((t) => t.side)).toEqual(["a","b","a","b","a","b"]);
    // rounds 1,1,2,2,3,3
    expect(result.transcript.map((t) => t.round)).toEqual([1,1,2,2,3,3]);

    expect(result.winnerToken).toBe("1"); // winner="a" → tokenId "1"
    expect(result.battleId).toBe(42);
    expect(result.aScore).toBe(70);
    expect(result.bScore).toBe(45);
    expect(result.verdict).toBe("GhostA dominates.");

    expect(mockInsertBattle).toHaveBeenCalledTimes(1);
    expect(mockRecordResult).toHaveBeenCalledTimes(2);

    // winner wins, loser loses, both full XP (multiplier=1)
    expect(mockRecordResult).toHaveBeenCalledWith("1", "0xaaa", "GhostA", true, 100);
    expect(mockRecordResult).toHaveBeenCalledWith("2", "0xbbb", "GhostB", false, 20);

    expect(mockBurnCredit).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// 2. Premium side A: burnCredit called once per A line (3 times)
// ---------------------------------------------------------------------------

describe("premium side A", () => {
  it("burns a credit for each of A's 3 premium lines; free side B never burns", async () => {
    const aPremium = { ...sideA, premiumEligible: true };

    // complete is called: A-r1(premium), B-r1(free), A-r2(premium), B-r2(free), A-r3(premium), B-r3(free), judge
    mockComplete
      .mockResolvedValueOnce("a premium 1")   // A round 1 premium
      .mockResolvedValueOnce("b free 1")       // B round 1 free
      .mockResolvedValueOnce("a premium 2")   // A round 2 premium
      .mockResolvedValueOnce("b free 2")       // B round 2 free
      .mockResolvedValueOnce("a premium 3")   // A round 3 premium
      .mockResolvedValueOnce("b free 3")       // B round 3 free
      .mockResolvedValueOnce(JUDGE_JSON);       // judge

    await resolveBattle(aPremium, sideB);

    expect(mockBurnCredit).toHaveBeenCalledTimes(3);
    expect(mockBurnCredit).toHaveBeenCalledWith("0xaaa");
  });
});

// ---------------------------------------------------------------------------
// 3. Premium returns null → falls back to free; burnCredit NOT called for those
// ---------------------------------------------------------------------------

describe("premium returns null → fallback to free", () => {
  it("does not burn credit when premium call returns null", async () => {
    const aPremium = { ...sideA, premiumEligible: true };

    // For each of A's 3 turns: premium returns null, then free returns text.
    // B's 3 turns: free returns text directly.
    mockComplete
      .mockResolvedValueOnce(null)          // A r1 premium → null
      .mockResolvedValueOnce("a free 1")    // A r1 free fallback
      .mockResolvedValueOnce("b free 1")    // B r1
      .mockResolvedValueOnce(null)          // A r2 premium → null
      .mockResolvedValueOnce("a free 2")    // A r2 free fallback
      .mockResolvedValueOnce("b free 2")    // B r2
      .mockResolvedValueOnce(null)          // A r3 premium → null
      .mockResolvedValueOnce("a free 3")    // A r3 free fallback
      .mockResolvedValueOnce("b free 3")    // B r3
      .mockResolvedValueOnce(JUDGE_JSON);   // judge

    const result = await resolveBattle(aPremium, sideB);

    expect(mockBurnCredit).not.toHaveBeenCalled();
    expect(result.transcript).toHaveLength(6);
    expect(result.transcript[0].text).toBe("a free 1");
  });
});

// ---------------------------------------------------------------------------
// 4. LLM fully null → templateBurn fallback (non-empty lines)
// ---------------------------------------------------------------------------

describe("LLM fully null → template fallback", () => {
  it("produces non-empty lines from templateBurn when all complete() calls return null", async () => {
    // All 7 calls return null
    mockComplete.mockResolvedValue(null);

    const result = await resolveBattle(sideA, sideB);

    expect(result.transcript).toHaveLength(6);
    for (const line of result.transcript) {
      expect(line.text.length).toBeGreaterThan(0);
    }
    expect(mockBurnCredit).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// 5. Judge raw null → deterministic fallback still yields a winner; battle persists
// ---------------------------------------------------------------------------

describe("judge raw null → deterministic fallback", () => {
  it("still inserts battle and records results when judge returns null", async () => {
    // Give A longer lines so fallback gives winner="a"
    mockComplete
      .mockResolvedValueOnce("a very long line with lots of words here to beat b")
      .mockResolvedValueOnce("b short")
      .mockResolvedValueOnce("a another long line for side a to stay ahead clearly")
      .mockResolvedValueOnce("b short again")
      .mockResolvedValueOnce("a one more long burn from side a to ensure victory now")
      .mockResolvedValueOnce("b small")
      .mockResolvedValueOnce(null); // judge → null → fallback

    const result = await resolveBattle(sideA, sideB);

    expect(result.winnerToken).toBe("1"); // A has more chars → "a" wins
    expect(mockInsertBattle).toHaveBeenCalledTimes(1);
    expect(mockRecordResult).toHaveBeenCalledTimes(2);
    expect(result.verdict).toContain("wordier");
  });
});

// ---------------------------------------------------------------------------
// 6. Self-battle: both XP = 0; recordResult called with xpDelta=0
// ---------------------------------------------------------------------------

describe("self-battle (same wallet)", () => {
  it("records xpDelta=0 for both sides when wallets match", async () => {
    const sameWalletA = { tokenId: "1", wallet: "0xsame", premiumEligible: false };
    const sameWalletB = { tokenId: "2", wallet: "0xsame", premiumEligible: false };

    mockFetch.mockReset();
    mockFetch
      .mockResolvedValueOnce(stateA as any)
      .mockResolvedValueOnce(stateB as any);

    mockComplete
      .mockResolvedValueOnce("a1").mockResolvedValueOnce("b1")
      .mockResolvedValueOnce("a2").mockResolvedValueOnce("b2")
      .mockResolvedValueOnce("a3").mockResolvedValueOnce("b3")
      .mockResolvedValueOnce(JUDGE_JSON);

    const result = await resolveBattle(sameWalletA, sameWalletB);

    expect(result.aXp).toBe(0);
    expect(result.bXp).toBe(0);

    // recordResult called with xpDelta=0 for both
    const calls = mockRecordResult.mock.calls;
    expect(calls).toHaveLength(2);
    expect(calls[0][4]).toBe(0);
    expect(calls[1][4]).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// 7. Anti-grind: recentBattleCount=1 → winner xp halved (50), loser (10)
// ---------------------------------------------------------------------------

describe("anti-grind: recent=1 → multiplier=0.5", () => {
  it("halves winner XP to 50 and loser XP to 10", async () => {
    mockRecentBattleCount.mockReturnValue(1);

    mockComplete
      .mockResolvedValueOnce("a1").mockResolvedValueOnce("b1")
      .mockResolvedValueOnce("a2").mockResolvedValueOnce("b2")
      .mockResolvedValueOnce("a3").mockResolvedValueOnce("b3")
      .mockResolvedValueOnce(JUDGE_JSON); // winner="a"

    const result = await resolveBattle(sideA, sideB);

    expect(result.aXp).toBe(50);  // floor(100 * 0.5)
    expect(result.bXp).toBe(10);  // floor(20 * 0.5)

    expect(mockRecordResult).toHaveBeenCalledWith("1", "0xaaa", "GhostA", true, 50);
    expect(mockRecordResult).toHaveBeenCalledWith("2", "0xbbb", "GhostB", false, 10);
  });
});

// ---------------------------------------------------------------------------
// 8. Anti-grind: recentBattleCount=2 → multiplier=0, both XP=0
// ---------------------------------------------------------------------------

describe("anti-grind: recent=2 → multiplier=0", () => {
  it("zeroes both XP when pair has 2+ recent battles", async () => {
    mockRecentBattleCount.mockReturnValue(2);

    mockComplete
      .mockResolvedValueOnce("a1").mockResolvedValueOnce("b1")
      .mockResolvedValueOnce("a2").mockResolvedValueOnce("b2")
      .mockResolvedValueOnce("a3").mockResolvedValueOnce("b3")
      .mockResolvedValueOnce(JUDGE_JSON);

    const result = await resolveBattle(sideA, sideB);

    expect(result.aXp).toBe(0);
    expect(result.bXp).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// 9. gotchi not found throws
// ---------------------------------------------------------------------------

describe("gotchi not found", () => {
  it("throws Error('gotchi not found') when fetchGotchiState returns null", async () => {
    mockFetch.mockReset();
    mockFetch.mockResolvedValueOnce(null);

    await expect(resolveBattle(sideA, sideB)).rejects.toThrow("gotchi not found");
  });
});
