import { useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useAccount } from "wagmi";
import { ArrowLeft, Coins, Users, ListPlus, Wallet, BarChart3, Share2, Check } from "lucide-react";
import { useMyConnectedLendings } from "@/hooks/useMyLendings";
import { ConnectButton } from "@/components/wallet/ConnectButton";
import { LendingCard } from "@/components/lending/LendingCard";
import { LendingDetailModal } from "@/components/lending/LendingDetailModal";
import { UnlistedGotchiList } from "@/components/lending/UnlistedGotchiList";
import { AutoRenewTab } from "@/components/lending/AutoRenewTab";
import { Seo } from "@/components/Seo";
import { siteUrl } from "@/lib/site";
import { ghstFromWei } from "@/lib/lending/transform";

type Tab = "unlisted" | "active" | "rented" | "borrowing" | "ended" | "autorenew";

export default function LendingMePage() {
  const { address, isConnected } = useAccount();
  const { lender, borrower, loading, error } = useMyConnectedLendings();
  const [tab, setTab] = useState<Tab>("unlisted");
  const [searchParams, setSearchParams] = useSearchParams();
  const detailId = searchParams.get("l");
  const closeDetail = () => {
    const next = new URLSearchParams(searchParams);
    next.delete("l");
    setSearchParams(next, { replace: true });
  };

  const sections = useMemo(() => {
    const active = lender.filter((l) => !l.cancelled && !l.completed && !l.borrower);
    const rented = lender.filter((l) => !l.cancelled && !l.completed && l.borrower);
    const borrowing = borrower.filter((l) => !l.cancelled && !l.completed);
    const ended = [...lender, ...borrower].filter((l) => l.cancelled || l.completed);
    return { active, rented, borrowing, ended };
  }, [lender, borrower]);

  const counts = {
    active: sections.active.length,
    rented: sections.rented.length,
    borrowing: sections.borrowing.length,
    ended: sections.ended.length,
  };

  // P&L summary
  const totalUpfrontEarned = lender
    .filter((l) => !l.cancelled && (l.borrower || l.completed))
    .reduce((s, l) => s + ghstFromWei(l.upfrontCost), 0);
  const totalUpfrontSpent = borrower
    .filter((l) => !l.cancelled)
    .reduce((s, l) => s + ghstFromWei(l.upfrontCost), 0);

  // Suppress unused warning for ended count tab logic below
  void error;

  const visible =
    tab === "active"
      ? sections.active
      : tab === "rented"
      ? sections.rented
      : tab === "borrowing"
      ? sections.borrowing
      : tab === "ended"
      ? sections.ended
      : [];

  return (
    <div className="container mx-auto max-w-7xl px-4 py-6">
      <Seo
        title="My Lendings — GotchiCloset"
        description="Manage your Aavegotchi lending listings, rentals, and earnings."
        canonical={siteUrl("/lending/me")}
      />

      <div className="flex items-center justify-between mb-6 gap-3 flex-wrap">
        <div>
          <Link
            to="/lending"
            className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="w-3 h-3" /> Back to marketplace
          </Link>
          <h1 className="text-2xl font-bold tracking-tight mt-1">My Lendings</h1>
          {address && (
            <p className="text-xs text-muted-foreground font-mono">
              {address.slice(0, 6)}…{address.slice(-4)}
            </p>
          )}
        </div>

        <div className="flex items-center gap-2">
          {address && <ShareLink address={address} />}
          <Link
            to="/lending/whitelists"
            className="inline-flex items-center gap-1.5 h-9 px-3 rounded-md border border-border/40 bg-background/70 hover:bg-muted/50 text-xs font-medium transition-colors"
          >
            <Users className="w-3.5 h-3.5" /> Whitelists
          </Link>
          <Link
            to="/lending/me/list"
            className="inline-flex items-center gap-1.5 h-9 px-3 rounded-md bg-primary text-primary-foreground hover:bg-primary/90 text-xs font-semibold transition-colors"
          >
            <ListPlus className="w-3.5 h-3.5" /> Bulk list
          </Link>
          <Link
            to="/lending/analytics"
            className="inline-flex items-center gap-1.5 h-9 px-3 rounded-md border border-border/40 bg-background/70 hover:bg-muted/50 text-xs font-medium transition-colors"
          >
            <BarChart3 className="w-3.5 h-3.5" /> Analytics
          </Link>
        </div>
      </div>

      {!isConnected ? (
        <div className="rounded-lg border border-primary/30 bg-primary/5 p-6 text-center max-w-md mx-auto">
          <Wallet className="w-8 h-8 mx-auto mb-2 text-primary" />
          <p className="text-sm font-medium mb-3">Connect a wallet to see your lendings</p>
          <ConnectButton />
        </div>
      ) : (
        <>
          {/* P&L cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
            <Stat
              label="Active listings"
              value={counts.active.toString()}
              icon={<ListPlus className="w-4 h-4 text-primary" />}
            />
            <Stat
              label="Currently rented out"
              value={counts.rented.toString()}
              icon={<Coins className="w-4 h-4 text-amber-500" />}
            />
            <Stat
              label="Earned upfront"
              value={`${Math.round(totalUpfrontEarned).toLocaleString()} GHST`}
              icon={<Coins className="w-4 h-4 text-green-500" />}
              hint="from agreed/completed rentals"
            />
            <Stat
              label="Spent upfront"
              value={`${Math.round(totalUpfrontSpent).toLocaleString()} GHST`}
              icon={<Coins className="w-4 h-4 text-pink-500" />}
              hint="as borrower"
            />
          </div>

          {error && (
            <div className="rounded border border-destructive/40 bg-destructive/5 p-3 text-sm mb-4">
              {error}
            </div>
          )}

          {/* Tabs */}
          <div className="flex items-center gap-1 mb-4 border-b border-border/30 overflow-x-auto">
            {(
              [
                { value: "unlisted", label: "Unlisted (list these)" },
                { value: "active", label: "Listed" },
                { value: "rented", label: "Rented out" },
                { value: "borrowing", label: "I'm borrowing" },
                { value: "autorenew", label: "Auto-renew" },
                { value: "ended", label: "Past" },
              ] as { value: Tab; label: string }[]
            ).map((t) => (
              <button
                key={t.value}
                type="button"
                onClick={() => setTab(t.value)}
                className={`px-3 py-2 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
                  tab === t.value
                    ? "border-primary text-primary"
                    : "border-transparent text-muted-foreground hover:text-foreground"
                }`}
              >
                {t.label}
                {t.value !== "unlisted" && t.value !== "autorenew" && (
                  <span className="text-[10px] text-muted-foreground ml-1">({counts[t.value as keyof typeof counts]})</span>
                )}
              </button>
            ))}
          </div>

          {tab === "unlisted" ? (
            address ? <UnlistedGotchiList ownerAddress={address.toLowerCase()} /> : null
          ) : tab === "autorenew" ? (
            <AutoRenewTab />
          ) : loading ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
              {Array.from({ length: 8 }).map((_, i) => (
                <div key={i} className="aspect-square rounded-lg bg-muted/30 animate-pulse" />
              ))}
            </div>
          ) : visible.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground text-sm">
              {tab === "active" && "No listings yet. Switch to the Unlisted tab to list some."}
              {tab === "rented" && "No active rentals out at the moment."}
              {tab === "borrowing" && "You're not currently renting any gotchis."}
              {tab === "ended" && "No past lendings yet."}
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3">
              {visible.map((l) => (
                <LendingCard key={l.id} lending={l} />
              ))}
            </div>
          )}
        </>
      )}

      {detailId && <LendingDetailModal lendingId={detailId} onClose={closeDetail} />}
    </div>
  );
}

