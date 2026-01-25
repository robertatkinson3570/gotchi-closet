import { Menu } from "@headlessui/react";
import { useDisconnect } from "wagmi";
import { Button } from "@/ui/button";
import { useAddressState } from "@/lib/addressState";
import { shortenAddress } from "@/lib/address";
import { switchToBaseChain } from "@/lib/chains";
import { useToast } from "@/ui/use-toast";
import { ConnectButton } from "./ConnectButton";
import { NetworkBanner } from "./NetworkBanner";
import { ArrowLeft, FlaskConical, Eye, X } from "lucide-react";
import { useNavigate, Link } from "react-router-dom";
import { ThemeToggle } from "@/components/layout/ThemeToggle";

type WalletHeaderProps = {
  showBack?: boolean;
  manualAddress?: string | null;
  connectedOwner?: string | null;
  onClearManual?: () => void;
  onUseConnected?: () => void;
};

export function WalletHeader({ 
  showBack = true,
  manualAddress,
  connectedOwner,
  onClearManual,
  onUseConnected,
}: WalletHeaderProps) {
  const navigate = useNavigate();
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

  return (
    <header className="sticky top-0 z-50 h-12 w-full bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 border-b">
      <div className="px-4 flex h-12 items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          {showBack && (
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={() => navigate("/")}
            >
              <ArrowLeft className="h-4 w-4" />
            </Button>
          )}
          <div className="text-lg font-semibold tracking-tight">
            Gotchi<span className="font-normal text-muted-foreground">Closet</span>
          </div>
        </div>
        
        {/* Viewing wallets section */}
        <div className="flex items-center gap-1.5 flex-1 justify-center min-w-0">
          <Eye className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
          {connectedOwner && (
            <span className="inline-flex items-center gap-1 rounded-full bg-muted/50 border border-border px-2 py-0.5 text-[10px] text-muted-foreground">
              <span className="hidden sm:inline">Connected</span> {shortenAddress(connectedOwner)}
            </span>
          )}
          {manualAddress && (
            <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 border border-primary/30 px-2 py-0.5 text-[10px] text-primary">
              <span className="hidden sm:inline">Manual</span> {shortenAddress(manualAddress)}
              {onClearManual && (
                <button onClick={onClearManual} className="hover:text-destructive ml-0.5" title="Clear manual">
                  <X className="h-3 w-3" />
                </button>
              )}
            </span>
          )}
          {manualAddress && connectedOwner && onUseConnected && (
            <Button size="sm" variant="ghost" onClick={onUseConnected} className="h-6 px-2 text-[10px]">
              Use Connected
            </Button>
          )}
        </div>

        <div className="flex items-center gap-1.5">
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
              <Menu.Button as={Button} variant="secondary">
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

