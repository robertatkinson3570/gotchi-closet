import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { createPortal } from "react-dom";
import { X, RotateCcw, ArrowLeft } from "lucide-react";
import { Button } from "@/ui/button";
import { GotchiSvg } from "@/components/gotchi/GotchiSvg";
import type { Gotchi } from "@/types";
import "./catwalk.css";

type CatwalkModalProps = {
  gotchis: Gotchi[];
  onClose: () => void;
};

type Status = "idle" | "running" | "done";
type Phase = "enter" | "pause" | "move" | "exit";

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
    return Array.from({ length: 15 }, (_, i) => ({
      id: i,
      left: `${Math.random() * 100}%`,
      delay: `${Math.random() * 10}s`,
      duration: `${10 + Math.random() * 10}s`,
      size: `${3 + Math.random() * 4}px`,
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

export function CatwalkModal({ gotchis, onClose }: CatwalkModalProps) {
  const [status, setStatus] = useState<Status>("idle");
  const [activeIndex, setActiveIndex] = useState(0);
  const [phase, setPhase] = useState<Phase>("enter");
  const [reducedMotion, setReducedMotion] = useState(false);
  const modalRef = useRef<HTMLDivElement>(null);

  const sortedGotchis = useMemo(() => {
    return [...gotchis].sort(
      (a, b) => (b.baseRarityScore ?? 0) - (a.baseRarityScore ?? 0)
    );
  }, [gotchis]);

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
      setTimeout(() => setPhase("pause"), 1200);
    } else if (phase === "pause") {
      setTimeout(() => setPhase("move"), 200);
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
      }, 800);
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

  const content = (
    <div
      ref={modalRef}
      tabIndex={-1}
      role="dialog"
      aria-modal="true"
      aria-label="Catwalk Mode"
      className="fixed inset-0 z-50 flex items-center justify-center"
      onKeyDown={handleKeyDown}
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="absolute inset-0 catwalk-stage">
        <Particles />
      </div>

      <div className="absolute top-4 left-4 z-10">
        <div className="bg-purple-600/80 text-white px-3 py-1 rounded-full text-sm font-bold">
          CATWALK MODE
        </div>
        <div className="text-purple-300/80 text-xs mt-1">
          Pure vibes. Zero stat changes.
        </div>
      </div>

      <Button
        variant="ghost"
        size="icon"
        className="absolute top-4 right-4 z-10 text-white hover:bg-white/10"
        onClick={onClose}
        aria-label="Close catwalk"
      >
        <X className="h-6 w-6" />
      </Button>

      {reducedMotion && (
        <div className="absolute top-20 left-1/2 -translate-x-1/2 z-10 bg-amber-600/80 text-white px-4 py-2 rounded-lg text-sm">
          Reduced motion enabled. Animations disabled.
        </div>
      )}

      {status === "done" ? (
        <div className="relative z-10 text-center">
          <h2 className="text-3xl font-bold text-white mb-2">That's the show</h2>
          <p className="text-purple-300 mb-6">All gotchis have walked the Catwalk.</p>
          <div className="flex gap-4 justify-center">
            <Button
              onClick={handleReplay}
              className="bg-purple-600 hover:bg-purple-700"
            >
              <RotateCcw className="h-4 w-4 mr-2" />
              Replay
            </Button>
            <Button variant="outline" onClick={onClose} className="text-white border-white/30 hover:bg-white/10">
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back to Dress
            </Button>
          </div>
        </div>
      ) : (
        <>
          <div className="absolute bottom-8 left-8 z-10">
            <div className="text-purple-400/60 text-xs mb-2">Backstage</div>
            <div className="flex gap-2 flex-wrap max-w-xs">
              {sortedGotchis.slice(activeIndex + 1, activeIndex + 6).map((g, i) => (
                <div
                  key={g.id}
                  className="gotchi-backstage opacity-40"
                  style={{ animationDelay: `${i * 0.2}s` }}
                >
                  <GotchiSvg
                    gotchiId={g.gotchiId || g.id}
                    hauntId={g.hauntId}
                    collateral={g.collateral}
                    numericTraits={g.numericTraits}
                    equippedWearables={g.equippedWearables}
                    className="h-12 w-12"
                    mode="preview"
                  />
                </div>
              ))}
            </div>
          </div>

          <div className="relative z-10 flex flex-col items-center">
            <div className="catwalk-spotlight absolute w-80 h-80 rounded-full -z-10" />

            <div className="catwalk-runway w-96 h-2 rounded-full mb-8" />

            {activeGotchi && (
              <div className={`${getPhaseClass()}`} key={`${activeGotchi.id}-${phase}`}>
                <GotchiSvg
                  gotchiId={activeGotchi.gotchiId || activeGotchi.id}
                  hauntId={activeGotchi.hauntId}
                  collateral={activeGotchi.collateral}
                  numericTraits={activeGotchi.numericTraits}
                  equippedWearables={activeGotchi.equippedWearables}
                  className="h-48 w-48"
                  mode="preview"
                />
                <div className="text-center mt-4 transition-opacity duration-300">
                  <div className="text-white font-bold text-lg">{activeGotchi.name}</div>
                  <div className="text-purple-300 text-sm">
                    BRS: {activeGotchi.baseRarityScore ?? "—"}
                  </div>
                </div>
              </div>
            )}

            <div className="absolute bottom-4 text-purple-400/60 text-sm">
              {activeIndex + 1} / {sortedGotchis.length}
            </div>
          </div>
        </>
      )}
    </div>
  );

  return createPortal(content, document.body);
}
