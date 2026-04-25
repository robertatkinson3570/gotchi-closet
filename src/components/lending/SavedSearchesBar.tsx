import { useState } from "react";
import { Star, X, Plus } from "lucide-react";
import {
  type SavedSearch,
  saveSearch,
  deleteSearch,
  loadSavedSearches,
  isDefaultSearch,
} from "@/lib/lending/savedSearches";
import type { LendingFilters, LendingSort } from "@/lib/lending/types";

type Props = {
  filters: LendingFilters;
  sort: LendingSort;
  onApply: (s: SavedSearch) => void;
};

export function SavedSearchesBar({ filters, sort, onApply }: Props) {
  const [list, setList] = useState<SavedSearch[]>(() => loadSavedSearches());
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");

  const canSave = !isDefaultSearch(filters, sort);

  const handleSave = () => {
    if (!name.trim()) return;
    const next = saveSearch(name.trim(), filters, sort);
    setList(next);
    setName("");
    setAdding(false);
  };

  const handleDelete = (id: string) => {
    setList(deleteSearch(id));
  };

  if (list.length === 0 && !adding && !canSave) return null;

  return (
    <div className="px-3 py-2 border-b border-border/30 flex items-center gap-1.5 overflow-x-auto bg-muted/10">
      <Star className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
      {list.map((s) => (
        <span
          key={s.id}
          className="inline-flex items-center gap-1 rounded-md border border-border/40 bg-background/70 hover:bg-muted/50 transition-colors"
        >
          <button
            type="button"
            onClick={() => onApply(s)}
            className="px-2 py-1 text-[11px] font-medium"
            title={`Saved on ${new Date(s.createdAt).toLocaleDateString()}`}
          >
            {s.name}
          </button>
          <button
            type="button"
            onClick={() => handleDelete(s.id)}
            className="px-1 text-muted-foreground hover:text-destructive"
            title="Delete saved search"
          >
            <X className="w-3 h-3" />
          </button>
        </span>
      ))}
      {canSave && !adding && (
        <button
          type="button"
          onClick={() => setAdding(true)}
          className="inline-flex items-center gap-1 px-2 h-7 rounded-md border border-dashed border-primary/40 text-primary text-[11px] font-medium hover:bg-primary/10"
        >
          <Plus className="w-3 h-3" /> Save current
        </button>
      )}
      {adding && (
        <span className="inline-flex items-center gap-1">
          <input
            type="text"
            value={name}
            autoFocus
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleSave();
              if (e.key === "Escape") {
                setAdding(false);
                setName("");
              }
            }}
            placeholder="Search name…"
            className="h-7 px-2 rounded border border-border/40 bg-background/70 text-[11px]"
          />
          <button
            type="button"
            onClick={handleSave}
            disabled={!name.trim()}
            className="h-7 px-2 rounded bg-primary text-primary-foreground text-[11px] font-semibold disabled:opacity-50"
          >
            Save
          </button>
          <button
            type="button"
            onClick={() => {
              setAdding(false);
              setName("");
            }}
            className="text-[11px] text-muted-foreground"
          >
            cancel
          </button>
        </span>
      )}
    </div>
  );
}
