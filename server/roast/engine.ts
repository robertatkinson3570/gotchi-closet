import { fetchGotchiState } from "../companion/gotchiState";
import { complete } from "../companion/llmProvider";
import { burnCredit } from "../companion/db";
import { insertBattle, recordResult, recentBattleCount } from "./store";
import { resolveEquippedTraits } from "../../src/lib/companion/personality";
import { screenOutbound } from "../../src/lib/companion/contentFilter";
import {
  archetypeFor,
  roastSystemPrompt,
  roastLineUser,
  judgeSystemPrompt,
  judgeUser,
} from "../../src/lib/roast/prompts";
import { parseVerdict } from "../../src/lib/roast/judge";
import { templateBurn } from "../../src/lib/roast/templates";
import { xpForResult } from "../../src/lib/roast/xp";
import type { RoastArchetype } from "../../src/lib/roast/types";

export interface BattleSide {
  tokenId: string;
  wallet: string;
  premiumEligible: boolean;
}

export interface BattleResult {
  battleId: number;
  winnerToken: string;
  verdict: string;
  transcript: { side: "a" | "b"; round: number; text: string }[];
  aScore: number;
  bScore: number;
  aXp: number;
  bXp: number;
}

/** Resolved data for one side of the battle. */
interface SideCtx {
  name: string;
  archetype: RoastArchetype;
  roastSys: string;
}

export async function resolveBattle(
  a: BattleSide,
  b: BattleSide
): Promise<BattleResult> {
  // 1. Fetch gotchi states
  const [stateA, stateB] = await Promise.all([
    fetchGotchiState(a.tokenId),
    fetchGotchiState(b.tokenId),
  ]);
  if (!stateA || !stateB) throw new Error("gotchi not found");

  // 2. Compute per-side context
  const traitsA = resolveEquippedTraits(stateA);
  const traitsB = resolveEquippedTraits(stateB);
  const ctxA: SideCtx = {
    name: stateA.name,
    archetype: archetypeFor(traitsA),
    roastSys: roastSystemPrompt(stateA.name, archetypeFor(traitsA)),
  };
  const ctxB: SideCtx = {
    name: stateB.name,
    archetype: archetypeFor(traitsB),
    roastSys: roastSystemPrompt(stateB.name, archetypeFor(traitsB)),
  };

  // 3. Generate 3 rounds × 2 sides = 6 lines
  const transcript: { side: "a" | "b"; round: number; text: string }[] = [];
  const priorLines: string[] = [];
  const aLines: string[] = [];
  const bLines: string[] = [];

  let lineIndex = 0;

  for (let round = 1; round <= 3; round++) {
    // Side A fires
    const lineA = await generateLine(
      a,
      ctxA,
      ctxB.name,
      ctxB.archetype,
      priorLines,
      lineIndex
    );
    transcript.push({ side: "a", round, text: lineA });
    priorLines.push(lineA);
    aLines.push(lineA);
    lineIndex++;

    // Side B fires
    const lineB = await generateLine(
      b,
      ctxB,
      ctxA.name,
      ctxA.archetype,
      priorLines,
      lineIndex
    );
    transcript.push({ side: "b", round, text: lineB });
    priorLines.push(lineB);
    bLines.push(lineB);
    lineIndex++;
  }

  // 4. Judge
  const rawJudge = await complete(
    judgeSystemPrompt(),
    [{ role: "user", content: judgeUser(ctxA.name, ctxB.name, aLines, bLines) }],
    "free"
  );
  const verdict = parseVerdict(rawJudge, ctxA.name, ctxB.name, aLines, bLines);
  const winnerToken = verdict.winner === "a" ? a.tokenId : b.tokenId;

  // 5. XP with anti-grind + self-battle rule
  let aXp = 0;
  let bXp = 0;

  if (a.wallet !== b.wallet) {
    const baseWinXp = xpForResult({ result: "win" });   // 100
    const baseLossXp = xpForResult({ result: "loss" }); // 20
    const recent = recentBattleCount(a.tokenId, b.tokenId, Date.now() - 3_600_000);
    const multiplier = recent === 0 ? 1 : recent === 1 ? 0.5 : 0;

    const winXp = Math.floor(baseWinXp * multiplier);
    const lossXp = Math.floor(baseLossXp * multiplier);

    if (verdict.winner === "a") {
      aXp = winXp;
      bXp = lossXp;
    } else {
      aXp = lossXp;
      bXp = winXp;
    }
  }

  // 6. Persist
  const battleId = insertBattle({
    aToken: a.tokenId,
    aName: ctxA.name,
    aWallet: a.wallet,
    bToken: b.tokenId,
    bName: ctxB.name,
    bWallet: b.wallet,
    winnerToken,
    transcript,
    verdict: verdict.verdict,
    aScore: verdict.aScore,
    bScore: verdict.bScore,
  });

  recordResult(a.tokenId, a.wallet, ctxA.name, verdict.winner === "a", aXp);
  recordResult(b.tokenId, b.wallet, ctxB.name, verdict.winner === "b", bXp);

  return {
    battleId,
    winnerToken,
    verdict: verdict.verdict,
    transcript,
    aScore: verdict.aScore,
    bScore: verdict.bScore,
    aXp,
    bXp,
  };
}

/**
 * Generate one roast line for `side` against `oppName`/`oppArchetype`.
 * Priority: premium LLM → free LLM → template fallback.
 * Credit is burned only when the premium call returns text.
 */
async function generateLine(
  side: BattleSide,
  ctx: SideCtx,
  oppName: string,
  oppArchetype: RoastArchetype,
  priorLines: string[],
  lineIndex: number
): Promise<string> {
  const userMsg = roastLineUser(oppName, oppArchetype, priorLines);
  const msgs = [{ role: "user" as const, content: userMsg }];

  if (side.premiumEligible) {
    const premium = await complete(ctx.roastSys, msgs, "premium");
    if (premium !== null) {
      burnCredit(side.wallet);
      return screenOutbound(premium);
    }
  }

  const free = await complete(ctx.roastSys, msgs, "free");
  if (free !== null) {
    return screenOutbound(free);
  }

  return templateBurn(ctx.archetype, oppName, lineIndex);
}
