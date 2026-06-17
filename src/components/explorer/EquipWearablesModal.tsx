import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAccount, useChainId, usePublicClient, useWriteContract } from "wagmi";
import { Loader2, X, CheckCircle2, XCircle, Shirt, Trash2, Bookmark, Plus } from "lucide-react";
import { BASE_CHAIN_ID } from "@/lib/chains";
import { AAVEGOTCHI_DIAMOND_BASE } from "@/lib/lending/contracts";
import { parseRevert } from "@/lib/lending/parseRevert";
import { SLOT_NAMES } from "@/lib/constants";
import { GotchiSvg } from "@/components/gotchi/GotchiSvg";
import wearablesData from "../../../data/wearables.json";

const EQUIP_ABI = [
  { name: "equipWearables", type: "function", stateMutability: "nonpayable", inputs: [{ name: "_tokenId", type: "uint256" }, { name: "_wearablesToEquip", type: "uint16[16]" }], outputs: [] },
] as const;
const ITEM_BALANCES_ABI = [
  { name: "itemBalances", type: "function", stateMutability: "view", inputs: [{ name: "_account", type: "address" }], outputs: [{ type: "tuple[]", components: [{ name: "itemId", type: "uint256" }, { name: "balance", type: "uint256" }] }] },
] as const;

type WData = { id: number; name: string; slotPositions: boolean[]; rarityScoreModifier: number; traitModifiers: number[]; category: number };
const WMAP = new Map<number, WData>((wearablesData as WData[]).map((w) => [w.id, w]));
const itemImg = (id: number) => `https://dapp.aavegotchi.com/brand/items/${id}.svg`;
const TRAIT_ABBR = ["NRG", "AGG", "SPK", "BRN"];

function traitSummary(w?: WData): string {
  if (!w) return "";
  const parts: string[] = [];
  w.traitModifiers?.slice(0, 4).forEach((v, i) => { if (v) parts.push(`${v > 0 ? "+" : ""}${v} ${TRAIT_ABBR[i]}`); });
  if (w.rarityScoreModifier) parts.push(`+${w.rarityScoreModifier} BRS`);
  return parts.join(" · ");
}

type Status = { kind: "idle" } | { kind: "busy" } | { kind: "ok" } | { kind: "err"; msg: string };

// Saved outfits are local (per-browser) named loadouts of the 8 slots, applicable
// to any gotchi — same idea as the dapp's Outfit Manager.
type Outfit = { name: string; slots: number[] };
const OUTFITS_KEY = "gc_outfits";
function loadOutfits(): Outfit[] {
  try { return JSON.parse(localStorage.getItem(OUTFITS_KEY) || "[]"); } catch { return []; }
}
function saveOutfits(o: Outfit[]) {
  try { localStorage.setItem(OUTFITS_KEY, JSON.stringify(o)); } catch { /* ignore quota */ }
}

