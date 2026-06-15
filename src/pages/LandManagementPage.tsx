import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useAccount, useReadContract } from "wagmi";
import {
  ArrowLeft,
  Wallet,
  MapPin,
  HandCoins,
  Zap,
  Telescope,
  Plus,
  Trash2,
  ChevronDown,
  ChevronRight,
  Info,
  Loader2,
} from "lucide-react";
import { ConnectButton } from "@/components/wallet/ConnectButton";
import { Seo } from "@/components/Seo";
import { siteUrl } from "@/lib/site";
import { useMyConnectedLendings } from "@/hooks/useMyLendings";
import { useGotchisByOwner } from "@/lib/hooks/useGotchisByOwner";
import { useLandParcels, PARCEL_SIZE_LABEL, type ParcelRow } from "@/hooks/useLandParcels";
import { useParcelInstallations } from "@/hooks/useParcelInstallations";
import { useRealmActions } from "@/hooks/useRealmActions";
import { LandAlchemicaBar } from "@/components/lending/LandAlchemicaBar";
import { ParcelDetailModal } from "@/components/lending/ParcelDetailModal";
import { REALM_DIAMOND_BASE, REALM_FACET_ABI, CHANNEL_COOLDOWN_SEC } from "@/lib/lending/contracts";
import { BASE_CHAIN_ID } from "@/lib/chains";
import { useToast } from "@/ui/use-toast";

const TOKENS = ["FUD", "FOMO", "ALPHA", "KEK"] as const;
const DECIMALS = BigInt(10) ** BigInt(18);

function whole(amount: bigint): string {
  return (amount / DECIMALS).toLocaleString();
}
function alchLine(amts: bigint[]): string {
  return TOKENS.map((t, i) => `${whole(amts[i] ?? 0n)} ${t}`).join(" · ");
}
function countdown(sec: number): string {
  if (sec <= 0) return "ready";
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  return h > 0 ? `${h}h ${m}m` : m > 0 ? `${m}m` : "<1m";
}

