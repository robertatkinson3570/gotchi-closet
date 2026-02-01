/**
 * Mommy Dress Me™ (Auto Dress Engine)
 * 
 * Deterministic, search-based auto-dresser for Gotchis.
 * Uses beam search to find optimal builds, respects locked wearables, uses canonical BRS calculations.
 */

import type { Wearable, EditorInstance } from "@/types";
import type { SetDefinition } from "@/lib/sets";
import { computeBRSBreakdown } from "@/lib/rarity";
import { SETS } from "@/lib/sets";
import type { WearableCounts } from "@/state/selectors";

export type AutoDressGoal = "maximizeBRS" | "traitShape";

export type AutoDressOptions = {
  goal: AutoDressGoal;
  // Trait Shape options
  traitShapeType?: "oneDominant" | "twoEqual" | "balanced";
  // Advanced
  aggressiveRespectChanges?: boolean;
  // Rarity ceiling
  highestAllowedRarity?: "all" | "godlike" | "mythical" | "legendary" | "rare" | "uncommon" | "common";
};

export type AutoDressResult = {
  success: boolean;
  equippedWearables: number[];
  respecAllocated?: number[];
  explanation: string;
  brsDelta?: number;
  traitDeltas?: number[];
  wearableChanges?: number;
  respectChanges?: number;
};

type AutoDressContext = {
  instance: EditorInstance;
  baseTraits: number[];
  currentEquipped: number[];
  lockedSlots: Set<number>;
  ownedWearables: Map<number, Wearable>;
  availCounts: WearableCounts;
  wearablesById: Map<number, Wearable>;
  sets: SetDefinition[];
  blocksElapsed?: number;
  options: AutoDressOptions;
  // Computed count semantics
  maxUsableCounts: Map<number, number>; // Max count usable per wearable ID
  wearablesUsableBySlot: number[][]; // wearablesUsableBySlot[slot] = list of wearable IDs
  prunedWearablesBySlot: number[][]; // Pruned list for performance (goal-specific ranking)
  baselineBrs?: number; // Baseline BRS for constraint checking (balanced goal)
  nakedBrs?: number; // Naked baseline BRS (gotchi with no wearables on unlocked slots)
  nakedEval?: Evaluation; // Naked baseline evaluation (for threshold comparison)
  ownedWearableIds: Set<number>; // Set of owned wearable IDs (for validation)
  reservedWearableIds?: Set<number>; // Optional: reserved wearable IDs (DEV-only hook for locked gotchis)
};

type BuildState = {
  equipped: number[]; // length 16
  respecAllocated?: number[]; // length 4, optional (only for Trait Shape)
};

type Evaluation = {
  totalBrs: number;
  finalTraits: number[];
  activeSets: SetDefinition[];
  goalScore: number;
  setCount: number;
};

const SLOT_COUNT = 16;
const BEAM_WIDTH = 20;
const MAX_ITERATIONS = 12;
const MAX_OPTIONS_PER_SLOT = 20; // Includes empty option (0)
const EPS = 1e-6; // Epsilon for floating point comparison

/**
 * Trait Direction Rules:
 * - Traits below 50 improve by moving DOWN (toward 0)
 * - Traits above 50 improve by moving UP (toward 99)
 * - Trait at exactly 50 can go either direction
 */
function getTraitDirection(traitValue: number): "down" | "up" | "neutral" {
  if (traitValue < 50) return "down";
  if (traitValue > 50) return "up";
  return "neutral";
}

/**
 * Calculate how extreme a trait is (distance from 50, higher = better for BRS)
 */
function getExtremity(traitValue: number): number {
  return Math.abs(traitValue - 50);
}

/**
 * Check if a wearable modifier moves a trait in the correct direction
 * Returns true if the modifier is beneficial or neutral
 */
function isModifierBeneficial(baseTrait: number, modifier: number): boolean {
  if (modifier === 0) return true; // No effect is neutral
  const direction = getTraitDirection(baseTrait);
  if (direction === "neutral") return true; // At 50, any direction is OK
  if (direction === "down") return modifier < 0; // Want to decrease
  return modifier > 0; // direction === "up", want to increase
}

/**
 * Check if a wearable has any harmful modifiers for the given base traits
 */
function hasHarmfulModifiers(baseTrait: number[], wearableModifiers: number[]): boolean {
  for (let i = 0; i < 4; i++) {
    const mod = wearableModifiers[i] || 0;
    if (mod !== 0 && !isModifierBeneficial(baseTrait[i], mod)) {
      return true;
    }
  }
  return false;
}

/**
 * Canonical rarity ordering (higher number = higher rarity)
 */
const RARITY_ORDER = {
  common: 1,
  uncommon: 2,
  rare: 3,
  legendary: 4,
  mythical: 5,
  godlike: 6,
} as const;

type RarityTier = keyof typeof RARITY_ORDER;

/**
 * Get rarity order for a wearable (defaults to common if rarity is missing/invalid)
 */
function getRarityOrder(rarity: string | undefined | null): number {
  if (!rarity) return RARITY_ORDER.common;
  const normalized = rarity.toLowerCase() as RarityTier;
  return RARITY_ORDER[normalized] || RARITY_ORDER.common;
}

/**
 * Check if a wearable meets the rarity ceiling requirement
 */
function meetsRarityCeiling(
  wearable: Wearable,
  highestAllowedRarity: string | undefined
): boolean {
  if (!highestAllowedRarity || highestAllowedRarity === "all") {
    return true;
  }
  const wearableRarity = getRarityOrder(wearable.rarity);
  const maxRarity = RARITY_ORDER[highestAllowedRarity.toLowerCase() as RarityTier] || RARITY_ORDER.godlike;
  return wearableRarity <= maxRarity;
}

