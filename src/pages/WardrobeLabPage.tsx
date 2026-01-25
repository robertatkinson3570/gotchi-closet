import { useState, useMemo, useEffect } from "react";
import { Link } from "react-router-dom";
import { FlaskConical, ArrowLeft, Check, ChevronRight } from "lucide-react";
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
import { useWearablesById } from "@/state/selectors";
import { useAppStore } from "@/state/useAppStore";
import type { Gotchi, Wearable } from "@/types";

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

type OptimizationResult = {
  gotchiId: string;
  gotchiName: string;
  ownerAddress: string;
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

  const { connectedAddress, isOnBase } = useAddressState();
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

  const simulateRespec = (baseTraits: number[], usedSkillPoints: number): { optimizedTraits: number[]; respecUsed: number; brsDelta: number } => {
    const traits = [...baseTraits];
    const available = usedSkillPoints || 0;
    let respecUsed = 0;
    let brsDelta = 0;

    if (available <= 0) return { optimizedTraits: traits, respecUsed: 0, brsDelta: 0 };

    for (let i = 0; i < 4 && respecUsed < available; i++) {
      const currentTrait = traits[i];
      const currentBrs = traitToBRS(currentTrait);
      
      if (strategy.goal === "MAX_BRS") {
        if (currentTrait < 50 && currentTrait > 0) {
          const pointsToUse = Math.min(available - respecUsed, currentTrait);
          const newTrait = currentTrait - pointsToUse;
          const newBrs = traitToBRS(newTrait);
          brsDelta += newBrs - currentBrs;
          traits[i] = newTrait;
          respecUsed += pointsToUse;
        } else if (currentTrait >= 50 && currentTrait < 99) {
          const pointsToUse = Math.min(available - respecUsed, 99 - currentTrait);
          const newTrait = currentTrait + pointsToUse;
          const newBrs = traitToBRS(newTrait);
          brsDelta += newBrs - currentBrs;
          traits[i] = newTrait;
          respecUsed += pointsToUse;
        }
      }
    }

    return { optimizedTraits: traits, respecUsed, brsDelta };
  };

  const runOptimizer = async () => {
    setIsRunning(true);
    const selectedGotchis = allGotchis.filter((g) => selectedGotchiIds.has(g.id));
    const optimizationResults: OptimizationResult[] = [];
    void wearableInventory;

    for (const gotchi of selectedGotchis) {
      const baseTraits = gotchi.numericTraits || [0, 0, 0, 0, 0, 0];
      const equippedWearables = gotchi.equippedWearables || [];
      const usedSkillPoints = gotchi.usedSkillPoints || 0;
      const owner = findGotchiOwner(gotchi.id);
      
      const currentBreakdown = computeBRSBreakdown({
        baseTraits,
        equippedWearables,
        wearablesById,
      });

      const { optimizedTraits, respecUsed, brsDelta } = simulateRespec(baseTraits, usedSkillPoints);
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

      optimizationResults.push({
        gotchiId: gotchi.id,
        gotchiName: gotchi.name || `Gotchi #${gotchi.id}`,
        ownerAddress: owner,
        before: {
          equippedWearables: [...equippedWearables],
          traits: baseTraits.slice(0, 4),
          brs: currentBreakdown.totalBrs,
        },
        after: {
          equippedWearables: [...equippedWearables],
          traits: optimizedTraits.slice(0, 4),
          brs: afterBreakdown.totalBrs,
          respecUsed,
          respecAvailable: usedSkillPoints,
        },
        explanation,
      });
    }

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

      <div className="flex justify-between pt-4">
        <Link to="/dress">
          <Button variant="ghost">
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back to Dress
          </Button>
        </Link>
        <Button onClick={goNext} disabled={selectedGotchiIds.size === 0}>
          Next: Strategy
          <ChevronRight className="w-4 h-4 ml-2" />
        </Button>
      </div>
    </div>
  );

  const renderStrategyStep = () => (
    <div className="space-y-6">
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

      <div className="flex justify-between pt-4">
        <Button variant="ghost" onClick={goPrev}>
          <ArrowLeft className="w-4 h-4 mr-2" />
          Back
        </Button>
        <Button onClick={goNext}>
          Next: Constraints
          <ChevronRight className="w-4 h-4 ml-2" />
        </Button>
      </div>
    </div>
  );

  const renderConstraintsStep = () => (
    <div className="space-y-6">
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

      <div className="flex justify-between pt-4">
        <Button variant="ghost" onClick={goPrev}>
          <ArrowLeft className="w-4 h-4 mr-2" />
          Back
        </Button>
        <Button onClick={goNext}>
          Next: Run
          <ChevronRight className="w-4 h-4 ml-2" />
        </Button>
      </div>
    </div>
  );

  const renderRunStep = () => (
    <div className="space-y-6">
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

      <div className="flex justify-between pt-4">
        <Button variant="ghost" onClick={goPrev}>
          <ArrowLeft className="w-4 h-4 mr-2" />
          Back
        </Button>
        <Button onClick={runOptimizer} disabled={isRunning}>
          {isRunning ? (
            <>Running...</>
          ) : (
            <>
              <FlaskConical className="w-4 h-4 mr-2" />
              Run Wardrobe Lab
            </>
          )}
        </Button>
      </div>
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
        <div className="space-y-4">
          {results.map((result) => (
            <Card key={result.gotchiId} className="p-4">
              <div className="flex items-center justify-between mb-3">
                <div>
                  <h4 className="font-medium">{result.gotchiName}</h4>
                  <span className="text-xs text-muted-foreground">
                    {shortenAddress(result.ownerAddress)}
                  </span>
                </div>
                <span className="text-xs px-2 py-1 rounded bg-muted">Simulated</span>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <span className="text-xs font-medium text-muted-foreground">Before</span>
                  <div className="text-lg font-semibold">{result.before.brs} BRS</div>
                </div>
                <div className="space-y-1">
                  <span className="text-xs font-medium text-muted-foreground">After</span>
                  <div className="text-lg font-semibold">{result.after.brs} BRS</div>
                  <div className="text-xs text-muted-foreground">
                    Respec: {result.after.respecUsed} / {result.after.respecAvailable}
                  </div>
                </div>
              </div>

              {result.explanation.length > 0 && (
                <ul className="mt-3 text-xs text-muted-foreground space-y-1">
                  {result.explanation.map((line, i) => (
                    <li key={i}>• {line}</li>
                  ))}
                </ul>
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
    <div className="container mx-auto px-4 py-6 max-w-3xl">
      <div className="flex items-center gap-2 mb-6">
        <FlaskConical className="w-5 h-5 text-primary" />
        <h1 className="text-2xl font-bold">Wardrobe Lab</h1>
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
  );
}
