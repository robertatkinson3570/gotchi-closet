import { useState } from "react";
import { useAccount, useSignMessage } from "wagmi";
import { GotchiSvgById } from "@/components/explorer/GotchiSvgById";
import { useCompanion } from "@/state/useCompanion";
import { postGlobal } from "@/lib/companion/api";
import { useGlobalRoom } from "./useGlobalRoom";
import { globalRoomMessage, PREMIUM_SIG_TTL_MS } from "@/lib/companion/premiumAuth";

export function GlobalChatTab({ active }: { active: boolean }) {
  const { address } = useAccount();
  const { signMessageAsync } = useSignMessage();
  const selectedTokenId = useCompanion((s) => s.selectedTokenId);
  const messages = useGlobalRoom(active);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function joinSig(): Promise<{ signature: string; signedAt: number }> {
    const key = `companion.roomSig.${address!.toLowerCase()}`;
    try {
      const cached = JSON.parse(localStorage.getItem(key) || "null");
      if (cached?.signature && Date.now() - cached.signedAt < PREMIUM_SIG_TTL_MS) return cached;
    } catch { /* ignore */ }
    const signedAt = Date.now();
    const signature = await signMessageAsync({ message: globalRoomMessage(address!, signedAt) });
    const sig = { signature, signedAt };
    try { localStorage.setItem(key, JSON.stringify(sig)); } catch { /* ignore */ }
    return sig;
  }

  async function send() {
    const text = draft.trim();
    if (!text || !address || !selectedTokenId || busy) return;
    setBusy(true); setErr(null); setDraft("");
    try {
      const { signature, signedAt } = await joinSig();
      const r = await postGlobal({ tokenId: selectedTokenId, wallet: address, text, signature, signedAt });
      if (!r.ok) setErr(r.error || "couldn't post");
    } catch {
      setErr("signature needed to post");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <div className="flex-1 space-y-2 overflow-y-auto p-3">
        {messages.length === 0 && <div className="pt-6 text-center text-sm text-white/40">the room is quiet… say something 👻</div>}
        {messages.map((m) => (
          <div key={m.id} className="flex items-start gap-2">
            <span className="mt-0.5 h-7 w-7 shrink-0 overflow-hidden rounded-full bg-black/30">
              <GotchiSvgById id={m.tokenId} className="block h-full w-full [&>svg]:h-full [&>svg]:w-full" />
            </span>
            <div className="min-w-0">
              <div className="text-[11px] text-fuchsia-200/70">
                {m.name}{m.isAI && <span className="ml-1 rounded bg-white/10 px-1 text-[9px] text-white/50">ai</span>}
              </div>
              <div className="whitespace-pre-wrap break-words text-sm text-white/90">{m.text}</div>
            </div>
          </div>
        ))}
      </div>
      {err && <div className="px-3 pb-1 text-[11px] text-rose-300/80">{err}</div>}
      <div className="flex shrink-0 items-center gap-2 border-t border-white/10 p-2">
        <input
          value={draft} onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && send()}
          placeholder={address ? (selectedTokenId ? "post to the room…" : "pick a gotchi first") : "connect wallet to post"}
          disabled={!address || !selectedTokenId}
          className="flex-1 rounded-xl bg-black/40 px-3 py-2 text-sm text-white placeholder:text-white/30 outline-none"
        />
        <button onClick={send} disabled={busy || !draft.trim()}
          className="rounded-xl bg-fuchsia-500/80 px-3 py-2 text-sm font-medium text-white disabled:opacity-40">↑</button>
      </div>
    </>
  );
}
