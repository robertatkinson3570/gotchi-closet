import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Button } from "@/ui/button";
import { Input } from "@/ui/input";
import { normalizeAddress, isValidAddress } from "@/lib/address";
import { cacheGet, cacheSet, CACHE_KEYS } from "@/lib/cache";
import { formatAddress } from "@/lib/format";
import { X, Sparkles, Layers, BarChart3 } from "lucide-react";
import { DonateCard } from "@/components/DonateCard";
import { Seo } from "@/components/Seo";
import { siteUrl } from "@/lib/site";
import { ConnectButton } from "@/components/wallet/ConnectButton";
import { useAccount, useChainId, useDisconnect } from "wagmi";
import { BASE_CHAIN_ID } from "@/lib/chains";

const STORAGE_MANUAL_VIEW = "gc_manualViewAddress";

export default function HomePage() {
  const [manualAddressInput, setManualAddressInput] = useState("");
  const [recentAddresses, setRecentAddresses] = useState<string[]>(() => {
    const cached = cacheGet<string[]>(CACHE_KEYS.ADDRESSES);
    return cached || [];
  });
  const navigate = useNavigate();
  const { address: connectedAddress, isConnected } = useAccount();
  const chainId = useChainId();
  const isOnBase = chainId === BASE_CHAIN_ID;
  const { disconnect } = useDisconnect();

  const connectedOwner =
    isConnected && isOnBase && connectedAddress
      ? normalizeAddress(connectedAddress)
      : undefined;

  const manualTrimmed = manualAddressInput.trim();
  const hasManualInput = manualTrimmed.length > 0;
  const isManualValid = useMemo(
    () => (!hasManualInput ? true : isValidAddress(manualTrimmed)),
    [hasManualInput, manualTrimmed]
  );

  useEffect(() => {
    if (typeof window === "undefined") return;
    const stored = window.localStorage.getItem(STORAGE_MANUAL_VIEW);
    if (stored && isValidAddress(stored)) {
      setManualAddressInput(normalizeAddress(stored));
    }
  }, []);

  const handleDress = () => {
    if (hasManualInput && !isManualValid) {
      return;
    }

    if (hasManualInput) {
      const normalized = normalizeAddress(manualTrimmed);
      window.localStorage.setItem(STORAGE_MANUAL_VIEW, normalized);
      const updated = [
        normalized,
        ...recentAddresses.filter((addr) => addr !== normalized),
      ].slice(0, 5);
      setRecentAddresses(updated);
      cacheSet(CACHE_KEYS.ADDRESSES, updated);
      navigate(`/dress?view=${normalized}`);
      return;
    }

    navigate("/dress");
  };

  const handleRecentClick = (addr: string) => {
    setManualAddressInput(addr);
  };

  const handleRemoveRecent = (addr: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const updated = recentAddresses.filter((a) => a !== addr);
    setRecentAddresses(updated);
    cacheSet(CACHE_KEYS.ADDRESSES, updated);
  };

  return (
    <div className="relative min-h-screen bg-gradient-to-b from-background via-background to-muted/20">
      <Seo
        title="GotchiCloset – Dress Your Aavegotchi, Preview Wearables & Optimize Sets"
        description="Preview wearables, try full sets, and optimize traits for your Aavegotchi. A fast, clean fitting room built for battlers and collectors."
        canonical={siteUrl("/")}
        jsonLd={{
          "@context": "https://schema.org",
          "@type": "SoftwareApplication",
          name: "GotchiCloset",
          applicationCategory: "GameUtility",
          operatingSystem: "Web",
        }}
      />
      
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[600px] bg-primary/5 rounded-full blur-3xl" />
        <div className="absolute bottom-0 left-0 w-96 h-96 bg-purple-500/5 rounded-full blur-3xl" />
        <div className="absolute bottom-1/4 right-0 w-80 h-80 bg-pink-500/5 rounded-full blur-3xl" />
      </div>

      <div className="relative z-10 flex flex-col items-center px-4 sm:px-6 pt-8 sm:pt-12 pb-8">
        <div className="w-full max-w-md">
          <div className="backdrop-blur-sm bg-card/80 rounded-3xl border border-border/50 shadow-2xl shadow-black/5 overflow-hidden">
            <div className="px-6 pt-8 pb-6 text-center">
              <div className="flex justify-center mb-4">
                <img
                  src="/logo.png"
                  alt="GotchiCloset"
                  className="w-48 h-48 sm:w-64 sm:h-64 object-contain drop-shadow-lg"
                />
              </div>
              <h1 className="text-lg sm:text-xl font-bold tracking-tight text-foreground">
                Your Gotchi's Been in the Closet Long Enough
              </h1>
              <p className="mt-1.5 text-sm text-muted-foreground">
                Put an outfit on it already!
              </p>
            </div>

            <div className="px-6 pb-8 space-y-4">
              <div className="space-y-2">
                <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                  Wallet Address
                </label>
                <Input
                  placeholder="0x..."
                  value={manualAddressInput}
                  onChange={(e) => setManualAddressInput(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleDress()}
                  className="h-11 bg-background/50 border-border/50 rounded-xl focus-visible:ring-2 focus-visible:ring-primary/20 focus-visible:border-primary/50 placeholder:text-muted-foreground/50 transition-all"
                  data-testid="home-manual-input"
                />
                {hasManualInput && !isManualValid && (
                  <p className="text-xs text-destructive">Enter a valid Ethereum address</p>
                )}
                <p className="text-xs text-muted-foreground/70">
                  Paste any wallet to dress those gotchis
                </p>
              </div>

              <div className="flex items-center gap-3">
                <div className="flex-1 h-px bg-border/50" />
                <span className="text-xs text-muted-foreground/60 uppercase tracking-wider">or</span>
                <div className="flex-1 h-px bg-border/50" />
              </div>

              <div className="space-y-2">
                {isConnected && connectedAddress ? (
                  <Button
                    onClick={() => disconnect()}
                    variant="secondary"
                    className="w-full h-11 rounded-xl border border-border/50 bg-background/50 hover:bg-muted/50 transition-all"
                  >
                    <span className="font-mono text-sm">{formatAddress(connectedOwner || "")}</span>
                  </Button>
                ) : (
                  <ConnectButton
                    variant="secondary"
                    className="w-full h-11 rounded-xl border border-border/50 bg-background/50 hover:bg-muted/50 transition-all"
                    testId="home-connect-wallet-btn"
                  />
                )}
                <p className="text-xs text-muted-foreground/70">
                  Connect wallet for quick access. No transactions.
                </p>
              </div>

              <Button
                onClick={handleDress}
                className="w-full h-12 rounded-xl bg-primary hover:bg-primary/90 text-primary-foreground font-semibold text-base shadow-lg shadow-primary/20 hover:shadow-xl hover:shadow-primary/25 hover:-translate-y-0.5 transition-all duration-200"
                data-testid="home-dress-btn"
                disabled={!isManualValid}
              >
                Dress Gotchis
              </Button>

              {recentAddresses.length > 0 && (
                <div className="pt-2 space-y-2">
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                    Recent
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {recentAddresses.map((addr) => (
                      <button
                        key={addr}
                        className="group flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-muted/50 hover:bg-muted text-sm font-mono border border-border/30 hover:border-border/50 transition-all"
                        onClick={() => handleRecentClick(addr)}
                      >
                        <span className="text-foreground/80">{formatAddress(addr)}</span>
                        <span
                          onClick={(e) => handleRemoveRecent(addr, e)}
                          className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive transition-all"
                        >
                          <X className="h-3 w-3" />
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>

          <div className="mt-8 space-y-6">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <Link 
                to="/sets" 
                className="group flex flex-col items-center gap-2 p-4 rounded-2xl bg-card/50 border border-border/30 hover:border-primary/30 hover:bg-card/80 transition-all"
              >
                <div className="p-2.5 rounded-xl bg-primary/10 text-primary group-hover:scale-110 transition-transform">
                  <Layers className="h-5 w-5" />
                </div>
                <span className="text-sm font-medium text-foreground">Browse Sets</span>
              </Link>
              <Link 
                to="/traits/nrg" 
                className="group flex flex-col items-center gap-2 p-4 rounded-2xl bg-card/50 border border-border/30 hover:border-primary/30 hover:bg-card/80 transition-all"
              >
                <div className="p-2.5 rounded-xl bg-purple-500/10 text-purple-500 group-hover:scale-110 transition-transform">
                  <Sparkles className="h-5 w-5" />
                </div>
                <span className="text-sm font-medium text-foreground">Trait Optimization</span>
              </Link>
              <Link 
                to="/rarity-score" 
                className="group flex flex-col items-center gap-2 p-4 rounded-2xl bg-card/50 border border-border/30 hover:border-primary/30 hover:bg-card/80 transition-all"
              >
                <div className="p-2.5 rounded-xl bg-pink-500/10 text-pink-500 group-hover:scale-110 transition-transform">
                  <BarChart3 className="h-5 w-5" />
                </div>
                <span className="text-sm font-medium text-foreground">Rarity Score</span>
              </Link>
            </div>

            <div className="space-y-4 p-5 rounded-2xl bg-card/30 border border-border/20">
              <div>
                <h2 className="text-sm font-semibold text-foreground mb-1">
                  What GotchiCloset does
                </h2>
                <p className="text-sm text-muted-foreground leading-relaxed">
                  Load any wallet, preview wearables, and compare set bonuses and
                  trait changes without extra clicks.
                </p>
              </div>
              <div>
                <h2 className="text-sm font-semibold text-foreground mb-1">
                  Why it's great for power users
                </h2>
                <ul className="text-sm text-muted-foreground space-y-1">
                  <li className="flex items-start gap-2">
                    <span className="text-primary mt-1">•</span>
                    Fast previews with clear trait impact
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-primary mt-1">•</span>
                    Side-by-side set and wearable checks
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-primary mt-1">•</span>
                    No clutter, just dress your Gotchi
                  </li>
                </ul>
              </div>
            </div>

            <DonateCard className="w-full" />
          </div>
        </div>
      </div>
    </div>
  );
}
