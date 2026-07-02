import { Menu } from "@headlessui/react";
import { useDisconnect } from "wagmi";
import { Button } from "@/ui/button";
import { useAddressState } from "@/lib/addressState";
import { shortenAddress } from "@/lib/address";
import { switchToBaseChain } from "@/lib/chains";
import { useToast } from "@/ui/use-toast";
import { NetworkBanner } from "./NetworkBanner";
import { X, Wallet } from "lucide-react";

type WalletHeaderProps = {
  multiWallets?: string[];
  connectedOwner?: string | null;
  onRemoveWallet?: (addr: string) => void;
};

/**
 * Slim wallet bar for the Dress page's multi-wallet workflow. The global header
 * (logo, nav, theme, connect) lives in RootLayout — this only adds the extra
 * wallet chips + the "use connected address" menu + the network banner, so it no
 * longer duplicates the logo/menu.
 */
export function WalletHeader({
  multiWallets = [],
  connectedOwner,
  onRemoveWallet,
}: WalletHeaderProps) {
  const { disconnect } = useDisconnect();
  const { toast } = useToast();
  const {
    connectedAddress,
    isConnected,
    isOnBase,
    applyConnectedAddress,
  } = useAddressState();

  const handleSwitch = async () => {
    try {
      await switchToBaseChain();
    } catch (error: any) {
      toast({ title: "Switch failed", description: error?.message || "Unable to switch to Base.", variant: "destructive" });
    }
  };

  const totalWallets = multiWallets.length + (connectedOwner ? 1 : 0);

  return (
    <div className="w-full border-b border-border/40 bg-background/70">
      <div className="px-3 md:px-4 flex min-h-10 items-center justify-between gap-2 py-1">
        <div className="flex items-center gap-1 flex-1 min-w-0 overflow-hidden">
          {totalWallets > 0 && (
            <div className="flex items-center gap-1 overflow-x-auto scrollbar-none max-w-full">
              <Wallet className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
              {connectedOwner && (
                <span className="inline-flex items-center gap-1 rounded-full bg-green-500/10 border border-green-500/30 px-2 py-0.5 text-[10px] text-green-600 dark:text-green-400 shrink-0">
                  <span className="h-1.5 w-1.5 rounded-full bg-green-500" />
                  <span className="hidden md:inline">Connected</span>
                  {shortenAddress(connectedOwner)}
                </span>
              )}
              {multiWallets.map((addr) => (
                <span key={addr} className="inline-flex items-center gap-1 rounded-full bg-primary/10 border border-primary/30 px-2 py-0.5 text-[10px] text-primary shrink-0">
                  {shortenAddress(addr)}
                  {onRemoveWallet && (
                    <button onClick={() => onRemoveWallet(addr)} className="hover:text-destructive ml-0.5" title="Remove wallet">
                      <X className="h-3 w-3" />
                    </button>
                  )}
                </span>
              ))}
            </div>
          )}
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          {/* Disconnected: no button here — the global header's wallet chip
              already offers Connect, and doubling the CTA stacked two
              "Connect Wallet" buttons on mobile. */}
          {!isConnected ? null : (
            <Menu as="div" className="relative">
              <Menu.Button as={Button} variant="secondary" size="sm" className="h-8">
                {connectedAddress ? shortenAddress(connectedAddress) : "Connected"}
              </Menu.Button>
              <Menu.Items className="absolute right-0 mt-2 w-56 rounded-lg border bg-background shadow-lg p-2 text-sm z-50">
                <div className="px-2 py-1 text-xs text-muted-foreground">{isOnBase ? "Base" : "Wrong network"}</div>
                {!isOnBase && (
                  <Menu.Item>{() => <Button variant="secondary" size="sm" className="w-full justify-start" onClick={handleSwitch}>Switch to Base</Button>}</Menu.Item>
                )}
                <Menu.Item>{() => <Button variant="ghost" size="sm" className="w-full justify-start" onClick={applyConnectedAddress}>Use connected address</Button>}</Menu.Item>
                <Menu.Item>{() => <Button variant="ghost" size="sm" className="w-full justify-start" onClick={() => disconnect()}>Disconnect</Button>}</Menu.Item>
              </Menu.Items>
            </Menu>
          )}
        </div>
      </div>
      <NetworkBanner />
    </div>
  );
}
