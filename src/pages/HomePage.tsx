import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Button } from "@/ui/button";
import { Input } from "@/ui/input";
import { Card, CardContent, CardHeader } from "@/ui/card";
import { normalizeAddress, isValidAddress } from "@/lib/address";
import { cacheGet, cacheSet, CACHE_KEYS } from "@/lib/cache";
import { formatAddress } from "@/lib/format";
import { X } from "lucide-react";
import { Logo } from "@/components/Logo";
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
    <div className="relative min-h-screen flex flex-col overflow-x-hidden">
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
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,_hsl(var(--surface-2))_0%,_hsl(var(--bg))_55%)]" />
      <div className="absolute -top-20 -left-24 h-72 w-72 rounded-full bg-[hsl(var(--accent))]/10 blur-3xl" />
      <div className="absolute -bottom-24 right-0 h-80 w-80 rounded-full bg-[hsl(var(--accent-2))]/8 blur-3xl" />

      <div className="flex-1 flex items-center justify-center p-6 relative z-10">
        <div className="relative w-full max-w-[520px] space-y-6">
          <Card className="rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--surface))] shadow-[0_20px_60px_hsl(var(--shadow))]">
            <CardHeader className="space-y-3 text-center py-8">
              <header className="hero">
                <div className="hero-content space-y-3">
                  <Logo variant="hero" className="mx-auto" />
                  <h1 className="text-2xl font-semibold tracking-tight text-foreground">
                    Your Gotchi’s Been in the Closet Long Enough
                  </h1>
                  <p className="text-sm text-[hsl(var(--muted))]">
                    Dress and optimize your Gotchi
                  </p>
                </div>
              </header>
            </CardHeader>
            <CardContent className="space-y-5 p-6 pt-0">
              <div className="space-y-3">
                <div className="relative">
                  <div className="flex flex-col gap-2 sm:flex-row">
                    <div className="flex-1 space-y-1">
                      <label className="text-xs font-medium text-muted-foreground">
                        Wallet Address (optional)
                      </label>
                    <Input
                      placeholder="0x..."
                      value={manualAddressInput}
                      onChange={(e) => {
                        setManualAddressInput(e.target.value);
                      }}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          handleDress();
                        }
                      }}
                      className="bg-[hsl(var(--surface-2))] border-[hsl(var(--border))] focus-visible:ring-[hsl(var(--accent))]/30 placeholder:text-[hsl(var(--muted))]"
                      data-testid="home-manual-input"
                    />
                      <div className="text-xs text-muted-foreground">
                        Paste any wallet to dress those gotchis.
                      </div>
                    </div>
                  </div>
                  {hasManualInput && !isManualValid ? (
                    <div className="text-xs text-red-500">
                      Enter a valid Ethereum address
                    </div>
                  ) : null}
                </div>
                <div className="flex items-center justify-center text-xs text-muted-foreground">
                  <span className="px-2">and/or</span>
                </div>
                {isConnected && connectedAddress ? (
                  <Button
                    onClick={() => disconnect()}
                    variant="secondary"
                    className="w-full border border-[hsl(var(--border))] bg-[hsl(var(--surface-2))] hover:bg-[hsl(var(--surface))]"
                  >
                    {connectedOwner}
                  </Button>
                ) : (
                  <ConnectButton
                    variant="secondary"
                    className="w-full border border-[hsl(var(--border))] bg-[hsl(var(--surface-2))] hover:bg-[hsl(var(--surface))]"
                    testId="home-connect-wallet-btn"
                  />
                )}
                <div className="text-xs text-muted-foreground">
                  Connect to include your wallet. No transactions.
                </div>
            <Button
              onClick={handleDress}
              className="w-full bg-gradient-to-r from-[hsl(var(--text))]/90 to-[hsl(var(--surface-2))] text-[hsl(var(--surface))] hover:translate-y-[-1px] hover:shadow-md transition"
              data-testid="home-dress-btn"
              disabled={!isManualValid}
            >
              Dress Gotchis
            </Button>
              </div>

              {recentAddresses.length > 0 && (
                <div className="space-y-2">
                  <p className="text-sm text-[hsl(var(--muted))]">Recent Addresses</p>
                  <div className="flex flex-wrap gap-2">
                    {recentAddresses.map((addr) => (
                      <div
                        key={addr}
                        className="group flex items-center gap-1 px-3 py-1 rounded-full bg-[hsl(var(--chip-bg))] text-[hsl(var(--chip-text))] text-sm border border-[hsl(var(--border))] cursor-pointer hover:shadow-sm transition"
                        onClick={() => handleRecentClick(addr)}
                      >
                        <span>{formatAddress(addr)}</span>
                        <button
                          onClick={(e) => handleRemoveRecent(addr, e)}
                          className="ml-1 opacity-0 group-hover:opacity-100 hover:text-[hsl(var(--accent))] transition"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          <section className="space-y-4 text-sm text-muted-foreground">
            <div>
              <h2 className="text-base font-semibold text-foreground">
                What GotchiCloset does
              </h2>
              <p>
                Load any wallet, preview wearables, and compare set bonuses and
                trait changes without extra clicks.
              </p>
            </div>
            <div>
              <h2 className="text-base font-semibold text-foreground">
                Why it’s great for power users
              </h2>
              <ul className="list-disc pl-5">
                <li>Fast previews with clear trait impact.</li>
                <li>Side-by-side set and wearable checks.</li>
                <li>No clutter, just dress your Gotchi.</li>
              </ul>
            </div>
            <div className="flex flex-wrap gap-3">
              <Link className="underline" to="/sets">Browse sets</Link>
              <Link className="underline" to="/traits/nrg">Trait optimization</Link>
              <Link className="underline" to="/rarity-score">Rarity score</Link>
            </div>
          </section>
        </div>
      </div>

      <section className="w-full flex justify-center px-6 pb-12 mt-12 relative z-10">
        <DonateCard className="w-full max-w-[520px]" />
      </section>
    </div>
  );
}