export default function LandManagementPage() {
  const { address, isConnected } = useAccount();
  const { toast } = useToast();
  const [detailParcel, setDetailParcel] = useState<string | null>(null);

  // Pick any Gotchi the wallet controls to act as the claimer/channeler.
  const { lender } = useMyConnectedLendings();
  const { gotchis } = useGotchisByOwner(address?.toLowerCase() ?? "");
  const claimerGotchiId = useMemo(() => {
    const fromLender = lender.find((l) => Number.isFinite(Number(l.gotchiTokenId)));
    if (fromLender) return Number(fromLender.gotchiTokenId);
    const g = (gotchis ?? [])[0] as any;
    const id = g ? Number(g.gotchiId ?? g.id) : NaN;
    return Number.isFinite(id) ? id : undefined;
  }, [lender, gotchis]);

  const { rows, isLoading, error } = useLandParcels(address);
  const actions = useRealmActions();

  // Gotchi's last-channel timestamp (channeling cooldown is per gotchi).
  const { data: gotchiLastChanneled } = useReadContract({
    address: REALM_DIAMOND_BASE,
    abi: REALM_FACET_ABI,
    functionName: "getLastChanneled",
    args: claimerGotchiId ? [BigInt(claimerGotchiId)] : undefined,
    chainId: BASE_CHAIN_ID,
    query: { enabled: !!claimerGotchiId },
  });

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

  const totals = useMemo(() => {
    const claim = [0n, 0n, 0n, 0n];
    const ground = [0n, 0n, 0n, 0n];
    for (const r of rows) {
      r.available.forEach((v, i) => (claim[i] += v));
      r.remaining.forEach((v, i) => (ground[i] += v ?? 0n));
    }
    return { claim, ground };
  }, [rows]);

  return (
    <div className="container mx-auto max-w-7xl px-4 py-6">
      <Seo
        title="Land Management — GotchiCloset"
        description="Manage your Aavegotchi Gotchiverse parcels: claim alchemica, channel, survey, and equip installations."
        canonical={siteUrl("/lending/lands")}
      />

      <div className="flex items-center justify-between mb-6 gap-3 flex-wrap">
        <div>
          <Link to="/lending/me" className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
            <ArrowLeft className="w-3 h-3" /> Back to my lendings
          </Link>
          <h1 className="text-2xl font-bold tracking-tight mt-1 inline-flex items-center gap-2">
            <MapPin className="w-6 h-6 text-emerald-500" /> Land Management
          </h1>
          {address && (
            <p className="text-xs text-muted-foreground font-mono">
              {address.slice(0, 6)}…{address.slice(-4)}
            </p>
          )}
        </div>
      </div>

      {!isConnected ? (
        <div className="rounded-lg border border-primary/30 bg-primary/5 p-6 text-center max-w-md mx-auto">
          <Wallet className="w-8 h-8 mx-auto mb-2 text-primary" />
          <p className="text-sm font-medium mb-3">Connect a wallet to manage your land</p>
          <ConnectButton />
        </div>
      ) : (
        <>
          <LandAlchemicaBar />

          {/* Summary */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-6">
            <Stat label="Parcels" value={rows.length.toString()} />
            <Stat label="Claimable now" value={alchLine(totals.claim)} small />
            <Stat label="In-ground (remaining)" value={alchLine(totals.ground)} small />
          </div>

          {error && (
            <div className="rounded border border-destructive/40 bg-destructive/5 p-3 text-sm mb-4">{error}</div>
          )}

          {isLoading && rows.length === 0 ? (
            <div className="grid gap-3">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="h-24 rounded-lg bg-muted/30 animate-pulse" />
              ))}
            </div>
          ) : rows.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground text-sm">
              No parcels found for this wallet.
            </div>
          ) : (
            <div className="grid gap-3">
              {rows.map((r) => (
                <ParcelCard
                  key={r.tokenId}
                  row={r}
                  claimerGotchiId={claimerGotchiId}
                  gotchiLastChanneled={gotchiLastChanneled as bigint | undefined}
                  actions={actions}
                  onDetails={() => setDetailParcel(r.tokenId)}
                />
              ))}
            </div>
          )}
        </>
      )}

      {detailParcel && (
        <ParcelDetailModal parcelId={detailParcel} onClose={() => setDetailParcel(null)} />
      )}
    </div>
  );
}

function Stat({ label, value, small }: { label: string; value: string; small?: boolean }) {
  return (
    <div className="rounded-xl glass p-3">
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className={`mt-1 font-semibold ${small ? "text-xs break-words" : "text-lg"}`}>{value}</div>
    </div>
  );
}

