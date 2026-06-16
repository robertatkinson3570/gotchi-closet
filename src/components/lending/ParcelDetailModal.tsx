import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useAccount, useWriteContract, usePublicClient } from "wagmi";
import { useQueryClient } from "@tanstack/react-query";
import { X, Loader2, MapPin, Zap, Sprout, Package, Lock, Trash2, Telescope } from "lucide-react";
import { useParcelDetail, type Placed } from "@/hooks/useParcelDetail";
import { useInstallationInventory, type InventoryItem } from "@/hooks/useInstallationInventory";
import { PARCEL_SIZE_LABEL } from "@/hooks/useLandParcels";
import { ParcelGrid } from "@/components/lending/ParcelGrid";
import type { useRealmActions } from "@/hooks/useRealmActions";
import { REALM_DIAMOND_BASE, REALM_FACET_ABI } from "@/lib/lending/contracts";
import { BASE_CHAIN_ID } from "@/lib/chains";
import { parseRevert } from "@/lib/lending/parseRevert";

const TOKENS = ["FUD", "FOMO", "ALPHA", "KEK"] as const;
const DEC = BigInt(10) ** BigInt(18);

const whole = (b?: bigint) => ((b ?? 0n) / DEC).toLocaleString();
const perDay = (b?: bigint) => (((b ?? 0n) * 86400n) / DEC).toLocaleString();
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
};

export function ParcelDetailModal({ parcelId, onClose, actions, gotchiId }: Props) {
  const { detail, isLoading, error } = useParcelDetail(parcelId);
  const { address } = useAccount();
  const inventory = useInstallationInventory(address);
  const [dragItem, setDragItem] = useState<InventoryItem | null>(null);
  const [pending, setPending] = useState<Placed[]>([]);
  const [moving, setMoving] = useState<{ index: number; w: number; h: number } | null>(null);
  const [saving, setSaving] = useState<{ done: number; total: number } | null>(null);
  const canBuild = !!actions && !!gotchiId && !!actions.isOnBase;
  const canRemove = canBuild;

  async function savePending() {
    if (!detail || !gotchiId || pending.length === 0) return;
    setSaving({ done: 0, total: pending.length });
    try {
      for (let i = 0; i < pending.length; i++) {
        const it = pending[i];
        const hash = await writeContractAsync({
          chainId: BASE_CHAIN_ID,
          address: REALM_DIAMOND_BASE,
          abi: REALM_FACET_ABI,
          functionName: "equipInstallation",
          args: [BigInt(detail.tokenId), BigInt(gotchiId), BigInt(it.installationId), BigInt(it.x), BigInt(it.y), "0x"],
        });
        await publicClient?.waitForTransactionReceipt({ hash, confirmations: 1 });
        setSaving({ done: i + 1, total: pending.length });
      }
      setPending([]);
      queryClient.invalidateQueries({ queryKey: ["parcel-detail"] });
      queryClient.invalidateQueries({ queryKey: ["land-parcels"] });
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
      queryClient.invalidateQueries({ queryKey: ["parcel-detail"] });
      queryClient.invalidateQueries({ queryKey: ["land-parcels"] });
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
                        <td className="px-2 py-1.5 text-right">{perDay(detail.harvestRate[i])}</td>
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

            {/* Visual layout + building */}
            <section>
              <div className="text-xs font-semibold mb-1.5 inline-flex items-center justify-between gap-1.5">
                <span className="inline-flex items-center gap-1.5">
                  <Package className="w-3.5 h-3.5 text-primary" /> Layout · {detail.installations.length} installations · {detail.tiles.length} tiles
                </span>
                {canRemove && (
                  <span className="text-[10px] font-normal text-muted-foreground">Click an installation to remove it</span>
                )}
              </div>
              <ParcelGrid
                installations={detail.installations}
                tiles={detail.tiles}
                realmId={detail.tokenId}
                busyKey={actions?.activeKey ?? null}
                onRemove={
                  canRemove
                    ? (item) => {
                        if (
                          typeof window !== "undefined" &&
                          !window.confirm(`Remove ${item.name} at (${item.x},${item.y})? This unequips it from the parcel.`)
                        )
                          return;
                        actions!.unequip(
                          BigInt(detail.tokenId),
                          BigInt(gotchiId!),
                          BigInt(item.installationId),
                          BigInt(item.x),
                          BigInt(item.y)
                        );
                      }
                    : undefined
                }
                placing={
                  dragItem ? { w: dragItem.w, h: dragItem.h } : moving ? { w: moving.w, h: moving.h } : null
                }
                onPlace={
                  canBuild
                    ? (x, y) => {
                        if (moving) {
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
                pending={pending}
                onUnstage={(i) => setPending((p) => p.filter((_, idx) => idx !== i))}
                onMoveStart={(i) => {
                  setMoving({ index: i, w: pending[i].w, h: pending[i].h });
                  setDragItem(null);
                }}
                size={detail.size}
              />

              {canBuild && (
                <div className="mt-3">
                  <div className="text-xs font-semibold mb-1.5 flex items-center justify-between gap-2 flex-wrap">
                    <span>Your installations — drag onto the grid (staged, not saved yet)</span>
                    {pending.length > 0 && (
                      <span className="inline-flex items-center gap-1.5">
                        <button
                          type="button"
                          disabled={!!saving}
                          onClick={savePending}
                          className="inline-flex items-center gap-1 h-7 px-2.5 rounded-md bg-emerald-600 text-white hover:bg-emerald-600/90 disabled:opacity-50 text-[11px] font-semibold"
                        >
                          {saving ? (
                            <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Saving {saving.done}/{saving.total}…</>
                          ) : (
                            <>Save changes ({pending.length})</>
                          )}
                        </button>
                        <button
                          type="button"
                          disabled={!!saving}
                          onClick={() => setPending([])}
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
          </div>
        )}
      </div>
    </div>,
    document.body
  );
}
