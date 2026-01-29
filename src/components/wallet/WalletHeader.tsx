import { Menu } from "@headlessui/react";
import { useDisconnect } from "wagmi";
import { Button } from "@/ui/button";
import { useAddressState } from "@/lib/addressState";
import { shortenAddress } from "@/lib/address";
import { switchToBaseChain } from "@/lib/chains";
import { useToast } from "@/ui/use-toast";
import { ConnectButton } from "./ConnectButton";
import { NetworkBanner } from "./NetworkBanner";
import { FlaskConical, X, Wallet, Search } from "lucide-react";
import { Link } from "react-router-dom";
import { ThemeToggle } from "@/components/layout/ThemeToggle";

type WalletHeaderProps = {
  multiWallets?: string[];
  connectedOwner?: string | null;
  onRemoveWallet?: (addr: string) => void;
};

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
    useConnectedAddress,
  } = useAddressState();

  const handleSwitch = async () => {
    try {
      await switchToBaseChain();
    } catch (error: any) {
      toast({
        title: "Switch failed",
        description: error?.message || "Unable to switch to Base.",
        variant: "destructive",
      });
    }
  };

  const totalWallets = multiWallets.length + (connectedOwner ? 1 : 0);

  return (
    <header className="sticky top-0 z-50 w-full bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 border-b">
      <div className="px-4 flex h-12 items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 min-w-0 shrink-0">
          <Link to="/" className="hover:opacity-80 transition-opacity">
            <img
              src="/logo.png"
              alt="GotchiCloset"
              className="h-12 w-12 object-contain -my-2"
            />
          </Link>
          <div className="text-lg font-semibold tracking-tight hidden sm:block">
            Gotchi<span className="font-normal text-muted-foreground">Closet</span>
          </div>
        </div>
        
        <div className="flex items-center gap-1 flex-1 justify-center min-w-0 overflow-hidden">
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
                <span
                  key={addr}
                  className="inline-flex items-center gap-1 rounded-full bg-primary/10 border border-primary/30 px-2 py-0.5 text-[10px] text-primary shrink-0"
                >
                  {shortenAddress(addr)}
                  {onRemoveWallet && (
                    <button
                      onClick={() => onRemoveWallet(addr)}
                      className="hover:text-destructive ml-0.5"
                      title="Remove wallet"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  )}
                </span>
              ))}
            </div>
          )}
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          <Link to="/explorer">
            <Button size="sm" variant="ghost" className="h-8 px-2" title="Explorer">
              <Search className="h-4 w-4" />
            </Button>
          </Link>
          <Link to="/wardrobe-lab">
            <Button size="sm" variant="ghost" className="h-8 px-2" title="Wardrobe Lab">
              <FlaskConical className="h-4 w-4" />
            </Button>
          </Link>
          <ThemeToggle />
          {!isConnected ? (
            <ConnectButton />
          ) : (
            <Menu as="div" className="relative">
              <Menu.Button as={Button} variant="secondary" size="sm" className="h-8">
                {connectedAddress
                  ? shortenAddress(connectedAddress)
                  : "Connected"}
              </Menu.Button>
              <Menu.Items className="absolute right-0 mt-2 w-56 rounded-lg border bg-background shadow-lg p-2 text-sm">
                <div className="px-2 py-1 text-xs text-muted-foreground">
                  {isOnBase ? "Base" : "Wrong network"}
                </div>
                {!isOnBase && (
                  <Menu.Item>
                    {() => (
                      <Button
                        variant="secondary"
                        size="sm"
                        className="w-full justify-start"
                        onClick={handleSwitch}
                      >
                        Switch to Base
                      </Button>
                    )}
                  </Menu.Item>
                )}
                <Menu.Item>
                  {() => (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="w-full justify-start"
                      onClick={useConnectedAddress}
                    >
                      Use connected address
                    </Button>
                  )}
                </Menu.Item>
                <Menu.Item>
                  {() => (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="w-full justify-start"
                      onClick={() => disconnect()}
                    >
                      Disconnect
                    </Button>
                  )}
                </Menu.Item>
              </Menu.Items>
            </Menu>
          )}
        </div>
      </div>
      <NetworkBanner />
    </header>
  );
}
