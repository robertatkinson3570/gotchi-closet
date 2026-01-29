import { useState } from "react";
import { Link } from "react-router-dom";
import { Input } from "@/ui/input";
import { Button } from "@/ui/button";
import { ThemeToggle } from "@/components/layout/ThemeToggle";
import { Search, X, SlidersHorizontal, ArrowUpDown, Shirt, FlaskConical } from "lucide-react";
import type { DataMode, ExplorerSort } from "@/lib/explorer/types";
import { sortOptions } from "@/lib/explorer/sorts";
import { shortenAddress } from "@/lib/address";
import { ConnectButton } from "@/components/wallet/ConnectButton";

type Props = {
  mode: DataMode;
  onModeChange: (mode: DataMode) => void;
  search: string;
  onSearchChange: (s: string) => void;
  sort: ExplorerSort;
  onSortChange: (s: ExplorerSort) => void;
  filterCount: number;
  onOpenFilters: () => void;
  onOpenSort: () => void;
  connectedAddress?: string | null;
  isConnected?: boolean;
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
  filterCount,
  onOpenFilters,
  onOpenSort,
  connectedAddress,
  isConnected,
}: Props) {
  const [mobileSearchOpen, setMobileSearchOpen] = useState(false);

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
        <div className="flex items-center gap-2 overflow-x-auto pb-1 md:pb-0 scrollbar-none">
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

            <select
              value={`${sort.field}:${sort.direction}`}
              onChange={(e) => {
                const [field, dir] = e.target.value.split(":") as [string, "asc" | "desc"];
                onSortChange({ field: field as any, direction: dir });
              }}
              className="h-8 px-2 text-xs bg-background border rounded-md"
            >
              {sortOptions.map((opt) => (
                <option key={`${opt.value.field}:${opt.value.direction}`} value={`${opt.value.field}:${opt.value.direction}`}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>

          <div className="flex md:hidden items-center gap-1 ml-auto shrink-0">
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
            <Button
              variant="outline"
              size="icon"
              className="h-8 w-8 relative"
              onClick={onOpenFilters}
            >
              <SlidersHorizontal className="h-4 w-4" />
              {filterCount > 0 && (
                <span className="absolute -top-1 -right-1 bg-primary text-primary-foreground text-[10px] rounded-full h-4 w-4 flex items-center justify-center">
                  {filterCount}
                </span>
              )}
            </Button>
          </div>

          <Button
            variant="outline"
            size="sm"
            className="hidden md:flex gap-1 relative shrink-0"
            onClick={onOpenFilters}
          >
            <SlidersHorizontal className="h-4 w-4" />
            Filters
            {filterCount > 0 && (
              <span className="bg-primary text-primary-foreground text-[10px] rounded-full h-4 w-4 flex items-center justify-center ml-1">
                {filterCount}
              </span>
            )}
          </Button>
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