/**
 * Main entry point for auto-dress engine
 */
export function autoDress(
  instance: EditorInstance,
  ownedWearables: Map<number, Wearable>,
  availCounts: WearableCounts,
  wearablesById: Map<number, Wearable>,
  lockedSlots: Set<number>,
  options: AutoDressOptions
): AutoDressResult {
  // Initialize context
  const currentEquipped = normalizeEquipped(instance.equippedBySlot);
  
  // Filter sets by rarity ceiling: only include sets where ALL wearables meet the requirement
  const filteredSets = options.highestAllowedRarity && options.highestAllowedRarity !== "all"
    ? SETS.filter(set => {
        // Check if all wearables in the set meet the rarity requirement
        return set.requiredWearableIds.every(wearableId => {
          const wearable = wearablesById.get(wearableId);
          if (!wearable) return false; // If wearable not found, exclude set
          return meetsRarityCeiling(wearable, options.highestAllowedRarity);
        });
      })
    : SETS;
  
  const context: AutoDressContext = {
    instance,
    baseTraits: instance.baseGotchi.numericTraits,
    currentEquipped,
    lockedSlots,
    ownedWearables,
    availCounts,
    wearablesById,
    sets: filteredSets,
    blocksElapsed: instance.baseGotchi.blocksElapsed,
    options,
    maxUsableCounts: new Map(),
    wearablesUsableBySlot: [],
    prunedWearablesBySlot: [],
    ownedWearableIds: new Set(Array.from(ownedWearables.values()).map(w => w.id)),
  };

  // Detect count semantics and compute max usable counts
  detectCountSemantics(context);
  
  // Precompute wearables usable by slot
  precomputeUsableWearables(context);
  
  // Precompute pruned wearables by slot (performance optimization)
  precomputePrunedWearables(context);

  // Evaluate current build (for delta calculations)
  const currentEval = evaluateBuild(context, { equipped: currentEquipped });
  if (!currentEval) {
    return {
      success: false,
      equippedWearables: currentEquipped,
      explanation: "Mommy couldn't find a meaningful improvement 💅",
    };
  }

  // Build "nakey baseline" start state: all unlocked slots are 0, locked slots keep current equipped
  // Also enforce rarity cap: strip illegal wearables from unlocked slots
  const startEquipped = [...currentEquipped];
  let hadIllegalWearables = false;
  
  for (let slot = 0; slot < SLOT_COUNT; slot++) {
    if (lockedSlots.has(slot)) {
      // Locked slots are always respected, even if above rarity cap
      continue;
    }
    
    // Unlocked slots: set to 0 (nakey baseline)
    // Also check if we're removing an illegal rarity wearable
    const currentWearableId = currentEquipped[slot] || 0;
    if (currentWearableId !== 0) {
      const wearable = wearablesById.get(currentWearableId);
      if (wearable && options.highestAllowedRarity && options.highestAllowedRarity !== "all") {
        if (!meetsRarityCeiling(wearable, options.highestAllowedRarity)) {
          hadIllegalWearables = true;
        }
      }
    }
    startEquipped[slot] = 0;
  }

  // CRITICAL: Evaluate naked baseline for threshold comparison AND baseline constraints
  // Mommy always starts from naked - never compare against dressed state
  const nakedEval = evaluateBuild(context, { equipped: startEquipped });
  if (nakedEval) {
    context.nakedBrs = nakedEval.totalBrs;
    context.nakedEval = nakedEval;
    // Use NAKED baseline for constraint checking (balanced goal must not lower BRS below naked)
    context.baselineBrs = nakedEval.totalBrs;
  } else {
    // Fallback to current eval if naked evaluation fails (shouldn't happen normally)
    context.baselineBrs = currentEval.totalBrs;
  }

  // Dev-only check: ensure locked slots are preserved in start state
  if (import.meta.env.DEV) {
    for (let slot = 0; slot < SLOT_COUNT; slot++) {
      if (lockedSlots.has(slot)) {
        if (startEquipped[slot] !== currentEquipped[slot]) {
          throw new Error(
            `[autoDressEngine] Locked slot ${slot} mismatch in startEquipped: ${startEquipped[slot]} !== ${currentEquipped[slot]}`
          );
        }
      } else {
        if (startEquipped[slot] !== 0) {
          throw new Error(
            `[autoDressEngine] Unlocked slot ${slot} should be 0 in startEquipped, got ${startEquipped[slot]}`
          );
        }
      }
    }
  }

  // Run beam search starting from nakey baseline (locked slots preserved)
  const bestState = beamSearch(context, startEquipped);
  if (!bestState) {
    return {
      success: false,
      equippedWearables: currentEquipped,
      explanation: "Mommy couldn't find a meaningful improvement 💅",
    };
  }

  // Evaluate best candidate
  const bestEval = evaluateBuild(context, bestState);
  if (!bestEval) {
    return {
      success: false,
      equippedWearables: currentEquipped,
      explanation: "Mommy couldn't find a meaningful improvement 💅",
    };
  }

  // Apply respect adjustment ONLY for Trait Shape
  let finalState = bestState;
  if (context.options.goal === "traitShape") {
    const respecAllocated = optimizeRespectForTraitShape(context, bestState, bestEval);
    if (respecAllocated) {
      const stateWithRespec: BuildState = { ...bestState, respecAllocated };
      const respecEval = evaluateBuild(context, stateWithRespec);
      // Accept respec if it improves goal score by more than EPS
      if (respecEval && respecEval.goalScore > bestEval.goalScore + EPS) {
        finalState = stateWithRespec;
      }
    }
  }

  // Re-evaluate final state
  const finalEval = evaluateBuild(context, finalState);
  if (!finalEval) {
    return {
      success: false,
      equippedWearables: currentEquipped,
      explanation: "Mommy couldn't find a meaningful improvement 💅",
    };
  }

  // Check thresholds
  if (!meetsThreshold(context, currentEval, finalEval, finalState)) {
    return {
      success: false,
      equippedWearables: currentEquipped,
      explanation: "Mommy couldn't find a meaningful improvement 💅",
    };
  }

  // Dev-only assertion: balanced goal must never lower BRS below NAKED baseline
  if (import.meta.env.DEV && context.options.goal === "traitShape" && context.options.traitShapeType === "balanced") {
    const nakedBrsCheck = context.nakedBrs || currentEval.totalBrs;
    if (finalEval.totalBrs < nakedBrsCheck - EPS) {
      console.error(
        `[autoDressEngine] INVARIANT VIOLATION: Balanced goal lowered BRS below naked baseline from ${nakedBrsCheck} to ${finalEval.totalBrs}`
      );
      return {
        success: false,
        equippedWearables: currentEquipped,
        explanation: "Mommy couldn't find a meaningful improvement 💅",
      };
    }
  }

  // Compute deltas
  const brsDelta = finalEval.totalBrs - currentEval.totalBrs;
  const traitDeltas = computeTraitDeltas(currentEval, finalEval);
  const wearableChanges = countChanges(currentEquipped, finalState.equipped);
  const respectChanges = finalState.respecAllocated
    ? finalState.respecAllocated.reduce((sum, v) => sum + Math.abs(v), 0)
    : 0;

  // Generate explanation
  const explanation = generateExplanation(context, currentEval, finalEval, finalState, hadIllegalWearables);

  // Sanity check (dev only)
  if (process.env.NODE_ENV === "development") {
    validateState(context, finalState);
  }

  return {
    success: true,
    equippedWearables: finalState.equipped,
    respecAllocated: finalState.respecAllocated,
    explanation,
    brsDelta,
    traitDeltas,
    wearableChanges,
    respectChanges,
  };
}

