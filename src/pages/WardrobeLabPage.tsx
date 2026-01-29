import { useState, useMemo, useEffect } from "react";
import { Link } from "react-router-dom";
import { FlaskConical, ArrowLeft, Check, ChevronRight, TrendingUp, Minus, Shirt, Search } from "lucide-react";
import { ThemeToggle } from "@/components/layout/ThemeToggle";
import { Button } from "@/ui/button";
import { Card } from "@/ui/card";
import { Checkbox } from "@/ui/checkbox";
import { Label } from "@/ui/label";
import { RadioGroup, RadioGroupItem } from "@/ui/radio-group";
import { Switch } from "@/ui/switch";
import { useAddressState } from "@/lib/addressState";
import { useGotchisByOwner } from "@/lib/hooks/useGotchisByOwner";
import { shortenAddress, normalizeAddress, isValidAddress } from "@/lib/address";
import { computeBRSBreakdown, traitToBRS, detectActiveSets } from "@/lib/rarity";
import { getRespecBaseTraits } from "@/lib/respec";
import { useWearablesById } from "@/state/selectors";
import { useAppStore } from "@/state/useAppStore";
import { GotchiSvg } from "@/components/gotchi/GotchiSvg";
import { getWearableIconUrlCandidates } from "@/lib/wearableImages";
import { placeholderSvg } from "@/lib/placeholderSvg";
import type { Gotchi, Wearable } from "@/types";

const TRAIT_NAMES = ["NRG", "AGG", "SPK", "BRN"];

const STORAGE_MANUAL_VIEW = "gc_manualViewAddress";

type WizardStep = "scope" | "strategy" | "constraints" | "run" | "results";

type Strategy = {
  goal: "MAX_BRS" | "BATTLER";
  traitShape: "ONE_DOMINANT" | "TWO_EQUAL" | "BALANCED";
};

type Constraints = {
  preferSets: boolean;
  preserveExistingSets: boolean;
  skipLowRespec: boolean;
  bestEffort: boolean;
};

type TraitChange = {
  trait: number;
  from: number;
  to: number;
  brsGain: number;
};

type OptimizationResult = {
  gotchiId: string;
  gotchiName: string;
  ownerAddress: string;
  hauntId: number;
  collateral: string;
  before: {
    equippedWearables: number[];
    traits: number[];
    brs: number;
  };
  after: {
    equippedWearables: number[];
    traits: number[];
    brs: number;
    respecUsed: number;
    respecAvailable: number;
  };
  explanation: string[];
  isOptimized: boolean;
  brsDelta: number;
  traitChanges: TraitChange[];
};

const STEP_ORDER: WizardStep[] = ["scope", "strategy", "constraints", "run"];

