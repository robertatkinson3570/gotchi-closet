import { useState, useRef, useEffect } from "react";
import { useParams, Link } from "react-router-dom";
import { useQuery, useMutation } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import { GotchiSvgById } from "@/components/explorer/GotchiSvgById";
import { SoulBadge } from "@/components/soul/SoulBadge";
import { ShareBar } from "@/components/soul/ShareBar";
import { env } from "@/lib/env";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface PublicGotchiData {
  tokenId: string;
  name: string;
  traits: number[];
  owner?: string;
  kinship: number;
  level: number;
  archetype: string;
  traitLines: { emoji: string; label: string; reason: string }[];
}

interface ChatMessage {
  role: "user" | "gotchi";
  text: string;
}

// ---------------------------------------------------------------------------
// API helpers
// ---------------------------------------------------------------------------

const apiBase = env.companionApiUrl;

async function fetchArenaGotchi(tokenId: string): Promise<PublicGotchiData> {
  const res = await fetch(`${apiBase}/api/arena/gotchi/${tokenId}`);
  if (!res.ok) throw new Error(res.status === 404 ? "not_found" : "fetch_error");
  return res.json();
}

async function sendChat(
  tokenId: string,
  message: string
): Promise<{ reply: string; source: string }> {
  const res = await fetch(`${apiBase}/api/arena/chat/${tokenId}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message }),
  });
  if (!res.ok) throw new Error("chat_error");
  return res.json();
}

// ---------------------------------------------------------------------------
// Trait label helpers (mirrors personality.ts poles)
// ---------------------------------------------------------------------------

const TRAIT_CODES = ["NRG", "AGG", "SPK", "BRN"];
const TRAIT_NAMES = ["Energy", "Aggression", "Spookiness", "Brain"];

function traitBar(value: number) {
  const pct = Math.round(Math.min(100, Math.max(0, value)));
  const isHigh = value >= 50;
  return (
    <div className="flex items-center gap-2 text-xs">
      <div className="w-24 h-1.5 rounded-full bg-white/10 overflow-hidden">
        <div
          className={`h-full rounded-full transition-all ${isHigh ? "bg-purple-400" : "bg-cyan-400"}`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="text-white/50 tabular-nums w-6">{value}</span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function PublicGotchiPage() {
  const { tokenId = "" } = useParams<{ tokenId: string }>();
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [capped, setCapped] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  const {
    data: gotchi,
    isLoading,
    isError,
    error,
  } = useQuery({
    queryKey: ["arena-gotchi", tokenId],
    queryFn: () => fetchArenaGotchi(tokenId),
    enabled: !!tokenId,
    retry: 1,
    staleTime: 5 * 60_000,
  });

  const chatMutation = useMutation({
    mutationFn: (msg: string) => sendChat(tokenId, msg),
    onSuccess: (data) => {
      setMessages((prev) => [...prev, { role: "gotchi", text: data.reply }]);
      if (data.source === "capped") setCapped(true);
    },
    onError: () => {
      setMessages((prev) => [
        ...prev,
        { role: "gotchi", text: "The ether is disrupted… try again in a moment 👻" },
      ]);
    },
  });

  // Scroll to bottom when new messages arrive
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  function handleSend() {
    const trimmed = input.trim();
    if (!trimmed || chatMutation.isPending) return;
    setMessages((prev) => [...prev, { role: "user", text: trimmed }]);
    setInput("");
    chatMutation.mutate(trimmed);
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }

  // ---------------------------------------------------------------------------
  // Loading / error states
  // ---------------------------------------------------------------------------

  if (isLoading) {
    return (
      <div className="min-h-screen bg-[#0d0d1a] flex items-center justify-center">
        <motion.div
          animate={{ opacity: [0.4, 1, 0.4] }}
          transition={{ duration: 1.6, repeat: Infinity }}
          className="text-purple-300 text-lg font-semibold"
        >
          Summoning spirit…
        </motion.div>
      </div>
    );
  }

  if (isError || !gotchi) {
    const notFound = (error as Error)?.message === "not_found";
    return (
      <div className="min-h-screen bg-[#0d0d1a] flex flex-col items-center justify-center gap-4 px-4 text-center">
        <div className="text-5xl">👻</div>
        <h1 className="text-white text-2xl font-bold">
          {notFound ? "Lost Spirit" : "Something went wrong"}
        </h1>
        <p className="text-white/50 max-w-sm">
          {notFound
            ? `Gotchi #${tokenId} hasn't been summoned yet, or has wandered beyond the veil.`
            : "The subgraph ether is disrupted. Try again in a moment."}
        </p>
        <Link
          to="/"
          className="mt-2 text-purple-400 hover:text-purple-300 underline underline-offset-2"
        >
          ← Back to GotchiCloset
        </Link>
      </div>
    );
  }

  // ---------------------------------------------------------------------------
  // Main render
  // ---------------------------------------------------------------------------

  const traitHighlights = gotchi.traits.slice(0, 4);

  return (
    <div className="min-h-screen bg-[#0d0d1a] text-white">
      {/* Top bar */}
      <div className="border-b border-white/8 px-4 py-2 flex items-center justify-between max-w-4xl mx-auto">
        <Link to="/" className="text-purple-400 hover:text-purple-300 text-sm font-medium">
          ← GotchiCloset
        </Link>
        <span className="text-white/30 text-xs">Gotchi Arena · public preview</span>
      </div>

      <div className="max-w-4xl mx-auto px-4 py-8 flex flex-col gap-8 md:flex-row md:items-start">
        {/* Left: Gotchi card */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
          className="flex-shrink-0 flex flex-col items-center gap-4 w-full md:w-64"
        >
          {/* Sprite */}
          <div className="relative">
            <div
              className="w-48 h-48 rounded-2xl overflow-hidden flex items-center justify-center"
              style={{
                background: "radial-gradient(circle at 50% 60%, rgba(139,92,246,0.18) 0%, rgba(6,182,212,0.10) 60%, transparent 100%)",
                boxShadow: "0 0 40px rgba(139,92,246,0.25), 0 0 80px rgba(6,182,212,0.08)",
              }}
            >
              <GotchiSvgById id={gotchi.tokenId} className="w-40 h-40" />
            </div>
          </div>

          {/* Name + badge */}
          <div className="flex flex-col items-center gap-1.5">
            <h1 className="text-xl font-bold text-white text-center">{gotchi.name}</h1>
            <div className="flex items-center gap-2">
              <SoulBadge kinship={gotchi.kinship} level={gotchi.level} size="md" />
              <span className="text-white/40 text-xs">Lv {gotchi.level}</span>
            </div>
            <p className="text-purple-300 text-sm font-medium text-center">{gotchi.archetype}</p>
            {gotchi.owner && (
              <p className="text-white/25 text-xs font-mono">{gotchi.owner}</p>
            )}
          </div>

          {/* Trait bars */}
          <div className="w-full bg-white/5 rounded-xl p-4 flex flex-col gap-2.5">
            <p className="text-white/40 text-[10px] uppercase tracking-widest mb-1">Traits</p>
            {traitHighlights.map((val, i) => (
              <div key={TRAIT_CODES[i]} className="flex items-center gap-2">
                <span className="text-white/50 text-xs w-8 shrink-0">{TRAIT_CODES[i]}</span>
                <div className="flex-1">{traitBar(val)}</div>
                <span className="text-white/30 text-[10px] w-16 hidden sm:block">{TRAIT_NAMES[i]}</span>
              </div>
            ))}
          </div>

          {/* Trait lines (personality card) */}
          {gotchi.traitLines.length > 0 && (
            <div className="w-full bg-white/4 rounded-xl p-4 flex flex-col gap-1.5">
              <p className="text-white/40 text-[10px] uppercase tracking-widest mb-1">Personality</p>
              {gotchi.traitLines.slice(0, 6).map((line, i) => (
                <div key={i} className="flex items-center gap-1.5 text-xs text-white/60">
                  <span>{line.emoji}</span>
                  <span>{line.label}</span>
                </div>
              ))}
            </div>
          )}
        </motion.div>

        {/* Right: Chat */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.1 }}
          className="flex-1 flex flex-col gap-4 min-h-[480px]"
        >
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-white/60 text-sm">Talk to</span>
            <span className="text-purple-300 font-semibold text-sm">{gotchi.name}</span>
            <span className="text-white/20 text-xs ml-auto">no wallet needed</span>
          </div>
          <ShareBar
            url={`${window.location.origin}/g/${tokenId}`}
            text={`Come talk to ${gotchi.name} on GotchiCloset 👻`}
          />

          {/* Message list */}
          <div
            className="flex-1 overflow-y-auto flex flex-col gap-3 rounded-2xl p-4 min-h-[300px] max-h-[420px]"
            style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)" }}
          >
            {messages.length === 0 && (
              <motion.p
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="text-white/25 text-sm text-center mt-8 select-none"
              >
                Say hello to {gotchi.name} 👋
              </motion.p>
            )}

            <AnimatePresence initial={false}>
              {messages.map((msg, i) => (
                <motion.div
                  key={i}
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.2 }}
                  className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
                >
                  <div
                    className={`max-w-[80%] rounded-2xl px-3.5 py-2 text-sm leading-relaxed ${
                      msg.role === "user"
                        ? "bg-purple-600/60 text-white rounded-br-sm"
                        : "bg-cyan-900/40 text-cyan-100 rounded-bl-sm border border-cyan-500/15"
                    }`}
                  >
                    {msg.text}
                  </div>
                </motion.div>
              ))}
            </AnimatePresence>

            {chatMutation.isPending && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="flex justify-start"
              >
                <div className="bg-cyan-900/40 border border-cyan-500/15 rounded-2xl rounded-bl-sm px-3.5 py-2 text-cyan-300/60 text-sm">
                  <motion.span
                    animate={{ opacity: [0.4, 1, 0.4] }}
                    transition={{ duration: 1.2, repeat: Infinity }}
                  >
                    …
                  </motion.span>
                </div>
              </motion.div>
            )}

            <div ref={bottomRef} />
          </div>

          {/* Input */}
          {capped ? (
            <motion.div
              initial={{ opacity: 0, scale: 0.97 }}
              animate={{ opacity: 1, scale: 1 }}
              className="rounded-2xl p-4 text-center"
              style={{ background: "rgba(139,92,246,0.12)", border: "1px solid rgba(139,92,246,0.25)" }}
            >
              <p className="text-purple-200 text-sm font-medium mb-2">
                You've hit today's free chat limit 👻
              </p>
              <p className="text-white/50 text-xs mb-4">
                Connect your wallet to unlock the full companion: unlimited chat, pet, equip, and more.
              </p>
              <Link
                to="/"
                className="inline-block bg-purple-600 hover:bg-purple-500 transition-colors text-white text-sm font-semibold px-5 py-2 rounded-xl"
              >
                Connect wallet →
              </Link>
            </motion.div>
          ) : (
            <div className="flex gap-2">
              <input
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value.slice(0, 300))}
                onKeyDown={handleKeyDown}
                placeholder={`Ask ${gotchi.name} something…`}
                disabled={chatMutation.isPending}
                className="flex-1 rounded-xl px-4 py-2.5 text-sm bg-white/6 border border-white/10 text-white placeholder-white/25 focus:outline-none focus:border-purple-500/60 focus:bg-white/8 transition-all disabled:opacity-50"
              />
              <button
                onClick={handleSend}
                disabled={!input.trim() || chatMutation.isPending}
                className="rounded-xl px-4 py-2.5 text-sm font-semibold bg-purple-600 hover:bg-purple-500 disabled:opacity-40 disabled:cursor-not-allowed transition-colors text-white shrink-0"
              >
                Send
              </button>
            </div>
          )}

          {/* CTA banner */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.6 }}
            className="rounded-xl px-4 py-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2"
            style={{ background: "rgba(6,182,212,0.06)", border: "1px solid rgba(6,182,212,0.12)" }}
          >
            <p className="text-white/50 text-xs leading-relaxed">
              Connect your wallet for the full companion + Roast Arena →
            </p>
            <Link
              to="/"
              className="text-cyan-400 hover:text-cyan-300 text-xs font-semibold whitespace-nowrap transition-colors"
            >
              Get started ↗
            </Link>
          </motion.div>
        </motion.div>
      </div>
    </div>
  );
}
