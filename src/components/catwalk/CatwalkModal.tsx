import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { createPortal } from "react-dom";
import { X, RotateCcw, ArrowLeft, Loader2 } from "lucide-react";
import { Button } from "@/ui/button";
import { GotchiSvg } from "@/components/gotchi/GotchiSvg";
import { usePreloadAssets } from "./usePreloadAssets";
import type { Gotchi } from "@/types";
import "./catwalk.css";

type CatwalkModalProps = {
  gotchis: Gotchi[];
  onClose: () => void;
};

type Status = "loading" | "idle" | "running" | "done";
type Phase = "enter" | "arrival" | "pause" | "move" | "exit";

const MOVES = [
  "classic-twirl",
  "half-turn",
  "pivot-pose",
  "squash-stretch",
  "float-strut",
  "spotlight-pop",
  "moonwalk",
] as const;

type Move = (typeof MOVES)[number];

function getMoveForGotchi(tokenId: string): Move {
  const numId = parseInt(tokenId.replace(/\D/g, ""), 10) || 0;
  const index = numId % MOVES.length;
  return MOVES[index];
}

function getEntrySide(tokenId: string): "left" | "right" {
  const numId = parseInt(tokenId.replace(/\D/g, ""), 10) || 0;
  return numId % 100 < 10 ? "right" : "left";
}

function Particles() {
  const particles = useMemo(() => {
    return Array.from({ length: 20 }, (_, i) => ({
      id: i,
      left: `${Math.random() * 100}%`,
      delay: `${Math.random() * 8}s`,
      duration: `${12 + Math.random() * 8}s`,
      size: `${2 + Math.random() * 3}px`,
    }));
  }, []);

  return (
    <>
      {particles.map((p) => (
        <div
          key={p.id}
          className="catwalk-particle"
          style={{
            left: p.left,
            animationDelay: p.delay,
            animationDuration: p.duration,
            width: p.size,
            height: p.size,
          }}
        />
      ))}
    </>
  );
}

function GotchiCard({
  gotchi,
  size = "sm",
  className = "",
}: {
  gotchi: Gotchi;
  size?: "sm" | "lg";
  className?: string;
}) {
  const sizeClass = size === "lg" ? "h-40 w-40 sm:h-48 sm:w-48" : "h-10 w-10 sm:h-12 sm:w-12";
  const cardClass = size === "lg" ? "gotchi-card-active" : "gotchi-card";

  return (
    <div className={`${cardClass} ${className}`}>
      <GotchiSvg
        gotchiId={gotchi.gotchiId || gotchi.id}
        hauntId={gotchi.hauntId}
        collateral={gotchi.collateral}
        numericTraits={gotchi.numericTraits}
        equippedWearables={gotchi.equippedWearables}
        className={sizeClass}
        mode="preview"
      />
    </div>
  );
}