function ParcelCard({
  row,
  claimerGotchiId,
  gotchiLastChanneled,
  actions,
  onDetails,
}: {
  row: ParcelRow;
  claimerGotchiId?: number;
  gotchiLastChanneled?: bigint;
  actions: ReturnType<typeof useRealmActions>;
  onDetails: () => void;
}) {
  const [open, setOpen] = useState(false);
  const realmId = BigInt(row.tokenId);
  const gotchi = claimerGotchiId ? BigInt(claimerGotchiId) : 0n;
  const hasClaimable = row.available.some((v) => v > 0n);
  const depleted = row.remaining.every((v) => (v ?? 0n) === 0n);
  const nowSec = Math.floor(Date.now() / 1000);
  const nextChannel = row.lastChanneled > 0 ? row.lastChanneled + CHANNEL_COOLDOWN_SEC : 0;
  const channelIn = Math.max(0, nextChannel - nowSec);

  const busy = (key: string) =>
    actions.activeKey === key && (actions.step === "submitting" || actions.step === "confirming");
  const anyBusy = actions.step === "submitting" || actions.step === "confirming";
  const disabled = anyBusy || !actions.isOnBase || !claimerGotchiId;

  return (
    <div className="rounded-lg border border-border/40 bg-background/60 p-3">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="min-w-0">
          <div className="font-semibold text-sm inline-flex items-center gap-2 flex-wrap">
            <span className="font-mono">{row.parcelId}</span>
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-muted/60 text-muted-foreground">
              {PARCEL_SIZE_LABEL[row.size] ?? `Size ${row.size}`}
            </span>
            <span className="text-[10px] text-muted-foreground">
              #{row.tokenId} · District {row.district} · ({row.x},{row.y})
            </span>
          </div>
          <div className="text-xs text-muted-foreground mt-1">
            Survey round {row.surveyRound} · {row.installations} installations · {row.tiles} tiles
          </div>
          <div className="text-xs mt-1">
            <span className="text-emerald-600 dark:text-emerald-400 font-medium">Claimable:</span>{" "}
            <span className="text-foreground">{alchLine(row.available)}</span>
          </div>
          <div className="text-[11px] text-muted-foreground mt-0.5">In-ground: {alchLine(row.remaining)}</div>
          <div className="text-[11px] text-muted-foreground mt-0.5">
            Channel: {channelIn > 0 ? `cooldown ${countdown(channelIn)}` : "ready"}
          </div>
        </div>

        <div className="flex items-center gap-1.5 flex-wrap justify-end">
          <ActBtn
            onClick={() => actions.claim(realmId, gotchi)}
            busy={busy(`claim:${realmId}`)}
            disabled={disabled || !hasClaimable}
            icon={<HandCoins className="w-3.5 h-3.5" />}
            title={!hasClaimable ? "Nothing in reservoir to claim" : "Claim this parcel's reservoir alchemica"}
            variant="primary"
          >
            Claim
          </ActBtn>
          <ActBtn
            onClick={() => actions.channel(realmId, gotchi, (gotchiLastChanneled ?? 0n) as bigint)}
            busy={busy(`channel:${realmId}`)}
            disabled={disabled || channelIn > 0}
            icon={<Zap className="w-3.5 h-3.5" />}
            title={channelIn > 0 ? `On cooldown (${countdown(channelIn)})` : "Channel the Aaltar with your gotchi"}
          >
            Channel
          </ActBtn>
          <ActBtn
            onClick={() => actions.survey(realmId)}
            busy={busy(`survey:${realmId}`)}
            disabled={anyBusy || !actions.isOnBase}
            icon={<Telescope className="w-3.5 h-3.5" />}
            title={depleted ? "Survey for a new alchemica round" : "Survey (usually only when in-ground is depleted)"}
          >
            Survey
          </ActBtn>
          <button
            type="button"
            onClick={() => setOpen((o) => !o)}
            className="inline-flex items-center gap-1 h-8 px-2.5 rounded-md border border-border/40 bg-background/70 hover:bg-muted/50 text-xs font-medium"
          >
            {open ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
            Installations
          </button>
          <button
            type="button"
            onClick={onDetails}
            className="inline-flex items-center gap-1 h-8 px-2.5 rounded-md border border-border/40 bg-background/70 hover:bg-muted/50 text-xs font-medium"
            title="View full parcel details"
          >
            <Info className="w-3.5 h-3.5" /> Details
          </button>
        </div>
      </div>

      {open && <InstallationsPanel row={row} gotchi={gotchi} actions={actions} disabled={disabled} />}
    </div>
  );
}

function InstallationsPanel({
  row,
  gotchi,
  actions,
  disabled,
}: {
  row: ParcelRow;
  gotchi: bigint;
  actions: ReturnType<typeof useRealmActions>;
  disabled: boolean;
}) {
  const realmId = BigInt(row.tokenId);
  const { installations, isLoading } = useParcelInstallations(row.tokenId);
  const [addId, setAddId] = useState("");
  const [addX, setAddX] = useState("");
  const [addY, setAddY] = useState("");

  const canAdd = addId !== "" && addX !== "" && addY !== "" && !disabled;

  return (
    <div className="mt-3 border-t border-border/30 pt-3 space-y-3">
      <div>
        <div className="text-xs font-semibold mb-1.5">Equipped installations</div>
        {isLoading ? (
          <div className="text-xs text-muted-foreground">Loading…</div>
        ) : installations.length === 0 ? (
          <div className="text-xs text-muted-foreground">None equipped.</div>
        ) : (
          <div className="grid gap-1.5">
            {installations.map((inst) => {
              const key = `unequip:${realmId}:${inst.installationId}:${inst.x}:${inst.y}`;
              const busy = actions.activeKey === key && (actions.step === "submitting" || actions.step === "confirming");
              return (
                <div
                  key={`${inst.installationId}-${inst.x}-${inst.y}`}
                  className="flex items-center justify-between gap-2 text-xs rounded border border-border/30 bg-background/50 px-2 py-1.5"
                >
                  <span className="truncate">
                    {inst.name}{" "}
                    <span className="text-muted-foreground">
                      #{inst.installationId} @ ({inst.x},{inst.y})
                    </span>
                  </span>
                  <button
                    type="button"
                    onClick={() =>
                      actions.unequip(realmId, gotchi, BigInt(inst.installationId), BigInt(inst.x), BigInt(inst.y))
                    }
                    disabled={disabled}
                    className="inline-flex items-center gap-1 h-7 px-2 rounded border border-destructive/40 bg-destructive/10 hover:bg-destructive/20 text-destructive disabled:opacity-50 disabled:cursor-not-allowed font-medium"
                    title="Unequip (remove) this installation"
                  >
                    {busy ? <Loader2 className="w-3 h-3 animate-spin" /> : <Trash2 className="w-3 h-3" />}
                    Remove
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div>
        <div className="text-xs font-semibold mb-1.5">Add installation</div>
        <div className="flex items-end gap-2 flex-wrap">
          <Field label="Installation ID" value={addId} onChange={setAddId} placeholder="e.g. 10" />
          <Field label="X" value={addX} onChange={setAddX} placeholder="x" w="w-16" />
          <Field label="Y" value={addY} onChange={setAddY} placeholder="y" w="w-16" />
          <button
            type="button"
            disabled={!canAdd}
            onClick={() => actions.equip(realmId, gotchi, BigInt(addId), BigInt(addX), BigInt(addY))}
            className="inline-flex items-center gap-1 h-8 px-3 rounded-md bg-emerald-600 text-white hover:bg-emerald-600/90 disabled:opacity-50 disabled:cursor-not-allowed text-xs font-semibold"
          >
            {actions.activeKey === `equip:${realmId}` && (actions.step === "submitting" || actions.step === "confirming") ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Plus className="w-3.5 h-3.5" />
            )}
            Add
          </button>
        </div>
        <div className="text-[10px] text-muted-foreground mt-1">
          Must be a level-1 installation you own, placed on a free grid slot. Coordinates are the top-left origin
          on the parcel grid. Reverts if the slot is occupied or building is frozen.
        </div>
      </div>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  placeholder,
  w = "w-24",
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  w?: string;
}) {
  return (
    <label className="text-[10px] text-muted-foreground">
      <span className="block mb-0.5">{label}</span>
      <input
        inputMode="numeric"
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value.replace(/[^0-9]/g, ""))}
        className={`${w} h-8 px-2 rounded border border-border/40 bg-background text-xs text-foreground`}
      />
    </label>
  );
}

function ActBtn({
  onClick,
  busy,
  disabled,
  icon,
  children,
  title,
  variant = "default",
}: {
  onClick: () => void;
  busy?: boolean;
  disabled?: boolean;
  icon: React.ReactNode;
  children: React.ReactNode;
  title?: string;
  variant?: "default" | "primary";
}) {
  const cls =
    variant === "primary"
      ? "bg-primary text-primary-foreground hover:bg-primary/90"
      : "border border-border/40 bg-background/70 hover:bg-muted/50";
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled || busy}
      title={title}
      className={`inline-flex items-center gap-1 h-8 px-2.5 rounded-md text-xs font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${cls}`}
    >
      {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : icon}
      {children}
    </button>
  );
}
