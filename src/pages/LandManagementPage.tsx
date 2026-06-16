import { useCallback, useEffect, useMemo, useState } from "react";
import { useAccount, useReadContract } from "wagmi";
import {
  Wallet,
  MapPin,
  HandCoins,
  Zap,
  Info,
  Loader2,
  ChevronUp,
  ChevronDown,
} from "lucide-react";
import { ConnectButton } from "@/components/wallet/ConnectButton";
import { Seo } from "@/components/Seo";
import { siteUrl } from "@/lib/site";
import { useMyConnectedLendings } from "@/hooks/useMyLendings";
import { useGotchisByOwner } from "@/lib/hooks/useGotchisByOwner";
import { useLandParcels, PARCEL_SIZE_LABEL, type ParcelRow } from "@/hooks/useLandParcels";
import { useRealmActions } from "@/hooks/useRealmActions";
import { LandAlchemicaBar } from "@/components/lending/LandAlchemicaBar";
import { ParcelDetailModal } from "@/components/lending/ParcelDetailModal";
import { GotchiChannelSelect } from "@/components/lending/GotchiChannelSelect";
import { REALM_DIAMOND_BASE, REALM_FACET_ABI, CHANNEL_COOLDOWN_SEC, CHANNEL_COOLDOWN_SEC_BY_ALTAR, RESERVOIR_COOLDOWN_SEC } from "@/lib/lending/contracts";
import { BASE_CHAIN_ID } from "@/lib/chains";
import { useToast } from "@/ui/use-toast";

const PAGE_SIZE = 25;
const SHOW_FILTERS = false; // hidden for now per request; flip to re-enable

