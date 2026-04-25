import { Link } from "react-router-dom";
import type { LendingSort, Lending } from "@/lib/lending/types";
import { Search, ArrowUpDown, ArrowUp, ArrowDown, BarChart3, User, Download } from "lucide-react";
import { activeLendingsToCsv, downloadCsv } from "@/lib/lending/csvExport";

type Props = {
  search: string;
  onSearchChange: (v: string) => void;
  sort: LendingSort;
  onSortChange: (s: LendingSort) => void;
  count: number;
  total: number;
  visibleLendings?: Lending[];
};

const SORT_FIELDS: { value: LendingSort["field"]; label: string }[] = [
  { value: "newest", label: "Newest" },
  { value: "price", label: "Price" },
  { value: "brs", label: "BRS" },
  { value: "duration", label: "Duration" },
  { value: "level", label: "Level" },
  { value: "kinship", label: "Kinship" },
];

export function LendingTopBar({
  search,
  onSearchChange,
  sort,
  onSortChange,
  count,
  total,
  visibleLendings,
}: Props) {
  const flipDir = () =>
    onSortChange({ ...sort, direction: sort.direction === "asc" ? "desc" : "asc" });

  const exportCsv = () => {
    if (!visibleLendings || visibleLendings.length === 0) return;
    const csv = activeLendingsToCsv(visibleLendings);
    const ts = new Date().toISOString().slice(0, 10);
    downloadCsv(`gotchicloset-lendings-${ts}.csv`, csv);
  };

  return (
    <div className="border-b border-border/30">
      <div className="flex items-center gap-2 px-3 py-2">
        <div className="hidden sm:flex items-center gap-1 text-[11px] text-muted-foreground shrink-0">
          <span className="font-medium text-foreground">Lending</span>
          <span className="text-muted-foreground/50">·</span>
          <span>
            {count.toLocaleString()} of {total.toLocaleString()} listings
          </span>
        </div>

        <div className="flex-1 flex items-center gap-2 max-w-2xl mx-auto">
          <div className="relative flex-1">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
            <input
              type="text"
              value={search}
              onChange={(e) => onSearchChange(e.target.value)}
              placeholder="Search by gotchi #, name, or 0x address…"
              className="w-full h-9 pl-8 pr-3 rounded-md border border-border/40 bg-background/70 text-sm placeholder:text-muted-foreground/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
              data-testid="lending-search"
            />
          </div>
        </div>

        {visibleLendings && visibleLendings.length > 0 && (
          <button
            type="button"
            onClick={exportCsv}
            className="hidden sm:inline-flex items-center gap-1 px-2 h-9 rounded-md border border-border/40 bg-background/70 hover:bg-muted/50 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors shrink-0"
            title="Export current view as CSV"
          >
            <Download className="w-3.5 h-3.5" />
            CSV
          </button>
        )}

        <Link
          to="/lending/me"
          className="hidden sm:inline-flex items-center gap-1 px-2 h-9 rounded-md border border-border/40 bg-background/70 hover:bg-muted/50 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors shrink-0"
          title="My lendings"
        >
          <User className="w-3.5 h-3.5" />
          Mine
        </Link>

        <Link
          to="/lending/analytics"
          className="hidden sm:inline-flex items-center gap-1 px-2 h-9 rounded-md border border-border/40 bg-background/70 hover:bg-muted/50 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors shrink-0"
          title="Lending analytics"
        >
          <BarChart3 className="w-3.5 h-3.5" />
          Analytics
        </Link>

        <div className="flex items-center gap-1 shrink-0">
          <ArrowUpDown className="w-3.5 h-3.5 text-muted-foreground" />
          <select
            value={sort.field}
            onChange={(e) =>
              onSortChange({ ...sort, field: e.target.value as LendingSort["field"] })
            }
            className="h-9 px-2 rounded-md border border-border/40 bg-background/70 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
            data-testid="lending-sort-field"
          >
            {SORT_FIELDS.map((f) => (
              <option key={f.value} value={f.value}>
                {f.label}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={flipDir}
            className="h-9 w-9 inline-flex items-center justify-center rounded-md border border-border/40 bg-background/70 hover:bg-muted/50 transition-colors"
            title={sort.direction === "asc" ? "Ascending" : "Descending"}
            data-testid="lending-sort-dir"
          >
            {sort.direction === "asc" ? (
              <ArrowUp className="w-3.5 h-3.5" />
            ) : (
              <ArrowDown className="w-3.5 h-3.5" />
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
