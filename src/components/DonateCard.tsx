import { Card } from "@/ui/card";
import { Button } from "@/ui/button";
import { Copy, Heart } from "lucide-react";
import { formatAddress } from "@/lib/format";
import { DONATION_ADDRESS } from "@/lib/constants";
import { useEffect, useState } from "react";

type DonateCardProps = {
  className?: string;
};

export function DonateCard({ className }: DonateCardProps) {
  const [copied, setCopied] = useState(false);
  const address = DONATION_ADDRESS;

  useEffect(() => {
    if (!copied) return;
    const timeout = setTimeout(() => setCopied(false), 1200);
    return () => clearTimeout(timeout);
  }, [copied]);

  const handleCopy = async () => {
    if (!address) return;
    try {
      await navigator.clipboard.writeText(address);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  };

  return (
    <Card
      className={`border border-[hsl(var(--border))] bg-[hsl(var(--surface))] p-4 shadow-[0_8px_24px_hsl(var(--shadow))] ${className || ""}`}
    >
      <div className="flex items-start gap-3">
        <div className="mt-0.5 rounded-full bg-[hsl(var(--surface-2))] p-2 text-[hsl(var(--muted))]">
          <Heart className="h-4 w-4" />
        </div>
        <div className="min-w-0 space-y-2">
          <div className="text-sm font-semibold">Support GotchiCloset</div>
          <p className="text-sm text-muted-foreground">
            GotchiCloset is free and built for the community. If this tool saves
            you time or helps with builds, feel free to toss a little support my
            way. Totally optional.
          </p>
          {address ? (
            <>
              <div className="flex items-center gap-2">
                <code className="text-xs rounded-md bg-[hsl(var(--surface-2))] px-2 py-1 text-[hsl(var(--text))]">
                  {formatAddress(address)}
                </code>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={handleCopy}
                  aria-label="Copy donation address"
                >
                  <Copy className="h-4 w-4" />
                </Button>
                {copied && (
                  <span className="text-xs text-muted-foreground">Copied</span>
                )}
              </div>
              <div className="text-xs text-muted-foreground">
                GHST / ETH / Base supported
              </div>
            </>
          ) : (
            <div className="text-xs text-muted-foreground">
              Donation address not configured.
            </div>
          )}
        </div>
      </div>
    </Card>
  );
}

