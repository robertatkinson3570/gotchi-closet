import { useState, useMemo } from "react";
import { createPortal } from "react-dom";
import { X, Baby, Sparkles, Shapes } from "lucide-react";
import { Button } from "@/ui/button";
import { Label } from "@/ui/label";
import { RadioGroup, RadioGroupItem } from "@/ui/radio-group";
import { autoDress, type AutoDressGoal, type AutoDressOptions, type AutoDressResult } from "@/lib/autoDressEngine";
import type { EditorInstance, Wearable } from "@/types";
import type { WearableCounts } from "@/state/selectors";
import { useToast } from "@/ui/use-toast";

type MommyDressModalProps = {
  instance: EditorInstance;
  ownedWearables: Map<number, Wearable>;
  availCounts: WearableCounts;
  wearablesById: Map<number, Wearable>;
  lockedSlots: Set<number>;
  onClose: () => void;
  onApply: (result: AutoDressResult, options: AutoDressOptions) => void;
  onNoImprovement?: () => void;
};

export function MommyDressModal({
  instance,
  ownedWearables,
  availCounts,
  wearablesById,
  lockedSlots,
  onClose,
  onApply,
  onNoImprovement,
}: MommyDressModalProps) {
  const [goal, setGoal] = useState<AutoDressGoal>("maximizeBRS");
  const [traitShapeType, setTraitShapeType] = useState<"oneDominant" | "twoEqual" | "balanced">("balanced");
  const [isRunning, setIsRunning] = useState(false);
  const { toast } = useToast();

  const options: AutoDressOptions = useMemo(() => {
    if (goal === "traitShape") {
      return {
        goal: "traitShape",
        traitShapeType,
        aggressiveRespectChanges: true, // Always use aggressive respect for Trait Shape
      };
    }
    return {
      goal: "maximizeBRS",
    };
  }, [goal, traitShapeType]);

  const handleApply = async () => {
    setIsRunning(true);
    try {
      const result = autoDress(
        instance,
        ownedWearables,
        availCounts,
        wearablesById,
        lockedSlots,
        options
      );

      if (result.success) {
        onApply(result, options);
        onClose();
      } else {
        // Close modal and notify parent to show inline message
        onClose();
        onNoImprovement?.();
      }
    } catch (error) {
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to auto-dress gotchi",
        variant: "destructive",
      });
    } finally {
      setIsRunning(false);
    }
  };

  const modalContent = (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div
        className="fixed inset-0 bg-background/80 backdrop-blur-sm"
        onClick={onClose}
      />
      <div className="relative z-50 w-full max-w-2xl max-h-[90vh] overflow-y-auto bg-background border rounded-lg shadow-lg p-6 m-4">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Baby className="h-5 w-5" />
            <h2 className="text-xl font-semibold">🍼 Mommy Dress Me™</h2>
          </div>
          <Button variant="ghost" size="icon" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        </div>

        <p className="text-sm text-muted-foreground mb-6">
          Auto-dress using your owned wearables. No on-chain changes.
        </p>

        {/* Section 1: Select Goal */}
        <div className="mb-6">
          <Label className="text-base font-medium mb-3 block">Select Goal</Label>
          <RadioGroup value={goal} onValueChange={(value) => setGoal(value as AutoDressGoal)}>
            <div className="space-y-3">
              <div className="flex items-center space-x-2 p-3 border rounded-md hover:bg-muted/50">
                <RadioGroupItem value="maximizeBRS" id="goal-brs" />
                <Label htmlFor="goal-brs" className="flex-1 cursor-pointer">
                  <div className="flex items-center gap-2">
                    <Sparkles className="h-4 w-4" />
                    <span>Maximize BRS (Rarity Score)</span>
                  </div>
                </Label>
              </div>
              <div className="flex items-center space-x-2 p-3 border rounded-md hover:bg-muted/50">
                <RadioGroupItem value="traitShape" id="goal-shape" />
                <Label htmlFor="goal-shape" className="flex-1 cursor-pointer">
                  <div className="flex items-center gap-2">
                    <Shapes className="h-4 w-4" />
                    <span>Trait Sculptor ✨</span>
                  </div>
                </Label>
              </div>
            </div>
          </RadioGroup>
        </div>

        {/* Section 2: Goal Options */}
        <div className="mb-6 space-y-4">
          {goal === "traitShape" && (
            <>
              <RadioGroup value={traitShapeType} onValueChange={(value) => setTraitShapeType(value as "oneDominant" | "twoEqual" | "balanced")}>
                <div className="space-y-2">
                  <div className="flex items-center space-x-2 p-2 border rounded-md">
                    <RadioGroupItem value="oneDominant" id="shape-dominant" />
                    <Label htmlFor="shape-dominant" className="cursor-pointer">One Dominant Trait</Label>
                  </div>
                  <div className="flex items-center space-x-2 p-2 border rounded-md">
                    <RadioGroupItem value="twoEqual" id="shape-two" />
                    <Label htmlFor="shape-two" className="cursor-pointer">Two Equal Traits</Label>
                  </div>
                  <div className="flex items-center space-x-2 p-2 border rounded-md">
                    <RadioGroupItem value="balanced" id="shape-balanced" />
                    <Label htmlFor="shape-balanced" className="cursor-pointer">Balanced</Label>
                  </div>
                </div>
              </RadioGroup>
            </>
          )}
        </div>

        {/* Actions */}
        <div className="flex gap-2 justify-end pt-4 border-t">
          <Button variant="outline" onClick={onClose} disabled={isRunning}>
            Cancel
          </Button>
          <Button onClick={handleApply} disabled={isRunning}>
            {isRunning ? "Dressing..." : "Apply Mommy's Build"}
          </Button>
        </div>
      </div>
    </div>
  );

  if (typeof window === "undefined") return null;
  return createPortal(modalContent, document.body);
}
