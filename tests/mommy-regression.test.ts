import { describe, expect, it } from "vitest";
import { mkdirSync, writeFileSync } from "fs";
import { join } from "path";
import { fetchGotchisByOwner, fetchAllWearables } from "@/graphql/fetchers";
import { autoDress } from "@/lib/autoDressEngine";
import { computeBRSBreakdown } from "@/lib/rarity";
import { computeOwnedCounts } from "@/state/selectors";
import { computeLockedWearableAllocations } from "@/lib/lockedBuilds";
import type { Gotchi, Wearable, EditorInstance } from "@/types";
import type { WearableCounts } from "@/state/selectors";

// Helper to normalize equipped array to 16 slots
function normalizeEquipped(equipped: number[]): number[] {
  const normalized = new Array(16).fill(0);
  for (let i = 0; i < Math.min(equipped.length, 16); i++) {
    normalized[i] = equipped[i] || 0;
  }
  return normalized;
}

// Helper to compute variance
function computeVariance(values: number[]): number {
  if (values.length === 0) return 0;
  const mean = values.reduce((sum, t) => sum + t, 0) / values.length;
  const variance = values.reduce((sum, t) => sum + Math.pow(t - mean, 2), 0) / values.length;
  return variance;
}

// Helper to count wearable changes
function countChanges(current: number[], candidate: number[]): number {
  let changes = 0;
  for (let i = 0; i < Math.max(current.length, candidate.length); i++) {
    if ((current[i] || 0) !== (candidate[i] || 0)) {
      changes++;
    }
  }
  return changes;
}

type GoalResult = {
  goal: string;
  passed: boolean;
  originalBRS: number;
  finalBRS: number;
  brsDelta: number;
  originalVariance: number;
  finalVariance: number;
  originalTraits: number[];
  finalTraits: number[];
  respecAllocated?: number[];
  respecMoved: number;
  setDelta: number;
  wearableChanges: number;
  failures: string[];
};

type RegressionResult = {
  gotchiId: string;
  gotchiName: string;
  passed: boolean;
  goalResults: GoalResult[];
  overallFailures: string[];
};

