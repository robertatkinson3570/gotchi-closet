import { useState } from "react";
import { useAccount, useChainId, usePublicClient, useWriteContract } from "wagmi";
import { Heart, Pencil, Sparkles, Send, Flame, Loader2, Tag, X, Settings2, CheckCircle2, XCircle } from "lucide-react";
import { BASE_CHAIN_ID } from "@/lib/chains";
import { AAVEGOTCHI_DIAMOND_BASE } from "@/lib/lending/contracts";
import { parseRevert } from "@/lib/lending/parseRevert";
import { GotchiSvg } from "@/components/gotchi/GotchiSvg";

const ACTIONS_ABI = [
  { name: "interact", type: "function", stateMutability: "nonpayable", inputs: [{ name: "_tokenIds", type: "uint256[]" }], outputs: [] },
  { name: "setAavegotchiName", type: "function", stateMutability: "nonpayable", inputs: [{ name: "_tokenId", type: "uint256" }, { name: "_name", type: "string" }], outputs: [] },
  { name: "spendSkillPoints", type: "function", stateMutability: "nonpayable", inputs: [{ name: "_tokenId", type: "uint256" }, { name: "_values", type: "int16[4]" }], outputs: [] },
  { name: "decreaseAndDestroy", type: "function", stateMutability: "nonpayable", inputs: [{ name: "_tokenId", type: "uint256" }, { name: "_toId", type: "uint256" }], outputs: [] },
  { name: "safeTransferFrom", type: "function", stateMutability: "nonpayable", inputs: [{ name: "from", type: "address" }, { name: "to", type: "address" }, { name: "tokenId", type: "uint256" }], outputs: [] },
  { name: "addERC721Listing", type: "function", stateMutability: "nonpayable", inputs: [{ name: "_erc721TokenAddress", type: "address" }, { name: "_erc721TokenId", type: "uint256" }, { name: "_priceInWei", type: "uint256" }], outputs: [] },
] as const;

type Props = {
  gotchiId: string;
  name?: string;
  hauntId?: number;
  collateral?: string;
  numericTraits?: number[];
  equippedWearables?: number[];
};

const TRAITS = ["NRG", "AGG", "SPK", "BRN"] as const;
type Status = { kind: "idle" } | { kind: "busy"; label: string } | { kind: "ok"; label: string } | { kind: "err"; label: string };