/**
 * Normalize equipped array to 16 slots
 */
function normalizeEquipped(equipped: number[]): number[] {
  const normalized = new Array(SLOT_COUNT).fill(0);
  for (let i = 0; i < Math.min(equipped.length, SLOT_COUNT); i++) {
    normalized[i] = equipped[i] || 0;
  }
  return normalized;
}

/**
 * Detect count semantics: whether availCounts includes or excludes currently equipped items
 */
function detectCountSemantics(context: AutoDressContext): void {
  // Count currently equipped items on this gotchi
  const equippedCountsOnThisGotchi = new Map<number, number>();
  for (const id of context.currentEquipped) {
    if (id && id !== 0) {
      equippedCountsOnThisGotchi.set(id, (equippedCountsOnThisGotchi.get(id) || 0) + 1);
    }
  }

  // Heuristic: if any equipped item has availCounts[id] === 0, then availCounts excludes equipped
  let availCountsExcludesEquipped = false;
  for (const [id, equippedCount] of equippedCountsOnThisGotchi.entries()) {
    const avail = context.availCounts[id] || 0;
    if (equippedCount > 0 && avail === 0) {
      availCountsExcludesEquipped = true;
      break;
    }
  }

  // Compute max usable counts
  // Never assume ownedWearables map key equals wearable id — use .values() and w.id
  for (const w of context.ownedWearables.values()) {
    const id = w.id;
    const avail = context.availCounts[id] || 0;
    const equipped = equippedCountsOnThisGotchi.get(id) || 0;
    
    if (availCountsExcludesEquipped) {
      // availCounts already excludes equipped, so maxUsable = availCounts + equipped
      // This allows candidate builds to keep currently equipped items
      context.maxUsableCounts.set(id, avail + equipped);
    } else {
      // availCounts is total owned, so maxUsable = availCounts
      // (equipped items are already counted in availCounts)
      context.maxUsableCounts.set(id, avail);
    }
  }
}

/**
 * Precompute which wearables can be used in each slot
 */
function precomputeUsableWearables(context: AutoDressContext): void {
  context.wearablesUsableBySlot = Array.from({ length: SLOT_COUNT }, () => []);

  // Never assume ownedWearables map key equals wearable id — use .values() and w.id
  for (const w of context.ownedWearables.values()) {
    const id = w.id;
    const maxUsable = context.maxUsableCounts.get(id) || 0;
    if (maxUsable <= 0) continue;
    
    const wearable = context.wearablesById.get(id);
    if (!wearable) continue;
    
    // Apply rarity ceiling filter
    if (!meetsRarityCeiling(wearable, context.options.highestAllowedRarity)) {
      continue;
    }

    // Find valid slots for this wearable
    const validSlots: number[] = [];
    for (let slot = 0; slot < SLOT_COUNT; slot++) {
      if (context.lockedSlots.has(slot)) continue;
      if (slot < wearable.slotPositions.length && wearable.slotPositions[slot]) {
        validSlots.push(slot);
      }
    }

    // Handle hand placement (only if wearable is actually valid for that slot by slotPositions)
    // Guard: only override if the wearable is valid for the hand slot
    if (wearable.handPlacement === "left" && validSlots.includes(4)) {
      // Override to left hand slot only if slotPositions allows it
      validSlots.splice(0, validSlots.length, 4);
    } else if (wearable.handPlacement === "right" && validSlots.includes(5)) {
      // Override to right hand slot only if slotPositions allows it
      validSlots.splice(0, validSlots.length, 5);
    }

    // Add to usable lists
    for (const slot of validSlots) {
      context.wearablesUsableBySlot[slot].push(id);
    }
  }

  // Sort each slot's list deterministically (by ID ascending)
  for (let slot = 0; slot < SLOT_COUNT; slot++) {
    context.wearablesUsableBySlot[slot].sort((a, b) => a - b);
  }
}

