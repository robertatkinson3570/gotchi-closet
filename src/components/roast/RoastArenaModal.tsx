import { useEffect, useReducer, useRef, useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import { useCompanion } from "@/state/useCompanion";
import { useRoastArena } from "./useRoastArena";
import { GotchiSvgById } from "@/components/explorer/GotchiSvgById";
import type { RoastBattle, RoastQueueEntry, RoastStatRow } from "@/lib/roast/api";

// ---------------------------------------------------------------------------
// Types & constants
// ---------------------------------------------------------------------------

type Tab = "queue" | "battles" | "leaderboard";

// ---------------------------------------------------------------------------
// Small presentational helpers
// ---------------------------------------------------------------------------

function WinLoss({ wins, losses }: { wins: number; losses: number }) {
  return (
    <span className="text-[11px] text-white/50">
      <span className="text-emerald-400">{wins}W</span>
      <span className="mx-0.5 text-white/30">/</span>
      <span className="text-rose-400">{losses}L</span>
    </span>
  );
}

function XpBadge({ xp }: { xp: number }) {
  return (
    <span className="rounded bg-fuchsia-500/20 px-1.5 py-0.5 text-[10px] font-semibold text-fuchsia-300">
      {xp.toLocaleString()} XP
    </span>
  );
}

function GotchiAvatar({ tokenId, size = "md" }: { tokenId: string; size?: "sm" | "md" | "lg" }) {
  const cls = size === "lg" ? "h-20 w-20" : size === "sm" ? "h-8 w-8" : "h-12 w-12";
  return (
    <span className={`${cls} shrink-0 overflow-hidden rounded-full border border-white/10 bg-black/40`}>
      <GotchiSvgById id={tokenId} className="block h-full w-full [&>svg]:h-full [&>svg]:w-full" />
    </span>
  );
}

// ---------------------------------------------------------------------------
// Rank chip (gold / silver / bronze / plain)
// ---------------------------------------------------------------------------
function RankChip({ rank }: { rank: number }) {
  const style =
    rank === 1 ? "bg-amber-400/20 text-amber-300 border-amber-400/40" :
    rank === 2 ? "bg-slate-300/20 text-slate-200 border-slate-400/40" :
    rank === 3 ? "bg-orange-700/20 text-orange-400 border-orange-600/40" :
    "bg-white/5 text-white/40 border-white/10";
  return (
    <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full border text-[11px] font-bold ${style}`}>
      {rank}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Queue tab
// ---------------------------------------------------------------------------

function QueueTab({
  queue, selectedTokenId, onEnter, onLeave, onRoast, busy,
}: {
  queue: RoastQueueEntry[];
  selectedTokenId: string | null;
  onEnter(): void;
  onLeave(): void;
  onRoast(opponentTokenId: string): void;
  busy: boolean;
}) {
  const inQueue = selectedTokenId ? queue.some((e) => e.tokenId === selectedTokenId) : false;
  const others = queue.filter((e) => e.tokenId !== selectedTokenId);

  return (
    <div className="flex flex-col gap-4">
      {/* Selected gotchi CTA */}
      {selectedTokenId && (
        <div className="flex items-center gap-3 rounded-2xl border border-fuchsia-500/20 bg-fuchsia-500/5 p-3">
          <GotchiAvatar tokenId={selectedTokenId} size="md" />
          <div className="min-w-0 flex-1">
            <div className="text-sm font-semibold text-white/80">Your Gotchi #{selectedTokenId}</div>
            <div className="mt-0.5 text-[11px] text-white/40">
              {inQueue ? "currently in the queue, waiting for challengers" : "not in queue"}
            </div>
          </div>
          <button
            onClick={inQueue ? onLeave : onEnter}
            disabled={busy}
            className={`shrink-0 rounded-xl px-3 py-1.5 text-sm font-semibold transition disabled:opacity-40 ${
              inQueue
                ? "border border-rose-500/40 bg-rose-500/10 text-rose-300 hover:bg-rose-500/20"
                : "bg-fuchsia-500 text-white shadow-lg shadow-fuchsia-900/40 hover:bg-fuchsia-400"
            }`}
          >
            {inQueue ? "Leave" : "⚔️ Enter the Arena"}
          </button>
        </div>
      )}

      {/* Challenger list */}
      <div>
        <div className="mb-2 text-[11px] uppercase tracking-widest text-white/30">
          Challengers waiting ({others.length})
        </div>
        {others.length === 0 ? (
          <div className="py-6 text-center text-sm text-white/30">
            the arena is empty… enter first to set the challenge
          </div>
        ) : (
          <div className="space-y-2">
            {others.map((entry) => (
              <motion.div
                key={entry.tokenId}
                initial={{ opacity: 0, x: -8 }}
                animate={{ opacity: 1, x: 0 }}
                className="flex items-center gap-3 rounded-xl border border-white/5 bg-white/5 px-3 py-2"
              >
                <GotchiAvatar tokenId={entry.tokenId} size="sm" />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium text-white/85">{entry.name || `#${entry.tokenId}`}</div>
                  <div className="flex items-center gap-2 mt-0.5">
                    <WinLoss wins={entry.wins} losses={entry.losses} />
                    <XpBadge xp={entry.xp} />
                  </div>
                </div>
                <button
                  onClick={() => onRoast(entry.tokenId)}
                  disabled={busy || !selectedTokenId}
                  className="shrink-0 rounded-lg border border-cyan-500/40 bg-cyan-500/10 px-2.5 py-1 text-xs font-semibold text-cyan-300 transition hover:bg-cyan-500/20 disabled:opacity-40"
                >
                  Roast!
                </button>
              </motion.div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// My Battles tab
// ---------------------------------------------------------------------------

function BattlesTab({
  battles,
  selectedTokenId,
  onReplay,
}: {
  battles: RoastBattle[];
  selectedTokenId: string | null;
  onReplay(battle: RoastBattle): void;
}) {
  if (battles.length === 0) {
    return (
      <div className="py-10 text-center text-sm text-white/30">
        no battles yet, enter the queue and roast someone
      </div>
    );
  }
  return (
    <div className="space-y-2">
      {battles.map((b) => {
        const won = b.winnerToken === selectedTokenId;
        const opponent = b.aToken === selectedTokenId ? { id: b.bToken, name: b.bName } : { id: b.aToken, name: b.aName };
        return (
          <motion.button
            key={b.id}
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            onClick={() => onReplay(b)}
            className="flex w-full items-center gap-3 rounded-xl border border-white/5 bg-white/5 px-3 py-2 text-left transition hover:border-fuchsia-500/30 hover:bg-fuchsia-500/5"
          >
            <GotchiAvatar tokenId={opponent.id} size="sm" />
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm text-white/80">vs {opponent.name || `#${opponent.id}`}</div>
              <div className="mt-0.5 text-[10px] text-white/40 truncate">{b.verdict}</div>
            </div>
            <span className={`shrink-0 rounded px-2 py-0.5 text-xs font-bold ${won ? "bg-emerald-500/20 text-emerald-400" : "bg-rose-500/20 text-rose-400"}`}>
              {won ? "WIN" : "LOSS"}
            </span>
            <span className="shrink-0 text-xs text-white/30">▶</span>
          </motion.button>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Leaderboard tab
// ---------------------------------------------------------------------------

function LeaderboardTab({
  rows,
  selectedTokenId,
}: {
  rows: RoastStatRow[];
  selectedTokenId: string | null;
}) {
  if (rows.length === 0) {
    return (
      <div className="py-10 text-center text-sm text-white/30">
        leaderboard is empty, fight for the top spot
      </div>
    );
  }
  return (
    <div className="space-y-1.5">
      {rows.map((row, i) => {
        const rank = i + 1;
        const isViewer = row.tokenId === selectedTokenId;
        return (
          <motion.div
            key={row.tokenId}
            initial={{ opacity: 0, x: 12 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: i * 0.03 }}
            className={`flex items-center gap-3 rounded-xl border px-3 py-2 ${
              isViewer
                ? "border-fuchsia-500/40 bg-fuchsia-500/10"
                : "border-white/5 bg-white/5"
            }`}
          >
            <RankChip rank={rank} />
            <GotchiAvatar tokenId={row.tokenId} size="sm" />
            <div className="min-w-0 flex-1">
              <div className={`truncate text-sm font-medium ${isViewer ? "text-fuchsia-200" : "text-white/80"}`}>
                {row.gotchiName || `#${row.tokenId}`}
                {isViewer && <span className="ml-1 text-[10px] text-fuchsia-400/70">you</span>}
              </div>
              <div className="flex items-center gap-2 mt-0.5">
                <WinLoss wins={row.wins} losses={row.losses} />
                <XpBadge xp={row.xp} />
              </div>
            </div>
          </motion.div>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Battle Replay view
// ---------------------------------------------------------------------------

function BattleReplay({
  battle,
  selectedTokenId,
  onBack,
  onRematch,
  busyRematch,
}: {
  battle: RoastBattle;
  selectedTokenId: string | null;
  onBack(): void;
  onRematch(opponentTokenId: string): void;
  busyRematch: boolean;
}) {
  const prefersReduced = useReducedMotion();
  const [visibleLines, setVisibleLines] = useState(0);
  const [verdictShown, setVerdictShown] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const isSideA = battle.aToken === selectedTokenId;
  const myToken = isSideA ? battle.aToken : battle.bToken;
  const oppToken = isSideA ? battle.bToken : battle.aToken;
  const myScore = isSideA ? battle.aScore : battle.bScore;
  const oppScore = isSideA ? battle.bScore : battle.aScore;
  const won = battle.winnerToken === myToken;

  const total = battle.transcript.length;

  useEffect(() => {
    setVisibleLines(0);
    setVerdictShown(false);
    if (prefersReduced) {
      setVisibleLines(total);
      setVerdictShown(true);
      return;
    }
    let i = 0;
    function tick() {
      i++;
      setVisibleLines(i);
      if (i < total) {
        timerRef.current = setTimeout(tick, 900);
      } else {
        timerRef.current = setTimeout(() => setVerdictShown(true), 700);
      }
    }
    timerRef.current = setTimeout(tick, 400);
    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
  }, [battle.id, prefersReduced, total]);

  return (
    <div className="flex flex-col gap-4">
      {/* VS staging */}
      <div className="flex items-center justify-center gap-6">
        <div className="flex flex-col items-center gap-1">
          <GotchiAvatar tokenId={battle.aToken} size="lg" />
          <div className="max-w-[5rem] truncate text-center text-xs text-white/70">{battle.aName || `#${battle.aToken}`}</div>
          <div className="text-[10px] text-white/40">{battle.aScore}pts</div>
        </div>
        <motion.div
          animate={prefersReduced ? {} : { scale: [1, 1.1, 1], textShadow: ["0 0 8px #f0abfc", "0 0 20px #f0abfc", "0 0 8px #f0abfc"] }}
          transition={{ repeat: Infinity, duration: 2 }}
          className="text-2xl font-black text-fuchsia-300 drop-shadow"
        >
          VS
        </motion.div>
        <div className="flex flex-col items-center gap-1">
          <GotchiAvatar tokenId={battle.bToken} size="lg" />
          <div className="max-w-[5rem] truncate text-center text-xs text-white/70">{battle.bName || `#${battle.bToken}`}</div>
          <div className="text-[10px] text-white/40">{battle.bScore}pts</div>
        </div>
      </div>

      {/* Transcript */}
      <div className="space-y-2">
        {battle.transcript.slice(0, visibleLines).map((line, idx) => {
          const isA = line.side === "a";
          return (
            <AnimatePresence key={idx} mode="wait">
              <motion.div
                initial={{ opacity: 0, x: isA ? -16 : 16, scale: 0.97 }}
                animate={{ opacity: 1, x: 0, scale: 1 }}
                transition={{ type: "spring", stiffness: 300, damping: 22 }}
                className={`flex gap-2 ${isA ? "flex-row" : "flex-row-reverse"}`}
              >
                <GotchiAvatar tokenId={isA ? battle.aToken : battle.bToken} size="sm" />
                <div className={`max-w-[75%] rounded-2xl px-3 py-2 text-sm leading-snug ${
                  isA
                    ? "rounded-tl-sm bg-fuchsia-500/20 text-fuchsia-100"
                    : "rounded-tr-sm bg-cyan-500/20 text-cyan-100"
                }`}>
                  <div className="mb-0.5 text-[9px] uppercase tracking-wider opacity-50">round {line.round}</div>
                  {line.text}
                </div>
              </motion.div>
            </AnimatePresence>
          );
        })}
      </div>

      {/* Verdict */}
      <AnimatePresence>
        {verdictShown && (
          <motion.div
            initial={{ opacity: 0, scale: 0.9, y: 8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            transition={{ type: "spring", stiffness: 260, damping: 20 }}
            className="rounded-2xl border border-fuchsia-500/30 bg-fuchsia-900/30 p-4 text-center"
          >
            {/* Winner / loser avatars */}
            <div className="mb-3 flex items-center justify-center gap-4">
              <motion.div
                animate={prefersReduced ? {} : won ? { scale: [1, 1.08, 1] } : { opacity: 0.45 }}
                transition={{ repeat: won ? Infinity : 0, duration: 1.8 }}
                className="flex flex-col items-center gap-1"
              >
                <GotchiAvatar tokenId={myToken} size="md" />
                <span className={`text-[10px] font-bold ${won ? "text-emerald-400" : "text-rose-400"}`}>
                  {won ? "WINNER" : "LOST"}
                </span>
              </motion.div>
              <div className="flex flex-col items-center gap-1">
                <GotchiAvatar tokenId={oppToken} size="md" />
                <span className={`text-[10px] font-bold ${won ? "text-rose-400" : "text-emerald-400"}`}>
                  {won ? "LOST" : "WINNER"}
                </span>
              </div>
            </div>

            {/* Score tally */}
            <div className="mb-2 flex items-center justify-center gap-3 text-sm">
              <span className="font-bold text-fuchsia-200">{myScore}</span>
              <span className="text-white/30">-</span>
              <span className="font-bold text-cyan-200">{oppScore}</span>
            </div>

            {/* Verdict marquee */}
            <div className="overflow-hidden rounded-xl bg-black/30 px-3 py-1.5">
              <p className="text-xs leading-relaxed text-white/70 italic">&ldquo;{battle.verdict}&rdquo;</p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Controls */}
      <div className="flex gap-2">
        <button
          onClick={onBack}
          className="flex-1 rounded-xl border border-white/10 bg-white/5 py-2 text-sm text-white/60 transition hover:bg-white/10"
        >
          ← Back
        </button>
        <button
          onClick={() => onRematch(oppToken)}
          disabled={busyRematch}
          className="flex-1 rounded-xl bg-fuchsia-500/80 py-2 text-sm font-semibold text-white transition hover:bg-fuchsia-400 disabled:opacity-40"
        >
          {busyRematch ? "battling…" : "⚔️ Rematch"}
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main modal
// ---------------------------------------------------------------------------

export function RoastArenaModal() {
  const roastOpen = useCompanion((s) => s.roastOpen);
  const setRoastOpen = useCompanion((s) => s.setRoastOpen);
  const selectedTokenId = useCompanion((s) => s.selectedTokenId);

  const { queue, leaderboard, battles, refresh, enter, leave, battle, loadBattle, busy, error } = useRoastArena();

  const [tab, setTab] = useState<Tab>("queue");
  const [replayBattle, setReplayBattle] = useState<RoastBattle | null>(null);
  const [busyRematch, setBusyRematch] = useState(false);

  // Refresh on open
  const [, forceRefresh] = useReducer((x: number) => x + 1, 0);
  useEffect(() => {
    if (roastOpen) { refresh(); forceRefresh(); }
  }, [roastOpen, refresh]);

  async function handleEnter() {
    if (!selectedTokenId) return;
    try { await enter(selectedTokenId); } catch { /* error shown via hook */ }
  }

  async function handleLeave() {
    if (!selectedTokenId) return;
    try { await leave(selectedTokenId); } catch { /* error shown via hook */ }
  }

  async function handleRoast(opponentTokenId: string) {
    try {
      const battleId = await battle(opponentTokenId);
      const b = await loadBattle(battleId);
      if (b) { setReplayBattle(b); }
    } catch { /* error shown via hook */ }
  }

  async function handleReplay(b: RoastBattle) {
    // Reload fresh from server to get full transcript
    const fresh = await loadBattle(b.id);
    setReplayBattle(fresh ?? b);
  }

  async function handleRematch(opponentTokenId: string) {
    setBusyRematch(true);
    try {
      const battleId = await battle(opponentTokenId);
      const b = await loadBattle(battleId);
      if (b) setReplayBattle(b);
    } catch { /* error shown via hook */ } finally {
      setBusyRematch(false);
    }
  }

  const tabs: { id: Tab; label: string }[] = [
    { id: "queue", label: "Queue" },
    { id: "battles", label: "My Battles" },
    { id: "leaderboard", label: "Leaderboard" },
  ];

  return (
    <Dialog.Root open={roastOpen} onOpenChange={setRoastOpen}>
      <Dialog.Portal>
        {/* Overlay */}
        <Dialog.Overlay asChild>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[60] bg-black/60 backdrop-blur-sm"
          />
        </Dialog.Overlay>

        {/* Panel */}
        <Dialog.Content asChild aria-describedby={undefined}>
          <motion.div
            initial={{ opacity: 0, scale: 0.97, y: 16 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.97, y: 16 }}
            transition={{ type: "spring", stiffness: 280, damping: 26 }}
            className={`
              fixed z-[61] flex flex-col
              inset-x-0 bottom-0 max-h-[92dvh] rounded-t-3xl
              sm:inset-auto sm:left-1/2 sm:top-1/2 sm:bottom-auto
              sm:-translate-x-1/2 sm:-translate-y-1/2
              sm:w-[36rem] sm:max-w-[95vw] sm:max-h-[85dvh] sm:rounded-3xl
              border border-fuchsia-500/25
              bg-[#160a23]/90 shadow-2xl shadow-fuchsia-900/40
              backdrop-blur-2xl
              overflow-hidden
            `}
            style={{
              boxShadow: "0 0 0 1px rgba(217,70,239,0.18), 0 32px 80px rgba(10,0,20,0.7), 0 0 60px rgba(217,70,239,0.12)",
            }}
          >
            {/* Neon top edge */}
            <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-fuchsia-500/60 to-transparent" />
            <div className="pointer-events-none absolute inset-x-0 bottom-0 h-px bg-gradient-to-r from-transparent via-cyan-500/30 to-transparent" />

            {/* Header */}
            <div className="flex shrink-0 items-center justify-between border-b border-white/10 px-5 py-3">
              <Dialog.Title className="font-black tracking-tight text-white">
                <span className="mr-1.5 text-lg">⚔️</span>
                <span className="bg-gradient-to-r from-fuchsia-300 to-cyan-300 bg-clip-text text-transparent text-lg uppercase tracking-widest">
                  Roast Arena
                </span>
              </Dialog.Title>
              <Dialog.Close asChild>
                <button
                  className="flex h-7 w-7 items-center justify-center rounded-full text-white/50 transition hover:bg-white/10 hover:text-white"
                  aria-label="close"
                >
                  ✕
                </button>
              </Dialog.Close>
            </div>

            {/* Tabs */}
            {!replayBattle && (
              <div className="flex shrink-0 gap-1 border-b border-white/10 px-4 py-2">
                {tabs.map((t) => (
                  <button
                    key={t.id}
                    onClick={() => setTab(t.id)}
                    className={`flex-1 rounded-lg py-1.5 text-xs font-semibold uppercase tracking-wider transition ${
                      tab === t.id
                        ? "bg-fuchsia-500/20 text-fuchsia-200 shadow-inner shadow-fuchsia-900/30"
                        : "text-white/40 hover:text-white/70"
                    }`}
                  >
                    {t.label}
                  </button>
                ))}
              </div>
            )}

            {/* Replay breadcrumb — always-visible escape back to the tabs/menu,
                so you can return to the leaderboard without refreshing. */}
            {replayBattle && (
              <div className="flex shrink-0 items-center gap-2 border-b border-white/10 px-4 py-2">
                <button
                  onClick={() => setReplayBattle(null)}
                  className="flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] font-semibold text-white/60 transition hover:bg-white/10 hover:text-white"
                >
                  ← Menu
                </button>
                <span className="text-[11px] uppercase tracking-widest text-white/30">Replay</span>
              </div>
            )}

            {/* Error banner */}
            {error && (
              <div className="shrink-0 bg-rose-500/10 px-4 py-2 text-xs text-rose-300">
                {error}
              </div>
            )}

            {/* Body — min-h-0 is REQUIRED: without it this flex child keeps its
                content's intrinsic height (default min-height:auto), overflows the
                capped panel, gets clipped by overflow-hidden, and never scrolls. */}
            <div className="flex-1 min-h-0 overflow-y-auto px-4 py-4">
              <AnimatePresence mode="wait">
                {replayBattle ? (
                  <motion.div
                    key="replay"
                    initial={{ opacity: 0, x: 16 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -16 }}
                  >
                    <BattleReplay
                      battle={replayBattle}
                      selectedTokenId={selectedTokenId}
                      onBack={() => setReplayBattle(null)}
                      onRematch={handleRematch}
                      busyRematch={busyRematch}
                    />
                  </motion.div>
                ) : tab === "queue" ? (
                  <motion.div key="queue" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                    <QueueTab
                      queue={queue}
                      selectedTokenId={selectedTokenId}
                      onEnter={handleEnter}
                      onLeave={handleLeave}
                      onRoast={handleRoast}
                      busy={busy}
                    />
                  </motion.div>
                ) : tab === "battles" ? (
                  <motion.div key="battles" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                    <BattlesTab
                      battles={battles}
                      selectedTokenId={selectedTokenId}
                      onReplay={handleReplay}
                    />
                  </motion.div>
                ) : (
                  <motion.div key="leaderboard" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                    <LeaderboardTab rows={leaderboard} selectedTokenId={selectedTokenId} />
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {/* Footer: refresh + busy indicator */}
            <div className="flex shrink-0 items-center justify-between border-t border-white/10 px-4 py-2">
              <button
                onClick={refresh}
                disabled={busy}
                className="text-[11px] text-white/30 transition hover:text-white/60 disabled:opacity-40"
              >
                ↻ refresh
              </button>
              {busy && (
                <span className="text-[11px] text-fuchsia-400/70 animate-pulse">working…</span>
              )}
            </div>
          </motion.div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
