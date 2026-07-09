import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { usePublicClient } from "wagmi";
import { Loader2, ShieldAlert, Check, Copy, CheckCircle2, XCircle } from "lucide-react";
import { BASE_CHAIN_ID } from "@/lib/chains";
import { AAVEGOTCHI_DIAMOND_BASE } from "@/lib/lending/contracts";
import {
  fetchPendingXpDrops,
  encodeCreateTx,
  rootMatches,
  isDeployed,
  VIEW_XP_DROP_ABI,
  SIGPROP_XP,
  COREPROP_XP,
  type CreateEntry,
  type PreparedCreateTx,
} from "@/lib/xpOperator";

const isBytes32 = (s: string) => /^0x[a-fA-F0-9]{64}$/.test(s.trim());

function CopyButton({ text }: { text: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      onClick={async () => { try { await navigator.clipboard.writeText(text); setDone(true); setTimeout(() => setDone(false), 1200); } catch { /* clipboard blocked */ } }}
      className="inline-flex items-center gap-1 rounded border border-white/15 px-2 py-1 text-[11px] hover:bg-white/5"
    >
      {done ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />} {done ? "Copied" : "Copy"}
    </button>
  );
}

// Read the on-chain root/xpAmount for a propId (view call — never broadcasts)
// and report whether it matches the operator's generated root.
function ValidateDrop() {
  const publicClient = usePublicClient({ chainId: BASE_CHAIN_ID });
  const [propId, setPropId] = useState("");
  const [expectedRoot, setExpectedRoot] = useState("");
  const [state, setState] = useState<{ kind: "idle" | "busy" | "done" | "err"; root?: string; xp?: bigint; msg?: string }>({ kind: "idle" });

  const run = async () => {
    if (!publicClient || !isBytes32(propId)) return setState({ kind: "err", msg: "Enter a 32-byte propId" });
    setState({ kind: "busy" });
    try {
      const res = (await publicClient.readContract({
        address: AAVEGOTCHI_DIAMOND_BASE,
        abi: VIEW_XP_DROP_ABI,
        functionName: "viewXPDrop",
        args: [propId.trim() as `0x${string}`],
      })) as { root: string; xpAmount: bigint };
      setState({ kind: "done", root: res.root, xp: res.xpAmount });
    } catch (e) {
      setState({ kind: "err", msg: (e as Error).message.slice(0, 140) });
    }
  };

  const deployed = state.kind === "done" && state.root ? isDeployed({ root: state.root, xpAmount: state.xp ?? 0n }) : false;
  const match = state.kind === "done" ? rootMatches(state.root, expectedRoot) : false;

  return (
    <div className="rounded-lg border border-white/10 p-4 space-y-3">
      <div className="text-sm font-semibold">Validate a drop on-chain</div>
      <p className="text-[11px] opacity-60">Reads <code>viewXPDrop</code> (a view call). Optionally paste your generated root to confirm it matches what is deployed — the zero-access proof that your pipeline is correct.</p>
      <input value={propId} onChange={(e) => setPropId(e.target.value)} placeholder="propId (0x… 32 bytes)" className="w-full rounded border border-white/15 bg-transparent px-3 py-1.5 text-sm font-mono" />
      <input value={expectedRoot} onChange={(e) => setExpectedRoot(e.target.value)} placeholder="expected root (optional)" className="w-full rounded border border-white/15 bg-transparent px-3 py-1.5 text-sm font-mono" />
      <button onClick={run} disabled={state.kind === "busy"} className="rounded bg-sky-500 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50 inline-flex items-center gap-1.5">
        {state.kind === "busy" ? <Loader2 className="w-4 h-4 animate-spin" /> : null} Read on-chain
      </button>
      {state.kind === "err" && <div className="text-red-400 text-[11px]">{state.msg}</div>}
      {state.kind === "done" && (
        <div className="text-[11px] space-y-1">
          <div className="flex items-center gap-2"><span className="opacity-60 w-24">On-chain root</span><span className="font-mono break-all">{state.root}</span></div>
          <div className="flex items-center gap-2"><span className="opacity-60 w-24">XP amount</span><span className="font-mono">{String(state.xp)}</span> <span className={deployed ? "text-emerald-400" : "opacity-60"}>{deployed ? "deployed" : "not deployed yet"}</span></div>
          {expectedRoot && (
            <div className={`inline-flex items-center gap-1 font-medium ${match ? "text-emerald-400" : "text-red-400"}`}>
              {match ? <CheckCircle2 className="w-3.5 h-3.5" /> : <XCircle className="w-3.5 h-3.5" />} {match ? "Generated root matches on-chain" : "Root mismatch"}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function PreparedTx({ prepared }: { prepared: PreparedCreateTx }) {
  const safeJson = JSON.stringify(prepared.safeTx, null, 2);
  return (
    <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-3 space-y-2">
      <div className="text-[11px] font-semibold text-emerald-300">Unsigned batchCreateXPDrop — hand to the multisig signer</div>
      <div className="space-y-1">
        {prepared.entries.map((e) => (
          <div key={e.propId} className="flex items-center gap-2 text-[11px] font-mono"><span className="opacity-60">{e.xpAmount} XP</span><span className="break-all">{e.propId}</span></div>
        ))}
      </div>
      <div className="flex items-center justify-between gap-2"><span className="text-[11px] opacity-60">Calldata</span><CopyButton text={prepared.data} /></div>
      <pre className="text-[10px] font-mono break-all whitespace-pre-wrap opacity-80 max-h-24 overflow-y-auto">{prepared.data}</pre>
      <div className="flex items-center justify-between gap-2"><span className="text-[11px] opacity-60">Safe tx (to {AAVEGOTCHI_DIAMOND_BASE.slice(0, 6)}…, value 0)</span><CopyButton text={safeJson} /></div>
    </div>
  );
}

// Manual builder: paste a sigprop/coreprop pair + their generated roots and get
// the ready-to-sign create tx. No broadcast.
function BuildCreateTx() {
  const [sigId, setSigId] = useState("");
  const [sigRoot, setSigRoot] = useState("");
  const [coreId, setCoreId] = useState("");
  const [coreRoot, setCoreRoot] = useState("");
  const [prepared, setPrepared] = useState<PreparedCreateTx | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const build = () => {
    setErr(null); setPrepared(null);
    const entries: CreateEntry[] = [];
    if (sigId || sigRoot) {
      if (!isBytes32(sigId) || !isBytes32(sigRoot)) return setErr("Sigprop id and root must both be 32-byte hex");
      entries.push({ propId: sigId.trim(), root: sigRoot.trim(), xpAmount: SIGPROP_XP });
    }
    if (coreId || coreRoot) {
      if (!isBytes32(coreId) || !isBytes32(coreRoot)) return setErr("Coreprop id and root must both be 32-byte hex");
      entries.push({ propId: coreId.trim(), root: coreRoot.trim(), xpAmount: COREPROP_XP });
    }
    if (!entries.length) return setErr("Enter at least one prop id + root");
    setPrepared(encodeCreateTx(entries));
  };

  const field = "w-full rounded border border-white/15 bg-transparent px-3 py-1.5 text-sm font-mono";
  return (
    <div className="rounded-lg border border-white/10 p-4 space-y-3">
      <div className="text-sm font-semibold">Build create tx (prepare only)</div>
      <div className="grid sm:grid-cols-2 gap-2">
        <input value={sigId} onChange={(e) => setSigId(e.target.value)} placeholder="sigprop id (0x…)" className={field} />
        <input value={sigRoot} onChange={(e) => setSigRoot(e.target.value)} placeholder="sigprop root (0x…)" className={field} />
        <input value={coreId} onChange={(e) => setCoreId(e.target.value)} placeholder="coreprop id (0x…)" className={field} />
        <input value={coreRoot} onChange={(e) => setCoreRoot(e.target.value)} placeholder="coreprop root (0x…)" className={field} />
      </div>
      <button onClick={build} className="rounded bg-sky-500 px-3 py-1.5 text-sm font-medium text-white">Encode</button>
      {err && <div className="text-red-400 text-[11px]">{err}</div>}
      {prepared && <PreparedTx prepared={prepared} />}
    </div>
  );
}

/** Admin-only XP-drop operator surface. Prepares and validates; never broadcasts. */
export function XpDropsOperator() {
  const { data: pending = [], isLoading } = useQuery({
    queryKey: ["xp-drops-pending"],
    queryFn: () => fetchPendingXpDrops(),
    staleTime: 300_000,
  });

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2.5 text-[12px] text-amber-200 inline-flex items-start gap-2">
        <ShieldAlert className="w-4 h-4 mt-0.5 shrink-0" />
        <span>Prepare-only. Nothing here broadcasts. <code>batchCreateXPDrop</code> is gated by the gameManager role and must be signed by the DAO multisig. This page only generates and validates the transaction to hand over.</span>
      </div>

      <div className="rounded-lg border border-white/10 p-4">
        <div className="text-sm font-semibold mb-2">Pending drops</div>
        {isLoading ? (
          <div className="opacity-60 text-sm inline-flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin" /> Loading…</div>
        ) : pending.length === 0 ? (
          <p className="text-[12px] opacity-60">No pending drops. The pipeline that pairs sigprop/coreprop proposals and generates merkle roots is not wired to this page yet (it runs in the aavegotchi-base operator backend). Use the manual tools below to validate a root or build a create tx from generated roots.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs whitespace-nowrap">
              <thead className="opacity-60"><tr><th className="text-left py-1 pr-3">AGIP</th><th className="text-left py-1 pr-3">Title</th><th className="text-left py-1 pr-3">Sigprop root</th><th className="text-left py-1 pr-3">Coreprop root</th><th className="text-right py-1">Tx</th></tr></thead>
              <tbody>
                {pending.map((d) => {
                  const entries: CreateEntry[] = [];
                  if (d.sigpropRoot) entries.push({ propId: d.sigpropId, root: d.sigpropRoot, xpAmount: SIGPROP_XP });
                  if (d.corepropRoot) entries.push({ propId: d.corepropId, root: d.corepropRoot, xpAmount: COREPROP_XP });
                  const prepared = entries.length ? encodeCreateTx(entries) : null;
                  return (
                    <tr key={d.agip} className="border-t border-white/10 align-top">
                      <td className="py-1.5 pr-3 font-mono">{d.agip}</td>
                      <td className="py-1.5 pr-3 max-w-[220px] truncate" title={d.title}>{d.title}</td>
                      <td className="py-1.5 pr-3 font-mono">{d.sigpropRoot ? `${d.sigpropRoot.slice(0, 10)}…` : "—"}</td>
                      <td className="py-1.5 pr-3 font-mono">{d.corepropRoot ? `${d.corepropRoot.slice(0, 10)}…` : "—"}</td>
                      <td className="py-1.5 text-right">{prepared ? <CopyButton text={JSON.stringify(prepared.safeTx)} /> : <span className="opacity-40">roots pending</span>}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="grid lg:grid-cols-2 gap-4">
        <ValidateDrop />
        <BuildCreateTx />
      </div>
    </div>
  );
}