export default function WardrobeLabPage() {
  const [currentStep, setCurrentStep] = useState<WizardStep>("scope");
  const [selectedGotchiIds, setSelectedGotchiIds] = useState<Set<string>>(new Set());
  const [strategy, setStrategy] = useState<Strategy>({
    goal: "MAX_BRS",
    traitShape: "BALANCED",
  });
  const [constraints, setConstraints] = useState<Constraints>({
    preferSets: true,
    preserveExistingSets: false,
    skipLowRespec: false,
    bestEffort: true,
  });
  const [results, setResults] = useState<OptimizationResult[]>([]);
  const [isRunning, setIsRunning] = useState(false);

  const { connectedAddress, isOnBase, isConnected } = useAddressState();
  const wearables = useAppStore((state) => state.wearables);
  const wearablesById = useWearablesById();
  const [manualViewAddress, setManualViewAddress] = useState<string | null>(null);

  useEffect(() => {
    const stored = window.localStorage.getItem(STORAGE_MANUAL_VIEW);
    if (stored && isValidAddress(stored)) {
      setManualViewAddress(normalizeAddress(stored));
    }
  }, []);

  const connectedOwner = connectedAddress && isOnBase ? connectedAddress.toLowerCase() : null;
  const manualOwner = manualViewAddress;
  
  const connectedResult = useGotchisByOwner(connectedOwner || undefined);
  const manualResult = useGotchisByOwner(manualOwner || undefined);

  const gotchisByOwner = useMemo(() => {
    const map = new Map<string, Gotchi[]>();
    if (connectedOwner && connectedResult.gotchis.length > 0) {
      map.set(connectedOwner, connectedResult.gotchis);
    }
    if (manualOwner && manualResult.gotchis.length > 0) {
      const existing = map.get(manualOwner) || [];
      const combined = [...existing];
      for (const g of manualResult.gotchis) {
        if (!combined.find(c => c.id === g.id)) {
          combined.push(g);
        }
      }
      map.set(manualOwner, combined);
    }
    return map;
  }, [connectedResult.gotchis, manualResult.gotchis, connectedOwner, manualOwner]);

  const allGotchis = useMemo(() => {
    return Array.from(gotchisByOwner.values()).flat();
  }, [gotchisByOwner]);

  const wearableInventory = useMemo(() => {
    const inventory = new Map<number, { wearable: Wearable; available: number }>();
    for (const w of wearables) {
      if (w.id) {
        inventory.set(w.id, { wearable: w, available: 1 });
      }
    }
    return inventory;
  }, [wearables]);

  const stepIndex = STEP_ORDER.indexOf(currentStep);

  const goNext = () => {
    if (stepIndex < STEP_ORDER.length - 1) {
      setCurrentStep(STEP_ORDER[stepIndex + 1]);
    }
  };

  const goPrev = () => {
    if (stepIndex > 0) {
      setCurrentStep(STEP_ORDER[stepIndex - 1]);
    }
  };

  const toggleGotchi = (id: string) => {
    setSelectedGotchiIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const selectAllFromOwner = (owner: string) => {
    const gotchis = gotchisByOwner.get(owner) || [];
    setSelectedGotchiIds((prev) => {
      const next = new Set(prev);
      for (const g of gotchis) {
        next.add(g.id);
      }
      return next;
    });
  };

  const deselectAllFromOwner = (owner: string) => {
    const gotchis = gotchisByOwner.get(owner) || [];
    setSelectedGotchiIds((prev) => {
      const next = new Set(prev);
      for (const g of gotchis) {
        next.delete(g.id);
      }
      return next;
    });
  };

  const findGotchiOwner = (gotchiId: string): string => {
    for (const [owner, gotchis] of gotchisByOwner.entries()) {
      if (gotchis.find(g => g.id === gotchiId)) return owner;
    }
    return "unknown";
  };

  const simulateRespec = (birthTraits: number[], usedSkillPoints: number): { optimizedTraits: number[]; respecUsed: number; brsDelta: number; changes: { trait: number; from: number; to: number; brsGain: number }[] } => {
    const traits = [...birthTraits];
    const available = usedSkillPoints || 0;
    let remaining = available;
    let brsDelta = 0;
    const changes: { trait: number; from: number; to: number; brsGain: number }[] = [];

    if (available <= 0) return { optimizedTraits: traits, respecUsed: 0, brsDelta: 0, changes: [] };

    const traitPotential = [0, 1, 2, 3].map(i => {
      const t = traits[i];
      const currentBrs = traitToBRS(t);
      let targetTrait: number;
      let pointsNeeded: number;
      
      if (t < 50) {
        targetTrait = 0;
        pointsNeeded = t;
      } else {
        targetTrait = 99;
        pointsNeeded = 99 - t;
      }
      
      const targetBrs = traitToBRS(targetTrait);
      const brsGain = targetBrs - currentBrs;
      const efficiency = pointsNeeded > 0 ? brsGain / pointsNeeded : 0;
      
      return { index: i, birth: t, current: t, target: targetTrait, pointsNeeded, brsGain, efficiency };
    });

    if (strategy.goal === "BATTLER") {
      const highTrait = traitPotential.filter(t => t.birth >= 50).sort((a, b) => b.birth - a.birth)[0];
      const lowTrait = traitPotential.filter(t => t.birth < 50).sort((a, b) => a.birth - b.birth)[0];
      const prioritized = [highTrait, lowTrait].filter(Boolean);
      
      for (const tp of prioritized) {
        if (!tp || remaining <= 0) continue;
        const pointsToUse = Math.min(remaining, tp.pointsNeeded);
        if (pointsToUse > 0) {
          const oldTrait = traits[tp.index];
          const newTrait = Math.max(0, Math.min(99, tp.birth < 50 ? oldTrait - pointsToUse : oldTrait + pointsToUse));
          const gain = traitToBRS(newTrait) - traitToBRS(tp.birth);
          traits[tp.index] = newTrait;
          remaining -= pointsToUse;
          brsDelta += gain;
          changes.push({ trait: tp.index, from: tp.birth, to: newTrait, brsGain: gain });
        }
      }
    }

    traitPotential.sort((a, b) => b.efficiency - a.efficiency);
    
    for (const tp of traitPotential) {
      if (remaining <= 0) break;
      if (traits[tp.index] === tp.target) continue;
      
      const currentVal = traits[tp.index];
      const pointsToUse = Math.min(remaining, Math.abs(tp.target - currentVal));
      if (pointsToUse > 0) {
        const oldTrait = tp.birth;
        const newTrait = Math.max(0, Math.min(99, tp.birth < 50 ? currentVal - pointsToUse : currentVal + pointsToUse));
        const gain = traitToBRS(newTrait) - traitToBRS(oldTrait);
        if (gain > 0 && !changes.find(c => c.trait === tp.index)) {
          traits[tp.index] = newTrait;
          remaining -= pointsToUse;
          brsDelta += gain;
          changes.push({ trait: tp.index, from: oldTrait, to: newTrait, brsGain: gain });
        } else if (changes.find(c => c.trait === tp.index)) {
          const existing = changes.find(c => c.trait === tp.index)!;
          traits[tp.index] = newTrait;
          remaining -= pointsToUse;
          existing.to = newTrait;
          existing.brsGain = traitToBRS(newTrait) - traitToBRS(tp.birth);
        }
      }
    }

    const totalBrsDelta = changes.reduce((sum, c) => sum + c.brsGain, 0);
    return { optimizedTraits: traits, respecUsed: available - remaining, brsDelta: totalBrsDelta, changes };
  };

  const runOptimizer = async () => {
    setIsRunning(true);
    const selectedGotchis = allGotchis.filter((g) => selectedGotchiIds.has(g.id));
    const optimizationResults: OptimizationResult[] = [];
    void wearableInventory;

    for (const gotchi of selectedGotchis) {
      const currentTraits = gotchi.numericTraits || [0, 0, 0, 0, 0, 0];
      const equippedWearables = gotchi.equippedWearables || [];
      const usedSkillPoints = gotchi.usedSkillPoints || 0;
      const owner = findGotchiOwner(gotchi.id);
      
      let birthTraits: number[];
      try {
        birthTraits = await getRespecBaseTraits(gotchi.id);
      } catch (err) {
        console.error(`Failed to fetch birth traits for ${gotchi.id}:`, err);
        birthTraits = [...currentTraits];
      }
      
      const currentBreakdown = computeBRSBreakdown({
        baseTraits: currentTraits,
        equippedWearables,
        wearablesById,
      });

      const { optimizedTraits, respecUsed, brsDelta, changes } = simulateRespec(birthTraits, usedSkillPoints);
      const activeSets = detectActiveSets(equippedWearables);
      
      const afterBreakdown = computeBRSBreakdown({
        baseTraits: optimizedTraits,
        equippedWearables,
        wearablesById,
      });

      const explanation: string[] = [];
      if (respecUsed > 0) {
        explanation.push(`Respec ${respecUsed} points for +${brsDelta} BRS`);
      }
      if (activeSets.length > 0) {
        explanation.push(`Active sets: ${activeSets.map(s => s.name).join(", ")}`);
      }
      if (constraints.preferSets && activeSets.length === 0) {
        explanation.push("No complete sets available");
      }
      explanation.push(`Strategy: ${strategy.goal === "MAX_BRS" ? "Maximize BRS" : "Battler"}`);

      const totalBrsDelta = afterBreakdown.totalBrs - currentBreakdown.totalBrs;
      const isAlreadyOptimized = totalBrsDelta === 0;

      if (isAlreadyOptimized) {
        explanation.unshift("Already optimized for this strategy");
      } else if (totalBrsDelta > 0) {
        explanation.unshift(`+${totalBrsDelta} BRS improvement possible`);
      }

      optimizationResults.push({
        gotchiId: gotchi.id,
        gotchiName: gotchi.name || `Gotchi #${gotchi.id}`,
        ownerAddress: owner,
        hauntId: gotchi.hauntId || 1,
        collateral: gotchi.collateral || "",
        before: {
          equippedWearables: [...equippedWearables],
          traits: [...currentTraits],
          brs: currentBreakdown.totalBrs,
        },
        after: {
          equippedWearables: [...equippedWearables],
          traits: [...optimizedTraits],
          brs: afterBreakdown.totalBrs,
          respecUsed,
          respecAvailable: usedSkillPoints,
        },
        explanation,
        isOptimized: isAlreadyOptimized,
        brsDelta: totalBrsDelta,
        traitChanges: changes,
      });
    }

    optimizationResults.sort((a, b) => b.after.brs - a.after.brs);
    setResults(optimizationResults);
    setCurrentStep("results");
    setIsRunning(false);
  };

  const renderStepIndicator = () => (
    <div className="flex items-center justify-center gap-2 mb-6">
      {STEP_ORDER.map((step, idx) => {
        const isActive = currentStep === step || currentStep === "results";
        const isCompleted = idx < stepIndex || currentStep === "results";
        return (
          <div key={step} className="flex items-center">
            <div
              className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium ${
                isCompleted
                  ? "bg-primary text-primary-foreground"
                  : isActive
                  ? "bg-primary/20 text-primary border-2 border-primary"
                  : "bg-muted text-muted-foreground"
              }`}
            >
              {isCompleted ? <Check className="w-4 h-4" /> : idx + 1}
            </div>
            {idx < STEP_ORDER.length - 1 && (
              <ChevronRight className="w-4 h-4 mx-1 text-muted-foreground" />
            )}
          </div>
        );
      })}
    </div>
  );

  const renderScopeStep = () => (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <Link to="/dress">
          <Button variant="ghost" size="sm">
            <ArrowLeft className="w-4 h-4 mr-1" />
            Back to Dress
          </Button>
        </Link>
        <Button onClick={goNext} disabled={selectedGotchiIds.size === 0} size="sm">
          Next: Strategy
          <ChevronRight className="w-4 h-4 ml-1" />
        </Button>
      </div>

      <h3 className="text-lg font-semibold">Select Gotchis</h3>
      <p className="text-sm text-muted-foreground">
        Choose which Gotchis to include in the optimization.
      </p>

      {allGotchis.length === 0 ? (
        <Card className="p-4 text-center text-muted-foreground">
          No Gotchis loaded. Please connect your wallet or enter an address on the Dress page first.
        </Card>
      ) : (
        <div className="space-y-4">
          {Array.from(gotchisByOwner.entries()).map(([owner, gotchis]) => {
            return (
              <Card key={owner} className="p-4">
                <div className="flex items-center justify-between mb-3">
                  <span className="font-medium">{shortenAddress(owner)}</span>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => selectAllFromOwner(owner)}
                    >
                      Select All
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => deselectAllFromOwner(owner)}
                    >
                      Clear
                    </Button>
                  </div>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2">
                  {gotchis.map((gotchi) => (
                    <label
                      key={gotchi.id}
                      className={`flex items-center gap-2 p-2 rounded border cursor-pointer transition-colors ${
                        selectedGotchiIds.has(gotchi.id)
                          ? "border-primary bg-primary/5"
                          : "border-border hover:bg-muted/50"
                      }`}
                    >
                      <Checkbox
                        checked={selectedGotchiIds.has(gotchi.id)}
                        onCheckedChange={() => toggleGotchi(gotchi.id)}
                      />
                      <span className="text-sm truncate">
                        {gotchi.name || `#${gotchi.id}`}
                      </span>
                    </label>
                  ))}
                </div>
              </Card>
            );
          })}
        </div>
      )}

    </div>
  );

  const renderStrategyStep = () => (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <Button variant="ghost" size="sm" onClick={goPrev}>
          <ArrowLeft className="w-4 h-4 mr-1" />
          Back
        </Button>
        <Button onClick={goNext} size="sm">
          Next: Constraints
          <ChevronRight className="w-4 h-4 ml-1" />
        </Button>
      </div>

      <h3 className="text-lg font-semibold">Optimization Strategy</h3>

      <div className="space-y-4">
        <div>
          <Label className="text-base font-medium">Goal</Label>
          <RadioGroup
            value={strategy.goal}
            onValueChange={(v: string) => setStrategy((s) => ({ ...s, goal: v as Strategy["goal"] }))}
            className="mt-2 space-y-2"
          >
            <div className="flex items-center space-x-2">
              <RadioGroupItem value="MAX_BRS" id="max-brs" />
              <Label htmlFor="max-brs">Maximize BRS (Rarity Score)</Label>
            </div>
            <div className="flex items-center space-x-2">
              <RadioGroupItem value="BATTLER" id="battler" />
              <Label htmlFor="battler">Optimize for Battler</Label>
            </div>
          </RadioGroup>
        </div>

        <div>
          <Label className="text-base font-medium">Trait Shape</Label>
          <RadioGroup
            value={strategy.traitShape}
            onValueChange={(v: string) =>
              setStrategy((s) => ({ ...s, traitShape: v as Strategy["traitShape"] }))
            }
            className="mt-2 space-y-2"
          >
            <div className="flex items-center space-x-2">
              <RadioGroupItem value="ONE_DOMINANT" id="one-dom" />
              <Label htmlFor="one-dom">One Dominant Trait</Label>
            </div>
            <div className="flex items-center space-x-2">
              <RadioGroupItem value="TWO_EQUAL" id="two-eq" />
              <Label htmlFor="two-eq">Two Equal Traits</Label>
            </div>
            <div className="flex items-center space-x-2">
              <RadioGroupItem value="BALANCED" id="balanced" />
              <Label htmlFor="balanced">Balanced</Label>
            </div>
          </RadioGroup>
        </div>
      </div>

    </div>
  );

  const renderConstraintsStep = () => (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <Button variant="ghost" size="sm" onClick={goPrev}>
          <ArrowLeft className="w-4 h-4 mr-1" />
          Back
        </Button>
        <Button onClick={goNext} size="sm">
          Next: Run
          <ChevronRight className="w-4 h-4 ml-1" />
        </Button>
      </div>

      <h3 className="text-lg font-semibold">Constraints</h3>
      <p className="text-sm text-muted-foreground">
        Optional settings to guide the optimizer.
      </p>

      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <Label htmlFor="prefer-sets">Prefer full wearable sets</Label>
          <Switch
            id="prefer-sets"
            checked={constraints.preferSets}
            onCheckedChange={(v: boolean) => setConstraints((c) => ({ ...c, preferSets: v }))}
          />
        </div>

        <div className="flex items-center justify-between">
          <Label htmlFor="preserve-sets">Do not break existing sets</Label>
          <Switch
            id="preserve-sets"
            checked={constraints.preserveExistingSets}
            onCheckedChange={(v: boolean) => setConstraints((c) => ({ ...c, preserveExistingSets: v }))}
          />
        </div>

        <div className="flex items-center justify-between">
          <Label htmlFor="skip-low-respec">Skip gotchis with limited respec</Label>
          <Switch
            id="skip-low-respec"
            checked={constraints.skipLowRespec}
            onCheckedChange={(v: boolean) => setConstraints((c) => ({ ...c, skipLowRespec: v }))}
          />
        </div>

        <div className="flex items-center justify-between">
          <Label htmlFor="best-effort">Best-effort fallback</Label>
          <Switch
            id="best-effort"
            checked={constraints.bestEffort}
            onCheckedChange={(v: boolean) => setConstraints((c) => ({ ...c, bestEffort: v }))}
          />
        </div>
      </div>

    </div>
  );

  const renderRunStep = () => (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <Button variant="ghost" size="sm" onClick={goPrev}>
          <ArrowLeft className="w-4 h-4 mr-1" />
          Back
        </Button>
        <Button onClick={runOptimizer} disabled={isRunning} size="sm">
          {isRunning ? (
            <>Running...</>
          ) : (
            <>
              <FlaskConical className="w-4 h-4 mr-1" />
              Run Wardrobe Lab
            </>
          )}
        </Button>
      </div>

      <h3 className="text-lg font-semibold">Ready to Run</h3>

      <Card className="p-4 space-y-2">
        <div className="flex justify-between text-sm">
          <span>Selected Gotchis:</span>
          <span className="font-medium">{selectedGotchiIds.size}</span>
        </div>
        <div className="flex justify-between text-sm">
          <span>Goal:</span>
          <span className="font-medium">{strategy.goal === "MAX_BRS" ? "Max BRS" : "Battler"}</span>
        </div>
        <div className="flex justify-between text-sm">
          <span>Trait Shape:</span>
          <span className="font-medium">{strategy.traitShape.replace("_", " ")}</span>
        </div>
      </Card>

    </div>
  );

  const renderResults = () => (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold">Results</h3>
        <Button variant="outline" onClick={() => setCurrentStep("scope")}>
          Start Over
        </Button>
      </div>

      <p className="text-sm text-muted-foreground">
        This is a simulation only. No changes have been made to your Gotchis.
      </p>

      {results.length === 0 ? (
        <Card className="p-4 text-center text-muted-foreground">
          No results to display.
        </Card>
      ) : (
        <div className="space-y-6">
          {results.map((result) => (
            <Card key={result.gotchiId} className="p-4">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h4 className="font-medium text-lg">{result.gotchiName}</h4>
                  <span className="text-xs text-muted-foreground">
                    {shortenAddress(result.ownerAddress)}
                  </span>
                </div>
                {result.isOptimized ? (
                  <span className="text-xs px-2 py-1 rounded bg-green-100 text-green-700 flex items-center gap-1">
                    <Check className="w-3 h-3" />
                    Already Optimal
                  </span>
                ) : result.brsDelta > 0 ? (
                  <span className="text-xs px-2 py-1 rounded bg-purple-100 text-purple-700 flex items-center gap-1">
                    <TrendingUp className="w-3 h-3" />
                    +{result.brsDelta} BRS
                  </span>
                ) : (
                  <span className="text-xs px-2 py-1 rounded bg-muted flex items-center gap-1">
                    <Minus className="w-3 h-3" />
                    No Change
                  </span>
                )}
              </div>

              <div className="grid grid-cols-2 gap-6">
                <div className="space-y-2">
                  <div className="text-center">
                    <span className="text-sm font-medium text-muted-foreground">Before</span>
                  </div>
                  <div className="aspect-square bg-muted/50 rounded-lg overflow-hidden">
                    <GotchiSvg
                      gotchiId={result.gotchiId}
                      hauntId={result.hauntId}
                      collateral={result.collateral}
                      numericTraits={result.before.traits}
                      equippedWearables={result.before.equippedWearables}
                      mode="preview"
                      className="w-full h-full"
                    />
                  </div>
                  <div className="text-center">
                    <div className="text-xl font-bold">{result.before.brs}</div>
                    <div className="text-xs text-muted-foreground">BRS</div>
                  </div>
                </div>

                <div className="space-y-2">
                  <div className="text-center">
                    <span className="text-sm font-medium text-muted-foreground">After</span>
                  </div>
                  <div className="aspect-square bg-muted/50 rounded-lg overflow-hidden">
                    <GotchiSvg
                      gotchiId={result.gotchiId}
                      hauntId={result.hauntId}
                      collateral={result.collateral}
                      numericTraits={result.after.traits}
                      equippedWearables={result.after.equippedWearables}
                      mode="preview"
                      className="w-full h-full"
                    />
                  </div>
                  <div className="text-center">
                    <div className="text-xl font-bold">{result.after.brs}</div>
                    <div className="text-xs text-muted-foreground">BRS</div>
                    {result.after.respecUsed > 0 && (
                      <div className="text-xs text-purple-600 mt-1">
                        Respec: {result.after.respecUsed} pts used
                      </div>
                    )}
                  </div>
                </div>
              </div>

              <div className="mt-4 pt-3 border-t">
                <div className="text-xs font-medium text-muted-foreground mb-2">Trait Scores (After Respec)</div>
                <div className="grid grid-cols-4 gap-2">
                  {[0, 1, 2, 3].map((idx) => {
                    const afterVal = result.after.traits[idx];
                    const beforeVal = result.before.traits[idx];
                    const afterTraits = result.after.traits.slice(0, 4);
                    const maxTrait = Math.max(...afterTraits);
                    const minTrait = Math.min(...afterTraits);
                    const isHighest = afterVal === maxTrait && afterVal >= 50;
                    const isLowest = afterVal === minTrait && afterVal < 50;
                    const changed = afterVal !== beforeVal;
                    return (
                      <div 
                        key={idx} 
                        className={`text-center p-2 rounded ${
                          isHighest ? "bg-red-100 border-2 border-red-400" :
                          isLowest ? "bg-blue-100 border-2 border-blue-400" :
                          "bg-muted/50"
                        }`}
                      >
                        <div className={`text-xs font-medium ${
                          isHighest ? "text-red-600" :
                          isLowest ? "text-blue-600" :
                          "text-muted-foreground"
                        }`}>
                          {TRAIT_NAMES[idx]}
                          {isHighest && " (HIGH)"}
                          {isLowest && " (LOW)"}
                        </div>
                        <div className={`text-lg font-bold ${
                          isHighest ? "text-red-700" :
                          isLowest ? "text-blue-700" :
                          ""
                        }`}>
                          {afterVal}
                        </div>
                        {changed && (
                          <div className="text-xs text-purple-600">
                            was {beforeVal}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>

              {result.after.equippedWearables.filter(id => id > 0).length > 0 && (
                <div className="mt-4 pt-3 border-t">
                  <div className="text-xs font-medium text-muted-foreground mb-2">Equipped Wearables</div>
                  <div className="flex flex-wrap gap-2">
                    {result.after.equippedWearables.filter(id => id > 0).map((wearableId, idx) => {
                      const wearable = wearablesById.get(wearableId);
                      const urls = getWearableIconUrlCandidates(wearableId);
                      return (
                        <div key={idx} className="w-10 h-10 rounded bg-muted overflow-hidden" title={wearable?.name || `#${wearableId}`}>
                          <img
                            src={urls[0]}
                            alt={wearable?.name || `Wearable ${wearableId}`}
                            className="w-full h-full object-contain"
                            onError={(e) => {
                              const target = e.target as HTMLImageElement;
                              if (urls[1] && target.src !== urls[1]) {
                                target.src = urls[1];
                              } else {
                                target.src = `data:image/svg+xml,${encodeURIComponent(placeholderSvg(String(wearableId), "?"))}`;
                              }
                            }}
                          />
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {result.traitChanges.length > 0 && (
                <div className="mt-4 pt-3 border-t">
                  <div className="text-xs font-medium text-muted-foreground mb-2">Trait Respec Changes</div>
                  <div className="flex flex-wrap gap-3">
                    {result.traitChanges.map((change, idx) => (
                      <div key={idx} className="text-xs bg-purple-50 text-purple-700 px-2 py-1 rounded">
                        <span className="font-medium">{TRAIT_NAMES[change.trait]}</span>: {change.from} → {change.to} 
                        <span className="text-purple-500 ml-1">(+{change.brsGain} BRS)</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {result.explanation.length > 0 && (
                <div className="mt-4 pt-3 border-t">
                  <ul className="text-xs text-muted-foreground space-y-1">
                    {result.explanation.map((line, i) => (
                      <li key={i}>• {line}</li>
                    ))}
                  </ul>
                </div>
              )}
            </Card>
          ))}
        </div>
      )}

      <div className="pt-4">
        <Link to="/dress">
          <Button variant="ghost">
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back to Dress
          </Button>
        </Link>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <header className="sticky top-0 z-50 w-full bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 border-b">
        <div className="px-4 flex h-12 items-center justify-between gap-2">
          <div className="flex items-center gap-1.5 min-w-0 shrink-0">
            <Link to="/" className="hover:opacity-80 transition-opacity">
              <img src="/logo.png" alt="GotchiCloset" className="h-12 w-12 object-contain -my-2" />
            </Link>
            <div className="text-lg font-semibold tracking-tight hidden sm:block">
              Gotchi<span className="font-normal text-muted-foreground">Closet</span>
            </div>
          </div>
          
          <div className="flex items-center gap-1 flex-1 justify-center min-w-0">
            {isConnected && connectedAddress && (
              <div className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-green-500/10 border border-green-500/30 text-[10px] text-green-600 dark:text-green-400">
                <span className="h-1.5 w-1.5 rounded-full bg-green-500" />
                <span className="hidden md:inline">Connected</span>
                {shortenAddress(connectedAddress)}
              </div>
            )}
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            <Link to="/dress">
              <Button size="sm" variant="ghost" className="h-8 px-2" title="Dress">
                <Shirt className="h-4 w-4" />
              </Button>
            </Link>
            <Link to="/explorer">
              <Button size="sm" variant="ghost" className="h-8 px-2" title="Explorer">
                <Search className="h-4 w-4" />
              </Button>
            </Link>
            <ThemeToggle />
          </div>
        </div>
      </header>

      <div className="container mx-auto px-4 py-6 max-w-3xl">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-2">
            <FlaskConical className="w-5 h-5 text-primary" />
            <h1 className="text-2xl font-bold">Wardrobe Labs (Prototype)</h1>
          </div>
        </div>

      <div className="mb-6 p-4 rounded-lg border border-amber-200 bg-amber-50">
        <h2 className="text-lg font-semibold text-amber-800 mb-2">Wardrobe Labs (Prototype)</h2>
        <p className="text-sm text-amber-700 mb-3">
          A UI-first prototype that is absolutely ahead of its own logic.
        </p>
        <p className="text-sm text-amber-700 mb-3">
          It confidently shows results it is not fully qualified to produce yet.
        </p>
        <p className="text-sm text-amber-700 mb-3">
          Use this to explore the concept, not to trust the math. Optimization logic is still under construction.
        </p>
        <p className="text-xs text-amber-600 font-medium">
          Status: Prototype · Math pending · Vibes approved
        </p>
      </div>

      {currentStep !== "results" && renderStepIndicator()}

      <Card className="p-6">
        {currentStep === "scope" && renderScopeStep()}
        {currentStep === "strategy" && renderStrategyStep()}
        {currentStep === "constraints" && renderConstraintsStep()}
        {currentStep === "run" && renderRunStep()}
        {currentStep === "results" && renderResults()}
      </Card>
      </div>
    </div>
  );
}
