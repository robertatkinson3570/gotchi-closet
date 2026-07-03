import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAccount, useChainId, usePublicClient, useWriteContract } from "wagmi";
import { Aperture, Loader2, X, CheckCircle2, XCircle, Sparkles } from "lucide-react";
import { BASE_CHAIN_ID } from "@/lib/chains";
import { AAVEGOTCHI_DIAMOND_BASE } from "@/lib/lending/contracts";
import { CORE_SUBGRAPH, coreSubgraphFetch } from "@/lib/subgraph";
import { parseRevert } from "@/lib/lending/parseRevert";
import { InlineSvg } from "./InlineSvg";

const PORTAL_ABI = [
  { name: "openPortals", type: "function", stateMutability: "nonpayable", inputs: [{ name: "_tokenIds", type: "uint256[]" }], outputs: [] },
  { name: "claimAavegotchi", type: "function", stateMutability: "nonpayable", inputs: [{ name: "_tokenId", type: "uint256" }, { name: "_option", type: "uint256" }], outputs: [] },
  { name: "portalAavegotchiTraits", type: "function", stateMutability: "view", inputs: [{ name: "_tokenId", type: "uint256" }], outputs: [{ type: "tuple[10]", components: [
    { name: "randomNumber", type: "uint256" }, { name: "numericTraits", type: "int16[6]" }, { name: "collateralType", type: "address" }, { name: "minimumStake", type: "uint256" }] }] },
  { name: "portalAavegotchisSvg", type: "function", stateMutability: "view", inputs: [{ name: "_tokenId", type: "uint256" }], outputs: [{ type: "string[10]" }] },
] as const;

const TRAITS = ["NRG", "AGG", "SPK", "BRN", "EYS", "EYC"];
const brsOf = (traits: number[]) => traits.reduce((s, t) => s + (t < 50 ? 100 - t : t + 1), 0);

type Portal = { id: string; status: number };

async function fetchPortals(owner: string): Promise<Portal[]> {
  const query = `query($owner: String!){ aavegotchis(first: 100, where: { owner: $owner, status_lt: 3 }){ id status } }`;
  const res = await coreSubgraphFetch(CORE_SUBGRAPH, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ query, variables: { owner } }) });
  const json = await res.json();
  return (json.data?.aavegotchis ?? []).map((a: any) => ({ id: a.id, status: Number(a.status) })).sort((a: Portal, b: Portal) => b.status - a.status);
}

export function PortalsPanel({ onClaimed }: { onClaimed?: () => void }) {
  const { address } = useAccount();
  const chainId = useChainId();
  const isOnBase = chainId === BASE_CHAIN_ID;
  const publicClient = usePublicClient({ chainId: BASE_CHAIN_ID });
  const { writeContractAsync } = useWriteContract();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [claim, setClaim] = useState<string | null>(null);

  const { data: portals, refetch } = useQuery({
    queryKey: ["my-portals", address?.toLowerCase()],
    queryFn: () => fetchPortals(address!.toLowerCase()),
    enabled: !!address,
    staleTime: 20_000,
  });

  const open = async (id: string) => {
    if (!publicClient) return;
    if (!isOnBase) return setErr("Switch to Base");
    setErr(null);
    setBusyId(id);
    try {
      const hash = await writeContractAsync({ chainId: BASE_CHAIN_ID, address: AAVEGOTCHI_DIAMOND_BASE, abi: PORTAL_ABI, functionName: "openPortals", args: [[BigInt(id)]] });
      await publicClient.waitForTransactionReceipt({ hash, confirmations: 1 });
      refetch();
    } catch (e) {
      setErr(parseRevert(e).slice(0, 160));
    } finally {
      setBusyId(null);
    }
  };

  if (!portals || portals.length === 0) return null;

  return (
    <div className="mb-5">
      <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2 inline-flex items-center gap-1.5">
        <Aperture className="w-4 h-4 text-fuchsia-400" /> Portals ({portals.length})
      </div>
      {err && <div className="text-[11px] text-red-500 mb-2">{err}</div>}
      <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8 gap-2">
        {portals.map((p) => (
          <div key={p.id} className="rounded-lg border border-fuchsia-500/30 bg-fuchsia-500/5 p-2 flex flex-col items-center text-center">
            <Aperture className="w-9 h-9 text-fuchsia-400 drop-shadow-[0_0_6px_rgba(232,121,249,0.6)] my-1" />
            <div className="text-[10px] font-mono text-muted-foreground">#{p.id}</div>
            {p.status === 0 ? (
              <button disabled={busyId === p.id} onClick={() => open(p.id)} className="mt-1 h-7 w-full rounded bg-fuchsia-600 text-white text-[11px] font-semibold disabled:opacity-50">
                {busyId === p.id ? <Loader2 className="w-3.5 h-3.5 animate-spin mx-auto" /> : "Open portal"}
              </button>
            ) : p.status === 1 ? (
              <div className="mt-1 text-[10px] text-amber-500 inline-flex items-center gap-1"><Loader2 className="w-3 h-3 animate-spin" /> Summoning…</div>
            ) : (
              <button onClick={() => setClaim(p.id)} className="mt-1 h-7 w-full rounded bg-emerald-600 text-white text-[11px] font-semibold">Choose Gotchi</button>
            )}
          </div>
        ))}
      </div>

      {claim && <ClaimModal tokenId={claim} onClose={() => setClaim(null)} onClaimed={() => { setClaim(null); refetch(); onClaimed?.(); }} />}
    </div>
  );
}

