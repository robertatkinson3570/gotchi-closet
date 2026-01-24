import { useEffect, useState } from "react";
import { Button } from "@/ui/button";
import { Input } from "@/ui/input";
import { useAddressState } from "@/lib/addressState";
import { isValidAddress } from "@/lib/address";
import { formatAddress } from "@/lib/format";
import { useQueryClient } from "@tanstack/react-query";

export function ActiveAddressBar() {
  const {
    activeAddress,
    connectedAddress,
    isConnected,
    setManualAddress,
    useConnectedAddress,
  } = useAddressState();
  const queryClient = useQueryClient();
  const [input, setInput] = useState(activeAddress || "");
  const [error, setError] = useState("");

  useEffect(() => {
    setInput(activeAddress || "");
  }, [activeAddress]);

  const handleView = () => {
    if (!isValidAddress(input)) {
      setError("Enter a valid Ethereum address");
      return;
    }
    setError("");
    setManualAddress(input);
    queryClient.cancelQueries({ queryKey: ["gotchis"] });
  };

  const handleUseConnected = () => {
    if (!connectedAddress) return;
    setError("");
    useConnectedAddress();
    queryClient.cancelQueries({ queryKey: ["gotchis"] });
  };

  return (
    <div className="w-full border-b bg-background px-4 py-3">
      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-medium">Viewing Wallet</span>
          <Input
            value={input}
            onChange={(event) => {
              setInput(event.target.value);
              if (error) setError("");
            }}
            placeholder="0x..."
            className="h-9 max-w-[360px]"
            data-testid="viewing-wallet-input"
          />
          <Button size="sm" onClick={handleView} data-testid="viewing-wallet-view-btn">
            View
          </Button>
          <Button
            size="sm"
            variant="secondary"
            onClick={handleUseConnected}
            disabled={!isConnected}
            data-testid="use-connected-btn"
          >
            Use Connected
          </Button>
        </div>
        <div className="text-xs text-muted-foreground" data-testid="active-address">
          {activeAddress}
        </div>
        {error ? (
          <div className="text-xs text-red-500">{error}</div>
        ) : isConnected && connectedAddress ? (
          <div className="text-xs text-muted-foreground">
            Connected wallet: {formatAddress(connectedAddress)} (you can view any
            wallet)
          </div>
        ) : null}
      </div>
    </div>
  );
}