export function GotchiActionsPanel({ gotchiId, name, hauntId, collateral, numericTraits, equippedWearables }: Props) {
  const { address, isConnected } = useAccount();
  const chainId = useChainId();
  const isOnBase = chainId === BASE_CHAIN_ID;
  const publicClient = usePublicClient({ chainId: BASE_CHAIN_ID });
  const { writeContractAsync } = useWriteContract();

  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState<Status>({ kind: "idle" });
  const [newName, setNewName] = useState(name ?? "");
  const [sp, setSp] = useState<[string, string, string, string]>(["0", "0", "0", "0"]);
  const [to, setTo] = useState("");
  const [price, setPrice] = useState("");

  const id = BigInt(gotchiId);
  const busy = status.kind === "busy";

  const run = async (label: string, functionName: string, args: any[]) => {
    if (!isConnected || !address || !publicClient) return setStatus({ kind: "err", label: "Connect your wallet first" });
    if (!isOnBase) return setStatus({ kind: "err", label: "Switch to Base" });
    setStatus({ kind: "busy", label: `${label}…` });
    try {
      const hash = await writeContractAsync({ chainId: BASE_CHAIN_ID, address: AAVEGOTCHI_DIAMOND_BASE, abi: ACTIONS_ABI, functionName: functionName as any, args: args as any });
      await publicClient.waitForTransactionReceipt({ hash, confirmations: 1 });
      setStatus({ kind: "ok", label: `${label} confirmed` });
    } catch (e) {
      setStatus({ kind: "err", label: parseRevert(e).slice(0, 140) });
    }
  };

  const Section = ({ icon, title, children }: { icon: React.ReactNode; title: string; children: React.ReactNode }) => (
    <div className="rounded-lg border border-border/60 p-2.5 space-y-1.5">
      <div className="flex items-center gap-1.5 text-xs font-semibold">{icon}{title}</div>
      {children}
    </div>
  );
  const field = "h-8 flex-1 min-w-0 rounded border border-border bg-background px-2 text-sm";
  const goBtn = "h-8 px-3 rounded bg-primary text-primary-foreground text-xs font-semibold disabled:opacity-50 shrink-0";

  return (
    <>
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); setOpen(true); setStatus({ kind: "idle" }); }}
        className="mt-2 inline-flex items-center justify-center gap-1.5 h-8 w-full rounded-md bg-primary/15 text-primary border border-primary/30 text-xs font-semibold hover:bg-primary/25"
      >
        <Settings2 className="w-3.5 h-3.5" /> Manage gotchi
      </button>

      {open && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/60 p-3" onClick={(e) => { e.stopPropagation(); setOpen(false); }}>
          <div className="w-[min(440px,94vw)] max-h-[90vh] overflow-y-auto rounded-xl border border-border bg-background shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-3 py-2 border-b border-border/60 sticky top-0 bg-background">
              <div className="text-sm font-semibold">Manage Gotchi #{gotchiId}{name ? ` · ${name}` : ""}</div>
              <button onClick={() => setOpen(false)} className="p-1 rounded hover:bg-muted/50"><X className="w-4 h-4" /></button>
            </div>

            <div className="p-3 space-y-2.5">
              <div className="flex items-center gap-3">
                <span className="w-20 h-20 rounded bg-muted/40 overflow-hidden shrink-0">
                  <GotchiSvg gotchiId={gotchiId} hauntId={hauntId} collateral={collateral} numericTraits={numericTraits} equippedWearables={equippedWearables} mode="preview" useBlobUrl className="w-full h-full object-contain" />
                </span>
                <div className="text-xs text-muted-foreground">
                  Actions are signed in your wallet. You must own this gotchi (and it must be unlocked) or the action reverts.
                </div>
              </div>

              {status.kind !== "idle" && (
                <div className={`flex items-center gap-1.5 text-xs rounded-md px-2 py-1.5 ${
                  status.kind === "busy" ? "bg-muted/50 text-foreground" : status.kind === "ok" ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400" : "bg-red-500/15 text-red-500"
                }`}>
                  {status.kind === "busy" ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : status.kind === "ok" ? <CheckCircle2 className="w-3.5 h-3.5" /> : <XCircle className="w-3.5 h-3.5" />}
                  {status.label}
                </div>
              )}

              <Section icon={<Heart className="w-3.5 h-3.5 text-rose-500" />} title="Pet (raise kinship)">
                <button disabled={busy} onClick={() => run("Pet", "interact", [[id]])} className="h-8 w-full rounded bg-rose-500/15 text-rose-500 border border-rose-500/30 text-xs font-semibold disabled:opacity-50">Pet now</button>
              </Section>

              <Section icon={<Pencil className="w-3.5 h-3.5" />} title="Rename">
                <div className="flex items-center gap-1.5">
                  <input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="New name" className={field} />
                  <button disabled={busy || !newName.trim()} onClick={() => run("Rename", "setAavegotchiName", [id, newName.trim()])} className={goBtn}>Save</button>
                </div>
              </Section>

              <Section icon={<Sparkles className="w-3.5 h-3.5 text-amber-500" />} title="Spend skill points">
                <div className="grid grid-cols-4 gap-1.5">
                  {TRAITS.map((t, i) => (
                    <label key={t} className="text-[10px] text-muted-foreground">
                      {t}
                      <input type="number" value={sp[i]} onChange={(e) => setSp((p) => { const n = [...p] as typeof p; n[i] = e.target.value; return n; })} className="h-7 w-full rounded border border-border bg-background px-1 text-xs" />
                    </label>
                  ))}
                </div>
                <button disabled={busy} onClick={() => run("Spend skill points", "spendSkillPoints", [id, sp.map((v) => Math.trunc(Number(v) || 0))])} className="h-8 w-full rounded bg-amber-500/15 text-amber-600 border border-amber-500/30 text-xs font-semibold disabled:opacity-50">Spend</button>
              </Section>

              <Section icon={<Tag className="w-3.5 h-3.5 text-emerald-500" />} title="List for sale (Baazaar)">
                <div className="flex items-center gap-1.5">
                  <input type="number" value={price} onChange={(e) => setPrice(e.target.value)} placeholder="Price in GHST" className={field} />
                  <button disabled={busy || !(Number(price) > 0)} onClick={() => run("List", "addERC721Listing", [AAVEGOTCHI_DIAMOND_BASE, id, BigInt(Math.floor(Number(price) * 1e18))])} className={`${goBtn} bg-emerald-600`}>List</button>
                </div>
              </Section>

              <Section icon={<Send className="w-3.5 h-3.5" />} title="Transfer">
                <div className="flex items-center gap-1.5">
                  <input value={to} onChange={(e) => setTo(e.target.value)} placeholder="0x recipient address" className={field} />
                  <button disabled={busy || !/^0x[a-fA-F0-9]{40}$/.test(to)} onClick={() => run("Transfer", "safeTransferFrom", [address as `0x${string}`, to as `0x${string}`, id])} className={goBtn}>Send</button>
                </div>
              </Section>

              <Section icon={<Flame className="w-3.5 h-3.5 text-red-500" />} title="Sacrifice (irreversible)">
                <p className="text-[11px] text-muted-foreground">Destroys the gotchi and returns its staked collateral. This cannot be undone.</p>
                <button
                  disabled={busy}
                  onClick={() => { if (window.confirm(`Sacrifice gotchi #${gotchiId}? IRREVERSIBLE — destroys it and returns staked collateral.`)) run("Sacrifice", "decreaseAndDestroy", [id, id]); }}
                  className="h-8 w-full rounded bg-red-500/15 text-red-500 border border-red-500/40 text-xs font-semibold disabled:opacity-50"
                >
                  Sacrifice gotchi
                </button>
              </Section>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
