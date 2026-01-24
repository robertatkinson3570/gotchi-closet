import { useMemo, useState } from "react";
import { Dialog } from "@headlessui/react";
import { useConnect } from "wagmi";
import { Button } from "@/ui/button";
import { useToast } from "@/ui/use-toast";

type ConnectButtonProps = {
  className?: string;
  variant?: "default" | "secondary" | "ghost";
  testId?: string;
};

export function ConnectButton({
  className,
  variant = "default",
  testId,
}: ConnectButtonProps) {
  const { connectors, connectAsync, isPending } = useConnect();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);

  const injectedConnector = useMemo(
    () => connectors.find((connector) => connector.id === "injected"),
    [connectors]
  );
  const walletConnectConnector = useMemo(
    () => connectors.find((connector) => connector.id === "walletConnect"),
    [connectors]
  );

  const handleConnect = async (id: "injected" | "walletConnect") => {
    const connector =
      id === "injected" ? injectedConnector : walletConnectConnector;
    if (!connector) {
      toast({
        title: "Connector unavailable",
        description: "That wallet option isn't available in this browser.",
        variant: "destructive",
      });
      return;
    }

    try {
      await connectAsync({ connector });
      setOpen(false);
    } catch (error: any) {
      toast({
        title: "Connection failed",
        description: error?.shortMessage || error?.message || "Try again.",
        variant: "destructive",
      });
    }
  };

  return (
    <>
      <Button
        onClick={() => setOpen(true)}
        className={className}
        variant={variant}
        data-testid={testId}
      >
        Connect Wallet
      </Button>
      <Dialog open={open} onClose={setOpen} className="relative z-50">
        <div className="fixed inset-0 bg-black/40" aria-hidden="true" />
        <div className="fixed inset-0 flex items-center justify-center p-4">
          <Dialog.Panel className="w-full max-w-sm rounded-xl border bg-background p-4 shadow-xl">
            <Dialog.Title className="text-sm font-semibold">
              Connect wallet
            </Dialog.Title>
            <div className="mt-4 space-y-2">
              <Button
                className="w-full"
                variant="secondary"
                onClick={() => handleConnect("injected")}
                disabled={isPending}
              >
                Injected Wallet (MetaMask/Rabby)
              </Button>
              <Button
                className="w-full"
                variant="secondary"
                onClick={() => handleConnect("walletConnect")}
                disabled={isPending}
              >
                WalletConnect
              </Button>
            </div>
            <div className="mt-4 flex justify-end">
              <Button variant="ghost" onClick={() => setOpen(false)}>
                Close
              </Button>
            </div>
          </Dialog.Panel>
        </div>
      </Dialog>
    </>
  );
}

