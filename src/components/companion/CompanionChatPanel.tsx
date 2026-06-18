import { useEffect, useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";
import { useAccount } from "wagmi";
import { useCompanionGotchis } from "./useCompanionGotchis";
import { useCompanion } from "@/state/useCompanion";
import { buildPersonality } from "@/lib/companion/personality";
import { postChat, getPremium, getHistory } from "@/lib/companion/api";
import { PersonalityCard } from "./PersonalityCard";
import { GoPremium } from "./GoPremium";
import { CompanionGotchiPicker } from "./CompanionGotchiPicker";
import { env } from "@/lib/env";
import type { ChatMessage } from "@/lib/companion/types";

export function CompanionChatPanel() {
  const { address } = useAccount();
  const gotchis = useCompanionGotchis();
  const { selectedTokenId, setOpen } = useCompanion();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [picking, setPicking] = useState(false);
  const [premium, setPremium] = useState(false);
  useEffect(() => { if (address) getPremium(address).then((s) => setPremium(s.active)).catch(() => {}); }, [address]);
  // Restore past conversation for this gotchi + owner (persists across browser close).
  useEffect(() => {
    if (address && selectedTokenId) getHistory(selectedTokenId, address).then(setMessages).catch(() => {});
    else setMessages([]);
  }, [address, selectedTokenId]);
  const endRef = useRef<HTMLDivElement>(null);

  const gotchi = useMemo(() => gotchis.find((g) => g.id === selectedTokenId) ?? null, [gotchis, selectedTokenId]);
  const profile = useMemo(() => (gotchi ? buildPersonality(gotchi) : null), [gotchi]);

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages, busy]);

  // Escape always closes, regardless of layout. (Clicking the mascot also toggles it.)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [setOpen]);

  async function send() {
    const text = draft.trim();
    if (!text || !selectedTokenId || !address || busy) return;
    setDraft("");
    setMessages((m) => [...m, { role: "user", content: text }]);
    setBusy(true);
    try {
      const res = await postChat(selectedTokenId, address, text);
      setMessages((m) => [...m, { role: "assistant", content: res.reply }]);
    } catch {
      setMessages((m) => [...m, { role: "assistant", content: "the ether glitched 👻 try again in a sec" }]);
    } finally {
      setBusy(false);
    }
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 16, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ type: "spring", stiffness: 300, damping: 26 }}
      className="fixed bottom-24 right-4 z-50 flex h-[32rem] max-h-[calc(100dvh-7rem)] w-[22rem] max-w-[92vw] flex-col overflow-hidden
                 rounded-2xl border border-white/10 bg-[#160a23]/85 shadow-2xl shadow-fuchsia-900/30 backdrop-blur-xl"
    >
      <div className="flex shrink-0 items-center justify-between border-b border-white/10 px-3 py-2">
        <button className="truncate text-xs text-fuchsia-200/80 hover:text-white" onClick={() => setPicking((p) => !p)}>
          {gotchi ? `${gotchi.name || `#${gotchi.id}`} ▾` : "Choose a gotchi ▾"}
        </button>
        <button className="-mr-1 shrink-0 rounded-lg px-2 py-1 text-base leading-none text-white/60 hover:bg-white/10 hover:text-white"
          onClick={() => setOpen(false)} aria-label="close">✕</button>
      </div>

      {picking ? (
        <div className="overflow-y-auto p-3"><CompanionGotchiPicker onPicked={() => setPicking(false)} /></div>
      ) : (
        <>
          <div className="flex-1 space-y-2 overflow-y-auto p-3">
            {profile && <PersonalityCard profile={profile} />}
            {env.companionPremiumEnabled && profile && !premium && <GoPremium onActivated={() => setPremium(true)} />}
            {messages.length === 0 && (
              <div className="pt-6 text-center text-sm text-white/40">
                say hi to your gotchi 👻
                <div className="mt-1 text-xs text-white/30">ask about its traits, kinship, or how to use the site</div>
              </div>
            )}
            {messages.map((m, i) => (
              <div key={i} className={`max-w-[85%] whitespace-pre-wrap rounded-2xl px-3 py-1.5 text-sm ${
                m.role === "user" ? "ml-auto bg-fuchsia-500/30 text-white" : "bg-white/10 text-white/90"}`}>
                {m.content}
              </div>
            ))}
            {busy && <div className="w-12 rounded-2xl bg-white/10 px-3 py-1.5 text-sm text-white/60">…</div>}
            <div ref={endRef} />
          </div>
          <div className="flex shrink-0 items-center gap-2 border-t border-white/10 p-2">
            <input
              value={draft} onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && send()}
              placeholder={address ? "talk to your gotchi…" : "connect wallet to chat"}
              disabled={!address || !selectedTokenId}
              className="flex-1 rounded-xl bg-black/40 px-3 py-2 text-sm text-white placeholder:text-white/30 outline-none"
            />
            <button onClick={send} disabled={busy || !draft.trim()}
              className="rounded-xl bg-fuchsia-500/80 px-3 py-2 text-sm font-medium text-white disabled:opacity-40">↑</button>
          </div>
        </>
      )}
    </motion.div>
  );
}
