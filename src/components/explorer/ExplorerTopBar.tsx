import { useState, useRef, useEffect } from "react";
import { Link } from "react-router-dom";
import { Input } from "@/ui/input";
import { Button } from "@/ui/button";
import { ThemeToggle } from "@/components/layout/ThemeToggle";
import { Search, X, ArrowUpDown, Shirt, FlaskConical, LayoutGrid, Users, ChevronDown, Check } from "lucide-react";
import type { DataMode, ExplorerSort } from "@/lib/explorer/types";
import { sortOptions, getSortLabel } from "@/lib/explorer/sorts";
import { shortenAddress } from "@/lib/address";
import { ConnectButton } from "@/components/wallet/ConnectButton";
import type { ViewMode } from "@/pages/ExplorerPage";

type Props = {
  mode: DataMode;
  onModeChange: (mode: DataMode) => void;
  search: string;
  onSearchChange: (s: string) => void;
  sort: ExplorerSort;
  onSortChange: (s: ExplorerSort) => void;
  onOpenSort: () => void;
  connectedAddress?: string | null;
  isConnected?: boolean;
  viewMode: ViewMode;
  onViewModeChange: (v: ViewMode) => void;
};

const modes: { value: DataMode; label: string }[] = [
  { value: "all", label: "All" },
  { value: "mine", label: "Owned" },
  { value: "baazaar", label: "Baazaar" },
];