export function CatwalkModal({ gotchis, onClose }: CatwalkModalProps) {
  const [status, setStatus] = useState<Status>("loading");
  const [activeIndex, setActiveIndex] = useState(0);
  const [phase, setPhase] = useState<Phase>("enter");
  const [reducedMotion, setReducedMotion] = useState(false);
  const modalRef = useRef<HTMLDivElement>(null);

  const sortedGotchis = useMemo(() => {
    return [...gotchis].sort(
      (a, b) => (b.baseRarityScore ?? 0) - (a.baseRarityScore ?? 0)
    );
  }, [gotchis]);

  const { loading: assetsLoading, progress } = usePreloadAssets(sortedGotchis);

  useEffect(() => {
    if (!assetsLoading && status === "loading") {
      setStatus("idle");
    }
  }, [assetsLoading, status]);

  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReducedMotion(mq.matches);
    const handler = (e: MediaQueryListEvent) => setReducedMotion(e.matches);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);

  useEffect(() => {
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = "";
    };
  }, []);

  useEffect(() => {
    modalRef.current?.focus();
  }, []);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      }
    },
    [onClose]
  );

  const startShow = useCallback(() => {
    if (sortedGotchis.length === 0) return;
    setActiveIndex(0);
    setPhase("enter");
    setStatus("running");
  }, [sortedGotchis.length]);

  const advancePhase = useCallback(() => {
    if (reducedMotion) {
      if (activeIndex < sortedGotchis.length - 1) {
        setActiveIndex((i) => i + 1);
      } else {
        setStatus("done");
      }
      return;
    }

    if (phase === "enter") {
      setTimeout(() => setPhase("arrival"), 1000);
    } else if (phase === "arrival") {
      setTimeout(() => setPhase("pause"), 250);
    } else if (phase === "pause") {
      setTimeout(() => setPhase("move"), 250);
    } else if (phase === "move") {
      const move = getMoveForGotchi(sortedGotchis[activeIndex]?.id || "0");
      const duration = move === "moonwalk" ? 900 : 700;
      setTimeout(() => setPhase("exit"), duration);
    } else if (phase === "exit") {
      setTimeout(() => {
        if (activeIndex < sortedGotchis.length - 1) {
          setActiveIndex((i) => i + 1);
          setPhase("enter");
        } else {
          setStatus("done");
        }
      }, 700);
    }
  }, [phase, activeIndex, sortedGotchis, reducedMotion]);

  useEffect(() => {
    if (status === "running") {
      advancePhase();
    }
  }, [status, phase, activeIndex, advancePhase]);

  useEffect(() => {
    if (status === "idle" && sortedGotchis.length > 0) {
      startShow();
    }
  }, [status, sortedGotchis.length, startShow]);

  const handleReplay = () => {
    setStatus("idle");
  };

  const activeGotchi = sortedGotchis[activeIndex];
  const entrySide = activeGotchi ? getEntrySide(activeGotchi.id) : "left";
  const move = activeGotchi ? getMoveForGotchi(activeGotchi.id) : "classic-twirl";

  const getPhaseClass = () => {
    if (reducedMotion) return "";
    switch (phase) {
      case "enter":
        return entrySide === "left" ? "gotchi-enter-left" : "gotchi-enter-right";
      case "arrival":
        return "gotchi-arrival";
      case "pause":
        return "";
      case "move":
        return `move-${move}`;
      case "exit":
        if (move === "moonwalk") return "move-moonwalk";
        return entrySide === "left" ? "gotchi-exit-right" : "gotchi-exit-left";
      default:
        return "";
    }
  };

  const backstageGotchis = sortedGotchis.slice(activeIndex + 1, activeIndex + 7);

  const content = (
    <div
      ref={modalRef}
      tabIndex={-1}
      role="dialog"
      aria-modal="true"
      aria-label="Catwalk Mode"
      className="fixed inset-0 z-50 flex flex-col items-center justify-end pb-8 sm:pb-12"
      onKeyDown={handleKeyDown}
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="absolute inset-0 catwalk-stage">
        <Particles />
        <div className="catwalk-vignette" />
      </div>

      <div className="absolute top-4 left-4 z-10">
        <div className="bg-purple-600/60 text-white px-3 py-1 rounded-full text-xs font-semibold backdrop-blur-sm">
          CATWALK
        </div>
        <div className="text-purple-400/60 text-[10px] mt-1">
          Visual showcase only
        </div>
      </div>

      <Button
        variant="ghost"
        size="icon"
        className="absolute top-4 right-4 z-10 text-white/70 hover:text-white hover:bg-white/10"
        onClick={onClose}
        aria-label="Close catwalk"
      >
        <X className="h-5 w-5" />
      </Button>

      {reducedMotion && status !== "loading" && (
        <div className="absolute top-16 left-1/2 -translate-x-1/2 z-10 bg-amber-600/70 text-white px-3 py-1.5 rounded-lg text-xs backdrop-blur-sm">
          Reduced motion enabled
        </div>
      )}

      {status === "loading" ? (
        <div className="relative z-10 flex flex-col items-center justify-center h-full loading-container">
          <Loader2 className="h-10 w-10 text-purple-400 animate-spin mb-4" />
          <div className="text-white font-medium mb-2">Loading Catwalk...</div>
          <div className="text-purple-300 text-sm">{progress}%</div>
          <div className="w-48 h-1.5 bg-purple-900/50 rounded-full mt-3 overflow-hidden">
            <div 
              className="h-full bg-purple-500 rounded-full transition-all duration-300"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>
      ) : status === "done" ? (
        <div className="relative z-10 text-center flex flex-col items-center justify-center h-full">
          <h2 className="text-2xl sm:text-3xl font-bold text-white mb-2">That's the show!</h2>
          <p className="text-purple-300/80 mb-6 text-sm">All gotchis have walked the runway.</p>
          <div className="flex gap-3 justify-center">
            <Button
              onClick={handleReplay}
              className="bg-purple-600 hover:bg-purple-700 text-sm"
            >
              <RotateCcw className="h-4 w-4 mr-2" />
              Replay
            </Button>
            <Button 
              variant="outline" 
              onClick={onClose} 
              className="text-white border-white/20 hover:bg-white/10 text-sm"
            >
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back to Dress
            </Button>
          </div>
        </div>
      ) : (
        <>
          <div className="absolute top-1/4 left-1/2 -translate-x-1/2 z-5 flex flex-col items-center">
            <div className="text-purple-400/50 text-[10px] uppercase tracking-widest mb-3">
              Backstage
            </div>
            <div className="backstage-container">
              {backstageGotchis.map((g, i) => (
                <div
                  key={g.id}
                  className="backstage-gotchi"
                  style={{ animationDelay: `${i * 0.3}s` }}
                >
                  <GotchiCard gotchi={g} size="sm" />
                </div>
              ))}
            </div>
          </div>

          <div className="relative z-10 flex flex-col items-center w-full px-4">
            <div className="catwalk-spotlight absolute w-72 h-72 sm:w-96 sm:h-96 rounded-full -top-48 sm:-top-56" />

            {activeGotchi && (
              <div className="relative mb-6">
                <div 
                  className={`active-gotchi-wrapper ${getPhaseClass()}`} 
                  key={`${activeGotchi.id}-${phase}`}
                >
                  <GotchiCard gotchi={activeGotchi} size="lg" />
                </div>
                <div className="gotchi-shadow" />
                
                <div className="text-center mt-4 transition-opacity duration-300">
                  <div className="text-white font-bold text-base sm:text-lg">{activeGotchi.name}</div>
                  <div className="text-purple-300/70 text-xs sm:text-sm">
                    BRS: {activeGotchi.baseRarityScore ?? "—"}
                  </div>
                </div>
              </div>
            )}

            <div className="catwalk-runway-platform" />

            <div className="mt-4 text-purple-400/50 text-xs">
              {activeIndex + 1} / {sortedGotchis.length}
            </div>
          </div>
        </>
      )}
    </div>
  );

  return createPortal(content, document.body);
}
