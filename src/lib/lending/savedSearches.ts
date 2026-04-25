import type { LendingFilters, LendingSort } from "./types";
import { defaultLendingFilters, defaultLendingSort } from "./types";

const KEY = "gc_lending_saved_searches";
const VERSION = 1;

export type SavedSearch = {
  id: string;
  name: string;
  filters: LendingFilters;
  sort: LendingSort;
  createdAt: number;
};

type Stored = {
  v: number;
  list: SavedSearch[];
};

export function loadSavedSearches(): SavedSearch[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return [];
    const data: Stored = JSON.parse(raw);
    if (data.v !== VERSION) return [];
    return Array.isArray(data.list) ? data.list : [];
  } catch {
    return [];
  }
}

function persist(list: SavedSearch[]) {
  if (typeof window === "undefined") return;
  const payload: Stored = { v: VERSION, list };
  window.localStorage.setItem(KEY, JSON.stringify(payload));
}

export function saveSearch(name: string, filters: LendingFilters, sort: LendingSort): SavedSearch[] {
  const list = loadSavedSearches();
  const id = `s_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
  const next: SavedSearch[] = [
    { id, name, filters, sort, createdAt: Date.now() },
    ...list,
  ].slice(0, 12);
  persist(next);
  return next;
}

export function deleteSearch(id: string): SavedSearch[] {
  const list = loadSavedSearches().filter((s) => s.id !== id);
  persist(list);
  return list;
}

// Compare against defaults to detect a "no-op" search
export function isDefaultSearch(filters: LendingFilters, sort: LendingSort): boolean {
  return (
    JSON.stringify(filters) === JSON.stringify(defaultLendingFilters) &&
    JSON.stringify(sort) === JSON.stringify(defaultLendingSort)
  );
}