function Stat({
  icon,
  label,
  value,
  hint,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <div className="rounded-xl glass p-3">
      <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wide text-muted-foreground">
        {icon}
        <span>{label}</span>
      </div>
      <div className="mt-1 text-lg font-semibold">{value}</div>
      {hint && <div className="text-[10px] text-muted-foreground mt-0.5">{hint}</div>}
    </div>
  );
}

function ShareLink({ address }: { address: string }) {
  const [copied, setCopied] = useState(false);
  const url =
    typeof window !== "undefined"
      ? `${window.location.origin}/lending?owner=${address.toLowerCase()}`
      : `/lending?owner=${address.toLowerCase()}`;
  const onCopy = async () => {
    try {
      await navigator.clipboard?.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      /* clipboard blocked — ignore */
    }
  };
  return (
    <button
      type="button"
      onClick={onCopy}
      className="inline-flex items-center gap-1.5 h-9 px-3 rounded-md border border-border/40 bg-background/70 hover:bg-muted/50 text-xs font-medium transition-colors"
      title={url}
    >
      {copied ? (
        <>
          <Check className="w-3.5 h-3.5 text-green-500" /> Copied
        </>
      ) : (
        <>
          <Share2 className="w-3.5 h-3.5" /> Share
        </>
      )}
    </button>
  );
}