/**
 * Precompute pruned wearables by slot (performance optimization with goal-specific ranking)
 * CRITICAL: Filter out wearables with harmful trait modifiers (wrong direction)
 */
function precomputePrunedWearables(context: AutoDressContext): void {
  context.prunedWearablesBySlot = Array.from({ length: SLOT_COUNT }, () => []);

  for (let slot = 0; slot < SLOT_COUNT; slot++) {
    const allWearables = context.wearablesUsableBySlot[slot] || [];
    if (allWearables.length === 0) continue;

    // Rank wearables by goal-specific heuristic
    const ranked = allWearables
      .map(id => {
        const wearable = context.wearablesById.get(id);
        if (!wearable) return null;
        
        const traitMods = wearable.traitModifiers || [];
        
        // CRITICAL: Filter out wearables with harmful modifiers for trait shape modes
        // A modifier is harmful if it moves a trait in the wrong direction
        if (context.options.goal === "traitShape") {
          if (hasHarmfulModifiers(context.baseTraits, traitMods)) {
            return null; // Skip this wearable entirely
          }
        }
        
        let score = 0;
        
        if (context.options.goal === "maximizeBRS") {
          // Rank by rarityScoreModifier desc, then sum(abs(traitModifiers[0..3])) desc
          score = (wearable.rarityScoreModifier || 0) * 10000;
          for (let i = 0; i < 4; i++) {
            score += Math.abs(traitMods[i] || 0) * 10;
          }
        } else if (context.options.goal === "traitShape") {
          // Rank by optimization potential (how much the wearable helps push traits to extremes)
          // Only count beneficial modifiers
          for (let i = 0; i < 4; i++) {
            const mod = traitMods[i] || 0;
            if (mod !== 0 && isModifierBeneficial(context.baseTraits[i], mod)) {
              // Score by how much it improves extremity
              const currentExtremity = getExtremity(context.baseTraits[i]);
              const newTrait = Math.max(0, Math.min(99, context.baseTraits[i] + mod));
              const newExtremity = getExtremity(newTrait);
              score += (newExtremity - currentExtremity) * 10000;
            }
          }
          score += (wearable.rarityScoreModifier || 0) * 10;
        }
        
        return { id, score };
      })
      .filter((item): item is { id: number; score: number } => item !== null)
      .sort((a, b) => {
        // Primary: score descending
        if (Math.abs(a.score - b.score) > 0.001) {
          return b.score - a.score;
        }
        // Tie-break: wearable id ascending (deterministic)
        return a.id - b.id;
      })
      .slice(0, MAX_OPTIONS_PER_SLOT - 1) // -1 because we'll add empty option (0)
      .map(item => item.id);

    context.prunedWearablesBySlot[slot] = ranked;
  }
}

/**
 * Canonical build evaluation using computeBRSBreakdown
 */
function evaluateBuild(context: AutoDressContext, state: BuildState): Evaluation | null {
  try {
    // Adjust base traits if respec is applied
    let baseTraits = context.baseTraits;
    if (state.respecAllocated) {
      baseTraits = [...context.baseTraits];
      for (let i = 0; i < 4; i++) {
        baseTraits[i] = Math.max(0, Math.min(99, baseTraits[i] + (state.respecAllocated[i] || 0)));
      }
      
      // Verify respec constraints
      const sum = state.respecAllocated.reduce((s, v) => s + v, 0);
      if (Math.abs(sum) > 0.01) {
        // Respec must sum to 0 (reallocation)
        return null;
      }
    }

    const breakdown = computeBRSBreakdown({
      baseTraits,
      equippedWearables: state.equipped,
      wearablesById: context.wearablesById,
      blocksElapsed: context.blocksElapsed,
    });

    const goalScore = computeGoalScore(context, breakdown, state.equipped);

    return {
      totalBrs: breakdown.totalBrs,
      finalTraits: breakdown.finalTraits,
      activeSets: breakdown.activeSets,
      goalScore,
      setCount: breakdown.activeSets.length,
    };
  } catch (error) {
    if (process.env.NODE_ENV === "development") {
      console.error("[autoDressEngine] Evaluation error:", error);
    }
    return null;
  }
}

/**
 * Compute goal-specific score (deterministic)
 * Uses EXTREMITY scoring - traits are scored by distance from 50 (0 or 99 = max extremity)
 * This respects trait direction rules automatically
 */
