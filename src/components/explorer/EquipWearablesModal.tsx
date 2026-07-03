import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAccount, useChainId, usePublicClient, useWriteContract } from "wagmi";
import { Loader2, X, CheckCircle2, XCircle, Shirt, Trash2, Bookmark, Plus, Sparkles } from "lucide-react";
import { BASE_CHAIN_ID } from "@/lib/chains";
import { AAVEGOTCHI_DIAMOND_BASE } from "@/lib/lending/contracts";
import { parseRevert } from "@/lib/lending/parseRevert";
import { SLOT_NAMES } from "@/lib/constants";
import { GotchiSvg } from "@/components/gotchi/GotchiSvg";
import { LiveTraitPanel } from "@/components/gotchi/LiveTraitPanel";
import { BrsSummary } from "@/components/gotchi/BrsSummary";
import { computeInstanceTraits, useWearablesById } from "@/state/selectors";
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

// Visible per-wearable stat modifiers, shown on equipped slots and in the picker
// so you can see what each piece does before/after equipping it. Colored by
// ALIGNMENT to this gotchi (via `directions`): green when the mod pushes a trait
// the rarity-beneficial way, red when it hurts. With no directions it falls back
// to raw sign (all directions default to +1).
function TraitMods({ w, directions }: { w?: WData; directions?: number[] }) {
  if (!w) return null;
  const chips = (w.traitModifiers?.slice(0, 4) ?? [])
    .map((v, i) => ({ label: TRAIT_ABBR[i], v: Number(v) || 0, dir: directions?.[i] ?? 1 }))
    .filter((c) => c.v !== 0);
  if (chips.length === 0 && !w.rarityScoreModifier) return null;
  return (
    <div className="mt-0.5 flex flex-wrap justify-center gap-x-1 gap-y-0.5 leading-none">
      {chips.map((c) => {
        const helps = c.dir * c.v > 0;
        return (
          <span key={c.label} className={`text-[8px] font-semibold tabular-nums ${helps ? "text-emerald-400" : "text-rose-400"}`} title={helps ? "Improves this gotchi's rarity" : "Hurts this gotchi's rarity"}>
            {c.v > 0 ? "+" : ""}{c.v} {c.label}
          </span>
        );
      })}
      {!!w.rarityScoreModifier && <span className="text-[8px] text-muted-foreground tabular-nums">+{w.rarityScoreModifier} BRS</span>}
    </div>
  );
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
  gotchiId, equippedWearables, hauntId, collateral, numericTraits, baseRarityScore, withSetsRarityScore, onClose, onSaved,
}: {
  gotchiId: string;
  equippedWearables?: number[];
  hauntId?: number;
  collateral?: string;
  numericTraits?: number[];
  /** On-chain trait-only rarity, used to anchor the live base score. */
  baseRarityScore?: number | string;
  /** On-chain rarity incl. sets + age; anchors the live total via an age offset. */
  withSetsRarityScore?: number | string;
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
  const [bestFirst, setBestFirst] = useState(false);

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

  // Live traits/BRS — same pure engine the dress page uses. Recomputes on every
  // slot change because `slots` is state. numericTraits are the base (birth +
  // respec) traits with no wearables; the engine applies wearable + set mods.
  const wearablesById = useWearablesById();
  const hasTraits = Array.isArray(numericTraits) && numericTraits.length >= 4;
  const live = useMemo(() => {
    if (!hasTraits) return null;
    return computeInstanceTraits({ baseTraits: numericTraits!, equippedBySlot: slots, wearablesById });
  }, [hasTraits, numericTraits, slots, wearablesById]);
  // Age BRS isn't plumbed into the modal, so anchor the total to the on-chain
  // withSetsRarityScore: offset = onchain − engine(currentOnChainOutfit). At
  // baseline the displayed Rarity matches the manage modal exactly, and it
  // tracks correctly as the outfit changes. Degrades to 0 when unavailable.
  const ageOffset = useMemo(() => {
    if (!hasTraits || withSetsRarityScore == null) return 0;
    const onchain = computeInstanceTraits({ baseTraits: numericTraits!, equippedBySlot: initial, wearablesById });
    return Number(withSetsRarityScore) - onchain.totalBrs;
  }, [hasTraits, withSetsRarityScore, numericTraits, initial, wearablesById]);
  const displayedTotal = live ? Math.round(live.totalBrs + ageOffset) : 0;
  const displayedBase = baseRarityScore != null ? Number(baseRarityScore) : (live?.traitBase ?? 0);

  // How many of a wearable are already placed across the current selection.
  const usedInSelection = (id: number) => slots.filter((s) => s === id).length;

  // Trait directions like the dress page: rarity rewards extremeness, so a trait
  // ≥50 wants to go higher (+1), <50 wants to go lower (−1). A wearable's
  // "alignment" is how much its modifiers push traits the beneficial way.
  const traitDirections = useMemo(
    () => Array.from({ length: 4 }, (_, i) => (Number(numericTraits?.[i] ?? 50) >= 50 ? 1 : -1)),
    [numericTraits]
  );
  const alignScore = (id: number) => {
    const w = WMAP.get(id);
    if (!w) return -Infinity;
    let s = 0;
    (w.traitModifiers?.slice(0, 4) ?? []).forEach((v, i) => { s += traitDirections[i] * (Number(v) || 0); });
    return s;
  };

  // Candidates for a slot: owned (balance > current placements) + valid for the slot.
  const candidatesFor = (slot: number) => {
    const ids = Object.keys(owned ?? {}).map(Number);
    return ids
      .filter((id) => WMAP.get(id)?.slotPositions?.[slot])
      .filter((id) => (owned![id] ?? 0) > usedInSelection(id) || slots[slot] === id)
      .sort((a, b) =>
        bestFirst
          ? alignScore(b) - alignScore(a) || (WMAP.get(b)?.rarityScoreModifier ?? 0) - (WMAP.get(a)?.rarityScoreModifier ?? 0)
          : (WMAP.get(b)?.rarityScoreModifier ?? 0) - (WMAP.get(a)?.rarityScoreModifier ?? 0)
      );
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
    <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/70 backdrop-blur-sm p-3" onClick={onClose}>
      <div className="w-[min(880px,97vw)] max-h-[94vh] overflow-y-auto rounded-2xl border border-white/10 bg-background shadow-2xl ring-1 ring-primary/10" onClick={(e) => e.stopPropagation()}>
        <div className="relative flex items-center justify-between px-4 py-3 border-b border-border/60 sticky top-0 z-10 bg-background overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-r from-primary/20 via-fuchsia-500/10 to-transparent pointer-events-none" />
          <div className="relative text-base font-bold inline-flex items-center gap-2"><Shirt className="w-5 h-5 text-primary" /> Equip wearables · <span className="font-mono text-muted-foreground">#{gotchiId}</span></div>
          <button onClick={onClose} className="relative p-1.5 rounded-lg bg-black/20 hover:bg-black/40 text-foreground"><X className="w-5 h-5" /></button>
        </div>

        <div className="grid md:grid-cols-[300px_1fr] gap-4 p-4">
          {/* Live preview */}
          <div className="space-y-3">
            <div className="aspect-square rounded-xl bg-gradient-to-b from-fuchsia-500/10 via-muted/20 to-primary/15 overflow-hidden ring-1 ring-white/10 shadow-inner">
              <GotchiSvg gotchiId={gotchiId} hauntId={hauntId} collateral={collateral} numericTraits={numericTraits} equippedWearables={previewWearables} mode="preview" useBlobUrl className="w-full h-full object-contain" />
            </div>
            <p className="text-[11px] text-muted-foreground">Live preview. Equipping is signed in your wallet; unequipped wearables return to it. You must own this gotchi and it must be unlocked.</p>

            {live && (
              <div className="space-y-2">
                <div className="rounded-lg border border-border/50 p-2.5">
                  <BrsSummary traitBase={displayedBase} traitWithMods={0} wearableFlat={0} setFlatBrs={0} ageBrs={0} totalBrs={displayedTotal} />
                  {live.bestSet && (
                    <div className="mt-1 inline-flex items-center gap-1 rounded-full border border-purple-500/30 bg-purple-500/10 px-2 py-0.5 text-[10px] font-medium text-purple-400">
                      <Sparkles className="w-3 h-3" /> {live.bestSet.name} set
                    </div>
                  )}
                </div>
                <LiveTraitPanel
                  baseTraits={numericTraits!}
                  finalTraits={live.finalTraits}
                  wearableDelta={live.wearableDelta}
                  setDelta={live.setTraitModsDelta}
                />
              </div>
            )}
            <div className="flex gap-2">
              <button onClick={() => setSlots([0, 0, 0, 0, 0, 0, 0, 0])} disabled={slots.every((s) => s === 0)} className="flex-1 h-9 rounded-lg border border-border/60 text-xs font-medium hover:bg-muted/50 disabled:opacity-40 inline-flex items-center justify-center gap-1.5"><Trash2 className="w-3.5 h-3.5" /> Unequip all</button>
              <button onClick={save} disabled={status.kind === "busy" || !dirty} className="flex-1 h-9 rounded-lg bg-gradient-to-r from-primary to-fuchsia-500 text-white text-xs font-bold disabled:opacity-40 inline-flex items-center justify-center gap-1.5 hover:brightness-110 shadow">
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
                  <div className="mt-1 text-[9px] text-center leading-tight text-muted-foreground truncate" title={w ? `${w.name} (${traitSummary(w)})` : ""}>{w?.name ?? "—"}</div>
                  <TraitMods w={w} directions={traitDirections} />
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
              <div className="flex items-center gap-2">
                {hasTraits && (
                  <button
                    onClick={() => setBestFirst((v) => !v)}
                    className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium transition-colors ${bestFirst ? "border-primary bg-primary/15 text-primary" : "border-border/60 text-muted-foreground hover:text-foreground"}`}
                    title="Rank the wearables that most improve this gotchi's rarity first"
                  >
                    <Sparkles className="w-3 h-3" /> Best for gotchi
                  </button>
                )}
                <button onClick={() => setPicker(null)} className="text-xs text-muted-foreground hover:text-foreground">Close</button>
              </div>
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
                      <TraitMods w={w} directions={traitDirections} />
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