export function EquipWearablesModal({
  gotchiId, equippedWearables, hauntId, collateral, numericTraits, onClose, onSaved,
}: {
  gotchiId: string;
  equippedWearables?: number[];
  hauntId?: number;
  collateral?: string;
  numericTraits?: number[];
  onClose: () => void;
  onSaved?: () => void;
}) {
  const { address, isConnected } = useAccount();
  const chainId = useChainId();
  const isOnBase = chainId === BASE_CHAIN_ID;
  const publicClient = usePublicClient({ chainId: BASE_CHAIN_ID });
  const { writeContractAsync } = useWriteContract();

  // The 8 visible slots; the contract takes a uint16[16] (slots 8-15 unused here).
  const initial = useMemo(() => Array.from({ length: 8 }, (_, i) => Number(equippedWearables?.[i] ?? 0)), [equippedWearables]);
  const [slots, setSlots] = useState<number[]>(initial);
  const [picker, setPicker] = useState<number | null>(null);
  const [status, setStatus] = useState<Status>({ kind: "idle" });
  const [outfits, setOutfits] = useState<Outfit[]>(() => loadOutfits());
  const [outfitName, setOutfitName] = useState("");

  const persistOutfits = (next: Outfit[]) => { setOutfits(next); saveOutfits(next); };
  const saveCurrentOutfit = () => {
    const name = outfitName.trim();
    if (!name) return;
    const next = [...outfits.filter((o) => o.name !== name), { name, slots: [...slots] }];
    persistOutfits(next);
    setOutfitName("");
  };

  // Owned wearable balances from the diamond (ERC1155 itemBalances).
  const { data: owned, isLoading: ownedLoading } = useQuery({
    queryKey: ["item-balances", address?.toLowerCase()],
    enabled: !!address && !!publicClient,
    staleTime: 60_000,
    queryFn: async () => {
      const res = (await publicClient!.readContract({ address: AAVEGOTCHI_DIAMOND_BASE, abi: ITEM_BALANCES_ABI, functionName: "itemBalances", args: [address as `0x${string}`] })) as { itemId: bigint; balance: bigint }[];
      const map: Record<number, number> = {};
      for (const b of res) { const id = Number(b.itemId); if (WMAP.get(id)?.category === 0) map[id] = Number(b.balance); }
      return map;
    },
  });

  const dirty = slots.some((s, i) => s !== initial[i]);

  // How many of a wearable are already placed across the current selection.
  const usedInSelection = (id: number) => slots.filter((s) => s === id).length;

  // Candidates for a slot: owned (balance > current placements) + valid for the slot.
  const candidatesFor = (slot: number) => {
    const ids = Object.keys(owned ?? {}).map(Number);
    return ids
      .filter((id) => WMAP.get(id)?.slotPositions?.[slot])
      .filter((id) => (owned![id] ?? 0) > usedInSelection(id) || slots[slot] === id)
      .sort((a, b) => (WMAP.get(b)?.rarityScoreModifier ?? 0) - (WMAP.get(a)?.rarityScoreModifier ?? 0));
  };

  const setSlot = (slot: number, id: number) => { setSlots((s) => s.map((v, i) => (i === slot ? id : v))); setPicker(null); };

  const save = async () => {
    if (!isConnected || !address || !publicClient) return setStatus({ kind: "err", msg: "Connect your wallet first" });
    if (!isOnBase) return setStatus({ kind: "err", msg: "Switch to Base" });
    setStatus({ kind: "busy" });
    try {
      const arr16 = [...slots, 0, 0, 0, 0, 0, 0, 0, 0].slice(0, 16).map((n) => Number(n)) as unknown as readonly [number, number, number, number, number, number, number, number, number, number, number, number, number, number, number, number];
      const hash = await writeContractAsync({ chainId: BASE_CHAIN_ID, address: AAVEGOTCHI_DIAMOND_BASE, abi: EQUIP_ABI, functionName: "equipWearables", args: [BigInt(gotchiId), arr16] });
      await publicClient.waitForTransactionReceipt({ hash, confirmations: 1 });
      setStatus({ kind: "ok" });
      onSaved?.();
    } catch (e) {
      setStatus({ kind: "err", msg: parseRevert(e).slice(0, 160) });
    }
  };

  const previewWearables = [...slots, 0, 0, 0, 0, 0, 0, 0, 0].slice(0, 16);

  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/60 p-3" onClick={onClose}>
      <div className="w-[min(880px,97vw)] max-h-[94vh] overflow-y-auto rounded-2xl border border-border bg-background shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-4 py-3 border-b border-border/60 sticky top-0 bg-background z-10">
          <div className="text-base font-bold inline-flex items-center gap-2"><Shirt className="w-5 h-5 text-primary" /> Equip wearables · Gotchi #{gotchiId}</div>
          <button onClick={onClose} className="p-1.5 rounded hover:bg-muted/50"><X className="w-5 h-5" /></button>
        </div>

        <div className="grid md:grid-cols-[300px_1fr] gap-4 p-4">
          {/* Live preview */}
          <div className="space-y-3">
            <div className="aspect-square rounded-xl bg-gradient-to-b from-muted/20 to-muted/50 overflow-hidden">
              <GotchiSvg gotchiId={gotchiId} hauntId={hauntId} collateral={collateral} numericTraits={numericTraits} equippedWearables={previewWearables} mode="preview" useBlobUrl className="w-full h-full object-contain" />
            </div>
            <p className="text-[11px] text-muted-foreground">Live preview. Equipping is signed in your wallet; unequipped wearables return to it. You must own this gotchi and it must be unlocked.</p>
            <div className="flex gap-2">
              <button onClick={() => setSlots([0, 0, 0, 0, 0, 0, 0, 0])} disabled={slots.every((s) => s === 0)} className="flex-1 h-9 rounded-md border border-border/60 text-xs font-medium hover:bg-muted/50 disabled:opacity-40 inline-flex items-center justify-center gap-1.5"><Trash2 className="w-3.5 h-3.5" /> Unequip all</button>
              <button onClick={save} disabled={status.kind === "busy" || !dirty} className="flex-1 h-9 rounded-md bg-primary text-primary-foreground text-xs font-semibold disabled:opacity-40 inline-flex items-center justify-center gap-1.5">
                {status.kind === "busy" ? <><Loader2 className="w-4 h-4 animate-spin" /> Saving…</> : "Save outfit"}
              </button>
            </div>
            {status.kind === "ok" && <div className="flex items-center gap-2 text-sm text-emerald-600 dark:text-emerald-400"><CheckCircle2 className="w-4 h-4" /> Outfit saved.</div>}
            {status.kind === "err" && <div className="flex items-center gap-2 text-sm text-red-500"><XCircle className="w-4 h-4" /> {status.msg}</div>}

            <div className="rounded-lg border border-border/50 p-2.5 space-y-2">
              <div className="text-[11px] font-semibold inline-flex items-center gap-1.5 text-muted-foreground"><Bookmark className="w-3.5 h-3.5" /> Outfit manager</div>
              <div className="flex items-center gap-1.5">
                <input value={outfitName} onChange={(e) => setOutfitName(e.target.value)} placeholder="Name this loadout" className="h-8 flex-1 min-w-0 rounded border border-border bg-background px-2 text-xs" />
                <button onClick={saveCurrentOutfit} disabled={!outfitName.trim()} className="h-8 px-2.5 rounded bg-muted text-xs font-medium disabled:opacity-40 inline-flex items-center gap-1"><Plus className="w-3.5 h-3.5" /> Save</button>
              </div>
              {outfits.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {outfits.map((o) => (
                    <span key={o.name} className="inline-flex items-center gap-1 rounded-full border border-border/60 bg-background pl-2 pr-1 py-0.5 text-[10px]">
                      <button onClick={() => setSlots([...o.slots, 0, 0, 0, 0, 0, 0, 0, 0].slice(0, 8))} className="hover:text-primary font-medium" title="Apply to this gotchi">{o.name}</button>
                      <button onClick={() => persistOutfits(outfits.filter((x) => x.name !== o.name))} className="text-muted-foreground hover:text-red-500" title="Delete"><X className="w-3 h-3" /></button>
                    </span>
                  ))}
                </div>
              )}
              <p className="text-[9px] text-muted-foreground">Loadouts are saved in this browser and can be applied to any gotchi. Applying sets the slots; press Save outfit to commit on-chain.</p>
            </div>
          </div>

          {/* Slots */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 content-start">
            {SLOT_NAMES.map((name, slot) => {
              const id = slots[slot];
              const w = id ? WMAP.get(id) : undefined;
              return (
                <div key={slot} className="rounded-lg border border-border/50 p-2 flex flex-col">
                  <div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground text-center mb-1">{name}</div>
                  <button
                    onClick={() => setPicker(picker === slot ? null : slot)}
                    className={`relative aspect-square rounded-md flex items-center justify-center bg-muted/30 hover:bg-muted/50 transition-colors ${picker === slot ? "ring-2 ring-primary" : ""}`}
                    title={w?.name ?? "Select a wearable"}
                  >
                    {id ? <img src={itemImg(id)} alt={w?.name ?? `#${id}`} className="max-w-[80%] max-h-[80%] object-contain" /> : <span className="text-[10px] text-muted-foreground font-medium">Select</span>}
                    {id !== 0 && (
                      <span onClick={(e) => { e.stopPropagation(); setSlot(slot, 0); }} className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-red-500 text-white flex items-center justify-center shadow" title="Remove"><X className="w-3 h-3" /></span>
                    )}
                  </button>
                  <div className="mt-1 h-7 text-[9px] text-center leading-tight text-muted-foreground truncate" title={w ? `${w.name} (${traitSummary(w)})` : ""}>{w?.name ?? "—"}</div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Picker drawer */}
        {picker !== null && (
          <div className="border-t border-border/60 p-4">
            <div className="flex items-center justify-between mb-2">
              <div className="text-sm font-semibold">Choose {SLOT_NAMES[picker]} wearable</div>
              <button onClick={() => setPicker(null)} className="text-xs text-muted-foreground hover:text-foreground">Close</button>
            </div>
            {ownedLoading ? (
              <div className="flex justify-center py-6"><Loader2 className="w-5 h-5 animate-spin text-primary" /></div>
            ) : candidatesFor(picker).length === 0 ? (
              <div className="text-xs text-muted-foreground py-4 text-center">You don't own any wearables for this slot.</div>
            ) : (
              <div className="grid grid-cols-3 sm:grid-cols-5 md:grid-cols-7 gap-2 max-h-[240px] overflow-y-auto">
                {candidatesFor(picker).map((id) => {
                  const w = WMAP.get(id);
                  const bal = owned?.[id] ?? 0;
                  return (
                    <button key={id} onClick={() => setSlot(picker, id)} className={`rounded-lg border p-1.5 hover:-translate-y-0.5 transition-all ${slots[picker] === id ? "border-primary ring-1 ring-primary/50" : "border-border/40 hover:border-primary/40"}`} title={traitSummary(w)}>
                      <span className="block aspect-square rounded bg-muted/30 flex items-center justify-center"><img src={itemImg(id)} alt={w?.name ?? `#${id}`} className="max-w-[80%] max-h-[80%] object-contain" /></span>
                      <div className="mt-1 text-[9px] font-medium truncate text-center">{w?.name ?? `#${id}`}</div>
                      <div className="text-[8px] text-muted-foreground text-center">×{bal}</div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