function computeGoalScore(
  context: AutoDressContext,
  breakdown: ReturnType<typeof computeBRSBreakdown>,
  _equipped: number[]
): number {
  const { totalBrs: brsTotal, finalTraits } = breakdown;
  const editableTraits = finalTraits.slice(0, 4); // NRG, AGG, SPK, BRN
  
  // Calculate extremity for each trait (distance from 50)
  const extremities = editableTraits.map(t => getExtremity(t));

  switch (context.options.goal) {
    case "maximizeBRS": {
      // Pure maximize BRS (no set bonus)
      return brsTotal;
    }

    case "traitShape": {
      const shapeType = context.options.traitShapeType || "balanced";

      if (shapeType === "oneDominant") {
        // Primary: maximize the BEST extremity (not raw value)
        // This finds which trait can be pushed furthest toward 0 or 99
        const maxExtremity = Math.max(...extremities);
        
        // Secondary: maximize "dominance gap" in extremity space
        const sortedExtremities = [...extremities].sort((a, b) => b - a);
        const othersAvg = sortedExtremities.slice(1).reduce((sum, v) => sum + v, 0) / 3;
        const dominanceGap = maxExtremity - othersAvg;
        
        // Tertiary: BRS (for tie-breaking)
        return maxExtremity * 100_000 + dominanceGap * 1000 + brsTotal;
      }

      if (shapeType === "twoEqual") {
        // Primary: maximize the 2nd-best extremity (both top traits should be extreme)
        const sortedExtremities = [...extremities].sort((a, b) => b - a);
        const e1 = sortedExtremities[0];
        const e2 = sortedExtremities[1];
        
        // Secondary: minimize difference between top 2 extremities
        const diff = Math.abs(e1 - e2);
        
        // Tertiary: maximize sum of top 2 extremities
        // Quaternary: BRS
        return e2 * 1_000_000 - diff * 10_000 + e1 * 100 + brsTotal;
      }

      if (shapeType === "balanced") {
        // Balanced: maximize average extremity while minimizing variance
        // CONSTRAINT: Never lower BRS
        
        // Primary: maximize count of equal extremities
        const roundedExtremities = extremities.map(e => Math.round(e));
        const valueCounts = new Map<number, number>();
        for (const v of roundedExtremities) {
          valueCounts.set(v, (valueCounts.get(v) || 0) + 1);
        }
        const maxEqualCount = Math.max(...Array.from(valueCounts.values()));
        
        // Secondary: minimize variance in extremity
        const variance = computeVariance(extremities);
        
        // Tertiary: maximize average extremity
        const avgExtremity = extremities.reduce((sum, v) => sum + v, 0) / 4;
        
        // Quaternary: BRS
        return maxEqualCount * 1_000_000 - variance * 10_000 + avgExtremity * 100 + brsTotal;
      }

      return brsTotal;
    }

    default:
      return brsTotal;
  }
}

/**
 * Compute variance of values
 */
function computeVariance(values: number[]): number {
  if (values.length === 0) return 0;
  const mean = values.reduce((sum, v) => sum + v, 0) / values.length;
  const squaredDiffs = values.map(v => Math.pow(v - mean, 2));
  return squaredDiffs.reduce((sum, v) => sum + v, 0) / values.length;
}

/**
 * Beam search for optimal build
 */
function beamSearch(context: AutoDressContext, startEquipped: number[]): BuildState | null {
  // Initialize beam with start state
  let beam: BuildState[] = [{ equipped: [...startEquipped] }];
  
  // Initialize best-so-far score from start state
  const startEval = evaluateBuild(context, { equipped: startEquipped });
  let bestSoFarScore = startEval ? startEval.goalScore : -Infinity;

  for (let iteration = 0; iteration < MAX_ITERATIONS; iteration++) {
    const candidates: Array<{ state: BuildState; eval: Evaluation }> = [];

    // Generate neighbors from all states in beam
    for (const state of beam) {
      const neighbors = generateNeighbors(context, state);
      for (const neighbor of neighbors) {
        const evaluation = evaluateBuild(context, neighbor);
        if (evaluation && isValidState(context, neighbor)) {
          candidates.push({ state: neighbor, eval: evaluation });
        }
      }
    }

    if (candidates.length === 0) break;

    // Filter out illegal candidates for balanced goal (BRS constraint)
    const filtered = (context.options.goal === "traitShape" && context.options.traitShapeType === "balanced" && context.baselineBrs !== undefined)
      ? candidates.filter(c => c.eval.totalBrs >= context.baselineBrs! - EPS)
      : candidates;

    if (filtered.length === 0) break; // No legal moves, stop search

    // Sort by goal score (desc), then tie-breakers (deterministic)
    filtered.sort((a, b) => {
      // Primary: goal score
      if (Math.abs(a.eval.goalScore - b.eval.goalScore) > 0.001) {
        return b.eval.goalScore - a.eval.goalScore;
      }
      // Secondary: total BRS
      if (Math.abs(a.eval.totalBrs - b.eval.totalBrs) > 0.001) {
        return b.eval.totalBrs - a.eval.totalBrs;
      }
      // Tertiary: more sets
      if (a.eval.setCount !== b.eval.setCount) {
        return b.eval.setCount - a.eval.setCount;
      }
      // Quaternary: fewer changes from current
      const changesA = countChanges(context.currentEquipped, a.state.equipped);
      const changesB = countChanges(context.currentEquipped, b.state.equipped);
      if (changesA !== changesB) {
        return changesA - changesB;
      }
      // Quinary: fewer respect changes (if any)
      const respecA = a.state.respecAllocated ? a.state.respecAllocated.reduce((sum, v) => sum + Math.abs(v), 0) : 0;
      const respecB = b.state.respecAllocated ? b.state.respecAllocated.reduce((sum, v) => sum + Math.abs(v), 0) : 0;
      if (respecA !== respecB) {
        return respecA - respecB;
      }
      // Senary: lexicographic smallest (deterministic tie-break)
      return compareEquippedArrays(a.state.equipped, b.state.equipped);
    });

    // Early termination if no improvement (compare against best-so-far)
    if (filtered.length > 0) {
      const bestCandidateEval = filtered[0].eval;
      if (bestCandidateEval.goalScore <= bestSoFarScore + EPS) {
        // No improvement, stop
        break;
      }
      // Update best-so-far
      bestSoFarScore = bestCandidateEval.goalScore;
    }

    // Keep top K from filtered candidates
    beam = filtered.slice(0, BEAM_WIDTH).map(c => c.state);
  }

  // Return best state from final beam
  if (beam.length === 0) return null;

  // Evaluate all final candidates and pick best
  // For balanced goal, filter out any that violate BRS constraint
  let evaluated = beam
    .map(state => ({ state, evaluation: evaluateBuild(context, state) }))
    .filter((item): item is { state: BuildState; evaluation: Evaluation } => item.evaluation !== null);

  // Apply BRS constraint filter for balanced goal
  if (context.options.goal === "traitShape" && context.options.traitShapeType === "balanced" && context.baselineBrs !== undefined) {
    evaluated = evaluated.filter(item => item.evaluation.totalBrs >= context.baselineBrs! - EPS);
  }

  evaluated.sort((a, b) => {
    if (Math.abs(a.evaluation.goalScore - b.evaluation.goalScore) > 0.001) {
      return b.evaluation.goalScore - a.evaluation.goalScore;
    }
    return b.evaluation.totalBrs - a.evaluation.totalBrs;
  });

  return evaluated.length > 0 ? evaluated[0].state : null;
}

