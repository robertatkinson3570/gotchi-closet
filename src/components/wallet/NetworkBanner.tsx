import { Button } from "@/ui/button";
import { useAddressState } from "@/lib/addressState";
import { switchToBaseChain } from "@/lib/chains";
import { useToast } from "@/ui/use-toast";

export function NetworkBanner() {
  const { isConnected, isOnBase } = useAddressState();
  const { toast } = useToast();

  if (!isConnected || isOnBase) return null;

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
    <div className="w-full border-b bg-[hsl(var(--surface-2))] px-4 py-2 text-sm flex items-center justify-between gap-3">
      <span>Wrong network. Switch to Base to load your Gotchis.</span>
      <Button size="sm" onClick={handleSwitch}>
        Switch to Base
      </Button>
    </div>
  );
}

