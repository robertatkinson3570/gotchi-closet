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
type Phase = "approach" | "pose" | "move" | "exit";

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

function getExitSide(tokenId: string): "left" | "right" {
  const numId = parseInt(tokenId.replace(/\D/g, ""), 10) || 0;
  return numId % 2 === 0 ? "left" : "right";
}

function CrowdGotchi({ gotchi, size = 28 }: { gotchi: Gotchi; size?: number }) {
  return (
    <div className="catwalk-crowd-gotchi">
      <div className="gotchi-svg-wrapper" style={{ width: size, height: size }}>
        <GotchiSvg
          gotchiId={gotchi.gotchiId || gotchi.id}
          hauntId={gotchi.hauntId}
          collateral={gotchi.collateral}
          numericTraits={gotchi.numericTraits}
          equippedWearables={gotchi.equippedWearables}
          className="w-full h-full"
          mode="preview"
        />
      </div>
    </div>
  );
}

function ActiveGotchi({ 
  gotchi, 
  phaseClass 
}: { 
  gotchi: Gotchi; 
  phaseClass: string;
}) {
  return (
    <div className={`catwalk-active-container ${phaseClass}`}>
      <div className="gotchi-svg-wrapper" style={{ width: 160, height: 160 }}>
        <GotchiSvg
          gotchiId={gotchi.gotchiId || gotchi.id}
          hauntId={gotchi.hauntId}
          collateral={gotchi.collateral}
          numericTraits={gotchi.numericTraits}
          equippedWearables={gotchi.equippedWearables}
          className="w-full h-full"
          mode="preview"
        />
      </div>
      <div className="catwalk-active-shadow" />
      <div className="catwalk-active-info">
        <div className="catwalk-active-name">{gotchi.name}</div>
        <div className="catwalk-active-brs">BRS: {gotchi.baseRarityScore ?? "—"}</div>
      </div>
    </div>
  );
}

