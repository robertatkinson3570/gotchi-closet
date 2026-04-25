import { useEffect, useState } from "react";
import { useAccount } from "wagmi";
import { Search, X, User } from "lucide-react";

type Props = {
  windowDays: 30 | 60 | 90;
  onWindowChange: (d: 30 | 60 | 90) => void;
  addressFilter: string | null;
  onAddressFilterChange: (a: string | null) => void;
  presetAddresses?: { address: string; label: string }[];
};

const WINDOWS = [30, 60, 90] as const;

export function AnalyticsToolbar({
  windowDays,
  onWindowChange,
  addressFilter,
  onAddressFilterChange,
  presetAddresses = [],
}: Props) {
  const { address: connected } = useAccount();
  const [input, setInput] = useState(addressFilter ?? "");

  useEffect(() => {
    setInput(addressFilter ?? "");
  }, [addressFilter]);

  const apply = () => {
    const v = input.trim();
    if (!v) {
      onAddressFilterChange(null);
      return;
    }
    if (!/^0x[a-fA-F0-9]{40}$/.test(v)) return;
    onAddressFilterChange(v.toLowerCase());
  };

  const clear = () => {
    setInput("");
    onAddressFilterChange(null);
  };

  return (
    <div className="rounded-xl border border-border/40 bg-card/50 p-3 mb-4 flex flex-wrap items-center gap-2">
      <div className="flex items-center gap-1 rounded-md border border-border/40 bg-background/70 p-0.5">
        {WINDOWS.map((d) => (
          <button
            key={d}
            type="button"
            onClick={() => onWindowChange(d)}
            className={`px-3 py-1 text-xs font-medium rounded transition-colors ${
              windowDays === d
                ? "bg-primary/15 text-primary"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {d}d
          </button>
        ))}
      </div>

      <div className="flex-1 flex items-center gap-1.5 min-w-[260px]">
        <div className="relative flex-1">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && apply()}
            placeholder="Filter by address (lender or borrower)…"
            className="w-full h-9 pl-8 pr-2 rounded-md border border-border/40 bg-background/70 text-sm font-mono"
          />
        </div>
        <button
          type="button"
          onClick={apply}
          disabled={!input.trim() || !/^0x[a-fA-F0-9]{40}$/.test(input.trim())}
          className="h-9 px-3 rounded-md bg-primary text-primary-foreground text-xs font-semibold disabled:opacity-40 hover:bg-primary/90"
        >
          Apply
        </button>
        {addressFilter && (
          <button
            type="button"
            onClick={clear}
            className="h-9 w-9 inline-flex items-center justify-center rounded-md border border-border/40 bg-background/70 hover:bg-muted/50"
            title="Clear filter"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      <div className="flex items-center gap-1 flex-wrap">
        {connected && (
          <button
            type="button"
            onClick={() => onAddressFilterChange(connected.toLowerCase())}
            className="h-7 px-2 rounded text-[11px] font-medium border border-border/40 bg-background/70 hover:bg-muted/50 inline-flex items-center gap-1"
          >
            <User className="w-3 h-3" /> Me
          </button>
        )}
        {presetAddresses.slice(0, 5).map((p) => (
          <button
            key={p.address}
            type="button"
            onClick={() => onAddressFilterChange(p.address.toLowerCase())}
            className={`h-7 px-2 rounded text-[11px] font-medium border transition-colors ${
              addressFilter?.toLowerCase() === p.address.toLowerCase()
                ? "bg-primary/15 border-primary/40 text-primary"
                : "border-border/40 bg-background/70 hover:bg-muted/50"
            }`}
            title={p.address}
          >
            {p.label}
          </button>
        ))}
      </div>
    </div>
  );
}
