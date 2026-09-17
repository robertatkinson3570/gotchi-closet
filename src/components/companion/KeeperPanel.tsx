import { useEffect, useState } from "react";
import { useAccount, useSignMessage, useWalletClient } from "wagmi";
import { keeperReadMessage, keeperSigTtlMs, KEEPER_SIG_CACHE_KEY, KEEPER_SIG_HEADER, keeperSigHeaderValue, forgetKeeperSig } from "@/lib/companion/keeperAuth";
import { ANALYST_DISCLAIMERS } from "@/lib/companion/api";
import { env } from "@/lib/env";

// KEEPER GOTCHI (06-standing-questions.md §6.3): "a new KeeperPanel.tsx
// beside CompanionChatPanel.tsx, reading GET /api/companion/keeper/:tokenId/
// :wallet on Closet, which proxies to GVR ... Same rows, same buttons,
// Closet's own styling." GVR's card (packages/client/src/ui/keeperCard.ts)
// is the sibling to keep in step with -- same fields, same "Why" toggle,
// same prepared-action shape ({to, data, label} or a note when there is no
// safe prepared transaction, per GVR's actions.ts).

type KeeperFact = { key: string; label: string; value: string };
type KeeperCite = { queryId: string; asOfBlock: string | null; chains: number[] };
type KeeperLine = { key: string; severity: "quiet" | "note" | "act"; text: string; facts: KeeperFact[]; cites: KeeperCite[] };
type KeeperActionCall = { to: string; data: string; value?: string; label: string; chainId: number; wallet: string };
/** B8 (GVR QA H-06, OWNER-22): chainId and wallet on every action, signable or not. */
type KeeperAction = { key: string; label: string; chainId: number; wallet: string; call: KeeperActionCall | null; note?: string };

const shortAddr = (a: string) => `${a.slice(0, 6)}..${a.slice(-4)}`;

/** Why a prepared action must not be sent from this wallet, or null when it may. */
export function keeperActionRefusal(connected: string | undefined, action: KeeperAction): string | null {
  if (!action.call) return action.note ?? "There is no prepared action for this one.";
  if (!connected) return "Connect the wallet this approval belongs to before revoking it.";
  if (connected.toLowerCase() !== action.wallet.toLowerCase()) return `This approval belongs to ${shortAddr(action.wallet)}; connect that wallet to revoke it.`;
  return null;
}
export type KeeperReport = {
  wallet: string; tokenId: string; asOfBlock: string | null;
  report: { lines: KeeperLine[] }; text: string; voiced: boolean; at: number; actions: KeeperAction[];
};

function explorerBlockUrl(chainId: number, block: string): string {
  return chainId === 1 ? `https://etherscan.io/block/${block}` : `https://basescan.org/block/${block}`;
}

const SEVERITY_CLASS: Record<string, string> = {
  quiet: "bg-white/10 text-white/50",
  note: "bg-sky-500/20 text-sky-200",
  act: "bg-amber-500/20 text-amber-200",
};

/** Not watched yet: what the Keeper does, and the one button that starts it. */
export function KeeperStartWatching({ busy, onStart }: { busy: boolean; onStart: () => void }) {
  return (
    <div className="space-y-2">
      <div className="text-xs text-white/60">
        Your Keeper isn't watching this wallet yet. Once it is, it reads the wallet every night: risky approvals, the exchanges you use, new transactions, your gotchi's pockets and DAO votes closing soon. Free, one signature, no gas.
      </div>
      {busy ? (
        <div className="text-xs text-white/50">Confirm in your wallet…</div>
      ) : (
        <button onClick={onStart} className="rounded-lg bg-fuchsia-500/30 px-3 py-1 text-xs font-semibold text-fuchsia-100 hover:bg-fuchsia-500/50">
          Start watching
        </button>
      )}
    </div>
  );
}

