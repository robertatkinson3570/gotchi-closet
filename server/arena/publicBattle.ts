import { archetypeFor, roastSystemPrompt, roastLineUser, judgeSystemPrompt, judgeUser } from "../../src/lib/roast/prompts";
import { parseVerdict } from "../../src/lib/roast/judge";
import { templateBurn } from "../../src/lib/roast/templates";
import { fetchPublicGotchi } from "./publicState";
import { getCachedBattle, putCachedBattle, bumpDailyBattles } from "./arenaCache";
import { complete } from "../companion/llmProvider";
import { screenOutbound } from "../../src/lib/companion/contentFilter";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface TranscriptLine {
  side: "a" | "b";
  round: number;
  text: string;
}

export interface BattleResult {
  a: { token: string; name: string };
  b: { token: string; name: string };
  transcript: TranscriptLine[];
  verdict: string;
  winnerToken: string;
  aScore: number;
  bScore: number;
  cached: boolean;
}

export interface BattleError {
  error: string;
}

// ---------------------------------------------------------------------------
// publicBattle
// ---------------------------------------------------------------------------

export async function publicBattle(
  tokenA: string,
  tokenB: string
): Promise<BattleResult | BattleError> {
  // Canonical pair key — order-independent so A/B swap hits the same cache row
  const pairKey = [tokenA, tokenB].sort().join("-");

  // 1. Cache hit
  const cached = getCachedBattle(pairKey);
  if (cached) {
    const transcript: TranscriptLine[] = JSON.parse(cached.transcript);
    // The cache always stores as sorted (aToken = sorted[0], bToken = sorted[1]).
    // Remap side labels so the caller's requested A is always "a".
    const flipped = cached.aToken !== tokenA;
    const remapped: TranscriptLine[] = flipped
      ? transcript.map((l) => ({ ...l, side: l.side === "a" ? "b" : "a" }))
      : transcript;
    return {
      a: { token: tokenA, name: flipped ? cached.bToken : cached.aToken },
      b: { token: tokenB, name: flipped ? cached.aToken : cached.bToken },
      transcript: remapped,
      verdict: cached.verdict,
      winnerToken: cached.winnerToken,
      aScore: flipped ? cached.bScore : cached.aScore,
      bScore: flipped ? cached.aScore : cached.bScore,
      cached: true,
    };
  }

  // 2. Daily rate cap
  const over = bumpDailyBattles(500);
  if (over) {
    return { error: "the arena is resting — come back tomorrow 👻" };
  }

  // 3. Fetch gotchi data
  const [gotchiA, gotchiB] = await Promise.all([
    fetchPublicGotchi(tokenA),
    fetchPublicGotchi(tokenB),
  ]);
  if (!gotchiA || !gotchiB) {
    return { error: "gotchi not found" };
  }

  const aName = gotchiA.name;
  const bName = gotchiB.name;
  const aArch = archetypeFor(gotchiA.traits);
  const bArch = archetypeFor(gotchiB.traits);

  // 4. Run 3 rounds — A then B each round (6 lines total)
  const transcript: TranscriptLine[] = [];
  const aLines: string[] = [];
  const bLines: string[] = [];
  let lineIdx = 0;

  for (let round = 1; round <= 3; round++) {
    // A's turn
    const aRaw = await complete(
      roastSystemPrompt(aName, aArch),
      [{ role: "user", content: roastLineUser(bName, bArch, [...aLines, ...bLines]) }],
      "free"
    );
    const aText = aRaw ? screenOutbound(aRaw) : templateBurn(aArch, bName, lineIdx);
    aLines.push(aText);
    transcript.push({ side: "a", round, text: aText });
    lineIdx++;

    // B's turn
    const bRaw = await complete(
      roastSystemPrompt(bName, bArch),
      [{ role: "user", content: roastLineUser(aName, aArch, [...bLines, ...aLines]) }],
      "free"
    );
    const bText = bRaw ? screenOutbound(bRaw) : templateBurn(bArch, aName, lineIdx);
    bLines.push(bText);
    transcript.push({ side: "b", round, text: bText });
    lineIdx++;
  }

  // 5. Judge
  const rawJudge = await complete(
    judgeSystemPrompt(),
    [{ role: "user", content: judgeUser(aName, bName, aLines, bLines) }],
    "free"
  );
  const v = parseVerdict(rawJudge, aName, bName, aLines, bLines);
  const winnerToken = v.winner === "a" ? tokenA : tokenB;

  // 6. Persist — always store with sorted token order (aToken = sorted[0])
  const [sortedA, sortedB] = [tokenA, tokenB].sort();
  const isCanonical = sortedA === tokenA;
  putCachedBattle({
    pairKey,
    aToken: sortedA,
    bToken: sortedB,
    // Remap transcript to canonical order before storing
    transcript: JSON.stringify(
      isCanonical
        ? transcript
        : transcript.map((l) => ({ ...l, side: l.side === "a" ? "b" : "a" }))
    ),
    verdict: v.verdict,
    winnerToken,
    aScore: isCanonical ? v.aScore : v.bScore,
    bScore: isCanonical ? v.bScore : v.aScore,
  });

  return {
    a: { token: tokenA, name: aName },
    b: { token: tokenB, name: bName },
    transcript,
    verdict: v.verdict,
    winnerToken,
    aScore: v.aScore,
    bScore: v.bScore,
    cached: false,
  };
}
