import { useEffect, useRef, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import { GotchiSvgById } from "@/components/explorer/GotchiSvgById";
import { ShareBar } from "@/components/soul/ShareBar";
import { env } from "@/lib/env";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface TranscriptLine {
  side: "a" | "b";
  round: number;
  text: string;
}

interface BattleResult {
  a: { token: string; name: string };
  b: { token: string; name: string };
  transcript: TranscriptLine[];
  verdict: string;
  winnerToken: string;
  aScore: number;
  bScore: number;
  cached: boolean;
}

interface BattleError {
  error: string;
}

type BattleData = BattleResult | BattleError;

// ---------------------------------------------------------------------------
// Fetch
// ---------------------------------------------------------------------------

async function fetchBattle(a: string, b: string): Promise<BattleData> {
  const res = await fetch(
    `${env.companionApiUrl}/api/arena/battle/${encodeURIComponent(a)}/vs/${encodeURIComponent(b)}`
  );
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function isBattleError(d: BattleData): d is BattleError {
  return "error" in d;
}

// Framer-motion spring variant for each transcript line
const lineVariants = {
  hidden: { opacity: 0, y: 18, scale: 0.96 },
  visible: { opacity: 1, y: 0, scale: 1, transition: { type: "spring", stiffness: 260, damping: 24 } },
};

// Winner glow
const winnerGlow = {
  hidden: { opacity: 0, scale: 0.9 },
  visible: { opacity: 1, scale: 1, transition: { type: "spring", stiffness: 200, damping: 20, delay: 0.15 } },
};

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function StagingPanel({ token, name, isWinner }: { token: string; name: string; isWinner: boolean }) {
  return (
    <div className="flex flex-col items-center gap-2">
      <div
        className={`rounded-2xl p-1 transition-all duration-500 ${
          isWinner
            ? "ring-4 ring-purple-400 shadow-[0_0_24px_6px_rgba(168,85,247,0.55)]"
            : "ring-2 ring-white/10"
        }`}
      >
        <GotchiSvgById id={token} className="w-28 h-28 sm:w-36 sm:h-36" />
      </div>
      <span className="text-sm font-semibold text-white/90 truncate max-w-[8rem]">{name}</span>
      {isWinner && (
        <motion.span
          variants={winnerGlow}
          initial="hidden"
          animate="visible"
          className="text-xs font-bold text-purple-300 uppercase tracking-widest"
        >
          Winner 👻
        </motion.span>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

export default function PublicBattlePage() {
  const { a, b } = useParams<{ a: string; b: string }>();

  const { data, isLoading, isError } = useQuery<BattleData>({
    queryKey: ["public-battle", a, b],
    queryFn: () => fetchBattle(a!, b!),
    staleTime: Infinity, // result is deterministic once cached
    retry: 1,
  });

  // Animate transcript lines one-by-one
  const [visibleCount, setVisibleCount] = useState(0);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!data || isBattleError(data)) return;
    setVisibleCount(0);
    const total = data.transcript.length;

    // Check prefers-reduced-motion
    const prefersReduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (prefersReduced) {
      setVisibleCount(total);
      return;
    }

    let i = 0;
    function tick() {
      i++;
      setVisibleCount(i);
      if (i < total) timerRef.current = setTimeout(tick, 900);
    }
    timerRef.current = setTimeout(tick, 400);
    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
  }, [data]);

  // ---------- loading ----------
  if (isLoading) {
    return (
      <div className="min-h-screen bg-[#0d0d1a] flex flex-col items-center justify-center gap-4 text-white/60">
        <motion.div
          animate={{ rotate: 360 }}
          transition={{ duration: 1.2, repeat: Infinity, ease: "linear" }}
          className="w-10 h-10 rounded-full border-4 border-purple-500 border-t-transparent"
        />
        <p className="text-sm">Summoning the arena…</p>
      </div>
    );
  }

  // ---------- error (network) ----------
  if (isError || !data) {
    return (
      <div className="min-h-screen bg-[#0d0d1a] flex flex-col items-center justify-center gap-4 text-white/60 px-4">
        <p className="text-2xl">👻</p>
        <p className="text-sm text-center">Could not reach the arena. Try again later.</p>
        <Link to="/" className="text-purple-400 hover:text-purple-300 text-sm underline">← Back home</Link>
      </div>
    );
  }

  // ---------- API-level error ----------
  if (isBattleError(data)) {
    return (
      <div className="min-h-screen bg-[#0d0d1a] flex flex-col items-center justify-center gap-4 text-white/60 px-4">
        <p className="text-2xl">👻</p>
        <p className="text-sm text-center">{data.error}</p>
        <Link to="/" className="text-purple-400 hover:text-purple-300 text-sm underline">← Back home</Link>
      </div>
    );
  }

  // ---------- full battle ----------
  const battleDone = visibleCount >= data.transcript.length;
  const winnerIsA = data.winnerToken === data.a.token;
  const winnerIsB = data.winnerToken === data.b.token;

  return (
    <div className="min-h-screen bg-[#0d0d1a] text-white font-sans">
      {/* Header */}
      <div className="max-w-2xl mx-auto px-4 pt-8 pb-4">
        <h1 className="text-center text-2xl sm:text-3xl font-extrabold tracking-tight text-transparent bg-clip-text bg-gradient-to-r from-purple-400 via-pink-400 to-cyan-400">
          Roast Arena
        </h1>
        <p className="text-center text-xs text-white/40 mt-1">
          Public battle · free model · read-only
        </p>
      </div>

      {/* VS staging */}
      <div className="max-w-2xl mx-auto px-4 py-4">
        <div className="flex items-center justify-around gap-4">
          <StagingPanel token={data.a.token} name={data.a.name} isWinner={battleDone && winnerIsA} />

          <div className="flex flex-col items-center gap-1 shrink-0">
            <motion.span
              initial={{ scale: 0.7, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ type: "spring", stiffness: 300, damping: 20 }}
              className="text-3xl sm:text-4xl font-black text-transparent bg-clip-text bg-gradient-to-b from-cyan-300 to-purple-500 drop-shadow-[0_0_12px_rgba(168,85,247,0.7)]"
            >
              VS
            </motion.span>
            <span className="text-[10px] text-white/30 uppercase tracking-widest">round</span>
          </div>

          <StagingPanel token={data.b.token} name={data.b.name} isWinner={battleDone && winnerIsB} />
        </div>
      </div>

      {/* Transcript */}
      <div className="max-w-2xl mx-auto px-4 pb-6 space-y-3">
        <AnimatePresence>
          {data.transcript.slice(0, visibleCount).map((line, idx) => {
            const isA = line.side === "a";
            return (
              <motion.div
                key={idx}
                variants={lineVariants}
                initial="hidden"
                animate="visible"
                className={`flex gap-3 ${isA ? "flex-row" : "flex-row-reverse"}`}
              >
                {/* Avatar chip */}
                <div className="shrink-0 w-8 h-8 rounded-full overflow-hidden ring-2 ring-white/10 mt-1">
                  <GotchiSvgById
                    id={isA ? data.a.token : data.b.token}
                    className="w-full h-full"
                  />
                </div>

                {/* Bubble */}
                <div
                  className={`max-w-[78%] rounded-2xl px-4 py-2.5 text-sm leading-snug shadow-md ${
                    isA
                      ? "bg-purple-800/60 text-purple-100 rounded-tl-none"
                      : "bg-cyan-800/60 text-cyan-100 rounded-tr-none"
                  }`}
                >
                  <span className="block text-[10px] font-bold uppercase tracking-wider mb-1 opacity-60">
                    {isA ? data.a.name : data.b.name} · round {line.round}
                  </span>
                  {line.text}
                </div>
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>

      {/* Verdict */}
      <AnimatePresence>
        {battleDone && (
          <motion.div
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ type: "spring", stiffness: 220, damping: 22 }}
            className="max-w-2xl mx-auto px-4 pb-8"
          >
            <div className="rounded-2xl border border-purple-500/30 bg-purple-900/30 backdrop-blur px-5 py-4 text-center space-y-1">
              <p className="text-xs font-bold uppercase tracking-widest text-purple-400">Judge's Verdict</p>
              <p className="text-base text-white/90">{data.verdict}</p>
              <p className="text-xs text-white/40">
                {data.a.name} {data.aScore} · {data.b.name} {data.bScore}
              </p>
            </div>

            {/* CTAs */}
            <div className="mt-6 flex flex-col sm:flex-row gap-3 justify-center">
              <Link
                to="/"
                className="text-center rounded-xl bg-purple-600 hover:bg-purple-500 active:bg-purple-700 transition-colors px-5 py-2.5 text-sm font-semibold text-white shadow-md"
              >
                Roast your own gotchi →
              </Link>
              <Link
                to={`/g/${a}`}
                className="text-center rounded-xl border border-cyan-500/40 hover:border-cyan-400 text-cyan-300 hover:text-cyan-200 transition-colors px-5 py-2.5 text-sm font-semibold"
              >
                Talk to {data.a.name} →
              </Link>
            </div>

            {/* Share */}
            <div className="mt-4 flex justify-center">
              <ShareBar
                url={`${window.location.origin}/arena/${a}/vs/${b}`}
                text={`${data.a.name} vs ${data.b.name}: who won this roast battle? 🔥👻`}
              />
            </div>

            {data.cached && (
              <p className="mt-3 text-center text-[10px] text-white/25">cached result</p>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