export function KeeperPanel({ tokenId }: { tokenId: string | null | undefined }) {
  const { address } = useAccount();
  const { signMessageAsync } = useSignMessage();
  const { data: walletClient } = useWalletClient();
  const [report, setReport] = useState<KeeperReport | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [whyOpen, setWhyOpen] = useState<Set<string>>(new Set());
  const [busyAction, setBusyAction] = useState<string | null>(null);
  // Self-serve registration: GVR says the wallet is not watched yet.
  const [unwatched, setUnwatched] = useState(false);
  const [registering, setRegistering] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  async function ensureKeeperAuth(wallet: string): Promise<{ signedAt: number; signature: string }> {
    const key = KEEPER_SIG_CACHE_KEY(wallet, "standing");
    try {
      const cached = JSON.parse(localStorage.getItem(key) || "null");
      if (cached?.signature && Date.now() - cached.signedAt < keeperSigTtlMs("standing")) return cached;
    } catch {
      /* ignore */
    }
    const signedAt = Date.now();
    const signature = await signMessageAsync({ message: keeperReadMessage(wallet, signedAt, "standing") });
    const auth = { signedAt, signature };
    try {
      localStorage.setItem(key, JSON.stringify(auth));
    } catch {
      /* privacy mode: sign again next time */
    }
    return auth;
  }

  useEffect(() => {
    if (!address || !tokenId) {
      setReport(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    (async () => {
      try {
        const read = async () => {
          const auth = await ensureKeeperAuth(address);
          // B2: the proof rides in the header, never a query string an access log keeps.
          // The companion API is its own origin in production (api.gotchicloset.com); a relative /api path is Vercel's and 404s.
          return fetch(`${env.companionApiUrl}/api/companion/keeper/${tokenId}/${address}`, { headers: { [KEEPER_SIG_HEADER]: keeperSigHeaderValue(auth) } });
        };
        let res = await read();
        // B1: a signature cached under the old message text fails once on GVR; drop it and sign again, once.
        if (res.status === 401) { forgetKeeperSig(address, "standing"); res = await read(); }
        if (!res.ok) {
          if (res.status === 404) {
            const miss = (await res.json().catch(() => ({}))) as { registered?: unknown };
            if (!cancelled) { setReport(null); setUnwatched(miss.registered === false); }
            return;
          }
          throw new Error(`keeper read failed (${res.status})`);
        }
        const body = (await res.json()) as KeeperReport;
        if (!cancelled) setReport(body);
      } catch (e: any) {
        if (!cancelled) setError(e?.message ?? "couldn't read your Keeper report");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [address, tokenId]);

  async function runAction(action: KeeperAction) {
    if (!action.call || !walletClient || busyAction) return;
    // B8: the connected wallet must own the permission, and the send happens on the action's chain.
    const refusal = keeperActionRefusal(address, action);
    if (refusal) { setError(refusal); return; }
    setBusyAction(action.key);
    try {
      const onChain = await walletClient.getChainId();
      if (onChain !== action.chainId) await walletClient.switchChain({ id: action.chainId });
      await walletClient.sendTransaction({
        account: address as `0x${string}`,
        chain: null,
        to: action.call.to as `0x${string}`,
        data: action.call.data as `0x${string}`,
        ...(action.call.value ? { value: BigInt(action.call.value) } : {}),
      });
    } catch {
      setError("Couldn't send that transaction.");
    } finally {
      setBusyAction(null);
    }
  }

  async function startWatching() {
    if (!address || !tokenId || registering) return;
    setRegistering(true);
    setError(null);
    try {
      const signedAt = Date.now();
      const signature = await signMessageAsync({ message: keeperReadMessage(address, signedAt, "register") });
      const res = await fetch(`${env.companionApiUrl}/api/companion/keeper/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ wallet: address, tokenId, signedAt, signature }),
      });
      const body = (await res.json().catch(() => ({}))) as { reply?: string; error?: string };
      if (!res.ok) { setError(body.error ?? "Couldn't start watching just now."); return; }
      setUnwatched(false);
      setNote(body.reply ?? "Your Keeper is watching this wallet now.");
    } catch {
      setError("Couldn't start watching: the signature was not given.");
    } finally {
      setRegistering(false);
    }
  }

  function toggleWhy(key: string) {
    setWhyOpen((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  if (!address || !tokenId) {
    return <div className="rounded-xl bg-white/5 p-3 text-xs text-white/50">Connect a wallet and pick a gotchi to see its Keeper report.</div>;
  }

  return (
    <div className="space-y-2 rounded-xl bg-white/5 p-3">
      <div className="text-xs font-semibold text-fuchsia-200/80">🗝 Keeper</div>
      {loading && !report && <div className="text-xs text-white/50">Reading your Keeper report…</div>}
      {error && <div className="text-xs text-red-300">⚠ {error}</div>}
      {!loading && !report && unwatched && <KeeperStartWatching busy={registering} onStart={startWatching} />}
      {!loading && !report && !unwatched && note && <div className="text-xs text-white/60">{note}</div>}
      {!loading && !report && !unwatched && !note && !error && (
        <div className="text-xs text-white/50">Your gotchi hasn't watched a full night yet. The first report lands after tonight's run.</div>
      )}
      {report && <KeeperReportView report={report} whyOpen={whyOpen} busyAction={busyAction} onToggleWhy={toggleWhy} onRunAction={runAction} />}
      <KeeperLegal />
    </div>
  );
}

/** 00-overview.md section 8: the four legal lines on every analyst surface, once, at the
 *  bottom, the same constant Ask mode renders (GVR QA H-01). */
export function KeeperLegal() {
  return (
    <div className="mt-2 space-y-0.5 border-t border-white/10 pt-1.5">
      {ANALYST_DISCLAIMERS.map((line, i) => (
        <div key={i} className={i === 0 ? "text-[9.5px] leading-snug text-white/60" : "text-[9.5px] leading-snug text-white/40"}>{line}</div>
      ))}
    </div>
  );
}

/** The loaded report, pure over its props so it can be rendered without a
 *  wallet (KeeperPanel.test.tsx). KeeperPanel owns the fetch and the wallet. */
export function KeeperReportView({ report, whyOpen, busyAction, onToggleWhy, onRunAction }: {
  report: KeeperReport; whyOpen: Set<string>; busyAction: string | null;
  onToggleWhy: (key: string) => void; onRunAction: (action: KeeperAction) => void;
}) {
  return (
    <>
      <div className="text-sm text-white/90">{report.text}</div>
      {report.report.lines.filter((l) => l.text).map((line) => {
        const actions = line.key === "permissions" ? report.actions.filter((a) => a.key.startsWith("revoke:")) : [];
        const open = whyOpen.has(line.key);
        return (
          <div key={line.key} className="space-y-1 rounded-lg border border-white/10 bg-black/20 p-2">
            <div className="flex items-start gap-2 text-xs">
              <span className={`shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-bold uppercase ${SEVERITY_CLASS[line.severity] ?? ""}`}>
                {line.severity}
              </span>
              <span className="text-white/80">{line.text}</span>
            </div>
            {actions.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {actions.map((a) =>
                  a.call ? (
                    <button
                      key={a.key}
                      disabled={busyAction === a.key}
                      onClick={() => onRunAction(a)}
                      className="rounded-lg bg-fuchsia-500/20 px-2 py-1 text-[10px] font-semibold text-fuchsia-100 hover:bg-fuchsia-500/30 disabled:opacity-40"
                    >
                      {busyAction === a.key ? "Confirm in wallet…" : a.label}
                    </button>
                  ) : (
                    <span key={a.key} className="text-[10px] text-white/40" title={a.note}>
                      {a.label}: {a.note ?? "no prepared action"}
                    </span>
                  )
                )}
              </div>
            )}
            {line.facts.length > 0 && (
              <button onClick={() => onToggleWhy(line.key)} className="text-[10px] text-white/40 hover:text-white/70">
                {open ? "Hide why" : "Why?"}
              </button>
            )}
            {open && (
              <div className="space-y-0.5 rounded bg-black/30 p-1.5 text-[10px] text-white/60">
                {line.facts.map((f) => (
                  <div key={f.key}>
                    <b>{f.label}</b>: {f.value}
                  </div>
                ))}
                {line.cites.map((c) => (
                  <div key={c.queryId}>
                    query {c.queryId}
                    {c.asOfBlock && (
                      <>
                        {" · "}
                        <a
                          href={explorerBlockUrl(c.chains[0] ?? 8453, c.asOfBlock)}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-fuchsia-300 hover:underline"
                        >
                          block {c.asOfBlock}
                        </a>
                      </>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </>
  );
}
