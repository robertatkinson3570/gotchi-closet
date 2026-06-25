// src/components/steward/EstateUpkeep.tsx
// Path 2 ("prepare + one-click"): the steward computes what's due across your whole wallet and
// you execute it from YOUR OWN wallet — your gas, no session key, no AA, fully non-custodial.
// Safety: we only ever send calls whose selector is one of pet/channel/claim (sessionSpec).
import { useState } from "react";
import { useWalletClient, usePublicClient, useAccount, useSwitchChain } from "wagmi";
import { useQueryClient } from "@tanstack/react-query";
import { base } from "viem/chains";
import { useUpkeep } from "@/hooks/useSteward";
import { SELECTORS } from "@/lib/steward/sessionSpec";

const ALLOWED = new Set(Object.values(SELECTORS).map((s) => s.toLowerCase()));

export function EstateUpkeep({ owner }: { owner: string }) {
  const { data, isLoading, refetch } = useUpkeep(owner);
  const { data: walletClient } = useWalletClient();
  const publicClient = usePublicClient();
  const { chainId } = useAccount();
  const { switchChain } = useSwitchChain();
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [hashes, setHashes] = useState<string[]>([]);
  const [err, setErr] = useState<string | null>(null);

  const s = data?.summary;
  const txCount = data?.calls.length ?? 0;
  const onBase = chainId === base.id;

  async function run() {
    if (!walletClient || !data) { setErr("Connect your wallet first."); return; }
    setBusy(true); setErr(null); setHashes([]); setProgress({ done: 0, total: data.calls.length });
    const sent: string[] = [];
    try {
      for (const c of data.calls) {
        // HARD safety: never sign anything that isn't pet/channel/claim, even if the API returned it.
        if (!ALLOWED.has(c.data.slice(0, 10).toLowerCase())) throw new Error("Refused an unexpected call (not pet/channel/claim).");
        const hash = await walletClient.sendTransaction({ to: c.to, data: c.data, account: walletClient.account, chain: base });
        sent.push(hash); setHashes([...sent]);
        await publicClient?.waitForTransactionReceipt({ hash });
        setProgress({ done: sent.length, total: data.calls.length });
      }
      qc.invalidateQueries({ queryKey: ["steward", "upkeep", owner] });
      refetch();
    } catch (e) {
      setErr((e as Error).message?.slice(0, 160) || "Run failed");
    } finally {
      setBusy(false);
    }
  }

  if (isLoading) return <div className="rounded-2xl border border-white/10 bg-zinc-900 p-4 text-sm text-zinc-400">Checking your estate…</div>;
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
            <button onClick={() => switchChain({ chainId: base.id })} className="shrink-0 rounded-lg bg-amber-600 px-4 py-2 font-semibold">
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