export function ExplorerTopBar({
  mode,
  onModeChange,
  search,
  onSearchChange,
  sort,
  onSortChange,
  onOpenSort,
  connectedAddress,
  isConnected,
  viewMode,
  onViewModeChange,
}: Props) {
  const [mobileSearchOpen, setMobileSearchOpen] = useState(false);
  const [sortOpen, setSortOpen] = useState(false);
  const sortRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (sortRef.current && !sortRef.current.contains(e.target as Node)) {
        setSortOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const currentKey = `${sort.field}:${sort.direction}`;
  const sortLabel = getSortLabel(sort);
  
  const statsOptions = sortOptions.filter((o) => o.category === "stats");
  const traitOptions = sortOptions.filter((o) => o.category === "traits");
  const marketOptions = sortOptions.filter((o) => o.category === "market");

  return (
    <div className="sticky top-0 z-30 bg-background/95 backdrop-blur border-b">
      <div className="flex items-center justify-between px-4 h-12 border-b">
        <div className="flex items-center gap-1.5 min-w-0 shrink-0">
          <Link to="/" className="hover:opacity-80 transition-opacity">
            <img src="/logo.png" alt="GotchiCloset" className="h-12 w-12 object-contain -my-2" />
          </Link>
          <div className="text-lg font-semibold tracking-tight hidden sm:block">
            Gotchi<span className="font-normal text-muted-foreground">Closet</span>
          </div>
        </div>
        
        <div className="flex items-center gap-1 flex-1 justify-center min-w-0">
          {isConnected && connectedAddress && (
            <div className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-green-500/10 border border-green-500/30 text-[10px] text-green-600 dark:text-green-400">
              <span className="h-1.5 w-1.5 rounded-full bg-green-500" />
              <span className="hidden md:inline">Connected</span>
              {shortenAddress(connectedAddress)}
            </div>
          )}
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          <Link to="/dress">
            <Button size="sm" variant="ghost" className="h-8 px-2" title="Dress">
              <Shirt className="h-4 w-4" />
            </Button>
          </Link>
          <Link to="/wardrobe-lab">
            <Button size="sm" variant="ghost" className="h-8 px-2" title="Wardrobe Lab">
              <FlaskConical className="h-4 w-4" />
            </Button>
          </Link>
          {!isConnected && <ConnectButton />}
          <ThemeToggle />
        </div>
      </div>
      <div className="flex flex-col gap-2 p-2 md:p-3">
        <div className="flex items-center gap-2 overflow-x-auto md:overflow-visible pb-1 md:pb-0 scrollbar-none">
          <div className="flex border rounded-lg overflow-hidden shrink-0">
            {modes.map((m) => (
              <button
                key={m.value}
                onClick={() => onModeChange(m.value)}
                className={`px-3 py-1.5 text-xs font-medium transition-colors border-r last:border-r-0 ${
                  mode === m.value
                    ? "bg-primary text-primary-foreground"
                    : "bg-background text-muted-foreground hover:bg-muted hover:text-foreground"
                }`}
              >
                {m.label}
              </button>
            ))}
          </div>

          <div className="hidden md:flex items-center gap-2 flex-1">
            <div className="relative flex-1 max-w-xs">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                type="text"
                placeholder="Search name, ID, or address..."
                value={search}
                onChange={(e) => onSearchChange(e.target.value)}
                className="h-8 pl-8 text-sm"
              />
              {search && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="absolute right-1 top-1/2 -translate-y-1/2 h-6 w-6"
                  onClick={() => onSearchChange("")}
                >
                  <X className="h-3 w-3" />
                </Button>
              )}
            </div>

            <div ref={sortRef} className="relative">
              <button
                onClick={() => setSortOpen(!sortOpen)}
                className="h-8 px-3 text-xs bg-background border rounded-lg flex items-center gap-2 hover:bg-muted/50 transition-colors min-w-[140px] justify-between"
              >
                <span className="truncate">{sortLabel}</span>
                <ChevronDown className={`h-3.5 w-3.5 text-muted-foreground transition-transform ${sortOpen ? "rotate-180" : ""}`} />
              </button>
              
              {sortOpen && (
                <div className="absolute top-full mt-1 right-0 w-56 bg-background/95 backdrop-blur-lg border rounded-xl shadow-xl z-50 py-1 max-h-[70vh] overflow-y-auto">
                  <div className="px-2 py-1.5 text-[10px] uppercase tracking-wider text-muted-foreground font-medium">Stats</div>
                  {statsOptions.map((opt) => {
                    const key = `${opt.value.field}:${opt.value.direction}`;
                    const isActive = key === currentKey;
                    return (
                      <button
                        key={key}
                        onClick={() => { onSortChange(opt.value); setSortOpen(false); }}
                        className={`w-full flex items-center justify-between px-3 py-2 text-sm hover:bg-muted/50 transition-colors ${isActive ? "bg-primary/10 text-primary" : ""}`}
                      >
                        <span>{opt.label}</span>
                        {isActive && <Check className="h-3.5 w-3.5" />}
                      </button>
                    );
                  })}
                  
                  <div className="px-2 py-1.5 text-[10px] uppercase tracking-wider text-muted-foreground font-medium border-t mt-1 pt-2">Traits</div>
                  {traitOptions.map((opt) => {
                    const key = `${opt.value.field}:${opt.value.direction}`;
                    const isActive = key === currentKey;
                    return (
                      <button
                        key={key}
                        onClick={() => { onSortChange(opt.value); setSortOpen(false); }}
                        className={`w-full flex items-center justify-between px-3 py-2 text-sm hover:bg-muted/50 transition-colors ${isActive ? "bg-primary/10 text-primary" : ""}`}
                      >
                        <span>{opt.label}</span>
                        {isActive && <Check className="h-3.5 w-3.5" />}
                      </button>
                    );
                  })}
                  
                  <div className="px-2 py-1.5 text-[10px] uppercase tracking-wider text-muted-foreground font-medium border-t mt-1 pt-2">Market</div>
                  {marketOptions.map((opt) => {
                    const key = `${opt.value.field}:${opt.value.direction}`;
                    const isActive = key === currentKey;
                    return (
                      <button
                        key={key}
                        onClick={() => { onSortChange(opt.value); setSortOpen(false); }}
                        className={`w-full flex items-center justify-between px-3 py-2 text-sm hover:bg-muted/50 transition-colors ${isActive ? "bg-primary/10 text-primary" : ""}`}
                      >
                        <span>{opt.label}</span>
                        {isActive && <Check className="h-3.5 w-3.5" />}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            {mode === "mine" && (
              <div className="flex items-center border rounded overflow-hidden">
                <button
                  onClick={() => onViewModeChange("cards")}
                  className={`p-1.5 transition-colors ${viewMode === "cards" ? "bg-primary text-primary-foreground" : "hover:bg-muted text-muted-foreground"}`}
                  title="Cards view"
                >
                  <LayoutGrid className="h-4 w-4" />
                </button>
                <button
                  onClick={() => onViewModeChange("family")}
                  className={`p-1.5 transition-colors ${viewMode === "family" ? "bg-primary text-primary-foreground" : "hover:bg-muted text-muted-foreground"}`}
                  title="Family Photo"
                >
                  <Users className="h-4 w-4" />
                </button>
              </div>
            )}
          </div>

          <div className="flex md:hidden items-center gap-1 ml-auto shrink-0">
            {mode === "mine" && (
              <div className="flex items-center border rounded overflow-hidden">
                <button
                  onClick={() => onViewModeChange("cards")}
                  className={`p-1.5 transition-colors ${viewMode === "cards" ? "bg-primary text-primary-foreground" : "hover:bg-muted text-muted-foreground"}`}
                  title="Cards"
                >
                  <LayoutGrid className="h-4 w-4" />
                </button>
                <button
                  onClick={() => onViewModeChange("family")}
                  className={`p-1.5 transition-colors ${viewMode === "family" ? "bg-primary text-primary-foreground" : "hover:bg-muted text-muted-foreground"}`}
                  title="Family Photo"
                >
                  <Users className="h-4 w-4" />
                </button>
              </div>
            )}
            <Button
              variant="outline"
              size="icon"
              className="h-8 w-8"
              onClick={() => setMobileSearchOpen(!mobileSearchOpen)}
            >
              <Search className="h-4 w-4" />
            </Button>
            <Button
              variant="outline"
              size="icon"
              className="h-8 w-8"
              onClick={onOpenSort}
            >
              <ArrowUpDown className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {mobileSearchOpen && (
          <div className="md:hidden relative">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              type="text"
              placeholder="Search name, ID, or address..."
              value={search}
              onChange={(e) => onSearchChange(e.target.value)}
              className="h-9 pl-8 pr-8 text-sm"
              autoFocus
            />
            {search && (
              <Button
                variant="ghost"
                size="icon"
                className="absolute right-1 top-1/2 -translate-y-1/2 h-7 w-7"
                onClick={() => onSearchChange("")}
              >
                <X className="h-4 w-4" />
              </Button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
