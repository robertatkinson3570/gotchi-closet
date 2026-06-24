import { useEffect, useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";
import { useAccount, useSignMessage } from "wagmi";
import { useCompanionGotchis } from "./useCompanionGotchis";
import { useCompanion } from "@/state/useCompanion";
import { buildPersonality } from "@/lib/companion/personality";
import { postChat, getPremium, getHistory } from "@/lib/companion/api";
import { PersonalityCard } from "./PersonalityCard";
import { SoulDepthMeter } from "./SoulDepthMeter";
import { GoPremium } from "./GoPremium";
import { CompanionGotchiPicker } from "./CompanionGotchiPicker";
import { GlobalChatTab } from "./GlobalChatTab";
import { PoweredByWisp } from "@/components/wisp/PoweredByWisp";
import { env } from "@/lib/env";
import { premiumMessage, PREMIUM_SIG_TTL_MS } from "@/lib/companion/premiumAuth";
import type { ChatMessage } from "@/lib/companion/types";

export function CompanionChatPanel() {
  const { address } = useAccount();
  const { signMessageAsync } = useSignMessage();
  const gotchis = useCompanionGotchis();
  const { selectedTokenId, setOpen, setRoastOpen, script, clearScript } = useCompanion();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [picking, setPicking] = useState(false);
  const [tab, setTab] = useState<"chat" | "global">("chat");
  const [premium, setPremium] = useState(false);
  const [credits, setCredits] = useState(0);
  useEffect(() => { if (address) getPremium(address).then((s) => { setPremium(s.active); setCredits(s.credits); }).catch(() => {}); }, [address]);
  // Restore past conversation for this gotchi + owner (persists across browser close).
  useEffect(() => {
    if (address && selectedTokenId) getHistory(selectedTokenId, address).then(setMessages).catch(() => {});
    else setMessages([]);
  }, [address, selectedTokenId]);
  const endRef = useRef<HTMLDivElement>(null);

  const gotchi = useMemo(() => gotchis.find((g) => g.id === selectedTokenId) ?? null, [gotchis, selectedTokenId]);
  const profile = useMemo(() => (gotchi ? buildPersonality(gotchi) : null), [gotchi]);

  // Keep the latest message/script line in view — including the moment the panel opens. The
  // persona + soul panels above load async and grow the column AFTER first paint, which would
  // push a programmatic opener back below the fold, so we re-scroll a few times as it settles.
  useEffect(() => {
    const toBottom = () => endRef.current?.scrollIntoView({ block: "end" });
    toBottom();
    const timers = [80, 250, 600, 1000].map((ms) => setTimeout(toBottom, ms));
    return () => timers.forEach(clearTimeout);
  }, [messages, busy, script.length, selectedTokenId, picking, tab]);

  // Escape always closes, regardless of layout. (Clicking the mascot also toggles it.)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [setOpen]);

  // Premium chat must prove wallet ownership so the OpenAI key can't be spent by a
  // spoofed wallet. Sign once per 24h and cache it; free chat never signs.
  async function ensurePremiumAuth(): Promise<{ signature: string; signedAt: number } | undefined> {
    if (!address || !premium || !env.companionPremiumEnabled) return undefined;
    const key = `companion.premiumSig.${address.toLowerCase()}`;
    try {
      const cached = JSON.parse(localStorage.getItem(key) || "null");
      if (cached?.signature && Date.now() - cached.signedAt < PREMIUM_SIG_TTL_MS) return cached;
    } catch { /* ignore */ }
    const signedAt = Date.now();
    const signature = await signMessageAsync({ message: premiumMessage(address, signedAt) });
    const auth = { signature, signedAt };
    try { localStorage.setItem(key, JSON.stringify(auth)); } catch { /* ignore */ }
    return auth;
  }

  async function send() {
    const text = draft.trim();
    if (!text || !selectedTokenId || !address || busy) return;
    clearScript();
    setDraft("");
    setMessages((m) => [...m, { role: "user", content: text }]);
    setBusy(true);
    try {
      let auth: { signature: string; signedAt: number } | undefined;
      try { auth = await ensurePremiumAuth(); } catch { auth = undefined; }
      const res = await postChat(selectedTokenId, address, text, auth);
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
        <div className="flex shrink-0 items-center gap-1">
          <button
            onClick={() => setRoastOpen(true)}
            className="rounded-lg px-2 py-1 text-xs font-semibold text-fuchsia-300/70 transition hover:bg-fuchsia-500/10 hover:text-fuchsia-200"
            title="Roast Arena"
          >
            ⚔️ Arena
          </button>
          <button className="-mr-1 rounded-lg px-2 py-1 text-base leading-none text-white/60 hover:bg-white/10 hover:text-white"
            onClick={() => setOpen(false)} aria-label="close">✕</button>
        </div>
      </div>
      <div className="flex shrink-0 items-center justify-end border-b border-white/10 px-2 py-1">
        <PoweredByWisp />
      </div>
      <div className="flex shrink-0 gap-1 border-b border-white/10 px-2 py-1">
        {(["chat", "global"] as const).map((t) => (
          <button key={t} onClick={() => setTab(t)}
            className={`flex-1 rounded-lg py-1 text-xs ${tab === t ? "bg-fuchsia-500/20 text-white" : "text-white/50 hover:text-white"}`}>
            {t === "chat" ? "Chat" : "Global"}
          </button>
        ))}
      </div>

      {tab === "global" ? (
        <GlobalChatTab active={tab === "global"} />
      ) : picking ? (
        <div className="overflow-y-auto p-3"><CompanionGotchiPicker onPicked={() => { setPicking(false); clearScript(); }} /></div>
      ) : (
        <>
          <div className="flex-1 space-y-2 overflow-y-auto p-3">
            {profile && <PersonalityCard profile={profile} />}
            {selectedTokenId && <SoulDepthMeter tokenId={selectedTokenId} />}
            {credits > 0 && <div className="px-3 pt-1 text-[10px] text-fuchsia-200/60">⚡ {credits.toLocaleString()} premium credits</div>}
            {env.companionPremiumEnabled && profile && (!premium || credits < 200) && <GoPremium onActivated={() => getPremium(address!).then((s) => { setPremium(s.active); setCredits(s.credits); }).catch(() => {})} />}
            {script.map((line, i) => (
              <div key={`script-${i}`} className="max-w-[85%] whitespace-pre-wrap rounded-2xl bg-white/10 px-3 py-1.5 text-sm text-white/90">{line}</div>
            ))}
            {messages.length === 0 && script.length === 0 && (
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