type Option = { numericTraits: number[]; brs: number; svg: string };

function ClaimModal({ tokenId, onClose, onClaimed }: { tokenId: string; onClose: () => void; onClaimed: () => void }) {
  const chainId = useChainId();
  const isOnBase = chainId === BASE_CHAIN_ID;
  const publicClient = usePublicClient({ chainId: BASE_CHAIN_ID });
  const { writeContractAsync } = useWriteContract();
  const [picked, setPicked] = useState<number | null>(null);
  const [status, setStatus] = useState<"idle" | "busy" | "ok" | "err">("idle");
  const [errMsg, setErrMsg] = useState("");

  const { data, isLoading } = useQuery({
    queryKey: ["portal-options", tokenId],
    enabled: !!publicClient,
    staleTime: 60_000,
    queryFn: async (): Promise<Option[]> => {
      const [traitsRaw, svgsRaw] = await Promise.all([
        publicClient!.readContract({ address: AAVEGOTCHI_DIAMOND_BASE, abi: PORTAL_ABI, functionName: "portalAavegotchiTraits", args: [BigInt(tokenId)] }),
        publicClient!.readContract({ address: AAVEGOTCHI_DIAMOND_BASE, abi: PORTAL_ABI, functionName: "portalAavegotchisSvg", args: [BigInt(tokenId)] }),
      ]);
      const traits = traitsRaw as unknown as { numericTraits: readonly number[] }[];
      const svgs = svgsRaw as unknown as readonly string[];
      return traits.map((t, i) => { const nt = t.numericTraits.map(Number); return { numericTraits: nt, brs: brsOf(nt), svg: svgs[i] ?? "" }; });
    },
  });

  const options = useMemo(() => data ?? [], [data]);

  const claim = async () => {
    if (picked == null || !publicClient) return;
    if (!isOnBase) { setStatus("err"); setErrMsg("Switch to Base"); return; }
    setStatus("busy");
    try {
      const hash = await writeContractAsync({ chainId: BASE_CHAIN_ID, address: AAVEGOTCHI_DIAMOND_BASE, abi: PORTAL_ABI, functionName: "claimAavegotchi", args: [BigInt(tokenId), BigInt(picked)] });
      await publicClient.waitForTransactionReceipt({ hash, confirmations: 1 });
      setStatus("ok");
      setTimeout(onClaimed, 1200);
    } catch (e) {
      setStatus("err");
      setErrMsg(parseRevert(e).slice(0, 160));
    }
  };

  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/60 p-3" onClick={onClose}>
      <div className="w-[min(820px,97vw)] max-h-[94vh] overflow-y-auto rounded-2xl border border-border bg-background shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-4 py-3 border-b border-border/60 sticky top-0 bg-background z-10">
          <div className="text-base font-bold inline-flex items-center gap-2"><Sparkles className="w-5 h-5 text-fuchsia-400" /> Choose your Gotchi · Portal #{tokenId}</div>
          <button onClick={onClose} className="p-1.5 rounded hover:bg-muted/50"><X className="w-5 h-5" /></button>
        </div>
        <div className="p-4">
          <p className="text-[11px] text-muted-foreground mb-3">Pick one of the 10 summoned Aavegotchis. Claiming is irreversible and signed in your wallet.</p>
          {isLoading ? (
            <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-2">
              {options.map((o, i) => (
                <button key={i} onClick={() => setPicked(i)} className={`rounded-lg border p-2 transition-all hover:-translate-y-0.5 ${picked === i ? "border-primary ring-2 ring-primary/50 bg-primary/5" : "border-border/40 hover:border-primary/40"}`}>
                  <InlineSvg svg={o.svg} className="block aspect-square rounded bg-muted/30 overflow-hidden [&>svg]:w-full [&>svg]:h-full" />
                  <div className="mt-1 text-[11px] font-bold">BRS {o.brs}</div>
                  <div className="text-[8px] text-muted-foreground leading-tight">{o.numericTraits.slice(0, 6).map((t, j) => `${TRAITS[j]} ${t}`).join(" · ")}</div>
                </button>
              ))}
            </div>
          )}
          {status === "err" && <div className="mt-3 flex items-center gap-2 text-sm text-red-500"><XCircle className="w-4 h-4" /> {errMsg}</div>}
          {status === "ok" && <div className="mt-3 flex items-center gap-2 text-sm text-emerald-500"><CheckCircle2 className="w-4 h-4" /> Summoned! Your new gotchi will appear shortly.</div>}
          <div className="mt-4 flex justify-end gap-2">
            <button onClick={onClose} className="h-9 px-4 rounded-md border border-border/60 text-sm font-medium hover:bg-muted/50">Cancel</button>
            <button disabled={picked == null || status === "busy" || status === "ok"} onClick={claim} className="h-9 px-5 rounded-md bg-fuchsia-600 text-white text-sm font-semibold disabled:opacity-50 inline-flex items-center gap-1.5">
              {status === "busy" ? <><Loader2 className="w-4 h-4 animate-spin" /> Claiming…</> : "Claim Gotchi"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