/**
 * Generate neighbor states (deterministic ordering)
 */
function generateNeighbors(context: AutoDressContext, state: BuildState): BuildState[] {
  const neighbors: BuildState[] = [];

  // Iterate slots in ascending order (deterministic)
  for (let slot = 0; slot < SLOT_COUNT; slot++) {
    if (context.lockedSlots.has(slot)) continue; // Skip locked slots

    const currentWearableId = state.equipped[slot] || 0;
    // Use pruned list for performance (goal-specific ranking)
    const usableWearables = context.prunedWearablesBySlot[slot] || [];

    // Always include empty option (0)
    const options = [0, ...usableWearables];

    // For each option, create a neighbor
    for (const wearableId of options) {
      if (wearableId === currentWearableId) continue; // Skip no-change

      // Quick check: would this violate counts?
      if (!wouldViolateCounts(context, state.equipped, slot, wearableId)) {
        const neighbor = { ...state, equipped: [...state.equipped] };
        neighbor.equipped[slot] = wearableId;
        neighbors.push(neighbor);
      }
    }
  }

  return neighbors;
}

/**
 * Check if a state would violate wearable counts
 */
function wouldViolateCounts(
  context: AutoDressContext,
  equipped: number[],
  slotToChange: number,
  newWearableId: number
): boolean {
  // Count wearables in the proposed state
  const counts = new Map<number, number>();
  for (let i = 0; i < equipped.length; i++) {
    const id = i === slotToChange ? newWearableId : (equipped[i] || 0);
    if (id && id !== 0) {
      counts.set(id, (counts.get(id) || 0) + 1);
    }
  }

  // Check against max usable
  for (const [id, count] of counts.entries()) {
    const maxUsable = context.maxUsableCounts.get(id) || 0;
    if (count > maxUsable) {
      return true;
    }
  }

  return false;
}

/**
 * Validate state (sanity check)
 */
function isValidState(context: AutoDressContext, state: BuildState): boolean {
  // Check locked slots
  for (let i = 0; i < SLOT_COUNT; i++) {
    if (context.lockedSlots.has(i)) {
      if ((state.equipped[i] || 0) !== (context.currentEquipped[i] || 0)) {
        return false; // Locked slot was changed
      }
    }
  }

  // Check counts
  const counts = new Map<number, number>();
  for (const id of state.equipped) {
    if (id && id !== 0) {
      counts.set(id, (counts.get(id) || 0) + 1);
    }
  }

  for (const [id, count] of counts.entries()) {
    const maxUsable = context.maxUsableCounts.get(id) || 0;
    if (count > maxUsable) {
      return false;
    }
  }

  return true;
}

/**
 * Optimize respect/respec allocation for Trait Shape (post-pass, deterministic enumeration)
 */
function optimizeRespectForTraitShape(
  context: AutoDressContext,
  bestState: BuildState,
  bestEval: Evaluation
): number[] | undefined {
  const cap = 3; // Trait Shape always uses aggressive respec (±3)
  
  // Enumerate all feasible deltas: each trait delta ∈ [-cap, cap], sum = 0
  const feasibleDeltas: number[][] = [];
  
  // Generate all combinations (small space for cap=1: 3^4=81, filter sum=0)
  for (let d0 = -cap; d0 <= cap; d0++) {
    for (let d1 = -cap; d1 <= cap; d1++) {
      for (let d2 = -cap; d2 <= cap; d2++) {
        for (let d3 = -cap; d3 <= cap; d3++) {
          if (d0 + d1 + d2 + d3 === 0) {
            feasibleDeltas.push([d0, d1, d2, d3]);
          }
        }
      }
    }
  }

  // Evaluate each delta
  let bestDelta: number[] | undefined;
  let bestScore = bestEval.goalScore;

  for (const delta of feasibleDeltas) {
    // Check constraints: each trait must stay in [0, 99]
    let valid = true;
    for (let i = 0; i < 4; i++) {
      const newTrait = context.baseTraits[i] + delta[i];
      if (newTrait < 0 || newTrait > 99) {
        valid = false;
        break;
      }
    }
    if (!valid) continue;

    // Evaluate with this delta
    const stateWithRespec: BuildState = {
      ...bestState,
      respecAllocated: delta,
    };
    const respecEvaluation = evaluateBuild(context, stateWithRespec);
    if (!respecEvaluation) continue;

    // Compare goal score
    if (respecEvaluation.goalScore > bestScore + EPS) {
      bestScore = respecEvaluation.goalScore;
      bestDelta = delta;
    } else if (Math.abs(respecEvaluation.goalScore - bestScore) < EPS) {
      // Tie: prefer lower L1 norm (fewer total points moved)
      const currentL1 = bestDelta ? bestDelta.reduce((sum, v) => sum + Math.abs(v), 0) : Infinity;
      const newL1 = delta.reduce((sum, v) => sum + Math.abs(v), 0);
      if (newL1 < currentL1) {
        bestDelta = delta;
      } else if (newL1 === currentL1 && bestDelta) {
        // Further tie: lexicographic delta array (ascending)
        for (let i = 0; i < 4; i++) {
          if (delta[i] !== bestDelta[i]) {
            if (delta[i] < bestDelta[i]) {
              bestDelta = delta;
            }
            break;
          }
        }
      }
    }
  }

  return bestDelta;
}

