import { useEffect, useMemo, useState } from "react";
import { qk } from "@/lib/queryKeys";
import { createPortal } from "react-dom";
import { useAccount, useWriteContract, usePublicClient } from "wagmi";
import { useQueryClient } from "@tanstack/react-query";
import { X, Loader2, MapPin, Zap, Sprout, Package, Lock, Trash2, Telescope, ArrowUpCircle } from "lucide-react";
import { useParcelDetail, type Placed } from "@/hooks/useParcelDetail";
import { useInstallationInventory, type InventoryItem } from "@/hooks/useInstallationInventory";
import { useCraft } from "@/hooks/useCraft";
import { useUpgrade } from "@/hooks/useUpgrade";
import { CRAFTABLE_L1 } from "@/lib/lending/contracts";
import { PARCEL_SIZE_LABEL } from "@/hooks/useLandParcels";
import { ParcelGrid } from "@/components/lending/ParcelGrid";
import type { useRealmActions } from "@/hooks/useRealmActions";
import { REALM_DIAMOND_BASE, REALM_FACET_ABI } from "@/lib/lending/contracts";
import { BASE_CHAIN_ID } from "@/lib/chains";
import { parseRevert } from "@/lib/lending/parseRevert";

const TOKENS = ["FUD", "FOMO", "ALPHA", "KEK"] as const;
const DEC = BigInt(10) ** BigInt(18);

const whole = (b?: bigint) => ((b ?? 0n) / DEC).toLocaleString();
const when = (u: number) => (u > 0 ? new Date(u * 1000).toLocaleString() : "never");

const DIMS: Record<number, string> = { 0: "8×8", 1: "16×16", 2: "32×64", 3: "64×32", 4: "64×64" };

const ACCESS_LABEL: Record<number, string> = {
  0: "Owner only",
  1: "Owner + borrowed gotchis",
  2: "Whitelisted",
  3: "Anyone (allowlisted)",
  4: "Anyone",
};
const accessLabel = (m: number | null) =>
  m == null ? "—" : ACCESS_LABEL[m] ?? `Mode ${m}`;

type Props = {
  parcelId: string;
  onClose: () => void;
  actions?: ReturnType<typeof useRealmActions>;
  gotchiId?: number;
  /** Optional Baazaar action panel (buy/offer or list/cancel + sale history),
   *  rendered under the header when this modal is opened from the Explorer. */
  marketPanel?: React.ReactNode;
};