describe("Mommy Regression: Balanced must not be worse", () => {
  it("runs Mommy across wallet and validates invariants", async () => {
    // Get wallet addresses from env or use default
    const walletsEnv = process.env.MOMMY_WALLETS;
    const wallets = walletsEnv
      ? walletsEnv.split(",").map((a) => a.trim()).filter(Boolean)
      : ["0xc4Cb6cB969e8b4e309Ab98E4Da51b77887aFaD96"]; // Default wallet

    if (wallets.length === 0) {
      throw new Error("No wallet addresses provided. Set MOMMY_WALLETS env var or use default.");
    }

    console.log(`\n🔍 Testing ${wallets.length} wallet(s): ${wallets.join(", ")}\n`);

    // Fetch all gotchis from all wallets
    const allGotchis: Gotchi[] = [];
    for (const wallet of wallets) {
      try {
        const gotchis = await fetchGotchisByOwner(wallet);
        allGotchis.push(...gotchis);
        console.log(`  ✓ Fetched ${gotchis.length} gotchis from ${wallet}`);
      } catch (error) {
        console.error(`  ✗ Failed to fetch gotchis from ${wallet}:`, error);
        throw error;
      }
    }

    if (allGotchis.length === 0) {
      throw new Error("No gotchis found in any wallet");
    }

    console.log(`\n📊 Total gotchis to test: ${allGotchis.length}\n`);

    // Fetch all wearables
    const wearables = await fetchAllWearables();
    const wearablesById = new Map<number, Wearable>();
    for (const w of wearables) {
      wearablesById.set(w.id, w);
    }
    console.log(`  ✓ Loaded ${wearables.length} wearables\n`);

    // Build owned wearables inventory
    const ownedCounts = computeOwnedCounts(allGotchis);
    const ownedWearables = new Map<number, Wearable>();
    for (const [id, wearable] of wearablesById.entries()) {
      if ((ownedCounts[id] || 0) > 0) {
        ownedWearables.set(id, wearable);
      }
    }

    // Build locked allocations (empty for regression test - no locked gotchis in test)
    const lockedById: Record<string, boolean> = {};
    const overridesById: Record<string, any> = {};
    const lockedAllocations = computeLockedWearableAllocations(overridesById, lockedById);
    const reservedWearableIds = new Set<number>();
    for (const [id, count] of Object.entries(lockedAllocations)) {
      if (count > 0) {
        reservedWearableIds.add(Number(id));
      }
    }

    // Build availCounts (owned - locked, no editor instances in test)
    const availCounts: WearableCounts = {};
    for (const [idStr, owned] of Object.entries(ownedCounts)) {
      const id = Number(idStr);
      const locked = lockedAllocations[id] || 0;
      availCounts[id] = Math.max(owned - locked, 0);
    }

    const results: RegressionResult[] = [];

    // Test each gotchi with all goal options
    for (let i = 0; i < allGotchis.length; i++) {
      const gotchi = allGotchis[i];
      const gotchiId = gotchi.id;
      const gotchiName = gotchi.name || `Gotchi ${gotchiId}`;

      console.log(`[${i + 1}/${allGotchis.length}] Testing ${gotchiName} (${gotchiId})...`);

      // Compute original evaluation (pre-Mommy equipped build)
      const originalEquipped = normalizeEquipped(gotchi.equippedWearables);
      const originalEval = computeBRSBreakdown({
        baseTraits: gotchi.numericTraits,
        equippedWearables: originalEquipped,
        wearablesById,
        blocksElapsed: gotchi.blocksElapsed,
      });
      const originalTraits = originalEval.finalTraits.slice(0, 4); // NRG, AGG, SPK, BRN
      const originalVariance = computeVariance(originalTraits);

      const goalResults: GoalResult[] = [];
      const overallFailures: string[] = [];

      // Test all goal options
      const goals = [
        { goal: "maximizeBRS", options: { goal: "maximizeBRS" as const } },
        { goal: "traitShape-oneDominant", options: { goal: "traitShape" as const, traitShapeType: "oneDominant" as const } },
        { goal: "traitShape-twoEqual", options: { goal: "traitShape" as const, traitShapeType: "twoEqual" as const } },
        { goal: "traitShape-balanced", options: { goal: "traitShape" as const, traitShapeType: "balanced" as const } },
      ];

      for (const { goal, options } of goals) {
        try {
          // Create EditorInstance (Mommy starts from naked internally, but we compare vs original)
          const instance: EditorInstance = {
            instanceId: `test-${gotchiId}-${goal}`,
            baseGotchi: gotchi,
            equippedBySlot: normalizeEquipped(gotchi.equippedWearables), // Original equipped
          };

          // Determine locked slots (empty for regression test)
          const lockedSlots = new Set<number>();

          // Call autoDress (starts from naked internally)
          const result = autoDress(
            instance,
            ownedWearables,
            availCounts,
            wearablesById,
            lockedSlots,
            options
          );

          // If no improvement found, result.equippedWearables equals original equipped
          // This means the gotchi is already optimal for this goal - validate it's not worse
          let finalBaseTraits = gotchi.numericTraits;
          if (result.respecAllocated) {
            finalBaseTraits = [...gotchi.numericTraits];
            for (let j = 0; j < 4; j++) {
              finalBaseTraits[j] = Math.max(0, Math.min(99, finalBaseTraits[j] + (result.respecAllocated[j] || 0)));
            }
          }

          const finalEval = computeBRSBreakdown({
            baseTraits: finalBaseTraits,
            equippedWearables: result.equippedWearables,
            wearablesById,
            blocksElapsed: gotchi.blocksElapsed,
          });

          // If no improvement found, final should equal original (already optimal)
          const isNoImprovement = !result.success;

          const finalTraits = finalEval.finalTraits.slice(0, 4);
          const finalVariance = computeVariance(finalTraits);
          const brsDelta = finalEval.totalBrs - originalEval.totalBrs;
          const setDelta = finalEval.activeSets.length - originalEval.activeSets.length;
          const wearableChanges = countChanges(originalEquipped, result.equippedWearables);
          const respecMoved = result.respecAllocated
            ? result.respecAllocated.reduce((sum, v) => sum + Math.abs(v), 0)
            : 0;

          // Validate goal-specific invariants (compare against ORIGINAL, not naked)
          const failures: string[] = [];

          if (goal === "maximizeBRS") {
            // Maximize BRS: finalBRS must be >= originalBRS
            if (finalEval.totalBrs < originalEval.totalBrs - 0.01) {
              failures.push(`BRS decreased: ${originalEval.totalBrs.toFixed(1)} → ${finalEval.totalBrs.toFixed(1)} (delta: ${brsDelta.toFixed(1)})`);
            }
          } else if (goal === "traitShape-oneDominant") {
            // One Dominant: dominant trait must increase OR dominance gap must increase
            const originalMax = Math.max(...originalTraits);
            const finalMax = Math.max(...finalTraits);
            const originalSorted = [...originalTraits].sort((a, b) => b - a);
            const finalSorted = [...finalTraits].sort((a, b) => b - a);
            const originalOthers = originalSorted.slice(1);
            const finalOthers = finalSorted.slice(1);
            const originalAvgOthers = originalOthers.reduce((sum, v) => sum + v, 0) / originalOthers.length;
            const finalAvgOthers = finalOthers.reduce((sum, v) => sum + v, 0) / finalOthers.length;
            const originalGap = originalMax - originalAvgOthers;
            const finalGap = finalMax - finalAvgOthers;

            const maxImproved = finalMax >= originalMax + 0.01;
            const gapImproved = finalGap >= originalGap + 0.01;
            const goalImproved = maxImproved || gapImproved;

            // If no improvement found, it means already optimal - final equals original (valid)
            if (isNoImprovement) {
              // Validate that final equals original (no regression)
              if (Math.abs(finalEval.totalBrs - originalEval.totalBrs) > 0.01) {
                failures.push(`No improvement but BRS changed: ${originalEval.totalBrs.toFixed(1)} → ${finalEval.totalBrs.toFixed(1)}`);
              }
            } else {
              // Improvement found - validate goal improved
              if (!goalImproved) {
                failures.push(`Goal not improved: max ${originalMax.toFixed(0)} → ${finalMax.toFixed(0)}, gap ${originalGap.toFixed(1)} → ${finalGap.toFixed(1)}`);
              }
              // BRS should not decrease by more than 10% if goal improved
              const brsDecrease = originalEval.totalBrs - finalEval.totalBrs;
              const brsDecreasePercent = (brsDecrease / originalEval.totalBrs) * 100;
              if (goalImproved && brsDecreasePercent > 10) {
                failures.push(`BRS decreased too much (${brsDecreasePercent.toFixed(1)}%): ${originalEval.totalBrs.toFixed(1)} → ${finalEval.totalBrs.toFixed(1)}`);
              }
              // If goal didn't improve, BRS must not decrease
              if (!goalImproved && finalEval.totalBrs < originalEval.totalBrs - 0.01) {
                failures.push(`BRS decreased and goal not improved: ${originalEval.totalBrs.toFixed(1)} → ${finalEval.totalBrs.toFixed(1)}`);
              }
            }
          } else if (goal === "traitShape-twoEqual") {
            // Two Equal: t2 must increase OR gap must decrease (with t2 not decreasing)
            const originalSorted = [...originalTraits].sort((a, b) => b - a);
            const finalSorted = [...finalTraits].sort((a, b) => b - a);
            const originalT2 = originalSorted[1];
            const finalT2 = finalSorted[1];
            const originalDiff = Math.abs(originalSorted[0] - originalSorted[1]);
            const finalDiff = Math.abs(finalSorted[0] - finalSorted[1]);

            const t2Improved = finalT2 >= originalT2 + 0.01;
            const gapImproved = finalDiff <= originalDiff - 0.01 && finalT2 >= originalT2;
            const goalImproved = t2Improved || gapImproved;

            // If no improvement found, it means already optimal - final equals original (valid)
            if (isNoImprovement) {
              // Validate that final equals original (no regression)
              if (Math.abs(finalEval.totalBrs - originalEval.totalBrs) > 0.01) {
                failures.push(`No improvement but BRS changed: ${originalEval.totalBrs.toFixed(1)} → ${finalEval.totalBrs.toFixed(1)}`);
              }
            } else {
              // Improvement found - validate goal improved
              if (!goalImproved) {
                failures.push(`Goal not improved: t2 ${originalT2.toFixed(0)} → ${finalT2.toFixed(0)}, diff ${originalDiff.toFixed(0)} → ${finalDiff.toFixed(0)}`);
              }
              // BRS should not decrease by more than 10% if goal improved
              const brsDecrease = originalEval.totalBrs - finalEval.totalBrs;
              const brsDecreasePercent = (brsDecrease / originalEval.totalBrs) * 100;
              if (goalImproved && brsDecreasePercent > 10) {
                failures.push(`BRS decreased too much (${brsDecreasePercent.toFixed(1)}%): ${originalEval.totalBrs.toFixed(1)} → ${finalEval.totalBrs.toFixed(1)}`);
              }
              // If goal didn't improve, BRS must not decrease
              if (!goalImproved && finalEval.totalBrs < originalEval.totalBrs - 0.01) {
                failures.push(`BRS decreased and goal not improved: ${originalEval.totalBrs.toFixed(1)} → ${finalEval.totalBrs.toFixed(1)}`);
              }
            }
          } else if (goal === "traitShape-balanced") {
            // Balanced: BRS must NOT decrease (hard constraint)
            if (finalEval.totalBrs < originalEval.totalBrs - 0.01) {
              failures.push(`BRS decreased: ${originalEval.totalBrs.toFixed(1)} → ${finalEval.totalBrs.toFixed(1)} (delta: ${brsDelta.toFixed(1)})`);
            }
            // Variance should improve or at least not get much worse
            if (finalVariance > originalVariance * 1.5 && originalVariance > 0) {
              failures.push(`Variance increased significantly: ${originalVariance.toFixed(2)} → ${finalVariance.toFixed(2)}`);
            }
          }

          // Common invariants
          // Invariant B: Engine must only use owned wearables
          for (const wearableId of result.equippedWearables) {
            if (wearableId && wearableId !== 0 && !ownedWearables.has(wearableId)) {
              failures.push(`Uses non-owned wearable: ${wearableId}`);
            }
          }

          // Invariant C: Must respect locked gotchis (reserved wearables)
          for (const wearableId of result.equippedWearables) {
            if (wearableId && wearableId !== 0 && reservedWearableIds.has(wearableId)) {
              failures.push(`Uses reserved wearable: ${wearableId}`);
            }
          }

          // Invariant D: Locked slots unchanged
          for (const slot of lockedSlots) {
            if ((result.equippedWearables[slot] || 0) !== (originalEquipped[slot] || 0)) {
              failures.push(`Locked slot ${slot} was modified`);
            }
          }

          const passed = failures.length === 0;
          if (!passed) {
            overallFailures.push(...failures.map(f => `${goal}: ${f}`));
          }

          goalResults.push({
            goal,
            passed,
            originalBRS: originalEval.totalBrs,
            finalBRS: finalEval.totalBrs,
            brsDelta,
            originalVariance,
            finalVariance,
            originalTraits: [...originalTraits],
            finalTraits: [...finalTraits],
            respecAllocated: result.respecAllocated,
            respecMoved,
            setDelta,
            wearableChanges,
            failures,
          });

          if (passed) {
            console.log(`  ✓ ${goal}: BRS ${originalEval.totalBrs.toFixed(1)} → ${finalEval.totalBrs.toFixed(1)} (${brsDelta >= 0 ? "+" : ""}${brsDelta.toFixed(1)})`);
          } else {
            console.log(`  ✗ ${goal} FAILED: ${failures.join("; ")}`);
          }
        } catch (error) {
          const errorMsg = error instanceof Error ? error.message : String(error);
          overallFailures.push(`${goal}: Exception: ${errorMsg}`);
          goalResults.push({
            goal,
            passed: false,
            originalBRS: originalEval.totalBrs,
            finalBRS: originalEval.totalBrs,
            brsDelta: 0,
            originalVariance,
            finalVariance: originalVariance,
            originalTraits: [...originalTraits],
            finalTraits: [...originalTraits],
            respecMoved: 0,
            setDelta: 0,
            wearableChanges: 0,
            failures: [`Exception: ${errorMsg}`],
          });
          console.error(`  ✗ ${goal} ERROR: ${errorMsg}`);
        }
      }

      const passed = overallFailures.length === 0;
      results.push({
        gotchiId,
        gotchiName,
        passed,
        goalResults,
        overallFailures,
      });
    }

    // Summary
    const passed = results.filter((r) => r.passed).length;
    const failed = results.filter((r) => !r.passed).length;

    // Count goal-specific failures
    const goalFailures = new Map<string, number>();
    for (const result of results) {
      for (const goalResult of result.goalResults) {
        if (!goalResult.passed) {
          goalFailures.set(goalResult.goal, (goalFailures.get(goalResult.goal) || 0) + 1);
        }
      }
    }

    console.log(`\n${"=".repeat(80)}`);
    console.log(`📊 SUMMARY`);
    console.log(`${"=".repeat(80)}`);
    console.log(`Total gotchis tested: ${results.length}`);
    console.log(`Gotchis with all goals passed: ${passed}`);
    console.log(`Gotchis with any goal failed: ${failed}`);
    console.log(`\nGoal-specific failures:`);
    for (const [goal, count] of goalFailures.entries()) {
      console.log(`  ${goal}: ${count} gotchis failed`);
    }

    if (failed > 0) {
      console.log(`\n❌ FAILURES (sorted by gotchi, then goal):`);
      const failures = results.filter((r) => !r.passed);

      for (const r of failures) {
        console.log(`\n${r.gotchiName} (${r.gotchiId}):`);
        for (const goalResult of r.goalResults) {
          if (!goalResult.passed) {
            console.log(`  ✗ ${goalResult.goal}:`);
            console.log(`    Original: BRS ${goalResult.originalBRS.toFixed(1)}, Var ${goalResult.originalVariance.toFixed(2)}`);
            console.log(`    Final:    BRS ${goalResult.finalBRS.toFixed(1)}, Var ${goalResult.finalVariance.toFixed(2)}`);
            console.log(`    Delta:    BRS ${goalResult.brsDelta >= 0 ? "+" : ""}${goalResult.brsDelta.toFixed(1)}, Var ${(goalResult.finalVariance - goalResult.originalVariance).toFixed(2)}`);
            for (const failure of goalResult.failures) {
              console.log(`    └─ ${failure}`);
            }
          }
        }
      }
    }

    // Write JSON report
    const reportDir = join(process.cwd(), "tmp");
    mkdirSync(reportDir, { recursive: true });
    const reportPath = join(reportDir, "mommy-regression-report.json");
    writeFileSync(
      reportPath,
      JSON.stringify(
        {
          timestamp: new Date().toISOString(),
          wallets,
          summary: {
            total: results.length,
            passed,
            failed,
          },
          results,
        },
        null,
        2
      )
    );
    console.log(`\n📄 JSON report written to: ${reportPath}`);

    // Assert no failures
    expect(failed).toBe(0);
  }, 300_000); // 5 minute timeout
});