/**
 * Check if improvement meets threshold
 * CRITICAL: Compare against NAKED baseline, not dressed state
 * Mommy always starts from naked - never assume "already optimized"
 */
function meetsThreshold(
  context: AutoDressContext,
  currentEval: Evaluation,
  finalEval: Evaluation,
  _finalState: BuildState
): boolean {
  // Use naked baseline for comparison (critical fix)
  // Fallback to current eval if naked baseline not available (shouldn't happen normally)
  const baselineEval = context.nakedEval || currentEval;

  switch (context.options.goal) {
    case "maximizeBRS": {
      // Compare against NAKED baseline BRS, not dressed state
      const nakedBrs = context.nakedBrs || baselineEval.totalBrs;
      const brsDelta = finalEval.totalBrs - nakedBrs;
      // Any improvement over naked is valid (we found wearables that help)
      return brsDelta >= 0.5;
    }

    case "traitShape": {
      const shapeType = context.options.traitShapeType || "balanced";
      const baselineTraits = baselineEval.finalTraits.slice(0, 4);
      const finalTraits = finalEval.finalTraits.slice(0, 4);

      if (shapeType === "oneDominant") {
        // Calculate extremity improvement (how far traits moved toward 0 or 99)
        const baselineExtremity = baselineTraits.map(t => getExtremity(t));
        const finalExtremity = finalTraits.map(t => getExtremity(t));
        const maxBaselineExtremity = Math.max(...baselineExtremity);
        const maxFinalExtremity = Math.max(...finalExtremity);
        
        // Any increase in max extremity is improvement
        return maxFinalExtremity > maxBaselineExtremity;
      }

      if (shapeType === "twoEqual") {
        // Compare extremity of top 2 traits
        const baselineSorted = [...baselineTraits].map(t => getExtremity(t)).sort((a, b) => b - a);
        const finalSorted = [...finalTraits].map(t => getExtremity(t)).sort((a, b) => b - a);
        const baselineT2 = baselineSorted[1];
        const finalT2 = finalSorted[1];
        
        // Any increase in 2nd-best extremity is improvement
        return finalT2 > baselineT2;
      }

      if (shapeType === "balanced") {
        // Balanced: improve variance and never lower BRS
        const nakedBrs = context.nakedBrs || baselineEval.totalBrs;
        if (finalEval.totalBrs < nakedBrs - EPS) return false;
        
        const baselineVariance = computeVariance(baselineTraits);
        if (baselineVariance === 0) return false; // Already perfect
        
        const newVariance = computeVariance(finalTraits);
        const varianceImprovement = (baselineVariance - newVariance) / baselineVariance;
        return varianceImprovement >= 0.05; // More lenient threshold for balanced
      }

      return false;
    }

    default:
      return false;
  }
}

/**
 * Compute trait deltas (from canonical evaluations)
 */
function computeTraitDeltas(
  currentEval: Evaluation,
  finalEval: Evaluation
): number[] {
  // Trait deltas must be finalTraitsCandidate - finalTraitsCurrent
  // (respec already included in evaluations)
  return finalEval.finalTraits.map((t, i) => t - currentEval.finalTraits[i]);
}

/**
 * Count wearable changes
 */
function countChanges(current: number[], candidate: number[]): number {
  let changes = 0;
  for (let i = 0; i < SLOT_COUNT; i++) {
    if ((current[i] || 0) !== (candidate[i] || 0)) {
      changes++;
    }
  }
  return changes;
}

/**
 * Compare equipped arrays lexicographically (deterministic tie-break)
 */
function compareEquippedArrays(a: number[], b: number[]): number {
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const aVal = a[i] || 0;
    const bVal = b[i] || 0;
    if (aVal !== bVal) {
      return aVal - bVal;
    }
  }
  return 0;
}

/**
 * Generate explanation from evaluated deltas
 */