export function CatwalkModal({ gotchis, onClose }: CatwalkModalProps) {
  const [status, setStatus] = useState<Status>("loading");
  const [activeIndex, setActiveIndex] = useState(0);
  const [phase, setPhase] = useState<Phase>("approach");
  const [reducedMotion, setReducedMotion] = useState(false);
  const modalRef = useRef<HTMLDivElement>(null);

  const sortedGotchis = useMemo(() => {
    return [...gotchis].sort(
      (a, b) => (b.baseRarityScore ?? 0) - (a.baseRarityScore ?? 0)
    );
  }, [gotchis]);

  const { loading: assetsLoading, progress } = usePreloadAssets(sortedGotchis);

  const crowdGotchis = useMemo(() => {
    return sortedGotchis.slice(0, 40);
  }, [sortedGotchis]);

  const leftCrowd = useMemo(() => {
    return crowdGotchis.filter((_, i) => i % 2 === 0).slice(0, 16);
  }, [crowdGotchis]);

  const rightCrowd = useMemo(() => {
    return crowdGotchis.filter((_, i) => i % 2 === 1).slice(0, 16);
  }, [crowdGotchis]);

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
    setPhase("approach");
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

    if (phase === "approach") {
      setTimeout(() => setPhase("pose"), 2200);
    } else if (phase === "pose") {
      setTimeout(() => setPhase("move"), 400);
    } else if (phase === "move") {
      const move = getMoveForGotchi(sortedGotchis[activeIndex]?.id || "0");
      const duration = move === "moonwalk" ? 1200 : 800;
      setTimeout(() => setPhase("exit"), duration);
    } else if (phase === "exit") {
      setTimeout(() => {
        if (activeIndex < sortedGotchis.length - 1) {
          setActiveIndex((i) => i + 1);
          setPhase("approach");
        } else {
          setStatus("done");
        }
      }, 1000);
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
  const exitSide = activeGotchi ? getExitSide(activeGotchi.id) : "left";
  const move = activeGotchi ? getMoveForGotchi(activeGotchi.id) : "classic-twirl";

  const getPhaseClass = () => {
    if (reducedMotion) return "gotchi-pose";
    switch (phase) {
      case "approach":
        return "gotchi-approach";
      case "pose":
        return "gotchi-pose";
      case "move":
        return `move-${move}`;
      case "exit":
        if (move === "moonwalk") return "move-moonwalk";
        return exitSide === "left" ? "gotchi-exit-left" : "gotchi-exit-right";
      default:
        return "";
    }
  };

  const renderCrowdRows = (crowdList: Gotchi[]) => {
    const rows: Gotchi[][] = [[], [], [], []];
    crowdList.forEach((g, i) => {
      rows[i % 4].push(g);
    });
    return rows.map((row, i) => (
      <div key={i} className="catwalk-crowd-row">
        {row.map((g) => (
          <CrowdGotchi key={g.id} gotchi={g} size={24 + (i * 2)} />
        ))}
      </div>
    ));
  };

  const content = (
    <div
      ref={modalRef}
      tabIndex={-1}
      role="dialog"
      aria-modal="true"
      aria-label="Catwalk Mode"
      className="fixed inset-0 z-50"
      onKeyDown={handleKeyDown}
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="catwalk-stage">
        <div className="catwalk-backdrop" />
        
        <div className="catwalk-ghost-orb catwalk-ghost-orb-1" />
        <div className="catwalk-ghost-orb catwalk-ghost-orb-2" />
        <div className="catwalk-ghost-orb catwalk-ghost-orb-3" />
        
        <div className="catwalk-portal" />
        <div className="catwalk-haze" />
        
        <div className="catwalk-runway-container">
          <div className="catwalk-runway-glow" />
          <div className="catwalk-runway-plane" />
          <div className="catwalk-runway-lane" />
          <div className="catwalk-runway-edge-left" />
          <div className="catwalk-runway-edge-right" />
        </div>

        <div className="catwalk-crowd catwalk-crowd-left">
          {renderCrowdRows(leftCrowd)}
        </div>
        <div className="catwalk-crowd catwalk-crowd-right">
          {renderCrowdRows(rightCrowd)}
        </div>

        <div className="catwalk-mist">
          <div className="catwalk-mist-layer" />
          <div className="catwalk-mist-layer catwalk-mist-layer-2" />
        </div>
        
        <div className="catwalk-sparkles">
          {Array.from({ length: 12 }, (_, i) => (
            <div
              key={i}
              className="catwalk-sparkle"
              style={{
                left: `${10 + Math.random() * 80}%`,
                top: `${10 + Math.random() * 60}%`,
                animationDelay: `${Math.random() * 3}s`,
                animationDuration: `${2 + Math.random() * 2}s`,
              }}
            />
          ))}
        </div>
        
        <div className="catwalk-spotlight" />
        <div className="catwalk-vignette" />
      </div>

      <div className="catwalk-badge">
        <div className="catwalk-badge-title">CATWALK</div>
        <div className="catwalk-badge-subtitle">Visual showcase</div>
      </div>

      <Button
        variant="ghost"
        size="icon"
        className="catwalk-close text-white/60 hover:text-white hover:bg-white/10"
        onClick={onClose}
        aria-label="Close catwalk"
      >
        <X className="h-5 w-5" />
      </Button>

      {reducedMotion && status !== "loading" && status !== "done" && (
        <div className="catwalk-reduced-motion">
          Reduced motion enabled
        </div>
      )}

      {status === "loading" && (
        <div className="catwalk-loading">
          <Loader2 className="h-10 w-10 text-purple-400 animate-spin mb-4" />
          <div className="catwalk-loading-text">Loading Catwalk...</div>
          <div className="catwalk-loading-percent">{progress}%</div>
          <div className="catwalk-loading-bar">
            <div 
              className="catwalk-loading-fill"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>
      )}

      {status === "done" && (
        <div className="catwalk-end">
          <div className="catwalk-end-title">That's the show!</div>
          <div className="catwalk-end-subtitle">All gotchis have walked the runway.</div>
          <div className="catwalk-end-buttons">
            <Button
              onClick={handleReplay}
              className="bg-purple-600 hover:bg-purple-700"
            >
              <RotateCcw className="h-4 w-4 mr-2" />
              Replay
            </Button>
            <Button 
              variant="outline" 
              onClick={onClose} 
              className="text-white border-white/20 hover:bg-white/10"
            >
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back to Dress
            </Button>
          </div>
        </div>
      )}

      {status === "running" && activeGotchi && (
        <>
          <ActiveGotchi
            key={`${activeGotchi.id}-${activeIndex}`}
            gotchi={activeGotchi}
            phaseClass={getPhaseClass()}
          />
          <div className="catwalk-progress">
            {activeIndex + 1} / {sortedGotchis.length}
          </div>
        </>
      )}
    </div>
  );

  return createPortal(content, document.body);
}
