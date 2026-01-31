import { useState, useMemo } from "react";
import { createPortal } from "react-dom";
import { X, Sparkles, Shapes, Zap } from "lucide-react";
import { Button } from "@/ui/button";
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
        aggressiveRespectChanges: true,
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
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop with blur */}
      <div
        className="fixed inset-0 bg-black/60 backdrop-blur-md"
        onClick={onClose}
      />
      
      {/* Modal Container */}
      <div className="relative z-50 w-full max-w-md overflow-hidden">
        {/* Gradient border effect */}
        <div className="absolute inset-0 rounded-2xl bg-gradient-to-br from-purple-500/30 via-fuchsia-500/20 to-violet-600/30 p-[1px]">
          <div className="h-full w-full rounded-2xl bg-background" />
        </div>
        
        {/* Content */}
        <div className="relative rounded-2xl bg-gradient-to-br from-background via-background to-purple-950/10 p-6 shadow-2xl shadow-purple-900/20">
          {/* Header */}
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-purple-500 to-fuchsia-600 shadow-lg shadow-purple-500/30">
                <span className="text-lg">👶</span>
              </div>
              <div>
                <h2 className="text-lg font-semibold bg-gradient-to-r from-purple-400 to-fuchsia-400 bg-clip-text text-transparent">
                  Mommy Dress Me
                </h2>
                <p className="text-xs text-muted-foreground">Auto-optimize your Gotchi</p>
              </div>
            </div>
            <Button 
              variant="ghost" 
              size="icon" 
              onClick={onClose}
              className="h-8 w-8 rounded-lg hover:bg-purple-500/10"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>

          {/* Goal Selection */}
          <div className="space-y-3 mb-6">
            <div className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              Select Strategy
            </div>
            
            {/* Maximize BRS Option */}
            <button
              onClick={() => setGoal("maximizeBRS")}
              className={`w-full p-4 rounded-xl border transition-all duration-200 text-left group ${
                goal === "maximizeBRS"
                  ? "border-purple-500/50 bg-purple-500/10 shadow-lg shadow-purple-500/10"
                  : "border-border hover:border-purple-500/30 hover:bg-purple-500/5"
              }`}
            >
              <div className="flex items-center gap-3">
                <div className={`flex h-9 w-9 items-center justify-center rounded-lg transition-all ${
                  goal === "maximizeBRS"
                    ? "bg-gradient-to-br from-purple-500 to-fuchsia-600 text-white shadow-md"
                    : "bg-muted/50 text-muted-foreground group-hover:bg-purple-500/20"
                }`}>
                  <Sparkles className="h-4 w-4" />
                </div>
                <div className="flex-1">
                  <div className={`font-medium ${goal === "maximizeBRS" ? "text-purple-400" : ""}`}>
                    Maximize BRS
                  </div>
                  <div className="text-xs text-muted-foreground">
                    Optimize for highest rarity score
                  </div>
                </div>
                <div className={`h-4 w-4 rounded-full border-2 transition-all ${
                  goal === "maximizeBRS"
                    ? "border-purple-500 bg-purple-500"
                    : "border-muted-foreground/30"
                }`}>
                  {goal === "maximizeBRS" && (
                    <div className="h-full w-full rounded-full bg-white scale-50" />
                  )}
                </div>
              </div>
            </button>

            {/* Trait Sculptor Option */}
            <button
              onClick={() => setGoal("traitShape")}
              className={`w-full p-4 rounded-xl border transition-all duration-200 text-left group ${
                goal === "traitShape"
                  ? "border-fuchsia-500/50 bg-fuchsia-500/10 shadow-lg shadow-fuchsia-500/10"
                  : "border-border hover:border-fuchsia-500/30 hover:bg-fuchsia-500/5"
              }`}
            >
              <div className="flex items-center gap-3">
                <div className={`flex h-9 w-9 items-center justify-center rounded-lg transition-all ${
                  goal === "traitShape"
                    ? "bg-gradient-to-br from-fuchsia-500 to-violet-600 text-white shadow-md"
                    : "bg-muted/50 text-muted-foreground group-hover:bg-fuchsia-500/20"
                }`}>
                  <Shapes className="h-4 w-4" />
                </div>
                <div className="flex-1">
                  <div className={`font-medium ${goal === "traitShape" ? "text-fuchsia-400" : ""}`}>
                    Trait Sculptor
                  </div>
                  <div className="text-xs text-muted-foreground">
                    Shape traits for specific builds
                  </div>
                </div>
                <div className={`h-4 w-4 rounded-full border-2 transition-all ${
                  goal === "traitShape"
                    ? "border-fuchsia-500 bg-fuchsia-500"
                    : "border-muted-foreground/30"
                }`}>
                  {goal === "traitShape" && (
                    <div className="h-full w-full rounded-full bg-white scale-50" />
                  )}
                </div>
              </div>
            </button>
          </div>

          {/* Shape Type Options (conditional) */}
          {goal === "traitShape" && (
            <div className="mb-6 p-4 rounded-xl bg-fuchsia-500/5 border border-fuchsia-500/20">
              <div className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-3">
                Shape Type
              </div>
              <div className="grid grid-cols-3 gap-2">
                {[
                  { value: "oneDominant", label: "Dominant", desc: "1 max trait" },
                  { value: "twoEqual", label: "Dual", desc: "2 high traits" },
                  { value: "balanced", label: "Balanced", desc: "Even spread" },
                ].map((option) => (
                  <button
                    key={option.value}
                    onClick={() => setTraitShapeType(option.value as typeof traitShapeType)}
                    className={`p-3 rounded-lg border text-center transition-all ${
                      traitShapeType === option.value
                        ? "border-fuchsia-500/50 bg-fuchsia-500/15 shadow-md"
                        : "border-border/50 hover:border-fuchsia-500/30 hover:bg-fuchsia-500/5"
                    }`}
                  >
                    <div className={`text-sm font-medium ${
                      traitShapeType === option.value ? "text-fuchsia-400" : ""
                    }`}>
                      {option.label}
                    </div>
                    <div className="text-[10px] text-muted-foreground mt-0.5">
                      {option.desc}
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Action Buttons */}
          <div className="flex gap-3">
            <Button 
              variant="outline" 
              onClick={onClose} 
              disabled={isRunning}
              className="flex-1 h-11 rounded-xl border-border/50 hover:bg-muted/50"
            >
              Cancel
            </Button>
            <Button 
              onClick={handleApply} 
              disabled={isRunning}
              className="flex-1 h-11 rounded-xl bg-gradient-to-r from-purple-600 to-fuchsia-600 hover:from-purple-500 hover:to-fuchsia-500 shadow-lg shadow-purple-500/25 border-0"
            >
              {isRunning ? (
                <span className="flex items-center gap-2">
                  <div className="h-4 w-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  Optimizing...
                </span>
              ) : (
                <span className="flex items-center gap-2">
                  <Zap className="h-4 w-4" />
                  Apply Build
                </span>
              )}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );

  if (typeof window === "undefined") return null;
  return createPortal(modalContent, document.body);
}
