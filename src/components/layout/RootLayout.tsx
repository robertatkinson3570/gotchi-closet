import { Suspense } from "react";
import { Outlet, useLocation, Link } from "react-router-dom";
import { useAccount, useDisconnect, usePublicClient, useReadContract } from "wagmi";
import { useQuery } from "@tanstack/react-query";
import { Menu } from "@headlessui/react";
import { Loader2 } from "lucide-react";
import { Coins, Search, Shirt, MapPin, Activity, Flame, Droplets, Landmark, Receipt, Bot, Copy, LogOut, Ghost, Trophy } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { GHST_TOKEN_BASE, ERC20_ABI } from "@/lib/lending/contracts";
import { BASE_CHAIN_ID } from "@/lib/chains";
import { resolveGotchiDomains } from "@/lib/gotchiDomains";
import { useToast } from "@/ui/use-toast";
import { useAuctionAlerts } from "@/hooks/useAuctionAlerts";
import { Button } from "@/ui/button";
import { ThemeToggle } from "@/components/layout/ThemeToggle";
import { FailoverPill } from "@/components/layout/FailoverPill";
import { Gv2Banner } from "@/components/layout/Gv2Banner";
import { ConnectButton } from "@/components/wallet/ConnectButton";
import { shortenAddress } from "@/lib/address";
import { FooterAttribution } from "@/components/FooterAttribution";
import { GhstTicker } from "@/components/layout/GhstTicker";
import { CompanionRoot } from "@/components/companion/CompanionRoot";
import { KnowledgeBaseButton } from "@/components/KnowledgeBaseModal";
import { PoweredByWisp } from "@/components/wisp/PoweredByWisp";

// Every page shows the full nav so all sections are reachable everywhere.
const NAV: { to: string; title: string; icon: LucideIcon }[] = [
  { to: "/explorer", title: "Explorer / Baazaar", icon: Search },
  { to: "/dress", title: "Dress", icon: Shirt },
  { to: "/activity", title: "Activity", icon: Activity },
  { to: "/leaderboard", title: "Kinship & XP Leaderboard", icon: Trophy },
  { to: "/forge", title: "Forge", icon: Flame },
  { to: "/staking", title: "GLTR Staking", icon: Droplets },
  { to: "/lending", title: "Lending", icon: Coins },
  { to: "/lending/lands", title: "Land Management", icon: MapPin },
  // Steward is hidden from the nav while we vet it (no one stumbles into it). The /steward
  // route still works by direct URL; set VITE_STEWARD_NAV=1 to reveal the menu option again.
  ...(import.meta.env.VITE_STEWARD_NAV === "1"
    ? [{ to: "/steward", title: "Steward — put your gotchis to work", icon: Bot }]
    : []),
  { to: "/dao", title: "DAO & Community", icon: Landmark },
];

function isActive(pathname: string, to: string): boolean {
  if (to === "/lending") return pathname === "/lending" || pathname.startsWith("/lending/me") || pathname.startsWith("/lending/analytics") || pathname.startsWith("/lending/whitelists");
  return pathname === to || pathname.startsWith(to + "/");
}

// GHST amounts in the header chip: keep it glanceable like the dapp's balance.
function fmtGhst(wei?: bigint): string {
  if (wei == null) return "0";
  const v = Number(wei) / 1e18;
  if (v >= 100_000) return `${Math.round(v / 1000).toLocaleString()}k`;
  return v.toLocaleString(undefined, { maximumFractionDigits: v < 100 ? 2 : 0 });
}

/**
 * Connected-wallet chip (dapp parity): always-visible GHST balance next to
 * your address — shown as your .gotchi name when you have one — opening a
 * menu (copy / my gotchis / my activity / disconnect) instead of the old
 * click-to-disconnect trap.
 */
