import { useState } from "react";
import { ArrowLeftRight, Coins, CreditCard, ExternalLink, Sparkles } from "lucide-react";
import { Seo } from "@/components/Seo";
import { siteUrl } from "@/lib/site";
import { SwapCard } from "@/components/swap/SwapCard";
import { AlchemicaSwapCard } from "@/components/swap/AlchemicaSwapCard";

const GHST = "0xcD2F22236DD9Dfe2356D7C543161D4d260FD9BcB";
const USDC = "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913";

type Tab = "swap" | "bridge" | "purchase";
const TABS: { key: Tab; label: string; icon: typeof Coins }[] = [
  { key: "swap", label: "Swap", icon: ArrowLeftRight },
  { key: "bridge", label: "Bridge", icon: Coins },
  { key: "purchase", label: "Purchase", icon: CreditCard },
];

type Provider = { name: string; desc: string; href: string; tag?: string };

const SWAP: Provider[] = [
  { name: "CowSwap", desc: "MEV-protected in-app swap on Base", href: `https://swap.cow.fi/#/8453/swap/${USDC}/${GHST}`, tag: "Recommended" },
  { name: "Aerodrome", desc: "The leading DEX on Base", href: `https://aerodrome.finance/swap?from=eth&to=${GHST}` },
  { name: "Uniswap", desc: "Cross-chain DEX", href: `https://app.uniswap.org/swap?chain=base&outputCurrency=${GHST}` },
  { name: "Quickswap", desc: "Legacy GHST liquidity on Polygon", href: "https://quickswap.exchange/#/swap" },
];
const BRIDGE: Provider[] = [
  { name: "Bungee (Socket)", desc: "Bridge any token to GHST on Base — the dapp's bridge rail", href: "https://www.bungee.exchange/", tag: "Recommended" },
  { name: "Jumper", desc: "Multi-route bridge + swap to Base", href: `https://jumper.exchange/?toChain=8453&toToken=${GHST}` },
  { name: "Base Bridge", desc: "Official Ethereum → Base bridge", href: "https://bridge.base.org/" },
];
const PURCHASE: Provider[] = [
  { name: "Coinbase", desc: "Buy USDC/ETH on Base with card or bank, then swap to GHST", href: "https://www.coinbase.com/", tag: "Easiest" },
  { name: "MoonPay", desc: "Card on-ramp to Base", href: "https://www.moonpay.com/buy" },
  { name: "Transak", desc: "Fiat on-ramp to Base", href: "https://global.transak.com/" },
];

const BY_TAB: Record<Tab, { intro: string; providers: Provider[] }> = {
  swap: { intro: "Swap tokens you already hold on Base into GHST.", providers: SWAP },
  bridge: { intro: "Move tokens from another chain to Base, then hold GHST.", providers: BRIDGE },
  purchase: { intro: "Buy crypto with fiat, then swap to GHST on Base.", providers: PURCHASE },
};

function ProviderCard({ p }: { p: Provider }) {
  return (
    <a href={p.href} target="_blank" rel="noopener noreferrer" className="group relative flex items-center gap-3 rounded-xl border border-border/40 bg-background/60 p-4 hover:border-primary/40 hover:-translate-y-0.5 hover:shadow-lg transition-all">
      <span className="inline-flex items-center justify-center w-10 h-10 rounded-xl bg-gradient-to-br from-primary/20 to-primary/5 text-primary font-bold">{p.name[0]}</span>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold">{p.name}</span>
          {p.tag && <span className="text-[9px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded bg-primary/15 text-primary">{p.tag}</span>}
        </div>
        <div className="text-xs text-muted-foreground">{p.desc}</div>
      </div>
      <ExternalLink className="w-4 h-4 text-muted-foreground group-hover:text-primary shrink-0" />
    </a>
  );
}

export default function GetTokensPage() {
  const [tab, setTab] = useState<Tab>("swap");
  const { intro, providers } = BY_TAB[tab];

  return (
    <div className="container mx-auto max-w-[720px] px-4 py-6">
      <Seo title="Get GHST — GotchiCloset" description="Swap, bridge or buy GHST on Base to use across the Aavegotchi ecosystem." canonical={siteUrl("/get-tokens")} />

      <div className="text-center mb-6">
        <h1 className="text-2xl font-bold tracking-tight inline-flex items-center gap-2"><Sparkles className="w-6 h-6 text-primary" /> Get GHST</h1>
        <p className="text-sm text-muted-foreground mt-1">Acquire GHST on Base to buy gotchis, wearables and more.</p>
      </div>

      <div className="flex items-center justify-center gap-1.5 mb-4">
        {TABS.map((t) => (
          <button key={t.key} onClick={() => setTab(t.key)} className={`inline-flex items-center gap-1.5 h-9 px-4 rounded-lg text-sm font-semibold border ${tab === t.key ? "bg-primary/15 text-primary border-primary/40" : "border-border/40 text-muted-foreground hover:bg-muted/40"}`}>
            <t.icon className="w-4 h-4" /> {t.label}
          </button>
        ))}
      </div>

      <p className="text-xs text-muted-foreground text-center mb-3">{intro}</p>
      {tab === "swap" && (
        <div className="mb-4">
          <AlchemicaSwapCard />
          <SwapCard />
          <div className="text-[10px] text-muted-foreground text-center mt-2">Or use an external venue:</div>
        </div>
      )}
      <div className="space-y-2.5">
        {providers.map((p) => <ProviderCard key={p.name} p={p} />)}
      </div>

      <div className="mt-5 rounded-xl border border-border/40 bg-muted/20 p-3 text-center">
        <div className="text-[11px] text-muted-foreground">GHST on Base</div>
        <code className="text-[11px] font-mono break-all">{GHST}</code>
      </div>
    </div>
  );
}