function countdown(sec: number): string {
  if (sec <= 0) return "Now";
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  return h > 0 ? `${h}h ${m}m` : m > 0 ? `${m}m` : "<1m";
}
function timeAgo(unix: number, nowSec: number): string {
  if (!unix) return "Never";
  const s = nowSec - unix;
  if (s < 60) return "just now";
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d} day${d === 1 ? "" : "s"} ago`;
}

const ACCESS_LABEL: Record<number, string> = { 0: "Owner", 1: "Borrower", 2: "Whitelist", 3: "Anyone", 4: "Anyone" };
type AccessCat = "owner" | "borrower" | "whitelist" | "anyone";
const accessCat = (m: number): AccessCat =>
  m === 0 ? "owner" : m === 1 ? "borrower" : m === 2 ? "whitelist" : "anyone";

type SortKey =
  | "id" | "name" | "district" | "size" | "aaltar" | "aaltarReady" | "cooldown"
  | "lastUsed" | "channelAccess" | "reservoirAccess" | "reservoirsReady" | "lastEmptied";

export default function LandManagementPage() {
  const { address, isConnected } = useAccount();
  const { toast } = useToast();
  const [detailParcel, setDetailParcel] = useState<string | null>(null);

  const { lender } = useMyConnectedLendings();
  const { gotchis } = useGotchisByOwner(address?.toLowerCase() ?? "");

  // Only directly-owned (unlocked) gotchis can channel. Let the user pick which
  // one — channel yield scales with kinship — and persist the choice per wallet
  // so it sticks across both per-parcel channel and Channel-all.
  const ownedGotchis = useMemo(
    () => (gotchis ?? []).filter((g) => Number.isFinite(Number(g.gotchiId ?? g.id))),
    [gotchis]
  );
  const [selectedGotchiId, setSelectedGotchiId] = useState<number | undefined>(undefined);
  useEffect(() => {
    if (selectedGotchiId != null || ownedGotchis.length === 0) return;
    const key = address ? `channelGotchi:${address.toLowerCase()}` : "";
    const saved = key ? Number(localStorage.getItem(key)) : NaN;
    if (Number.isFinite(saved) && ownedGotchis.some((g) => Number(g.gotchiId ?? g.id) === saved)) {
      setSelectedGotchiId(saved);
      return;
    }
    const best = [...ownedGotchis].sort((a, b) => (b.kinship ?? 0) - (a.kinship ?? 0))[0];
    setSelectedGotchiId(Number(best.gotchiId ?? best.id));
  }, [ownedGotchis, selectedGotchiId, address]);

  const pickGotchi = useCallback(
    (id: number) => {
      setSelectedGotchiId(id);
      if (address) localStorage.setItem(`channelGotchi:${address.toLowerCase()}`, String(id));
    },
    [address]
  );

  const claimerGotchiId = useMemo(() => {
    if (selectedGotchiId != null) return selectedGotchiId;
    const fromLender = lender.find((l) => Number.isFinite(Number(l.gotchiTokenId)));
    return fromLender ? Number(fromLender.gotchiTokenId) : undefined;
  }, [selectedGotchiId, lender]);

  const { rows, isLoading, error } = useLandParcels(address);
  const actions = useRealmActions();

  const { data: gotchiLastChanneled } = useReadContract({
    address: REALM_DIAMOND_BASE,
    abi: REALM_FACET_ABI,
    functionName: "getLastChanneled",
    args: claimerGotchiId ? [BigInt(claimerGotchiId)] : undefined,
    chainId: BASE_CHAIN_ID,
    query: { enabled: !!claimerGotchiId },
  });

  // 30s tick for live "ready / cooldown / ago" columns.
  const [nowSec, setNowSec] = useState(() => Math.floor(Date.now() / 1000));
  useEffect(() => {
    const id = setInterval(() => setNowSec(Math.floor(Date.now() / 1000)), 30_000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    if (actions.step === "success") {
      toast({ title: "Transaction confirmed", description: "On-chain state updated." });
      actions.reset();
    }
    if (actions.step === "error" && actions.errorMsg) {
      toast({ title: "Transaction failed", description: actions.errorMsg.slice(0, 180), variant: "destructive" });
      actions.reset();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [actions.step]);

  // ---- filters / sort / pagination ----
  const [onlyChannelable, setOnlyChannelable] = useState(false);
  const [chAccess, setChAccess] = useState<Set<AccessCat>>(new Set(["owner", "borrower", "whitelist", "anyone"]));
  const [rsvAccess, setRsvAccess] = useState<Set<AccessCat>>(new Set(["owner", "borrower", "whitelist", "anyone"]));
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: "aaltarReady", dir: 1 });
  const [page, setPage] = useState(0);

  const cooldownOf = (r: ParcelRow) => CHANNEL_COOLDOWN_SEC_BY_ALTAR[r.altarLevel] ?? CHANNEL_COOLDOWN_SEC;
  const channelReadyIn = (r: ParcelRow) =>
    r.lastChanneled > 0 ? Math.max(0, r.lastChanneled + cooldownOf(r) - nowSec) : 0;
  // Reservoirs can only be emptied once per cooldown; "ready" = cooldown elapsed
  // (lastClaimed + 8h) AND there's a balance to take. Balance alone is wrong —
  // it re-accumulates the instant you claim, so every parcel would look ready.
  const reservoirReadyIn = (r: ParcelRow) =>
    r.lastClaimed > 0 ? Math.max(0, r.lastClaimed + RESERVOIR_COOLDOWN_SEC - nowSec) : 0;
  const reservoirsReady = (r: ParcelRow) =>
    reservoirReadyIn(r) === 0 && r.available.some((v) => v > 0n);

  const filtered = useMemo(() => {
    return rows.filter((r) => {
      if (onlyChannelable && channelReadyIn(r) > 0) return false;
      if (!chAccess.has(accessCat(r.channelAccess))) return false;
      if (!rsvAccess.has(accessCat(r.reservoirAccess))) return false;
      return true;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, onlyChannelable, chAccess, rsvAccess, nowSec]);

  const sorted = useMemo(() => {
    const val = (r: ParcelRow): number | string => {
      switch (sort.key) {
        case "id": return Number(r.tokenId);
        case "name": return (r.name || r.parcelId).toLowerCase();
        case "district": return Number(r.district);
        case "size": return r.size;
        case "aaltar": return r.altarLevel;
        case "cooldown": return cooldownOf(r);
        case "aaltarReady": return channelReadyIn(r);
        case "lastUsed": return r.lastChanneled;
        case "channelAccess": return r.channelAccess;
        case "reservoirAccess": return r.reservoirAccess;
        case "reservoirsReady": return reservoirsReady(r) ? 0 : 1;
        case "lastEmptied": return r.lastClaimed;
      }
    };
    return [...filtered].sort((a, b) => {
      const va = val(a), vb = val(b);
      if (va < vb) return -1 * sort.dir;
      if (va > vb) return 1 * sort.dir;
      return 0;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtered, sort, nowSec]);

  const pageCount = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE));
  const pageRows = sorted.slice(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE);
  useEffect(() => { if (page >= pageCount) setPage(0); }, [page, pageCount]);

  const toggle = (set: Set<AccessCat>, setter: (s: Set<AccessCat>) => void, k: AccessCat) => {
    const next = new Set(set);
    next.has(k) ? next.delete(k) : next.add(k);
    setter(next);
    setPage(0);
  };
  const sortBy = (key: SortKey) =>
    setSort((s) => (s.key === key ? { key, dir: (s.dir * -1) as 1 | -1 } : { key, dir: 1 }));

  return (
    <div className="container mx-auto max-w-[1600px] px-4 py-6">
      <Seo
        title="Land Management — GotchiCloset"
        description="Manage your Aavegotchi Gotchiverse parcels: claim, channel, survey, and build."
        canonical={siteUrl("/lending/lands")}
      />

      <div className="flex items-center justify-between mb-4 gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold tracking-tight inline-flex items-center gap-2">
            <MapPin className="w-6 h-6 text-emerald-500" /> Land Management
          </h1>
          {address && <p className="text-xs text-muted-foreground font-mono">{address.slice(0, 6)}…{address.slice(-4)}</p>}
        </div>
        {isConnected && ownedGotchis.length > 0 && (
          <GotchiChannelSelect gotchis={ownedGotchis} value={selectedGotchiId} onChange={pickGotchi} />
        )}
      </div>

      {!isConnected ? (
        <div className="rounded-lg border border-primary/30 bg-primary/5 p-6 text-center max-w-md mx-auto">
          <Wallet className="w-8 h-8 mx-auto mb-2 text-primary" />
          <p className="text-sm font-medium mb-3">Connect a wallet to manage your land</p>
          <ConnectButton />
        </div>
      ) : (
        <>
          <LandAlchemicaBar gotchiId={claimerGotchiId} />

          {/* Filters (hidden for now) */}
          {SHOW_FILTERS && (
            <div className="rounded-lg border border-border/40 bg-background/60 p-3 mb-3 text-xs space-y-1.5">
              <label className="inline-flex items-center gap-1.5 cursor-pointer font-medium">
                <input type="checkbox" checked={onlyChannelable} onChange={(e) => { setOnlyChannelable(e.target.checked); setPage(0); }} />
                Only Aaltars that can channel now
              </label>
              <AccessFilter label="Channeling access" set={chAccess} onToggle={(k) => toggle(chAccess, setChAccess, k)} />
              <AccessFilter label="Reservoir access" set={rsvAccess} onToggle={(k) => toggle(rsvAccess, setRsvAccess, k)} />
            </div>
          )}

          {error && <div className="rounded border border-destructive/40 bg-destructive/5 p-3 text-sm mb-3">{error}</div>}

          <div className="flex items-center justify-between text-xs text-muted-foreground mb-2 flex-wrap gap-2">
            <span>{sorted.length} land{sorted.length === 1 ? "" : "s"}{filtered.length !== rows.length ? ` (of ${rows.length})` : ""}</span>
            <div className="inline-flex items-center gap-2">
              <span>Page {page + 1}/{pageCount}</span>
              <button disabled={page === 0} onClick={() => setPage((p) => Math.max(0, p - 1))} className="h-7 px-2 rounded border border-border/40 disabled:opacity-40">‹</button>
              <button disabled={page >= pageCount - 1} onClick={() => setPage((p) => Math.min(pageCount - 1, p + 1))} className="h-7 px-2 rounded border border-border/40 disabled:opacity-40">›</button>
            </div>
          </div>

          {isLoading && rows.length === 0 ? (
            <div className="space-y-2">{Array.from({ length: 8 }).map((_, i) => <div key={i} className="h-9 rounded bg-muted/30 animate-pulse" />)}</div>
          ) : rows.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground text-sm">No parcels found for this wallet.</div>
          ) : (
            <div className="overflow-x-auto rounded-lg border border-border/40">
              <table className="w-full text-xs whitespace-nowrap">
                <thead className="bg-muted/30 text-muted-foreground">
                  <tr>
                    <Th label="ID" k="id" sort={sort} onSort={sortBy} />
                    <Th label="Name" k="name" sort={sort} onSort={sortBy} />
                    <Th label="District" k="district" sort={sort} onSort={sortBy} />
                    <Th label="Size" k="size" sort={sort} onSort={sortBy} />
                    <Th label="Aaltar" k="aaltar" sort={sort} onSort={sortBy} />
                    <Th label="Aaltar ready" k="aaltarReady" sort={sort} onSort={sortBy} />
                    <Th label="Last channeled" k="lastUsed" sort={sort} onSort={sortBy} />
                    <Th label="Channel access" k="channelAccess" sort={sort} onSort={sortBy} />
                    <Th label="Cooldown" k="cooldown" sort={sort} onSort={sortBy} />
                    <Th label="Reservoir access" k="reservoirAccess" sort={sort} onSort={sortBy} />
                    <Th label="Reservoirs ready" k="reservoirsReady" sort={sort} onSort={sortBy} />
                    <Th label="Last emptied" k="lastEmptied" sort={sort} onSort={sortBy} />
                    <th className="text-right font-medium px-2 py-2">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {pageRows.map((r) => (
                    <Row
                      key={r.tokenId}
                      r={r}
                      nowSec={nowSec}
                      readyIn={channelReadyIn(r)}
                      reservoirsReady={reservoirsReady(r)}
                      reservoirReadyIn={reservoirReadyIn(r)}
                      claimerGotchiId={claimerGotchiId}
                      gotchiLastChanneled={gotchiLastChanneled as bigint | undefined}
                      actions={actions}
                      onDetails={() => setDetailParcel(r.tokenId)}
                    />
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {detailParcel && (
        <ParcelDetailModal parcelId={detailParcel} onClose={() => setDetailParcel(null)} actions={actions} gotchiId={claimerGotchiId} />
      )}
    </div>
  );
}

function AccessFilter({ label, set, onToggle }: { label: string; set: Set<AccessCat>; onToggle: (k: AccessCat) => void }) {
  const opts: AccessCat[] = ["owner", "borrower", "whitelist", "anyone"];
  return (
    <div className="inline-flex items-center gap-3 flex-wrap">
      <span className="text-muted-foreground">{label}:</span>
      {opts.map((k) => (
        <label key={k} className="inline-flex items-center gap-1 cursor-pointer capitalize">
          <input type="checkbox" checked={set.has(k)} onChange={() => onToggle(k)} />
          {k}
        </label>
      ))}
    </div>
  );
}

function Th({ label, k, sort, onSort }: { label: string; k: SortKey; sort: { key: SortKey; dir: 1 | -1 }; onSort: (k: SortKey) => void }) {
  const active = sort.key === k;
  return (
    <th className="text-left font-medium px-2 py-2 select-none">
      <button type="button" onClick={() => onSort(k)} className="inline-flex items-center gap-0.5 hover:text-foreground">
        {label}
        {active && (sort.dir === 1 ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />)}
      </button>
    </th>
  );
}

function Row({
  r, nowSec, readyIn, reservoirsReady, reservoirReadyIn, claimerGotchiId, gotchiLastChanneled, actions, onDetails,
}: {
  r: ParcelRow;
  nowSec: number;
  readyIn: number;
  reservoirsReady: boolean;
  reservoirReadyIn: number;
  claimerGotchiId?: number;
  gotchiLastChanneled?: bigint;
  actions: ReturnType<typeof useRealmActions>;
  onDetails: () => void;
}) {
  const realmId = BigInt(r.tokenId);
  const gotchi = claimerGotchiId ? BigInt(claimerGotchiId) : 0n;
  const cooldownSec = CHANNEL_COOLDOWN_SEC_BY_ALTAR[r.altarLevel] ?? CHANNEL_COOLDOWN_SEC;
  const anyBusy = actions.step === "submitting" || actions.step === "confirming";
  const disabled = anyBusy || !actions.isOnBase || !claimerGotchiId;
  const busy = (key: string) => actions.activeKey === key && anyBusy;

  return (
    <tr className="border-t border-border/20 hover:bg-muted/20">
      <td className="px-2 py-1.5 font-mono">#{r.tokenId}</td>
      <td className="px-2 py-1.5">{r.name || <span className="text-muted-foreground">—</span>}</td>
      <td className="px-2 py-1.5">{r.district}</td>
      <td className="px-2 py-1.5">{PARCEL_SIZE_LABEL[r.size] ?? `Size ${r.size}`}</td>
      <td className="px-2 py-1.5">{r.altarLevel > 0 ? `Aaltar L${r.altarLevel}` : "—"}</td>
      <td className={`px-2 py-1.5 ${readyIn === 0 ? "text-emerald-500 font-medium" : "text-muted-foreground"}`}>{countdown(readyIn)}</td>
      <td className="px-2 py-1.5 text-muted-foreground">{timeAgo(r.lastChanneled, nowSec)}</td>
      <td className="px-2 py-1.5">{ACCESS_LABEL[r.channelAccess] ?? r.channelAccess}</td>
      <td className="px-2 py-1.5 text-muted-foreground">{r.altarLevel > 0 ? `${Math.round(cooldownSec / 3600)}h` : "—"}</td>
      <td className="px-2 py-1.5">{ACCESS_LABEL[r.reservoirAccess] ?? r.reservoirAccess}</td>
      <td className={`px-2 py-1.5 ${reservoirsReady ? "text-emerald-500 font-medium" : "text-muted-foreground"}`}>{reservoirsReady ? "Now" : reservoirReadyIn > 0 ? `in ${countdown(reservoirReadyIn)}` : "—"}</td>
      <td className="px-2 py-1.5 text-muted-foreground">{timeAgo(r.lastClaimed, nowSec)}</td>
      <td className="px-2 py-1.5">
        <div className="flex items-center gap-1 justify-end">
          <IconBtn title="Claim reservoir" busy={busy(`claim:${realmId}`)} disabled={disabled || !reservoirsReady} onClick={() => actions.claim(realmId, gotchi)}><HandCoins className="w-3.5 h-3.5" /></IconBtn>
          <IconBtn title="Channel" busy={busy(`channel:${realmId}`)} disabled={disabled || readyIn > 0} onClick={() => actions.channel(realmId, gotchi, (gotchiLastChanneled ?? 0n) as bigint)}><Zap className="w-3.5 h-3.5" /></IconBtn>
          <IconBtn title="Details & build (survey, layout)" onClick={onDetails}><Info className="w-3.5 h-3.5" /></IconBtn>
        </div>
      </td>
    </tr>
  );
}

function IconBtn({ children, onClick, busy, disabled, title }: { children: React.ReactNode; onClick: () => void; busy?: boolean; disabled?: boolean; title: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled || busy}
      title={title}
      className="inline-flex items-center justify-center h-7 w-7 rounded border border-border/40 bg-background/70 hover:bg-muted/50 disabled:opacity-40 disabled:cursor-not-allowed"
    >
      {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : children}
    </button>
  );
}
