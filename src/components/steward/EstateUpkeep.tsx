// src/components/steward/EstateUpkeep.tsx
// Path 2 ("prepare + one-click"): the steward computes what's due across your whole wallet and
// you execute it from YOUR OWN wallet — your gas, no session key, no AA, fully non-custodial.
// Safety: we only ever send the exact (diamond, selector) pairs a session key would be scoped
// to (sessionSpec.sessionActions) — selector alone isn't enough, a hostile `to` could collide.
import { useRef, useState } from "react";
import { useWalletClient, usePublicClient, useAccount, useSwitchChain } from "wagmi";
import { useQueryClient } from "@tanstack/react-query";
import { base } from "viem/chains";
import { useUpkeep } from "@/hooks/useSteward";
import { sessionActions } from "@/lib/steward/sessionSpec";

const ALLOWED_PAIRS = new Set(
  sessionActions({ pet: true, channel: true, claim: true }).flatMap((a) =>
    "target" in a && "selector" in a ? [`${a.target.toLowerCase()}:${a.selector.toLowerCase()}`] : []
  )
);

export function EstateUpkeep({ owner }: { owner: string }) {
  const { data, isLoading, isError, refetch } = useUpkeep(owner);
  const { data: walletClient } = useWalletClient();
  const publicClient = usePublicClient();
  const { address, chainId } = useAccount();
  const { switchChain } = useSwitchChain();
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [hashes, setHashes] = useState<string[]>([]);
  const [err, setErr] = useState<string | null>(null);

  // Live account/chain, readable from inside the async run loop (the hook values it closed
  // over would be stale after a mid-run wallet switch).
  const live = useRef({ address, chainId });
  live.current = { address, chainId };

  const s = data?.summary;
  const txCount = data?.calls.length ?? 0;
  const onBase = chainId === base.id;

  async function run() {
    if (!walletClient || !publicClient || !data) { setErr("Connect your wallet first."); return; }
    const startAccount = walletClient.account.address.toLowerCase();
    setBusy(true); setErr(null); setHashes([]); setProgress({ done: 0, total: data.calls.length });
    const sent: string[] = [];
    try {
      for (const c of data.calls) {
        // HARD safety: only the exact (diamond, selector) pairs from sessionSpec ever reach
        // the wallet — a hostile/malformed API response can't route a colliding selector at
        // some other contract.
        const pair = `${c.to.toLowerCase()}:${c.data.slice(0, 10).toLowerCase()}`;
        if (!ALLOWED_PAIRS.has(pair)) throw new Error("Refused an unexpected call (not pet/channel/claim on the Aavegotchi/Realm diamonds).");
        // Stop cleanly if the wallet account or network changed mid-run — the remaining
        // calls were planned for the original account on Base.
        if ((live.current.address ?? "").toLowerCase() !== startAccount) throw new Error("Wallet account changed — stopped. Rerun from the new account.");
        if (live.current.chainId !== base.id) throw new Error("Network changed — switch back to Base and rerun.");
        const hash = await walletClient.sendTransaction({ to: c.to, data: c.data, account: walletClient.account, chain: base });
        sent.push(hash); setHashes([...sent]);
        await publicClient.waitForTransactionReceipt({ hash, timeout: 120_000 });
        setProgress({ done: sent.length, total: data.calls.length });
      }
    } catch (e) {
      setErr((e as Error).message?.slice(0, 160) || "Run failed");
    } finally {
      // Always resync — after a partial run some calls are already mined and must not be
      // offered (and replayed, reverting) again.
      qc.invalidateQueries({ queryKey: ["steward", "upkeep", owner] });
      refetch();
      setBusy(false);
    }
  }

  if (isLoading) return <div className="rounded-2xl border border-white/10 bg-zinc-900 p-4 text-sm text-zinc-400">Checking your estate…</div>;
  if (isError) {
    return (
      <div className="rounded-2xl border border-white/10 bg-zinc-900 p-4">
        <h2 className="text-lg font-bold">Estate upkeep</h2>
        <p className="mt-0.5 text-sm text-red-400">Couldn&rsquo;t check what&rsquo;s due (network hiccup).</p>
        <button onClick={() => refetch()} className="mt-2 rounded-lg bg-white/10 px-3 py-1.5 text-sm font-semibold hover:bg-white/15">Try again</button>
      </div>
    );
  }
  if (!data) return null;

  const nothingDue = txCount === 0;

  return (
    <div className="rounded-2xl border border-white/10 bg-zinc-900 p-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold">Estate upkeep</h2>
          {nothingDue ? (
            <p className="mt-0.5 text-sm text-emerald-300">All caught up. Nothing due right now.</p>
          ) : (
            <p className="mt-0.5 text-sm text-zinc-400">
              Ready: <b className="text-zinc-200">pet {s!.pet}</b> · <b className="text-zinc-200">channel {s!.channel}</b> · <b className="text-zinc-200">claim {s!.claim}</b>
              <span className="text-zinc-500"> · {txCount} {txCount === 1 ? "tx" : "txs"}, you pay your own gas</span>
            </p>
          )}
        </div>
        {!nothingDue && (
          onBase ? (
            <button onClick={run} disabled={busy} className="shrink-0 rounded-lg bg-emerald-600 px-4 py-2 font-semibold disabled:opacity-50">
              {busy && progress ? `Running ${progress.done}/${progress.total}…` : "Run upkeep"}
            </button>
          ) : (
            <button
              onClick={() => switchChain({ chainId: base.id }, { onError: (e) => setErr(e.message?.slice(0, 120) || "Network switch was rejected.") })}
              className="shrink-0 rounded-lg bg-amber-600 px-4 py-2 font-semibold"
            >
              Switch to Base
            </button>
          )
        )}
      </div>

      {err && <p className="mt-2 text-xs text-red-400">{err}</p>}
      {hashes.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-2 text-xs">
          {hashes.map((h, i) => (
            <a key={h} href={`https://basescan.org/tx/${h}`} target="_blank" rel="noreferrer" className="text-emerald-400 hover:underline">tx {i + 1} ↗</a>
          ))}
        </div>
      )}
      {!busy && progress && progress.done === progress.total && progress.total > 0 && !err && (
        <p className="mt-2 text-xs text-emerald-300">Done — ran {progress.total} {progress.total === 1 ? "transaction" : "transactions"}. ✨</p>
      )}
    </div>
  );
}
