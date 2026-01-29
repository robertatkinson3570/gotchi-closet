import { useState, useEffect, useCallback } from "react";
import { Camera } from "lucide-react";
import { Button } from "@/ui/button";
import { toPng } from "html-to-image";
import { toast } from "@/ui/use-toast";

type PhotoState = "idle" | "countingDown" | "flashing" | "saving";

type Props = {
  walletAddress?: string;
  isActive?: boolean;
};

export function TakePictureButton({ walletAddress, isActive = true }: Props) {
  const [state, setState] = useState<PhotoState>("idle");
  const [countdown, setCountdown] = useState(3);

  const prefersReducedMotion = typeof window !== "undefined" 
    ? window.matchMedia("(prefers-reduced-motion: reduce)").matches 
    : false;

  const reset = useCallback(() => {
    setState("idle");
    setCountdown(3);
  }, []);

  useEffect(() => {
    if (!isActive && state !== "idle") {
      reset();
    }
  }, [isActive, state, reset]);

  useEffect(() => {
    if (state !== "countingDown") return;

    if (countdown === 0) {
      setState("flashing");
      return;
    }

    const timer = setTimeout(() => {
      setCountdown((c) => c - 1);
    }, 1000);

    return () => clearTimeout(timer);
  }, [state, countdown]);

  useEffect(() => {
    if (state !== "flashing") return;

    const flashDuration = prefersReducedMotion ? 0 : 150;
    const timer = setTimeout(() => {
      captureAndDownload();
    }, flashDuration);

    return () => clearTimeout(timer);
  }, [state, prefersReducedMotion]);

  const captureAndDownload = async () => {
    setState("saving");

    const gridEl = document.querySelector('[data-family-photo="true"]') as HTMLElement;
    if (!gridEl) {
      toast({ description: "Uh oh. The ghosts blinked. Try again 👻" });
      reset();
      return;
    }

    try {
      // Note: Captures only the currently rendered/visible portion of the grid.
      // With infinite scroll, not all gotchis may be loaded/rendered at capture time.
      const dataUrl = await toPng(gridEl, {
        backgroundColor: getComputedStyle(document.documentElement).getPropertyValue("--background") || "#ffffff",
        pixelRatio: 2,
      });

      const shortWallet = walletAddress ? walletAddress.slice(0, 6) : "";
      const date = new Date().toISOString().split("T")[0];
      const filename = shortWallet 
        ? `gotchi-family-photo_${shortWallet}_${date}.png`
        : `gotchi-family-photo_${date}.png`;

      const link = document.createElement("a");
      link.download = filename;
      link.href = dataUrl;
      link.click();

      reset();
    } catch (err) {
      console.error("Capture failed:", err);
      toast({ description: "Uh oh. The ghosts blinked. Try again 👻" });
      reset();
    }
  };

  const handleClick = () => {
    if (state !== "idle") return;
    setState("countingDown");
    setCountdown(3);
  };

  const buttonLabel = state === "saving" ? "Saving the fam…" : "Take a picture 📸";
  const isDisabled = state !== "idle";

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        onClick={handleClick}
        disabled={isDisabled}
        className="text-xs"
      >
        {state === "idle" && <Camera className="h-3.5 w-3.5 mr-1.5" />}
        {buttonLabel}
      </Button>

      {state === "countingDown" && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="text-center text-white">
            <div className="text-2xl font-medium mb-2">Say Cheese! 🧀</div>
            <div className="text-sm text-white/70 mb-6">Everyone look spooky…</div>
            <div 
              key={countdown}
              className="text-8xl font-bold animate-bounce"
              style={{ animationDuration: "0.3s" }}
            >
              {countdown}
            </div>
          </div>
        </div>
      )}

      {state === "flashing" && !prefersReducedMotion && (
        <div 
          className="fixed inset-0 z-50 bg-white pointer-events-none"
          style={{
            animation: "flash 150ms ease-in-out",
          }}
        />
      )}

      <style>{`
        @keyframes flash {
          0% { opacity: 0; }
          50% { opacity: 1; }
          100% { opacity: 0; }
        }
      `}</style>
    </>
  );
}
