import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { useAccount, useSignMessage, useWalletClient } from "wagmi";
import { stewardApi } from "@/lib/steward/api";
import { useCompanionGotchis } from "./useCompanionGotchis";
import { useCompanion } from "@/state/useCompanion";
import { buildPersonality } from "@/lib/companion/personality";
import { postChat, getPremium, getHistory, getGoals, setGoal, getRecentActions } from "@/lib/companion/api";
import { PersonalityCard } from "./PersonalityCard";
import { SoulDepthMeter } from "./SoulDepthMeter";
import { GoPremium } from "./GoPremium";
import { CompanionGotchiPicker } from "./CompanionGotchiPicker";
import { GlobalChatTab } from "./GlobalChatTab";
import { PoweredByWisp } from "@/components/wisp/PoweredByWisp";
import { env } from "@/lib/env";
import { premiumMessage, PREMIUM_SIG_TTL_MS } from "@/lib/companion/premiumAuth";
import { actionMessage, ACTION_SIG_TTL_MS } from "@/lib/companion/actionAuth";
import type { ChatMessage } from "@/lib/companion/types";

export function CompanionChatPanel() {
  const { address } = useAccount();
  const { signMessageAsync } = useSignMessage();
  const { data: walletClient } = useWalletClient();
  const navigate = useNavigate();
  const gotchis = useCompanionGotchis();
  const { selectedTokenId, setOpen, setRoastOpen, script, clearScript } = useCompanion();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [picking, setPicking] = useState(false);
  const [tab, setTab] = useState<"chat" | "global">("chat");
  const [premium, setPremium] = useState(false);
  const [credits, setCredits] = useState(0);
  const [autoCollect, setAutoCollect] = useState(false);
  const [goalBusy, setGoalBusy] = useState(false);
  useEffect(() => { if (address) getPremium(address).then((s) => { setPremium(s.active); setCredits(s.credits); }).catch(() => {}); }, [address]);
  // Reflect the standing "keep_emptied" goal for the selected gotchi in the auto-collect toggle.
  useEffect(() => {
    if (!address || !selectedTokenId) { setAutoCollect(false); return; }
    getGoals(address)
      .then((gs) => setAutoCollect(gs.some((g) => g.tokenId === selectedTokenId && g.goal === "keep_emptied" && g.enabled)))
      .catch(() => {});
  }, [address, selectedTokenId]);
  // Restore past conversation for this gotchi + owner (persists across browser close).
  useEffect(() => {
    if (address && selectedTokenId) getHistory(selectedTokenId, address).then(setMessages).catch(() => {});
    else setMessages([]);
  }, [address, selectedTokenId]);

  // Proactive nudge: when the panel opens, if upkeep is due, Hermes greets with it. Throttled to
  // once per 30 min per wallet so it isn't spammy and doesn't hammer the chain snapshot.
  const nudgedRef = useRef(false);
  useEffect(() => {
    if (nudgedRef.current || !address) return;
    nudgedRef.current = true;
    try {
      const key = `companion.nudge.${address.toLowerCase()}`;
      if (Date.now() - Number(localStorage.getItem(key) || 0) < 30 * 60 * 1000) return;
      localStorage.setItem(key, String(Date.now()));
    } catch { /* ignore */ }
    stewardApi.upkeep(address).then((plan) => {
      const { pet, channel, claim } = plan.summary;
      if (!channel && !claim && !pet) return;
      const bits = [
        channel ? `${channel} to channel` : "",
        claim ? `${claim} reservoir${claim === 1 ? "" : "s"} to empty` : "",
        pet ? `${pet} to pet` : "",
      ].filter(Boolean).join(", ");
      setMessages((m) => [...m, { role: "assistant", content: `👋 you've got ${bits} ready, say "collect" and I'll take care of it 👻` }]);
    }).catch(() => {});
  }, [address]);
  // "While you were away…" — if the autonomous cron ran upkeep for this gotchi since the owner
  // last looked, greet with what Hermes did on its own. Tracks a per-gotchi last-seen action ts
  // so it reports each batch once. (Dormant until delegated signing is live and a wallet enrolls.)
  useEffect(() => {
    if (!address || !selectedTokenId) return;
    const key = `companion.lastAction.${address.toLowerCase()}.${selectedTokenId}`;
    getRecentActions(address, selectedTokenId).then((actions) => {
      const seen = Number(localStorage.getItem(key) || 0);
      const fresh = actions.filter((a) => a.kind === "auto-upkeep" && a.ts > seen);
      if (!fresh.length) return;
      try { localStorage.setItem(key, String(Math.max(...actions.map((a) => a.ts)))); } catch { /* ignore */ }
      const n = fresh.length;
      setMessages((m) => [...m, { role: "assistant", content: `👻 while you were away I ran upkeep ${n} time${n === 1 ? "" : "s"} for you: reservoirs emptied, gotchis tended.` }]);
    }).catch(() => {});
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

  // Hermes actions (channel/pet/claim) require a 24h wallet signature proving ownership
  // before the VPS runs them. Sign once, cache, reuse — no popup per action.
  function cachedActionAuth(): { actionSignature: string; actionSignedAt: number } | undefined {
    if (!address) return undefined;
    try {
      const cached = JSON.parse(localStorage.getItem(`companion.actionSig.${address.toLowerCase()}`) || "null");
      if (cached?.actionSignature && Date.now() - cached.actionSignedAt < ACTION_SIG_TTL_MS) return cached;
    } catch { /* ignore */ }
    return undefined;
  }
  async function ensureActionAuth(): Promise<{ actionSignature: string; actionSignedAt: number } | undefined> {
    if (!address) return undefined;
    const cached = cachedActionAuth();
    if (cached) return cached;
    const signedAt = Date.now();
    const actionSignature = await signMessageAsync({ message: actionMessage(address, signedAt) });
    const auth = { actionSignature, actionSignedAt: signedAt };
    try { localStorage.setItem(`companion.actionSig.${address.toLowerCase()}`, JSON.stringify(auth)); } catch { /* ignore */ }
    return auth;
  }

  // Prepare + sign: fetch the owner's due upkeep and send it from their OWN wallet, right in
  // chat. Works today without Steward enrollment. Reports when nothing is ready.
  async function runPrepareUpkeep() {
    if (!address || !walletClient) return;
    try {
      const plan = await stewardApi.upkeep(address);
      if (!plan.calls.length) {
        setMessages((m) => [...m, { role: "assistant", content: "nothing's ready to collect yet, your parcels are still on cooldown 👻" }]);
        return;
      }
      const n = plan.calls.length;
      setMessages((m) => [...m, { role: "assistant", content: `found alchemica to collect (${plan.summary.channel} channel, ${plan.summary.claim} claim): approve ${n} tx${n > 1 ? "s" : ""} in your wallet…` }]);
      let sent = 0;
      for (const call of plan.calls) {
        await walletClient.sendTransaction({ to: call.to, data: call.data });
        sent++;
      }
      setMessages((m) => [...m, { role: "assistant", content: `collected ✅ (${sent} tx${sent > 1 ? "s" : ""}), your alchemica's on the way 👻` }]);
    } catch (e: any) {
      const cancelled = /reject|denied|user/i.test(String(e?.message || e));
      setMessages((m) => [...m, { role: "assistant", content: cancelled ? "no worries, cancelled 👻" : "couldn't send that just now, try again in a sec" }]);
    }
  }

  // Toggle the standing "keep_emptied" goal. Enabling it authorizes autonomous gas spend, so it
  // needs the same 24h owner signature the Act path uses. Dormant until delegated signing is live.
  async function toggleAutoCollect() {
    if (!address || !selectedTokenId || goalBusy) return;
    const next = !autoCollect;
    setGoalBusy(true);
    try {
      const actionAuth = await ensureActionAuth();
      if (!actionAuth) return;
      const r = await setGoal(address, selectedTokenId, "keep_emptied", next, actionAuth);
      if (r.ok) {
        setAutoCollect(next);
        setMessages((m) => [...m, { role: "assistant", content: next
          ? "auto-collect on, once hands-free signing is live I'll keep your reservoirs emptied for you 👻"
          : "auto-collect off, I'll wait for you to say the word 👻" }]);
      }
    } catch { /* ignore — user likely declined the signature */ } finally {
      setGoalBusy(false);
    }
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
      let res = await postChat(selectedTokenId, address, text, auth, cachedActionAuth());
      // Hermes wants to act but has no valid action signature — sign once, then retry the same message.
      if (res.needsActionAuth) {
        let actionAuth: { actionSignature: string; actionSignedAt: number } | undefined;
        try { actionAuth = await ensureActionAuth(); } catch { actionAuth = undefined; }
        if (actionAuth) res = await postChat(selectedTokenId, address, text, auth, actionAuth);
      }
      setMessages((m) => [...m, { role: "assistant", content: res.reply }]);
      if (res.prepareUpkeep) {
        // Show the land page underneath but keep the chat open so they see the collect result.
        if (res.navigate) navigate(res.navigate);
        await runPrepareUpkeep();
      } else if (res.navigate) {
        // Pure navigation — close the panel and go.
        setOpen(false);
        navigate(res.navigate);
      }
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
            {selectedTokenId && (
              <div className="flex items-center justify-between rounded-xl bg-white/5 px-3 py-1.5">
                <span className="text-[11px] text-white/60" title="When hands-free signing is live, I'll keep this gotchi's reservoirs emptied on my own.">
                  🤖 Auto-collect
                </span>
                <button
                  onClick={toggleAutoCollect}
                  disabled={goalBusy || !address}
                  aria-pressed={autoCollect}
                  className={`rounded-full px-2.5 py-0.5 text-[11px] font-semibold transition disabled:opacity-40 ${
                    autoCollect ? "bg-emerald-500/30 text-emerald-100" : "bg-white/10 text-white/50 hover:text-white"}`}
                >
                  {autoCollect ? "on" : "off"}
                </button>
              </div>
            )}
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