function WalletChip() {
  const { address, isConnected } = useAccount();
  const { disconnect } = useDisconnect();
  const publicClient = usePublicClient({ chainId: BASE_CHAIN_ID });
  const { toast } = useToast();

  const { data: ghstWei } = useReadContract({
    chainId: BASE_CHAIN_ID,
    address: GHST_TOKEN_BASE,
    abi: ERC20_ABI,
    functionName: "balanceOf",
    args: address ? [address] : undefined,
    query: { enabled: !!address, refetchInterval: 30_000 },
  });

  const { data: domains } = useQuery({
    queryKey: ["gotchi-domain", address?.toLowerCase()],
    enabled: !!address && !!publicClient,
    staleTime: 5 * 60_000,
    queryFn: () => resolveGotchiDomains(publicClient!, [address]),
  });
  const domain = address ? domains?.get(address.toLowerCase()) : undefined;

  if (!isConnected || !address) return <ConnectButton className="h-8 px-2.5 text-xs" />;

  return (
    <Menu as="div" className="relative">
      <Menu.Button
        title="Wallet menu"
        className="inline-flex items-center gap-1.5 h-8 px-2.5 rounded-full bg-green-500/10 border border-green-500/30 text-[11px] font-medium text-green-600 dark:text-green-400 hover:bg-green-500/20"
      >
        <span className="h-1.5 w-1.5 rounded-full bg-green-500" />
        <span className="font-semibold tabular-nums">{fmtGhst(ghstWei as bigint | undefined)} GHST</span>
        <span className="hidden sm:inline border-l border-green-500/30 pl-1.5 max-w-[120px] truncate">{domain ?? shortenAddress(address)}</span>
      </Menu.Button>
      <Menu.Items className="absolute right-0 mt-2 w-52 rounded-xl border bg-background shadow-xl p-1.5 text-sm z-50">
        <div className="px-2 py-1.5 text-[11px] text-muted-foreground truncate">
          {domain ? <>{domain} · </> : null}{shortenAddress(address)} · Base
        </div>
        <Menu.Item>
          {() => (
            <button
              onClick={() => { navigator.clipboard?.writeText(address).then(() => toast({ title: "Address copied" })); }}
              className="w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-left hover:bg-muted/60"
            >
              <Copy className="w-3.5 h-3.5 text-muted-foreground" /> Copy address
            </button>
          )}
        </Menu.Item>
        <Menu.Item>
          {() => (
            <Link to="/me" className="w-full flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-muted/60">
              <Ghost className="w-3.5 h-3.5 text-muted-foreground" /> My gotchis & items
            </Link>
          )}
        </Menu.Item>
        <Menu.Item>
          {() => (
            <Link to="/me/activity" className="w-full flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-muted/60">
              <Receipt className="w-3.5 h-3.5 text-muted-foreground" /> My activity
            </Link>
          )}
        </Menu.Item>
        <Menu.Item>
          {() => (
            <button
              onClick={() => disconnect()}
              className="w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-left text-destructive hover:bg-destructive/10"
            >
              <LogOut className="w-3.5 h-3.5" /> Disconnect
            </button>
          )}
        </Menu.Item>
      </Menu.Items>
    </Menu>
  );
}

export function RootLayout() {
  const location = useLocation();
  const { address, isConnected } = useAccount();
  // Watched-auction outbid / ending-soon alerts run app-wide.
  useAuctionAlerts();

  return (
    <div className="min-h-screen flex flex-col">
      <Gv2Banner />
      <header className="h-14 w-full glass-nav sticky top-0 z-30">
        <div className="flex h-14 items-center justify-between px-3 md:px-4 gap-3 max-w-[1600px] mx-auto">
          <Link to="/" className="flex items-center gap-1.5 min-w-0 hover:opacity-90 transition-opacity">
            <img src="/logo.png" alt="GotchiCloset" className="h-12 w-12 object-contain -my-2" />
            <div className="text-xl font-heading tracking-tight truncate gradient-text hidden sm:block">GotchiCloset</div>
          </Link>
          <div className="flex items-center gap-0.5 sm:gap-1 flex-wrap justify-end">
            {NAV.map(({ to, title, icon: Icon }) => (
              <Link key={to} to={to}>
                <Button
                  size="sm"
                  variant="ghost"
                  className={`h-8 px-2 ${isActive(location.pathname, to) ? "bg-primary/15 text-primary shadow-glow-sm" : ""}`}
                  title={title}
                >
                  <Icon className="h-4 w-4" />
                </Button>
              </Link>
            ))}
            {isConnected && address && (
              <Link to="/me/activity" title="My activity — listings, offers, bids, auctions, sales">
                <Button size="sm" variant="ghost" className={`h-8 px-2 ${location.pathname.startsWith("/me/activity") || location.pathname.startsWith("/u/") ? "bg-primary/15 text-primary shadow-glow-sm" : ""}`}>
                  <Receipt className="h-4 w-4" />
                </Button>
              </Link>
            )}
            <FailoverPill />
            <div className="ml-0.5">
              <WalletChip />
            </div>
            <KnowledgeBaseButton variant="nav" />
            <ThemeToggle />
          </div>
        </div>
      </header>
      <main className="flex-1 relative z-[1]">
        <Suspense fallback={<div className="flex items-center justify-center py-24"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>}>
          <Outlet />
        </Suspense>
      </main>
      <footer className="flex flex-col items-center gap-2 px-4 py-4">
        <GhstTicker />
        <PoweredByWisp />
        <FooterAttribution className="text-center" />
      </footer>
      <CompanionRoot />
    </div>
  );
}
