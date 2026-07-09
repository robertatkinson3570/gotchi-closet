import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Button } from "@/ui/button";
import { Input } from "@/ui/input";
import { normalizeAddress, isValidAddress } from "@/lib/address";
import { cacheGet, cacheSet, CACHE_KEYS } from "@/lib/cache";
import { formatAddress } from "@/lib/format";
import { X, Sparkles, Layers, BarChart3, Plus, Wallet, Search, Coins } from "lucide-react";
import { DonateCard } from "@/components/DonateCard";
import { Seo } from "@/components/Seo";
import { siteUrl } from "@/lib/site";
import { ConnectButton } from "@/components/wallet/ConnectButton";
import { KnowledgeBaseButton } from "@/components/KnowledgeBaseModal";
import { useAccount, useChainId, useDisconnect } from "wagmi";
import { BASE_CHAIN_ID } from "@/lib/chains";
import { loadMultiWallets, addWallet, removeWallet } from "@/lib/multiWallet";

export default function HomePage() {
  const [manualAddressInput, setManualAddressInput] = useState("");
  const [multiWallets, setMultiWallets] = useState<string[]>(() => loadMultiWallets());
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
    setMultiWallets(loadMultiWallets());
  }, []);

  const handleAddWallet = () => {
    if (!hasManualInput || !isManualValid) return;
    const normalized = normalizeAddress(manualTrimmed);
    if (multiWallets.includes(normalized)) return;
    if (multiWallets.length >= 3) return;
    const updated = addWallet(normalized);
    setMultiWallets(updated);
    setManualAddressInput("");
    const recentUpdated = [
      normalized,
      ...recentAddresses.filter((addr) => addr !== normalized),
    ].slice(0, 5);
    setRecentAddresses(recentUpdated);
    cacheSet(CACHE_KEYS.ADDRESSES, recentUpdated);
  };

  const handleRemoveWallet = (addr: string) => {
    const updated = removeWallet(addr);
    setMultiWallets(updated);
  };

  const handleDress = () => {
    navigate("/dress");
  };

  const handleRecentClick = (addr: string) => {
    if (multiWallets.length >= 3) {
      setManualAddressInput(addr);
      return;
    }
    if (multiWallets.includes(normalizeAddress(addr))) return;
    const updated = addWallet(addr);
    setMultiWallets(updated);
  };

  const handleRemoveRecent = (addr: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const updated = recentAddresses.filter((a) => a !== addr);
    setRecentAddresses(updated);
    cacheSet(CACHE_KEYS.ADDRESSES, updated);
  };

  const canAddMore = multiWallets.length < 3;

  return (
    <div className="relative min-h-screen">
      <Seo
        title="GotchiCloset – Dress Your Aavegotchi, Preview Wearables & Optimize Sets"
        description="Preview wearables, try full sets, and optimize traits for your Aavegotchi. A fast, clean fitting room built for battlers and collectors."
        canonical={siteUrl("/")}
        jsonLd={{
          "@context": "https://schema.org",
          "@type": "SoftwareApplication",
          name: "GotchiCloset",
          url: siteUrl("/"),
          description:
            "Free Aavegotchi toolkit on Base: preview wearables and sets on your gotchi, calculate BRS rarity score, browse the Baazaar, and manage Gotchi lending.",
          applicationCategory: "GameApplication",
          operatingSystem: "Web browser",
          offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
          about: {
            "@type": "Thing",
            name: "Aavegotchi",
            sameAs: "https://www.aavegotchi.com/",
          },
        }}
      />

      <div className="relative z-10 flex flex-col items-center px-4 sm:px-6 pt-4 pb-6">
        <div className="w-full max-w-md">
          <div className="glass-strong rounded-2xl overflow-hidden lift">
            <div className="px-5 pt-3 pb-2 text-center">
              <div className="flex justify-center mb-2">
                <img
                  src="/logo.png"
                  alt="GotchiCloset"
                  className="w-48 h-48 sm:w-64 sm:h-64 object-contain drop-shadow-lg"
                />
              </div>
              <h1 className="font-heading text-2xl sm:text-3xl tracking-tight gradient-text">
                Your Gotchi's Been in the Closet Long Enough
              </h1>
              <p className="text-sm text-muted-foreground mt-1">
                Put an outfit on it already.
              </p>
              <div className="mt-2 flex justify-center">
                <KnowledgeBaseButton variant="link" />
              </div>
            </div>

            <div className="px-5 pb-5 space-y-3">
              {multiWallets.length > 0 && (
                <div className="space-y-1.5">
                  <label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide flex items-center gap-1">
                    <Wallet className="h-3 w-3" />
                    Wallets ({multiWallets.length}/3)
                  </label>
                  <div className="flex flex-wrap gap-1.5">
                    {multiWallets.map((addr) => (
                      <span
                        key={addr}
                        className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-primary/10 border border-primary/30 text-xs font-mono text-primary"
                      >
                        {formatAddress(addr)}
                        <button
                          onClick={() => handleRemoveWallet(addr)}
                          className="hover:text-destructive ml-0.5"
                          title="Remove wallet"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {canAddMore && (
                <div className="space-y-1">
                  <label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">
                    {multiWallets.length === 0 ? "Add Wallet Address" : "Add Another Wallet"}
                  </label>
                  <div className="flex gap-2">
                    <Input
                      placeholder="0x..."
                      value={manualAddressInput}
                      onChange={(e) => setManualAddressInput(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && handleAddWallet()}
                      className="h-10 bg-background/50 border-border/50 rounded-lg focus-visible:ring-2 focus-visible:ring-primary/20 focus-visible:border-primary/50 placeholder:text-muted-foreground/50 transition-all"
                      data-testid="home-manual-input"
                    />
                    <Button
                      onClick={handleAddWallet}
                      disabled={!hasManualInput || !isManualValid}
                      variant="secondary"
                      size="icon"
                      className="h-10 w-10 shrink-0"
                    >
                      <Plus className="h-4 w-4" />
                    </Button>
                  </div>
                  {hasManualInput && !isManualValid && (
                    <p className="text-xs text-destructive">Enter a valid Ethereum address</p>
                  )}
                </div>
              )}

              <div className="flex items-center gap-2">
                <div className="flex-1 h-px bg-border/40" />
                <span className="text-[10px] text-muted-foreground/50 uppercase">or connect</span>
                <div className="flex-1 h-px bg-border/40" />
              </div>

              {isConnected && connectedAddress ? (
                <div className="flex items-center gap-2">
                  <div className="flex-1 flex items-center gap-2 px-3 py-2 rounded-lg border border-green-500/30 bg-green-500/10">
                    <div className="h-2 w-2 rounded-full bg-green-500 animate-pulse" />
                    <span className="font-mono text-sm text-green-600 dark:text-green-400">{formatAddress(connectedOwner || "")}</span>
                  </div>
                  <Button
                    onClick={() => disconnect()}
                    variant="ghost"
                    size="sm"
                    className="text-xs text-muted-foreground hover:text-destructive"
                  >
                    Disconnect
                  </Button>
                </div>
              ) : (
                <ConnectButton
                  variant="secondary"
                  className="w-full h-10 rounded-lg border border-border/50 bg-background/50 hover:bg-muted/50 transition-all"
                  testId="home-connect-wallet-btn"
                />
              )}

              <Button
                onClick={handleDress}
                className="w-full h-11 rounded-lg bg-primary hover:bg-primary/90 text-primary-foreground font-semibold shadow-lg shadow-primary/20 hover:shadow-xl hover:shadow-primary/25 hover:-translate-y-0.5 transition-all duration-200"
                data-testid="home-dress-btn"
                disabled={multiWallets.length === 0 && !connectedOwner}
              >
                Dress Gotchis
              </Button>

              {recentAddresses.length > 0 && (
                <div className="space-y-1">
                  <label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">
                    Recent
                  </label>
                  <div className="flex flex-wrap gap-1.5">
                    {recentAddresses.map((addr) => {
                      const isAdded = multiWallets.includes(normalizeAddress(addr));
                      return (
                        <button
                          key={addr}
                          className={`group flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-mono border transition-all ${
                            isAdded 
                              ? "bg-muted/60 border-border/40 text-muted-foreground cursor-default"
                              : "bg-muted/40 hover:bg-muted border-border/20 hover:border-border/40"
                          }`}
                          onClick={() => !isAdded && handleRecentClick(addr)}
                          disabled={isAdded}
                        >
                          <span className={isAdded ? "text-muted-foreground/50" : "text-foreground/70"}>
                            {formatAddress(addr)}
                          </span>
                          {!isAdded && (
                            <span
                              onClick={(e) => handleRemoveRecent(addr, e)}
                              className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive transition-all"
                            >
                              <X className="h-2.5 w-2.5" />
                            </span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          </div>

          <div className="mt-4 space-y-3">
            <div className="grid grid-cols-5 gap-2">
              <Link
                to="/explorer"
                className="group glass rounded-xl flex flex-col items-center gap-1 p-2.5 lift"
              >
                <div className="p-2 rounded-lg bg-ecto/10 text-ecto group-hover:scale-110 transition-transform duration-220 ease-spring">
                  <Search className="h-4 w-4" />
                </div>
                <span className="text-xs font-medium text-foreground">Explorer</span>
              </Link>
              <Link
                to="/lending"
                className="group glass rounded-xl flex flex-col items-center gap-1 p-2.5 lift"
              >
                <div className="p-2 rounded-lg bg-gold/10 text-gold group-hover:scale-110 transition-transform duration-220 ease-spring">
                  <Coins className="h-4 w-4" />
                </div>
                <span className="text-xs font-medium text-foreground">Lending</span>
              </Link>
              <Link
                to="/sets"
                className="group glass rounded-xl flex flex-col items-center gap-1 p-2.5 lift"
              >
                <div className="p-2 rounded-lg bg-spectral/10 text-spectral group-hover:scale-110 transition-transform duration-220 ease-spring">
                  <Layers className="h-4 w-4" />
                </div>
                <span className="text-xs font-medium text-foreground">Sets</span>
              </Link>
              <Link
                to="/traits/nrg"
                className="group glass rounded-xl flex flex-col items-center gap-1 p-2.5 lift"
              >
                <div className="p-2 rounded-lg bg-cyan/10 text-cyan group-hover:scale-110 transition-transform duration-220 ease-spring">
                  <Sparkles className="h-4 w-4" />
                </div>
                <span className="text-xs font-medium text-foreground">Traits</span>
              </Link>
              <Link
                to="/rarity-score"
                className="group glass rounded-xl flex flex-col items-center gap-1 p-2.5 lift"
              >
                <div className="p-2 rounded-lg bg-ghst-pink/10 text-ghst-pink group-hover:scale-110 transition-transform duration-220 ease-spring">
                  <BarChart3 className="h-4 w-4" />
                </div>
                <span className="text-xs font-medium text-foreground">Rarity</span>
              </Link>
            </div>

            <div className="grid grid-cols-2 gap-3 p-3 rounded-xl glass">
              <div>
                <h2 className="text-xs font-semibold text-foreground mb-0.5">
                  What it does
                </h2>
                <p className="text-[11px] text-muted-foreground leading-relaxed">
                  Preview wearables, compare sets, and see trait changes instantly.
                </p>
              </div>
              <div>
                <h2 className="text-xs font-semibold text-foreground mb-0.5">
                  For power users
                </h2>
                <p className="text-[11px] text-muted-foreground leading-relaxed">
                  Fast previews, side-by-side comparisons, zero clutter.
                </p>
              </div>
            </div>

            <DonateCard className="w-full" />
          </div>
        </div>
      </div>
    </div>
  );
}