function generateExplanation(
  context: AutoDressContext,
  currentEval: Evaluation,
  finalEval: Evaluation,
  finalState: BuildState,
  hadIllegalWearables: boolean = false
): string {
  const parts: string[] = [];
  const brsDelta = finalEval.totalBrs - currentEval.totalBrs;
  const editableTraits = finalEval.finalTraits.slice(0, 4);

  if (context.options.goal === "maximizeBRS") {
    if (brsDelta > 0.01) {
      parts.push(`increased BRS by +${brsDelta.toFixed(1)}`);
    }
  } else if (context.options.goal === "traitShape") {
    const shapeType = context.options.traitShapeType || "balanced";

    if (shapeType === "oneDominant") {
      const maxTrait = Math.max(...editableTraits);
      const sorted = [...editableTraits].sort((a, b) => b - a);
      const others = sorted.slice(1);
      const avgOthers = others.reduce((sum, v) => sum + v, 0) / others.length;
      const gap = maxTrait - avgOthers;
      parts.push(`boosted top trait to ${maxTrait.toFixed(0)} (gap +${gap.toFixed(1)})`);
      if (brsDelta > 0.01) {
        parts.push(`BRS +${brsDelta.toFixed(1)}`);
      }
    } else if (shapeType === "twoEqual") {
      const sorted = [...editableTraits].sort((a, b) => b - a);
      const t2 = sorted[1];
      const diff = Math.abs(sorted[0] - sorted[1]);
      parts.push(`raised your 2nd-best trait to ${t2.toFixed(0)} and tightened the gap to ${diff.toFixed(0)}`);
      if (brsDelta > 0.01) {
        parts.push(`BRS +${brsDelta.toFixed(1)}`);
      }
    } else if (shapeType === "balanced") {
      const currentVariance = computeVariance(currentEval.finalTraits.slice(0, 4));
      const newVariance = computeVariance(finalEval.finalTraits.slice(0, 4));
      if (currentVariance > 0) {
        const varianceImprovement = ((currentVariance - newVariance) / currentVariance) * 100;
        parts.push(`reduced variance by ${varianceImprovement.toFixed(0)}%`);
        if (brsDelta > 0.01) {
          parts.push(`BRS +${brsDelta.toFixed(1)}`);
        }
      }
    }
  }

  // Add set completion info
  const setDelta = finalEval.setCount - currentEval.setCount;
  if (setDelta > 0) {
    parts.push(`completed ${setDelta} set(s)`);
  }

  // Add respec info if applied
  if (finalState.respecAllocated) {
    const d = finalState.respecAllocated;
    const moved = d.reduce((s, v) => s + Math.abs(v), 0);

    const labels = ["NRG", "AGG", "SPK", "BRN"] as const;
    const items: string[] = [];
    for (let i = 0; i < 4; i++) {
      const v = d[i] || 0;
      if (v !== 0) items.push(`${labels[i]} ${v > 0 ? `+${v}` : `${v}`}`);
    }

    // Always add a respec note if respecAllocated exists, even if items is empty (shouldn't happen)
    parts.push(`respec applied (${items.join(", ")} • moved ${moved})`);
  }

  // Add rarity cap info if active
  if (context.options.highestAllowedRarity && context.options.highestAllowedRarity !== "all") {
    const rarityLabel = context.options.highestAllowedRarity.charAt(0).toUpperCase() + context.options.highestAllowedRarity.slice(1);
    parts.push(`Rarity cap applied: ≤ ${rarityLabel}`);
  }

  // Add note if illegal wearables were removed
  if (hadIllegalWearables) {
    parts.push("Higher-rarity wearables were removed to meet the selected rarity cap");
  }

  if (parts.length === 0) {
    return "Mommy applied an optimized build";
  }

  return `Mommy chose this because it ${parts.join(" while ")}`;
}

/**
 * Validate state (dev-only sanity check)
 */
function validateState(context: AutoDressContext, state: BuildState): void {
  // Check locked slots
  for (let i = 0; i < SLOT_COUNT; i++) {
    if (context.lockedSlots.has(i)) {
      if ((state.equipped[i] || 0) !== (context.currentEquipped[i] || 0)) {
        throw new Error(`[autoDressEngine] Locked slot ${i} was modified`);
      }
    }
  }

  // Check that all equipped wearables exist in ownedWearableIds (from selector inventory)
  // This ensures Mommy only uses wearables available in the Wearable Selector
  for (const wearableId of state.equipped) {
    if (wearableId && wearableId !== 0 && !context.ownedWearableIds.has(wearableId)) {
      throw new Error(
        `[autoDressEngine] Wearable ${wearableId} not in owned inventory (not available in Wearable Selector)`
      );
    }
  }

  // DEV-only: Check reserved wearable IDs (hook for locked gotchis)
  if (import.meta.env.DEV && context.reservedWearableIds) {
    for (const wearableId of state.equipped) {
      if (wearableId && wearableId !== 0 && context.reservedWearableIds.has(wearableId)) {
        throw new Error(
          `[autoDressEngine] Wearable ${wearableId} is reserved by locked gotchis and must not be used`
        );
      }
    }
  }

  // DEV-only: Check rarity ceiling violation in final build
  if (import.meta.env.DEV && context.options.highestAllowedRarity && context.options.highestAllowedRarity !== "all") {
    for (const wearableId of state.equipped) {
      if (wearableId && wearableId !== 0) {
        const wearable = context.wearablesById.get(wearableId);
        if (wearable) {
          const wearableRarity = getRarityOrder(wearable.rarity);
          const maxRarity = RARITY_ORDER[context.options.highestAllowedRarity.toLowerCase() as RarityTier] || RARITY_ORDER.godlike;
          if (wearableRarity > maxRarity) {
            throw new Error(
              `[autoDressEngine] Mommy violated rarity cap in final build: wearable ${wearableId} (${wearable.rarity || "unknown"}, order ${wearableRarity}) exceeds ${context.options.highestAllowedRarity} (order ${maxRarity})`
            );
          }
        }
      }
    }
  }

  // Check counts
  const counts = new Map<number, number>();
  for (const id of state.equipped) {
    if (id && id !== 0) {
      counts.set(id, (counts.get(id) || 0) + 1);
    }
  }

  for (const [id, count] of counts.entries()) {
    const maxUsable = context.maxUsableCounts.get(id) || 0;
    if (count > maxUsable) {
      throw new Error(`[autoDressEngine] Wearable ${id} count violation: ${count} > ${maxUsable}`);
    }
  }

  // Check respec constraints (only for Trait Shape)
  if (state.respecAllocated) {
    if (context.options.goal !== "traitShape") {
      throw new Error(`[autoDressEngine] Respec allocated but goal is not traitShape`);
    }
    const sum = state.respecAllocated.reduce((s, v) => s + v, 0);
    if (Math.abs(sum) > 0.01) {
      throw new Error(`[autoDressEngine] Respec sum violation: ${sum} !== 0`);
    }
    for (let i = 0; i < 4; i++) {
      const newTrait = context.baseTraits[i] + (state.respecAllocated[i] || 0);
      if (newTrait < 0 || newTrait > 99) {
        throw new Error(`[autoDressEngine] Respec trait ${i} out of bounds: ${newTrait}`);
      }
    }
  }
}
