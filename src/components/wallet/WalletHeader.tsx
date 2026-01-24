import { Menu } from "@headlessui/react";
import { useDisconnect } from "wagmi";
import { Button } from "@/ui/button";
import { useAddressState } from "@/lib/addressState";
import { shortenAddress } from "@/lib/address";
import { switchToBaseChain } from "@/lib/chains";
import { useToast } from "@/ui/use-toast";
import { Logo } from "@/components/Logo";
import { ConnectButton } from "./ConnectButton";
import { NetworkBanner } from "./NetworkBanner";
import { ArrowLeft } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { ThemeToggle } from "@/components/layout/ThemeToggle";

type WalletHeaderProps = {
  showBack?: boolean;
};

export function WalletHeader({ showBack = true }: WalletHeaderProps) {
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
    <header className="sticky top-0 z-50 w-full bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 border-b">
      <div className="px-4 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3 min-w-0">
          {showBack && (
            <Button
              variant="ghost"
              size="icon"
              onClick={() => navigate("/")}
            >
              <ArrowLeft className="h-5 w-5" />
            </Button>
          )}
          <Logo variant="navbar" />
          <div className="min-w-0 flex flex-col leading-tight">
            <div className="text-xl font-semibold tracking-tight truncate">
              Gotchi
              <span className="font-normal text-[hsl(var(--muted))]">Closet</span>
            </div>
            {connectedAddress ? (
              <div className="text-sm text-muted-foreground truncate">
                {shortenAddress(connectedAddress)}
              </div>
            ) : null}
          </div>
        </div>
        <div className="flex items-center gap-2">
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