export function ParcelDetailModal({ parcelId, onClose, actions, gotchiId, marketPanel }: Props) {
  const { detail, isLoading, error } = useParcelDetail(parcelId);
  const { address } = useAccount();
  const inventory = useInstallationInventory(address);
  const craftHook = useCraft(address);
  const upgradeHook = useUpgrade(address);
  const [dragItem, setDragItem] = useState<InventoryItem | null>(null);
  const [tab, setTab] = useState<"overview" | "build">("overview");
  const [pending, setPending] = useState<Placed[]>([]);
  const [moving, setMoving] = useState<{ index: number; w: number; h: number } | null>(null);
  const [saving, setSaving] = useState<{ done: number; total: number } | null>(null);
  const [removals, setRemovals] = useState<Placed[]>([]); // existing installs staged for removal
  const [moves, setMoves] = useState<{ from: Placed; x: number; y: number }[]>([]); // existing installs staged to move
  const [movingExisting, setMovingExisting] = useState<Placed | null>(null);

  const keyOf = (i: { installationId: string; x: number; y: number }) => `${i.installationId}:${i.x}:${i.y}`;
  const removalKeys = useMemo(() => {
    const s = new Set<string>();
    removals.forEach((r) => s.add(keyOf(r)));
    moves.forEach((m) => s.add(keyOf(m.from)));
    return s;
  }, [removals, moves]);
  // Staged ghosts drawn on the grid: new placements + existing-install moves.
  const stagedGhosts = useMemo<Placed[]>(
    () => [...pending, ...moves.map((m) => ({ ...m.from, x: m.x, y: m.y, _moved: true } as Placed & { _moved: boolean }))],
    [pending, moves]
  );
  const pendingChanges = removals.length + moves.length + pending.length;
  const canBuild = !!actions && !!gotchiId && !!actions.isOnBase;
  const canRemove = canBuild;

  // Apply all staged changes in one pass: removals (unequip), moves (unequip
  // old + equip new), then new placements (equip). One signature per tx.
  async function saveChanges() {
    if (!detail || !gotchiId || pendingChanges === 0) return;
    const total = removals.length + moves.length * 2 + pending.length;
    let done = 0;
    setSaving({ done, total });
    const tick = () => { done++; setSaving({ done, total }); };
    const uneq = (i: { installationId: string; x: number; y: number }) =>
      writeContractAsync({ chainId: BASE_CHAIN_ID, address: REALM_DIAMOND_BASE, abi: REALM_FACET_ABI, functionName: "unequipInstallation", args: [BigInt(detail.tokenId), BigInt(gotchiId!), BigInt(i.installationId), BigInt(i.x), BigInt(i.y), "0x"] });
    const eq = (i: { installationId: string; x: number; y: number }) =>
      writeContractAsync({ chainId: BASE_CHAIN_ID, address: REALM_DIAMOND_BASE, abi: REALM_FACET_ABI, functionName: "equipInstallation", args: [BigInt(detail.tokenId), BigInt(gotchiId!), BigInt(i.installationId), BigInt(i.x), BigInt(i.y), "0x"] });
    try {
      for (const r of removals) { const h = await uneq(r); await publicClient?.waitForTransactionReceipt({ hash: h, confirmations: 1 }); tick(); }
      for (const m of moves) {
        const h1 = await uneq(m.from); await publicClient?.waitForTransactionReceipt({ hash: h1, confirmations: 1 }); tick();
        const h2 = await eq({ installationId: m.from.installationId, x: m.x, y: m.y }); await publicClient?.waitForTransactionReceipt({ hash: h2, confirmations: 1 }); tick();
      }
      for (const it of pending) { const h = await eq(it); await publicClient?.waitForTransactionReceipt({ hash: h, confirmations: 1 }); tick(); }
      setPending([]); setRemovals([]); setMoves([]);
      queryClient.invalidateQueries({ queryKey: qk.parcelDetail() });
      queryClient.invalidateQueries({ queryKey: qk.landParcels() });
    } catch (e) {
      if (typeof window !== "undefined") window.alert(parseRevert(e).slice(0, 200));
    } finally {
      setSaving(null);
    }
  }

  const { writeContractAsync } = useWriteContract();
  const publicClient = usePublicClient({ chainId: BASE_CHAIN_ID });
  const queryClient = useQueryClient();
  const [teardown, setTeardown] = useState<{ alch: number; done: number; total: number } | null>(null);

  async function runTeardown(alch: number, group: { installationId: string; x: number; y: number }[]) {
    if (!detail || !gotchiId) return;
    if (
      typeof window !== "undefined" &&
      !window.confirm(`Remove all ${TOKENS[alch]} harvesters & reservoirs (${group.length})? Each is a separate transaction.`)
    )
      return;
    setTeardown({ alch, done: 0, total: group.length });
    try {
      for (let i = 0; i < group.length; i++) {
        const it = group[i];
        const hash = await writeContractAsync({
          chainId: BASE_CHAIN_ID,
          address: REALM_DIAMOND_BASE,
          abi: REALM_FACET_ABI,
          functionName: "unequipInstallation",
          args: [BigInt(detail.tokenId), BigInt(gotchiId), BigInt(it.installationId), BigInt(it.x), BigInt(it.y), "0x"],
        });
        await publicClient?.waitForTransactionReceipt({ hash, confirmations: 1 });
        setTeardown({ alch, done: i + 1, total: group.length });
      }
      queryClient.invalidateQueries({ queryKey: qk.parcelDetail() });
      queryClient.invalidateQueries({ queryKey: qk.landParcels() });
    } catch (e) {
      if (typeof window !== "undefined") window.alert(parseRevert(e).slice(0, 200));
    } finally {
      setTeardown(null);
    }
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const boostList = detail
    ? (["fud", "fomo", "alpha", "kek"] as const)
        .map((k, i) => (detail.boosts[k] > 0 ? `${TOKENS[i]} +${detail.boosts[k]}` : null))
        .filter(Boolean)
    : [];

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/60 backdrop-blur-sm p-4 sm:p-8"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-2xl rounded-xl border border-border/50 bg-background shadow-xl my-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          onClick={onClose}
          className="absolute right-3 top-3 h-8 w-8 inline-flex items-center justify-center rounded-md hover:bg-muted/60 text-muted-foreground"
          aria-label="Close"
        >
          <X className="w-4 h-4" />
        </button>

        {isLoading && !detail ? (
          <div className="p-10 flex items-center justify-center text-muted-foreground text-sm gap-2">
            <Loader2 className="w-4 h-4 animate-spin" /> Loading parcel…
          </div>
        ) : error ? (
          <div className="p-6 text-sm text-destructive">{error}</div>
        ) : !detail ? (
          <div className="p-6 text-sm text-muted-foreground">Parcel not found.</div>
        ) : (
          <div className="p-4 sm:p-5 space-y-4">
            {/* Header */}
            <div className="pr-8">
              <div className="text-lg font-bold inline-flex items-center gap-2 flex-wrap">
                <MapPin className="w-5 h-5 text-emerald-500" />
                <span>Parcel {detail.tokenId}</span>
                {detail.name && <span className="text-emerald-500">{detail.name}</span>}
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-muted/60 text-muted-foreground">
                  {PARCEL_SIZE_LABEL[detail.size] ?? `Size ${detail.size}`}
                </span>
              </div>
              <div className="text-xs text-muted-foreground mt-1">
                District {detail.district} · ({detail.x},{detail.y}) · {DIMS[detail.size] ?? ""} · {detail.surveyRound} rounds surveyed
              </div>
              {detail.owner && (
                <div className="text-[11px] text-muted-foreground mt-0.5">
                  Owner: <span className="font-mono">{detail.owner.slice(0, 6)}…{detail.owner.slice(-4)}</span>
                  <button
                    type="button"
                    onClick={() => navigator.clipboard?.writeText(detail.owner)}
                    className="ml-1.5 text-primary hover:underline"
                  >
                    copy
                  </button>
                </div>
              )}
              {detail.lastSale && (
                <div className="text-[11px] text-muted-foreground mt-0.5">
                  Last Baazaar sale: <span className="text-foreground">{detail.lastSale.priceGhst.toLocaleString()} GHST</span>{" "}
                  ({new Date(detail.lastSale.time * 1000).toLocaleDateString()})
                </div>
              )}
              {actions && (
                <button
                  type="button"
                  onClick={() => actions.survey(BigInt(detail.tokenId))}
                  disabled={
                    !actions.isOnBase ||
                    detail.surveying ||
                    detail.surveyRound >= 10 ||
                    actions.step === "submitting" ||
                    actions.step === "confirming"
                  }
                  title={
                    detail.surveyRound >= 10
                      ? "All 10 survey rounds complete (max)"
                      : detail.surveying
                      ? "Survey already in progress"
                      : "Start a new survey round"
                  }
                  className="mt-2 inline-flex items-center gap-1 h-8 px-3 rounded-md border border-border/40 bg-background/70 hover:bg-muted/50 disabled:opacity-50 disabled:cursor-not-allowed text-xs font-semibold"
                >
                  <Telescope className="w-3.5 h-3.5" />
                  {detail.surveyRound >= 10 ? "Surveys maxed (10/10)" : detail.surveying ? "Surveying…" : "Survey"}
                </button>
              )}
            </div>

            {marketPanel && <div className="rounded-lg border border-border/40 bg-muted/10 p-3 space-y-2.5">{marketPanel}</div>}

            {/* Tabs */}
            <div className="flex items-center gap-1 border-b border-border/30">
              {(["overview", "build"] as const).map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setTab(t)}
                  className={`px-3 py-1.5 text-xs font-semibold border-b-2 -mb-px transition-colors ${
                    tab === t
                      ? "border-primary text-primary"
                      : "border-transparent text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {t === "overview" ? "Overview" : "Build & manage"}
                </button>
              ))}
            </div>

            {tab === "overview" && (
              <div className="space-y-4">
            {/* Alchemica table */}
            <section>
              <div className="text-xs font-semibold mb-1.5 inline-flex items-center gap-1.5">
                <Sprout className="w-3.5 h-3.5 text-emerald-500" /> Alchemica
              </div>
              <div className="overflow-x-auto rounded border border-border/40">
                <table className="w-full text-xs">
                  <thead className="text-muted-foreground">
                    <tr className="border-b border-border/40">
                      <th className="text-left font-medium px-2 py-1.5">Token</th>
                      <th className="text-right font-medium px-2 py-1.5">Claimable</th>
                      <th className="text-right font-medium px-2 py-1.5">In-ground</th>
                      <th className="text-right font-medium px-2 py-1.5">Harvest/day</th>
                      <th className="text-right font-medium px-2 py-1.5">Capacity</th>
                      <th className="text-right font-medium px-2 py-1.5">Claimed</th>
                    </tr>
                  </thead>
                  <tbody>
                    {TOKENS.map((t, i) => (
                      <tr key={t} className="border-b border-border/20 last:border-0">
                        <td className="px-2 py-1.5 font-medium">{t}</td>
                        <td className="px-2 py-1.5 text-right text-emerald-600 dark:text-emerald-400">{whole(detail.available[i])}</td>
                        <td className="px-2 py-1.5 text-right">{whole(detail.remaining[i])}</td>
                        <td className="px-2 py-1.5 text-right">{whole(detail.harvestRate[i])}</td>
                        <td className="px-2 py-1.5 text-right">{whole(detail.capacity[i])}</td>
                        <td className="px-2 py-1.5 text-right text-muted-foreground">{whole(detail.totalClaimed[i])}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {boostList.length > 0 && (
                <div className="text-[11px] text-muted-foreground mt-1.5">
                  Boosts: <span className="text-foreground font-medium">{boostList.join(" · ")}</span>
                </div>
              )}
            </section>

            {/* Survey history */}
            {detail.rounds.length > 0 && (
              <section>
                <div className="text-xs font-semibold mb-1.5 inline-flex items-center gap-1.5">
                  <Telescope className="w-3.5 h-3.5 text-emerald-500" /> Survey history · {detail.rounds.length} rounds
                </div>
                <div className="overflow-x-auto rounded border border-border/40">
                  <table className="w-full text-xs">
                    <thead className="text-muted-foreground">
                      <tr className="border-b border-border/40">
                        <th className="text-left font-medium px-2 py-1">Round</th>
                        {TOKENS.map((t) => (
                          <th key={t} className="text-right font-medium px-2 py-1">{t}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {detail.rounds.map((r) => (
                        <tr key={r.round} className="border-b border-border/20 last:border-0">
                          <td className="px-2 py-1">{r.round}</td>
                          {TOKENS.map((t, i) => (
                            <td key={t} className="px-2 py-1 text-right">{whole(r.amounts[i] ?? 0n)}</td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            )}

            {/* Channeling + access */}
            <section className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="rounded border border-border/40 p-2.5">
                <div className="text-xs font-semibold inline-flex items-center gap-1.5 mb-1">
                  <Zap className="w-3.5 h-3.5 text-amber-500" /> Channeling
                </div>
                <div className="text-[11px] text-muted-foreground">
                  Last channeled: <span className="text-foreground">{when(detail.lastChanneled)}</span>
                </div>
              </div>
              <div className="rounded border border-border/40 p-2.5">
                <div className="text-xs font-semibold inline-flex items-center gap-1.5 mb-1">
                  <Lock className="w-3.5 h-3.5 text-muted-foreground" /> Access rights
                </div>
                <div className="text-[11px] text-muted-foreground">
                  Channeling: <span className="text-foreground">{accessLabel(detail.accessChanneling)}</span>
                </div>
                <div className="text-[11px] text-muted-foreground">
                  Empty reservoir: <span className="text-foreground">{accessLabel(detail.accessReservoir)}</span>
                </div>
              </div>
            </section>

              </div>
            )}

            {tab === "build" && (
              <div className="space-y-4">
            {/* Visual layout + building */}
            <section>
              <div className="text-xs font-semibold mb-1.5 inline-flex items-center justify-between gap-1.5">
                <span className="inline-flex items-center gap-1.5">
                  <Package className="w-3.5 h-3.5 text-primary" /> Layout · {detail.installations.length} installations · {detail.tiles.length} tiles
                </span>
                {canRemove && (
                  <span className="text-[10px] font-normal text-muted-foreground">Click to remove · drag to move · staged until you Save</span>
                )}
              </div>
              <ParcelGrid
                installations={detail.installations}
                tiles={detail.tiles}
                realmId={detail.tokenId}
                busyKey={actions?.activeKey ?? null}
                removalKeys={removalKeys}
                onRemove={
                  canRemove
                    ? (item) =>
                        setRemovals((r) => (r.some((x) => keyOf(x) === keyOf(item)) ? r.filter((x) => keyOf(x) !== keyOf(item)) : [...r, item]))
                    : undefined
                }
                onMoveExistingStart={canBuild ? (item) => { setMovingExisting(item); setDragItem(null); setMoving(null); } : undefined}
                placing={
                  dragItem ? { w: dragItem.w, h: dragItem.h } : moving ? { w: moving.w, h: moving.h } : movingExisting ? { w: movingExisting.w, h: movingExisting.h } : null
                }
                onPlace={
                  canBuild
                    ? (x, y) => {
                        if (movingExisting) {
                          const from = movingExisting;
                          setMoves((m) => [...m.filter((z) => keyOf(z.from) !== keyOf(from)), { from, x, y }]);
                          setMovingExisting(null);
                        } else if (moving) {
                          setPending((p) => p.map((it, idx) => (idx === moving.index ? { ...it, x, y } : it)));
                          setMoving(null);
                        } else if (dragItem) {
                          setPending((p) => [
                            ...p,
                            {
                              installationId: dragItem.installationId,
                              name: dragItem.name,
                              x,
                              y,
                              w: dragItem.w,
                              h: dragItem.h,
                              category: dragItem.category,
                              alch: dragItem.alch,
                              level: dragItem.level,
                            },
                          ]);
                          setDragItem(null);
                        }
                      }
                    : undefined
                }
                pending={stagedGhosts}
                onUnstage={(i) => {
                  if (i < pending.length) setPending((p) => p.filter((_, idx) => idx !== i));
                  else setMoves((m) => m.filter((_, idx) => idx !== i - pending.length));
                }}
                onMoveStart={(i) => {
                  if (i < pending.length) { setMoving({ index: i, w: pending[i].w, h: pending[i].h }); setDragItem(null); }
                  else { const mv = moves[i - pending.length]; setMovingExisting(mv.from); setMoves((m) => m.filter((_, idx) => idx !== i - pending.length)); setDragItem(null); }
                }}
                size={detail.size}
              />

              {canBuild && (
                <div className="mt-3">
                  <div className="text-xs font-semibold mb-1.5 flex items-center justify-between gap-2 flex-wrap">
                    <span>Your installations — drag onto the grid (staged, not saved yet)</span>
                    {pendingChanges > 0 && (
                      <span className="inline-flex items-center gap-1.5">
                        <button
                          type="button"
                          disabled={!!saving}
                          onClick={saveChanges}
                          className="inline-flex items-center gap-1 h-7 px-2.5 rounded-md bg-emerald-600 text-white hover:bg-emerald-600/90 disabled:opacity-50 text-[11px] font-semibold"
                        >
                          {saving ? (
                            <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Saving {saving.done}/{saving.total}…</>
                          ) : (
                            <>Save changes ({pendingChanges})</>
                          )}
                        </button>
                        <button
                          type="button"
                          disabled={!!saving}
                          onClick={() => { setPending([]); setRemovals([]); setMoves([]); setMovingExisting(null); }}
                          className="h-7 px-2 rounded-md border border-border/40 text-[11px] disabled:opacity-50"
                        >
                          Discard
                        </button>
                      </span>
                    )}
                  </div>
                  {inventory.isLoading ? (
                    <div className="text-xs text-muted-foreground">Loading inventory…</div>
                  ) : inventory.items.length === 0 ? (
                    <div className="text-xs text-muted-foreground">No unequipped installations in your wallet.</div>
                  ) : (
                    <div className="flex flex-wrap gap-1.5">
                      {inventory.items.map((it) => {
                        const used = pending.filter((p) => p.installationId === it.installationId).length;
                        const left = it.balance - used;
                        return (
                          <div
                            key={it.installationId}
                            draggable={left > 0}
                            onDragStart={() => left > 0 && setDragItem(it)}
                            onDragEnd={() => setDragItem(null)}
                            title={`${it.name} · #${it.installationId} · ${it.w}×${it.h} · ${left} left`}
                            className={`inline-flex items-center gap-1 rounded border border-border/40 bg-background/70 px-1.5 py-1 text-[11px] ${
                              left > 0 ? "cursor-grab active:cursor-grabbing hover:bg-muted/50" : "opacity-40"
                            }`}
                          >
                            <img
                              src={`/installations/installation_${it.installationId}.png`}
                              alt=""
                              className="w-5 h-5 object-contain"
                              style={{ imageRendering: "pixelated" }}
                              onError={(e) => { (e.currentTarget as HTMLImageElement).style.visibility = "hidden"; }}
                            />
                            <span className="truncate max-w-[140px]">{it.name}</span>
                            <span className="text-muted-foreground">×{left}</span>
                          </div>
                        );
                      })}
                    </div>
                  )}
                  <div className="text-[10px] text-muted-foreground mt-1">
                    Drop to stage (green = valid, red = occupied). Click a staged tile to unstage. Hit{" "}
                    <span className="font-medium">Save changes</span> to equip — one wallet signature each (level-1 installs only).
                  </div>

                  <div className="mt-3 border-t border-border/30 pt-3">
                    <div className="text-xs font-semibold mb-1.5">Craft farming installations (spends alchemica)</div>
                    {craftHook.error && (
                      <div className="text-[10px] text-destructive mb-1">{craftHook.error.slice(0, 140)}</div>
                    )}
                    <div className="flex flex-wrap gap-1.5">
                      {CRAFTABLE_L1.map((c) => (
                        <button
                          key={c.id}
                          type="button"
                          disabled={!!craftHook.busyId}
                          onClick={() => craftHook.craft(c.id)}
                          title={`Cost: ${c.cost.map((v, i) => (v ? `${v} ${TOKENS[i]}` : null)).filter(Boolean).join(", ")}`}
                          className="inline-flex items-center gap-1 rounded border border-border/40 bg-background/70 hover:bg-muted/50 px-1.5 py-1 text-[11px] disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          <img
                            src={`/installations/installation_${c.id}.png`}
                            alt=""
                            className="w-5 h-5 object-contain"
                            style={{ imageRendering: "pixelated" }}
                          />
                          {craftHook.busyId === c.id
                            ? craftHook.step === "approving"
                              ? "Approving…"
                              : "Crafting…"
                            : c.name}
                        </button>
                      ))}
                    </div>
                    <div className="text-[10px] text-muted-foreground mt-1">
                      First craft approves alchemica spending. L1 installs mint instantly and appear in your inventory above.
                    </div>
                  </div>
                </div>
              )}
            </section>

            {/* Depleted-alchemica teardown */}
            {canBuild && (() => {
              const groups = ([0, 1, 2, 3] as const)
                .map((alch) => ({
                  alch,
                  items: detail.installations.filter(
                    (it) => (it.category === 1 || it.category === 2) && it.alch === alch
                  ),
                  depleted: (detail.remaining[alch] ?? 0n) === 0n,
                }))
                .filter((g) => g.depleted && g.items.length > 0);
              if (groups.length === 0) return null;
              return (
                <section>
                  <div className="text-xs font-semibold mb-1.5 inline-flex items-center gap-1.5">
                    <Trash2 className="w-3.5 h-3.5 text-destructive" /> Depleted teardown
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {groups.map((g) => (
                      <button
                        key={g.alch}
                        type="button"
                        disabled={!!teardown}
                        onClick={() =>
                          runTeardown(
                            g.alch,
                            g.items.map((it) => ({ installationId: it.installationId, x: it.x, y: it.y }))
                          )
                        }
                        className="inline-flex items-center gap-1 h-8 px-2.5 rounded-md border border-destructive/40 bg-destructive/10 hover:bg-destructive/20 text-destructive disabled:opacity-50 disabled:cursor-not-allowed text-xs font-semibold"
                      >
                        {teardown && teardown.alch === g.alch ? (
                          <>
                            <Loader2 className="w-3.5 h-3.5 animate-spin" /> Removing {teardown.done}/{teardown.total}…
                          </>
                        ) : (
                          <>
                            <Trash2 className="w-3.5 h-3.5" /> Remove all {TOKENS[g.alch]} harvesters & reservoirs ({g.items.length})
                          </>
                        )}
                      </button>
                    ))}
                  </div>
                  <div className="text-[10px] text-muted-foreground mt-1">
                    Shown only for alchemica types fully depleted in-ground. Each removal is a separate wallet signature.
                  </div>
                </section>
              );
            })()}

            {/* Upgrade installations */}
            {canBuild && (() => {
              const ups = detail.installations.filter((i) => i.category >= 0 && i.category <= 2 && i.level < 9);
              return (
                <section>
                  <div className="text-xs font-semibold mb-1.5 flex items-center justify-between gap-2">
                    <span className="inline-flex items-center gap-1.5">
                      <ArrowUpCircle className="w-3.5 h-3.5 text-primary" /> Upgrade installations (spends alchemica)
                    </span>
                    <button
                      type="button"
                      disabled={!!upgradeHook.busyKey}
                      onClick={() => upgradeHook.finalize(BigInt(detail.tokenId))}
                      className="h-7 px-2 rounded-md border border-border/40 bg-background/70 hover:bg-muted/50 disabled:opacity-50 text-[11px] font-medium"
                    >
                      {upgradeHook.busyKey === `fin:${detail.tokenId}` ? "Finalizing…" : "Finalize ready"}
                    </button>
                  </div>
                  {upgradeHook.error && (
                    <div className="text-[10px] text-destructive mb-1">{upgradeHook.error.slice(0, 140)}</div>
                  )}
                  {ups.length === 0 ? (
                    <div className="text-xs text-muted-foreground">All installations at max level (L9).</div>
                  ) : (
                    <div className="grid gap-1.5 max-h-48 overflow-y-auto">
                      {ups.map((i, idx) => {
                        const busy = upgradeHook.busyKey === `upg:${detail.tokenId}:${i.installationId}:${i.x}:${i.y}`;
                        return (
                          <div
                            key={idx}
                            className="flex items-center justify-between gap-2 text-[11px] rounded border border-border/30 bg-background/50 px-2 py-1.5"
                          >
                            <span className="truncate">
                              {i.name} <span className="text-muted-foreground">@ ({i.x},{i.y})</span>
                            </span>
                            <button
                              type="button"
                              disabled={!!upgradeHook.busyKey}
                              onClick={() =>
                                upgradeHook.upgrade(BigInt(detail.tokenId), BigInt(i.installationId), i.x, i.y, BigInt(gotchiId!))
                              }
                              className="h-7 px-2 rounded border border-primary/40 bg-primary/10 hover:bg-primary/20 text-primary disabled:opacity-50 disabled:cursor-not-allowed font-medium shrink-0"
                            >
                              {busy
                                ? upgradeHook.step === "approving"
                                  ? "Approving…"
                                  : "Upgrading…"
                                : `Upgrade → L${i.level + 1}`}
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  )}
                  <div className="text-[10px] text-muted-foreground mt-1">
                    Upgrades cost alchemica and queue for a block delay — hit <span className="font-medium">Finalize ready</span>{" "}
                    once the timer passes (or pass GLTR to skip, not wired here).
                  </div>
                </section>
              );
            })()}
              </div>
            )}
          </div>
        )}
      </div>
    </div>,
    document.body
  );
}
