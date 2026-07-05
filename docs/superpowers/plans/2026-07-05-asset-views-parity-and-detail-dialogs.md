# Asset Views Parity + Unified Detail Dialogs — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the Explorer's Collection / Owned / Baazaar / Auction asset views consistent — shared detail dialogs with prev/next + deep-linkable URLs, full-parity owned cards (name, list price, edit/cancel, auction), richer gotchi details (Spirit Points et al.), no UI em-dashes — and fix the intermittent stale-chunk dynamic-import error.

**Architecture:** Introduce two reusable primitives (`useDetailNav` hook + `DetailDialogShell` component) and migrate the five existing bespoke detail modals onto them. Then enrich `OwnedMarketGrid` with the connected wallet's listings (price/edit/cancel/auction) and extend the gotchi detail body. Em-dash cleanup and the chunk-error fix are standalone passes.

**Tech Stack:** React 18 + TypeScript, react-router-dom (`useSearchParams`), @tanstack/react-query, wagmi/viem, Vite, Vitest, Tailwind.

**Spec:** `docs/superpowers/specs/2026-07-05-asset-views-parity-and-detail-dialogs-design.md`

---

## File Structure

**New files:**
- `src/components/explorer/detail/useDetailNav.ts` — nav + URL-sync hook.
- `src/components/explorer/detail/useDetailNav.test.ts` — hook unit tests.
- `src/components/explorer/detail/DetailDialogShell.tsx` — shared modal chrome (header, prev/next, copy-link, close, keyboard).
- `src/components/explorer/detail/ownedListings.ts` — build the connected wallet's `listedMap` from subgraph; unit-tested pure transform + a fetcher.
- `src/components/explorer/detail/ownedListings.test.ts` — transform unit tests.

**Modified files:**
- `src/components/explorer/AuctionGrid.tsx`, `MarketGrid.tsx`, `WearableExplorerGrid.tsx`, `WearableDetailModal.tsx`, `OwnedMarketGrid.tsx`, `GotchiActionsPanel.tsx` — dialog migrations + parity.
- `src/pages/ExplorerPage.tsx` — pass ordered lists / nav wiring.
- `src/components/lending/ParcelDetailModal.tsx` — shell header controls.
- `src/main.tsx` (or router setup) + a small `src/lib/lazyWithRetry.ts` — chunk-error fix.
- Various `src/**/*.tsx` — Phase 1 em-dash string replacements.

---

## Phase 0 — Fix intermittent stale-chunk dynamic-import error

Symptom: `Failed to fetch dynamically imported module: .../assets/<Page>-<hash>.js`, intermittent, across pages. Cause: after a redeploy, a browser still running the old `index.html` requests old chunk hashes that no longer exist (Vite code-splits routes via `React.lazy(() => import(...))`). Fix: reload once on Vite's `preloadError`, and retry lazy imports with a one-shot hard reload.

### Task 0: Chunk-error recovery

**Files:**
- Create: `src/lib/lazyWithRetry.ts`
- Modify: `src/main.tsx` (or wherever the app mounts / router is created); the route lazy-imports (likely `src/app/router.tsx`).

- [ ] **Step 1: Add a global preload-error reload guard**

In `src/main.tsx`, before `ReactDOM.createRoot(...)`:
```ts
// A redeploy invalidates old code-split chunk hashes; a client on the previous
// index will 404 on import(). Reload once (guarded) to fetch the new index.
window.addEventListener("vite:preloadError", (e) => {
  e.preventDefault();
  const KEY = "gc-chunk-reload";
  if (sessionStorage.getItem(KEY)) return; // already tried this session
  sessionStorage.setItem(KEY, "1");
  window.location.reload();
});
```

- [ ] **Step 2: Add a retrying lazy wrapper**

```ts
// src/lib/lazyWithRetry.ts
import { lazy, type ComponentType } from "react";

// Retries a dynamic import once after a hard reload if the chunk 404s
// (stale hash after deploy). Session-guarded so it can't loop.
export function lazyWithRetry<T extends ComponentType<any>>(factory: () => Promise<{ default: T }>) {
  return lazy(async () => {
    try {
      return await factory();
    } catch (err) {
      const KEY = "gc-chunk-reload";
      if (!sessionStorage.getItem(KEY)) {
        sessionStorage.setItem(KEY, "1");
        window.location.reload();
        // Return a never-resolving promise; the reload takes over.
        return await new Promise<{ default: T }>(() => {});
      }
      throw err;
    }
  });
}
```

- [ ] **Step 3: Use it for route imports**

In the router file, replace `lazy(() => import("../pages/LandManagementPage"))` (and the other `lazy(() => import(...))` route defs) with `lazyWithRetry(() => import("../pages/LandManagementPage"))`. Import `lazyWithRetry` from `@/lib/lazyWithRetry`.

- [ ] **Step 4: Clear the guard on successful load**

In `src/main.tsx`, after the app has mounted, clear the one-shot so future deploys can retry again:
```ts
window.addEventListener("load", () => sessionStorage.removeItem("gc-chunk-reload"));
```

- [ ] **Step 5: Build + manual verify**

Run: `npm run build 2>&1 | tail -5` (success). Manual: `npm run dev`, navigate between lazy routes — no regression. (Full stale-chunk repro needs a redeploy; the guard is defensive.)

- [ ] **Step 6: Commit**

```bash
git add src/lib/lazyWithRetry.ts src/main.tsx src/app/router.tsx
git commit -m "fix(app): recover from stale code-split chunk errors after deploy"
```

---

## Phase 1 — Em-dash cleanup (req 1)

### Task 1: Inventory UI-visible em-dashes

**Files:** none (analysis).

- [ ] **Step 1: List candidate render strings**

Run:
```bash
cd /c/Cursor/gotchi-closet
grep -rnP '\xE2\x80\x94' src --include='*.tsx'
```
(`\xE2\x80\x94` = UTF-8 em-dash.)

- [ ] **Step 2: Classify each hit**

For every match decide: inside a **code comment** (`//`, `/* */`, JSDoc) or a **`*.test.tsx`** file? -> SKIP (not user-visible). Otherwise it renders (JSX text, `placeholder=`, `title=`, `alt=`, `aria-label=`, toast strings, `<option>` labels) -> REPLACE in Task 2.

### Task 2: Replace UI-visible em-dashes

**Files:** each `.tsx` identified in Task 1 (render strings only).

- [ ] **Step 1: Apply context-appropriate replacements (per site, via Edit — never blanket sed)**

- Empty-value placeholder standing alone (`>—<`, `?? "—"`) -> `None` (or `-` when a 1-char cell).
- Inline separator ` — ` between two values -> ` · ` (the app already uses `·`).
- Sentence dash inside a paragraph -> comma / colon / parenthesis.

Confirmed sites (Task 1 finds the rest):
- `MarketGrid.tsx:505` `Dist {…} — · {…}` + `PARCEL_SIZES[...] ?? "—"` -> `Dist {…} · {…}`, fallback `None`.
- `WearableDetailModal.tsx:31` `slotLabel … : "—"` -> `"None"`; `:58` trait `"—"` -> `"None"`.
- `AuctionGrid.tsx:683` empty-address `—` -> `None`.
- `GotchiInfoOverlay.tsx:34` `formatTraitMods` `"—"` -> `"None"`.

Example:
```
// MarketGrid.tsx — before
Dist {parcelMeta[l.tokenId].district || "—"} · {PARCEL_SIZES[parcelMeta[l.tokenId].size] ?? "—"}
// after
Dist {parcelMeta[l.tokenId].district || "None"} · {PARCEL_SIZES[parcelMeta[l.tokenId].size] ?? "None"}
```

- [ ] **Step 2: Verify no rendered em-dashes remain**

Run:
```bash
grep -rnP '\xE2\x80\x94' src --include='*.tsx' | grep -vi '\.test\.'
```
Manually confirm each remaining hit is a comment. Zero render-string hits.

- [ ] **Step 3: Build**

Run: `npm run build 2>&1 | tail -20` — success.

- [ ] **Step 4: Commit**

```bash
git add -A src
git commit -m "fix(ui): replace em-dashes in visible strings with context-appropriate punctuation"
```

---

## Phase 2 — Dialog shell + prev/next + deep-linking (reqs 2, 6)

### Task 3: `useDetailNav` hook (TDD)

**Files:**
- Create: `src/components/explorer/detail/useDetailNav.ts`
- Test: `src/components/explorer/detail/useDetailNav.test.ts`

- [ ] **Step 1: Write failing tests**

```ts
// src/components/explorer/detail/useDetailNav.test.ts
import { describe, it, expect } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import type { ReactNode } from "react";
import { useDetailNav } from "./useDetailNav";

type Row = { id: string };
const rows: Row[] = [{ id: "a" }, { id: "b" }, { id: "c" }];
const wrapper = (initial: string) =>
  ({ children }: { children: ReactNode }) =>
    <MemoryRouter initialEntries={[initial]}>{children}</MemoryRouter>;
const opts = (items: Row[]) => ({ items, getId: (r: Row) => r.id, asset: "wearable" });

describe("useDetailNav", () => {
  it("opens an item and reports index + bounds", () => {
    const { result } = renderHook(() => useDetailNav(opts(rows)), { wrapper: wrapper("/explorer") });
    act(() => result.current.openItem(rows[1]));
    expect(result.current.open?.id).toBe("b");
    expect(result.current.index).toBe(1);
    expect(result.current.hasPrev).toBe(true);
    expect(result.current.hasNext).toBe(true);
  });
  it("clamps at ends (no wrap)", () => {
    const { result } = renderHook(() => useDetailNav(opts(rows)), { wrapper: wrapper("/explorer") });
    act(() => result.current.openItem(rows[0]));
    expect(result.current.hasPrev).toBe(false);
    act(() => result.current.prev());
    expect(result.current.open?.id).toBe("a");
    act(() => result.current.next());
    expect(result.current.open?.id).toBe("b");
  });
  it("close() clears open state", () => {
    const { result } = renderHook(() => useDetailNav(opts(rows)), { wrapper: wrapper("/explorer") });
    act(() => result.current.openItem(rows[0]));
    act(() => result.current.close());
    expect(result.current.open).toBeNull();
  });
  it("auto-opens from URL params when the id is present", () => {
    const { result } = renderHook(() => useDetailNav(opts(rows)), { wrapper: wrapper("/explorer?asset=wearable&id=c") });
    expect(result.current.open?.id).toBe("c");
    expect(result.current.index).toBe(2);
  });
  it("ignores URL params for a different asset", () => {
    const { result } = renderHook(() => useDetailNav(opts(rows)), { wrapper: wrapper("/explorer?asset=gotchi&id=c") });
    expect(result.current.open).toBeNull();
  });
});
```

- [ ] **Step 2: Run — verify fail**

Run: `npx vitest run src/components/explorer/detail/useDetailNav.test.ts` — FAIL (module not found).

- [ ] **Step 3: Implement**

```ts
// src/components/explorer/detail/useDetailNav.ts
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";

export type DetailNavOptions<T> = {
  items: T[];
  getId: (item: T) => string;
  asset: string;
  urlSync?: boolean;
  onNeedMore?: () => void;
  hasMore?: boolean;
};
export type DetailNav<T> = {
  open: T | null; index: number;
  openItem: (item: T) => void; close: () => void;
  next: () => void; prev: () => void;
  hasNext: boolean; hasPrev: boolean; shareUrl: string | null;
};

export function useDetailNav<T>({ items, getId, asset, urlSync = true, onNeedMore, hasMore = false }: DetailNavOptions<T>): DetailNav<T> {
  const [params, setParams] = useSearchParams();
  const [openId, setOpenId] = useState<string | null>(null);

  const adopted = useRef(false);
  useEffect(() => {
    if (adopted.current || !urlSync) return;
    if (params.get("asset") !== asset) return;
    const id = params.get("id");
    if (id && items.some((it) => getId(it) === id)) { adopted.current = true; setOpenId(id); }
  }, [params, asset, items, getId, urlSync]);

  const index = useMemo(() => (openId == null ? -1 : items.findIndex((it) => getId(it) === openId)), [openId, items, getId]);
  const open = index >= 0 ? items[index] : null;

  const writeUrl = useCallback((id: string | null) => {
    if (!urlSync) return;
    const next = new URLSearchParams(params);
    if (id == null) { next.delete("asset"); next.delete("id"); }
    else { next.set("asset", asset); next.set("id", id); }
    setParams(next, { replace: true });
  }, [params, setParams, asset, urlSync]);

  const openItem = useCallback((item: T) => { const id = getId(item); setOpenId(id); writeUrl(id); }, [getId, writeUrl]);
  const close = useCallback(() => { setOpenId(null); writeUrl(null); }, [writeUrl]);

  const go = useCallback((delta: number) => {
    if (index < 0) return;
    const ni = index + delta;
    if (ni < 0 || ni >= items.length) return;
    const id = getId(items[ni]);
    setOpenId(id); writeUrl(id);
    if (delta > 0 && ni === items.length - 1 && hasMore) onNeedMore?.();
  }, [index, items, getId, writeUrl, hasMore, onNeedMore]);

  return {
    open, index, openItem, close,
    next: () => go(1), prev: () => go(-1),
    hasNext: index >= 0 && index < items.length - 1,
    hasPrev: index > 0,
    shareUrl: open ? `?asset=${asset}&id=${getId(open)}` : null,
  };
}
```

- [ ] **Step 4: Run — verify pass**

Run: `npx vitest run src/components/explorer/detail/useDetailNav.test.ts` — PASS (5). If `renderHook` from `@testing-library/react` isn't available, check `package.json` devDeps and use the project's existing hook-test utility.

- [ ] **Step 5: Commit**

```bash
git add src/components/explorer/detail/useDetailNav.ts src/components/explorer/detail/useDetailNav.test.ts
git commit -m "feat(explorer): add useDetailNav hook for dialog prev/next + URL deep-linking"
```

### Task 4: `DetailDialogShell` component

**Files:** Create `src/components/explorer/detail/DetailDialogShell.tsx`

- [ ] **Step 1: Implement**

```tsx
// src/components/explorer/detail/DetailDialogShell.tsx
import { useEffect, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { X, ChevronLeft, ChevronRight, Link2, Check } from "lucide-react";

export function DetailDialogShell({
  title, onClose, onPrev, onNext, hasPrev, hasNext, shareUrl, widthClass = "w-[min(480px,96vw)]", children,
}: {
  title: ReactNode; onClose: () => void;
  onPrev?: () => void; onNext?: () => void; hasPrev?: boolean; hasNext?: boolean;
  shareUrl?: string | null; widthClass?: string; children: ReactNode;
}) {
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = document.activeElement as HTMLElement | null;
      const typing = el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.tagName === "SELECT" || el.isContentEditable);
      if (typing) return;
      if (e.key === "Escape") onClose();
      else if (e.key === "ArrowLeft" && hasPrev && onPrev) onPrev();
      else if (e.key === "ArrowRight" && hasNext && onNext) onNext();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, onPrev, onNext, hasPrev, hasNext]);

  const copyLink = async () => {
    if (!shareUrl) return;
    try { await navigator.clipboard.writeText(location.origin + location.pathname + shareUrl); setCopied(true); setTimeout(() => setCopied(false), 1500); } catch { /* blocked */ }
  };

  return createPortal(
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/70 backdrop-blur-sm p-3" onClick={onClose}>
      <div className={`${widthClass} max-h-[92vh] overflow-y-auto rounded-2xl border border-white/10 bg-background shadow-2xl ring-1 ring-primary/10`} onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-2 px-4 py-3 border-b border-border/60 sticky top-0 bg-background z-10">
          <div className="text-base font-bold truncate flex-1 min-w-0">{title}</div>
          {shareUrl && (
            <button onClick={copyLink} title="Copy link to this item" className="p-1.5 rounded hover:bg-muted/50 shrink-0">
              {copied ? <Check className="w-4 h-4 text-emerald-500" /> : <Link2 className="w-4 h-4" />}
            </button>
          )}
          {(onPrev || onNext) && (
            <div className="flex items-center shrink-0">
              <button onClick={onPrev} disabled={!hasPrev} title="Previous (left arrow)" className="p-1.5 rounded hover:bg-muted/50 disabled:opacity-30 disabled:cursor-default"><ChevronLeft className="w-5 h-5" /></button>
              <button onClick={onNext} disabled={!hasNext} title="Next (right arrow)" className="p-1.5 rounded hover:bg-muted/50 disabled:opacity-30 disabled:cursor-default"><ChevronRight className="w-5 h-5" /></button>
            </div>
          )}
          <button onClick={onClose} title="Close (Esc)" className="p-1.5 rounded hover:bg-muted/50 shrink-0"><X className="w-5 h-5" /></button>
        </div>
        <div className="p-4 space-y-3">{children}</div>
      </div>
    </div>,
    document.body
  );
}
```

- [ ] **Step 2: Typecheck + commit**

Run: `npx tsc --noEmit 2>&1 | grep -i detaildialog || echo OK` — `OK`.
```bash
git add src/components/explorer/detail/DetailDialogShell.tsx
git commit -m "feat(explorer): add DetailDialogShell (shared chrome, prev/next, copy-link, keyboard)"
```

### Task 5: Migrate AuctionDetailModal onto shell + nav

**Files:** Modify `src/components/explorer/AuctionGrid.tsx`.

- [ ] **Step 1: Wire nav** — after `rows` is computed:
```tsx
import { useDetailNav } from "./detail/useDetailNav";
import { DetailDialogShell } from "./detail/DetailDialogShell";
const nav = useDetailNav({ items: rows, getId: (a) => a.id, asset: "auction" });
```
Replace `detail`/`setDetail`: delete the `useState`; card `onClick={() => { setDetail(a); setBidValue(""); }}` -> `onClick={() => { nav.openItem(a); setBidValue(""); }}`; `const live = detail ? … : null;` -> `const live = nav.open;`; `buyItNow`'s `setDetail(null)` -> `nav.close()`.

- [ ] **Step 2: Shell in `AuctionDetailModal`** — add props `onPrev?/onNext?/hasPrev?/hasNext?/shareUrl?` and replace its outer `fixed inset-0 …` + header with:
```tsx
return (
  <DetailDialogShell title={<>{meta?.name ?? assetLabel(a)} #{a.tokenId} · Auction</>} onClose={onClose}
    onPrev={onPrev} onNext={onNext} hasPrev={hasPrev} hasNext={hasNext} shareUrl={shareUrl} widthClass="w-[min(560px,96vw)]">
    {/* existing body */}
  </DetailDialogShell>
);
```
Render site passes `onClose={() => nav.close()} onPrev={nav.prev} onNext={nav.next} hasPrev={nav.hasPrev} hasNext={nav.hasNext} shareUrl={nav.shareUrl}`.

- [ ] **Step 3: Manual verify** — Auctions: open card, ‹/› + arrow keys page (not while typing a bid), copy-link `?asset=auction&id=…` reopens in a fresh tab.

- [ ] **Step 4: Commit**
```bash
git add src/components/explorer/AuctionGrid.tsx
git commit -m "feat(explorer): auction dialog uses shared shell with prev/next + deep-link"
```

### Task 6: Migrate MarketGrid detail onto shell + nav

**Files:** Modify `src/components/explorer/MarketGrid.tsx`.

- [ ] **Step 1: Wire nav** — after `rows`:
```tsx
import { useDetailNav } from "./detail/useDetailNav";
import { DetailDialogShell } from "./detail/DetailDialogShell";
const nav = useDetailNav({ items: rows, getId: (l) => l.tokenId, asset: itemKind });
const detail = nav.open; // minimal-churn alias
```
Card image `onClick={() => setDetail(l)}` -> `onClick={() => nav.openItem(l)}` (both the div and the portal button). Replace `setDetail(null)` -> `nav.close()`; guards `detail && …` already read the alias.

- [ ] **Step 2: Shell for the non-parcel modal** — replace its `fixed inset-0 …` wrapper + header with `DetailDialogShell` (title unchanged; `onClose={() => nav.close()}`, nav props, `shareUrl={nav.shareUrl}`), keeping the body.

- [ ] **Step 3: Parcel branch** — keep `ParcelDetailModal`, set `onClose={() => nav.close()}` (paging handled in Task 8).

- [ ] **Step 4: Manual verify + em-dash confirm** — Baazaar -> Items: prev/next across listings; copy-link `?asset=item&id=…`; `Dist … · …` shows no em-dash.

- [ ] **Step 5: Commit**
```bash
git add src/components/explorer/MarketGrid.tsx
git commit -m "feat(explorer): baazaar detail uses shared shell with prev/next + deep-link"
```

### Task 7: Migrate WearableDetailModal onto shell + nav

**Files:** Modify `WearableExplorerGrid.tsx`, `WearableDetailModal.tsx`.

- [ ] **Step 1: Nav in grid**
```tsx
import { useDetailNav } from "./detail/useDetailNav";
const nav = useDetailNav({ items: wearables, getId: (w) => String(w.id), asset: "wearable", hasMore, onNeedMore: loadMore });
```
Card `onClick={() => { onCardClick?.(wearable); nav.openItem(wearable); }}`. Modal:
```tsx
{nav.open && <WearableDetailModal wearable={nav.open} listing={baazaarPrices[nav.open.id]} onClose={() => nav.close()} onPrev={nav.prev} onNext={nav.next} hasPrev={nav.hasPrev} hasNext={nav.hasNext} shareUrl={nav.shareUrl} />}
```

- [ ] **Step 2: Shell in modal** — add nav/share props; replace `createPortal(<div className="fixed inset-0 …"> … </div>, document.body)` with `DetailDialogShell` (title `{wearable.name} #{wearable.id}`, `widthClass="w-[min(460px,96vw)]"`), keeping the body. Drop unused `createPortal`/`X` imports.

- [ ] **Step 3: Manual verify** — Baazaar -> Wearables: prev/next pages (triggers loadMore near the end); copy-link reopens.

- [ ] **Step 4: Commit**
```bash
git add src/components/explorer/WearableExplorerGrid.tsx src/components/explorer/WearableDetailModal.tsx
git commit -m "feat(explorer): wearable dialog uses shared shell with prev/next + deep-link"
```

### Task 8: ParcelDetailModal callers + Gotchi modal onto shell + nav

**Files:** Modify `GotchiActionsPanel.tsx`, `ExplorerPage.tsx`, `ParcelDetailModal.tsx` (read first).

- [ ] **Step 1: Read `ParcelDetailModal.tsx`** to learn its header. Add optional `onPrev/onNext/hasPrev/hasNext/shareUrl` props and render the same prev/next + copy-link buttons in its existing header row (mirror `DetailDialogShell`'s header). Minimal — don't restructure.

- [ ] **Step 2: Gotchi nav in `ExplorerPage`** — add:
```tsx
import { useDetailNav } from "@/components/explorer/detail/useDetailNav";
const gotchiNav = useDetailNav({ items: filteredGotchisBySearch, getId: (g) => g.tokenId, asset: "gotchi", hasMore: gotchiHasMore, onNeedMore: gotchiLoadMore });
```
Extract a `toManage(g, mode)` helper from the existing `onManage` mapping (returns a `ManageGotchi`). Card `onManage` -> `setManage(toManage(g, mode)); gotchiNav.openItem(g);`. Add an effect: when `gotchiNav.open` changes while `manage` is set, `setManage(toManage(gotchiNav.open, mode))`. `GotchiManageModal onClose` -> `setManage(null); gotchiNav.close();`. Pass `onPrev={gotchiNav.prev} onNext={gotchiNav.next} hasPrev={gotchiNav.hasPrev} hasNext={gotchiNav.hasNext} shareUrl={gotchiNav.shareUrl}`.

- [ ] **Step 3: Shell in `GotchiManageModal`** — add nav/share props; wrap the modal body in `DetailDialogShell` (title = name + `#id`, `widthClass="w-[min(560px,96vw)]"`), keeping tabs/actions as the body.

- [ ] **Step 4: Manual verify** — Explorer -> Gotchis: Details prev/next pages gotchis (loads more near end); copy-link `?asset=gotchi&id=…` reopens. Owned + Baazaar scopes too.

- [ ] **Step 5: Commit**
```bash
git add src/components/explorer/GotchiActionsPanel.tsx src/pages/ExplorerPage.tsx src/components/lending/ParcelDetailModal.tsx
git commit -m "feat(explorer): gotchi + parcel dialogs use shared shell nav + deep-link"
```

---

## Phase 3 — Owned-view parity (reqs 3, 4, 5, 7)

### Task 9: Owned listings transform + fetcher (TDD)

**Files:** Create `src/components/explorer/detail/ownedListings.ts` + `.test.ts`

- [ ] **Step 1: Failing test**
```ts
// src/components/explorer/detail/ownedListings.test.ts
import { describe, it, expect } from "vitest";
import { buildListedMap } from "./ownedListings";
describe("buildListedMap", () => {
  it("indexes erc721 + erc1155 rows by tokenId, first active wins", () => {
    const map = buildListedMap(
      [{ id: "L1", tokenId: "5", priceInWei: "1000000000000000000" }],
      [{ id: "L2", erc1155TypeId: "42", priceInWei: "2000000000000000000" }, { id: "L3", erc1155TypeId: "42", priceInWei: "3000000000000000000" }],
    );
    expect(map["5"]).toEqual({ listingId: "L1", priceWei: "1000000000000000000" });
    expect(map["42"]).toEqual({ listingId: "L2", priceWei: "2000000000000000000" });
  });
  it("empty in, empty out", () => { expect(buildListedMap([], [])).toEqual({}); });
});
```

- [ ] **Step 2: Run — fail.** `npx vitest run src/components/explorer/detail/ownedListings.test.ts`

- [ ] **Step 3: Implement**
```ts
// src/components/explorer/detail/ownedListings.ts
import { CORE_SUBGRAPH, coreSubgraphFetch } from "@/lib/subgraph";
export type OwnedListing = { listingId: string; priceWei: string };
export type ListedMap = Record<string, OwnedListing>;
type Erc721Row = { id: string; tokenId: string; priceInWei: string };
type Erc1155Row = { id: string; erc1155TypeId: string; priceInWei: string };
export function buildListedMap(erc721: Erc721Row[], erc1155: Erc1155Row[]): ListedMap {
  const out: ListedMap = {};
  for (const l of erc721) if (!out[l.tokenId]) out[l.tokenId] = { listingId: l.id, priceWei: l.priceInWei };
  for (const l of erc1155) if (!out[l.erc1155TypeId]) out[l.erc1155TypeId] = { listingId: l.id, priceWei: l.priceInWei };
  return out;
}
export async function fetchOwnedListings(kind: "erc721" | "erc1155", seller: string, category: number, tokenAddress: string): Promise<ListedMap> {
  const s = seller.toLowerCase();
  const q = kind === "erc721"
    ? `{ erc721Listings(first:1000, where:{ seller:"${s}", category:${category}, cancelled:false, timePurchased:"0" }, orderBy: timeCreated, orderDirection: desc){ id tokenId priceInWei } }`
    : `{ erc1155Listings(first:1000, where:{ seller:"${s}", erc1155TokenAddress:"${tokenAddress.toLowerCase()}", cancelled:false, sold:false, quantity_gt:0 }, orderBy: timeCreated, orderDirection: desc){ id erc1155TypeId priceInWei } }`;
  const res = await coreSubgraphFetch(CORE_SUBGRAPH, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ query: q }) });
  const j = await res.json();
  return kind === "erc721" ? buildListedMap(j.data?.erc721Listings ?? [], []) : buildListedMap([], j.data?.erc1155Listings ?? []);
}
```

- [ ] **Step 4: Run — pass.** Then commit:
```bash
git add src/components/explorer/detail/ownedListings.ts src/components/explorer/detail/ownedListings.test.ts
git commit -m "feat(explorer): owned-listing subgraph fetch + listedMap transform"
```

### Task 10: OwnedMarketGrid — name + price + detail dialog + edit/cancel

**Files:** Modify `src/components/explorer/OwnedMarketGrid.tsx`.

- [ ] **Step 1: Load listings** — after the `owned` query:
```tsx
import { fetchOwnedListings, type ListedMap } from "./detail/ownedListings";
import { itemMetaSync } from "@/lib/explorer/itemMeta";
import { useDetailNav } from "./detail/useDetailNav";
import { DetailDialogShell } from "./detail/DetailDialogShell";
const listingCategory = itemKind === "forge" ? null : (LISTING_CATEGORY[itemKind] ?? null);
const { data: listedMap } = useQuery<ListedMap>({
  queryKey: ["owned-listings", itemKind, address?.toLowerCase()],
  enabled: !!address && canList && listingCategory != null,
  staleTime: 30_000,
  queryFn: () => fetchOwnedListings(erc721 ? "erc721" : "erc1155", address!, listingCategory!, tokenContract),
});
const nav = useDetailNav({ items: rows, getId: (o) => o.id, asset: itemKind });
```

- [ ] **Step 2: Card shows name + price** — under the `#id` row:
```tsx
{itemKind !== "forge" && itemMetaSync(o.id)?.name && (
  <div className="text-[9px] text-muted-foreground text-center truncate" title={itemMetaSync(o.id)!.name}>{itemMetaSync(o.id)!.name}</div>
)}
{listedMap?.[o.id]
  ? <div className="text-[10px] text-emerald-500 font-semibold text-center">{(Number(listedMap[o.id].priceWei) / 1e18).toLocaleString(undefined, { maximumFractionDigits: 2 })} GHST</div>
  : <div className="text-[9px] text-muted-foreground text-center">Not listed</div>}
```

- [ ] **Step 3: Image opens the dialog** — wrap the image div with `onClick={() => nav.openItem(o)} className="cursor-pointer …"` (keep the bulk-select tap-to-list on the top row/checkbox affordance).

- [ ] **Step 4: Owned detail dialog** — add near the parcel modal, with helpers `listSingle`/`cancelListing`/`editListing` (full code below):
```tsx
{nav.open && itemKind !== "parcel" && (() => {
  const o = nav.open; const listed = listedMap?.[o.id]; const meta = itemMetaSync(o.id);
  return (
    <DetailDialogShell title={<>{meta?.name ?? itemKind} <span className="text-muted-foreground font-mono text-sm">#{o.id}</span></>}
      onClose={() => nav.close()} onPrev={nav.prev} onNext={nav.next} hasPrev={nav.hasPrev} hasNext={nav.hasNext} shareUrl={nav.shareUrl} widthClass="w-[min(440px,96vw)]">
      <div className="w-32 h-32 mx-auto rounded-xl overflow-hidden bg-gradient-to-b from-muted/15 to-muted/40 flex items-center justify-center [&_img]:max-h-28 [&_img]:max-w-28 [&_img]:object-contain">
        <AssetImage candidates={imgFor(itemKind, o.id)} alt={`#${o.id}`} />
      </div>
      {o.bal > 1 && <div className="text-center text-xs text-muted-foreground">You own ×{o.bal}</div>}
      <div className="rounded-lg border border-border/60 p-3 space-y-2">
        <div className="text-sm font-semibold">Your listing</div>
        {listed ? (
          <>
            <div className="text-2xl font-bold text-emerald-500 text-center">{(Number(listed.priceWei) / 1e18).toLocaleString(undefined, { maximumFractionDigits: 2 })} GHST</div>
            <div className="flex items-center gap-1.5">
              <input type="number" value={dPrice} onChange={(e) => setDPrice(e.target.value)} placeholder="New price (GHST)" className="h-9 flex-1 min-w-0 rounded border border-border bg-background px-2 text-sm" />
              <button disabled={dBusy !== "" || !(Number(dPrice) > 0)} onClick={() => editListing(o, listed)} className="h-9 px-3 rounded bg-emerald-600 text-white text-sm font-semibold disabled:opacity-50 shrink-0">{dBusy === "list" ? "Saving…" : "Edit"}</button>
              <button disabled={dBusy !== ""} onClick={() => cancelListing(o, listed)} className="h-9 px-3 rounded border border-border/60 text-sm font-medium text-muted-foreground hover:bg-muted/50 disabled:opacity-50 shrink-0">{dBusy === "cancel" ? "…" : "Cancel"}</button>
            </div>
          </>
        ) : (
          <div className="flex items-center gap-1.5">
            <input type="number" value={dPrice} onChange={(e) => setDPrice(e.target.value)} placeholder="Price (GHST)" className="h-9 flex-1 min-w-0 rounded border border-border bg-background px-2 text-sm" />
            <button disabled={dBusy !== "" || !(Number(dPrice) > 0)} onClick={() => listSingle(o)} className="h-9 px-3 rounded bg-emerald-600 text-white text-sm font-semibold disabled:opacity-50 shrink-0">{dBusy === "list" ? "Listing…" : "List"}</button>
          </div>
        )}
      </div>
      {auctionKind && <CreateAuctionButton kind={auctionKind} category={auctionCategory} tokenId={o.id} contractAddress={tokenContract} label={`${itemKind} #${o.id}`} maxQuantity={o.bal} onCreated={refetch} />}
      <RecentSales kind={erc721 ? "erc721" : "erc1155"} tokenId={o.id} />
    </DetailDialogShell>
  );
})()}
```
Helpers (place with `listOne`/`cancelOne`):
```tsx
const listSingle = async (o: Owned) => {
  const p = Number(dPrice);
  if (!publicClient || !address || !(p > 0) || listingCategory == null) return;
  if (!isOnBase) return toast({ title: "Switch to Base", variant: "destructive" });
  setDBusy("list");
  try {
    const wei = BigInt(Math.round(p * 1e6)) * 10n ** 12n;
    const approved = (await publicClient.readContract({ address: tokenContract, abi: APPROVAL_ABI, functionName: "isApprovedForAll", args: [address, AAVEGOTCHI_DIAMOND_BASE] })) as boolean;
    if (!approved) { const ah = await writeContractAsync({ chainId: BASE_CHAIN_ID, address: tokenContract, abi: APPROVAL_ABI, functionName: "setApprovalForAll", args: [AAVEGOTCHI_DIAMOND_BASE, true] }); await publicClient.waitForTransactionReceipt({ hash: ah, confirmations: 1 }); }
    const hash = erc721
      ? await writeContractAsync({ chainId: BASE_CHAIN_ID, address: AAVEGOTCHI_DIAMOND_BASE, abi: ERC721_MARKETPLACE_ABI, functionName: "addERC721Listing", args: [tokenContract, BigInt(o.id), BigInt(listingCategory), wei] })
      : await writeContractAsync({ chainId: BASE_CHAIN_ID, address: AAVEGOTCHI_DIAMOND_BASE, abi: ERC1155_MARKETPLACE_ABI, functionName: "setERC1155Listing", args: [tokenContract, BigInt(o.id), BigInt(o.bal), BigInt(listingCategory), wei] });
    await publicClient.waitForTransactionReceipt({ hash, confirmations: 1 });
    toast({ title: "Listed", description: `#${o.id} at ${p} GHST.` }); setDPrice(""); refetch();
  } catch (e) { toast({ title: "List failed", description: parseRevert(e).slice(0, 140), variant: "destructive" }); } finally { setDBusy(""); }
};
const cancelListing = async (o: Owned, listed: { listingId: string }) => {
  if (!publicClient || !address) return;
  setDBusy("cancel");
  try {
    const hash = erc721
      ? await writeContractAsync({ chainId: BASE_CHAIN_ID, address: AAVEGOTCHI_DIAMOND_BASE, abi: ERC721_MARKETPLACE_ABI, functionName: "cancelERC721Listing", args: [BigInt(listed.listingId)] })
      : await writeContractAsync({ chainId: BASE_CHAIN_ID, address: AAVEGOTCHI_DIAMOND_BASE, abi: ERC1155_MARKETPLACE_ABI, functionName: "cancelERC1155Listing", args: [BigInt(listed.listingId)] });
    await publicClient.waitForTransactionReceipt({ hash, confirmations: 1 });
    toast({ title: "Listing cancelled" }); refetch();
  } catch (e) { toast({ title: "Cancel failed", description: parseRevert(e).slice(0, 140), variant: "destructive" }); } finally { setDBusy(""); }
};
// Edit = cancel then re-list (no single-tx update verified on Base).
const editListing = async (o: Owned, listed: { listingId: string }) => { await cancelListing(o, listed); await listSingle(o); };
```
Add `const auctionCategory = 4;` near `auctionKind`. Verify `ERC1155_MARKETPLACE_ABI` includes `cancelERC1155Listing`; if missing, add the fragment to `contracts.ts` after confirming the selector on Base.

- [ ] **Step 5: Manual verify (non-wearable)** — Owned -> Items/Tiles: name + "Not listed"/price on card; image opens dialog; List works; price shows with Edit/Cancel; Cancel delists.

- [ ] **Step 6: Commit**
```bash
git add src/components/explorer/OwnedMarketGrid.tsx
git commit -m "feat(explorer): owned cards show name + price with edit/cancel + detail dialog"
```

### Task 11: Enable wearable/item auction in owned view (verify on-chain first)

**Files:** Modify `src/components/explorer/OwnedMarketGrid.tsx` (possibly `CreateAuctionButton.tsx`).

- [ ] **Step 1: Verify GBM wearable/item category on Base** — sample a live wearable auction:
```bash
node -e "const u='<GBM_BAAZAAR_SUBGRAPH_URL>';fetch(u,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({query:'{ auctions(first:20, where:{ type:\"erc1155\" }){ contractAddress category tokenId } }'})}).then(r=>r.json()).then(j=>console.log(JSON.stringify(j.data,null,2)))"
```
Find rows whose `contractAddress` is the Aavegotchi/wearable diamond; record their `category` as `WEARABLE_AUCTION_CATEGORY`. If none exist, do a minimal Base `createAuction` dry-run (small/test) with category 4 against the wearable diamond; if it reverts, treat as unsupported (Step 2b).

- [ ] **Step 2a: If supported** — extend:
```tsx
const auctionKind: "erc721" | "erc1155" | null =
  itemKind === "parcel" || itemKind === "fakegotchi" || itemKind === "portal" ? "erc721"
  : itemKind === "tile" || itemKind === "installation" || itemKind === "forge" || itemKind === "wearable" || itemKind === "item" ? "erc1155"
  : null;
const auctionCategory = itemKind === "wearable" || itemKind === "item" ? WEARABLE_AUCTION_CATEGORY : 4;
```

- [ ] **Step 2b: If unsupported** — render a disabled Auction button with `title="GBM auctions for wearables aren't live on Base yet"`. No reverting button.

- [ ] **Step 3: Manual verify** — Owned -> Wearables: Create Auction completes on Base (or the disabled state explains why).

- [ ] **Step 4: Commit**
```bash
git add src/components/explorer/OwnedMarketGrid.tsx
git commit -m "feat(explorer): auction owned wearables/items via GBM (category verified on Base)"
```

### Task 12: Confirm owned-wearable view inherits parity

**Files:** Verify `ExplorerPage.tsx` renders `<OwnedMarketGrid itemKind="wearable" />` for owned wearables (line ~579). Manual verify only; commit only if a tweak was needed.

- [ ] **Step 1:** Owned -> Wearables shows names, prices/"Not listed", detail dialog, edit/cancel, auction (per Task 11).

### Task 13: Gotchi detail field parity — Spirit Points + others (req 7)

**Files:** Modify `GotchiActionsPanel.tsx`, `src/lib/explorer/types.ts`, gotchi fetchers (`src/hooks/useExplorerData.ts` / `src/graphql/*`), gotchi card component.

- [ ] **Step 1: Verify data sources**
- **Spirit Points:** probe the core subgraph:
```bash
node -e "const u='<CORE_SUBGRAPH_URL>';const t='{ aavegotchi(id:\"1\"){ id spiritForce } }';fetch(u,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({query:t})}).then(r=>r.json()).then(j=>console.log(JSON.stringify(j)))"
```
Try `spiritForce`, then `spiritPoints`. If both error, it's a diamond getter — locate it in the dapp ABI and read via `publicClient.readContract`, else render `None`.
- **Forge Smithing:** check the forge subgraph for a per-gotchi smithing skill/points; else `None`.
- **XP-to-next / Age / Block Age / Equipped Set / GHST balance:** derive from existing `ExplorerGotchi` (`experience`, `createdAt`, `equippedSetName`, `stakedAmount`). Confirm/add an `xpToNext(level, experience)` helper (check `src/lib/` for a level table first).

- [ ] **Step 2: Extend types + fetch** (only for confirmed remote fields) — add subgraph fields to the gotchi query + `ExplorerGotchi`, or a `useQuery` contract-read in the modal. Unknown -> default `null` (renders `None`).

- [ ] **Step 3: Render fields** in the Details section:
```tsx
<div className="grid grid-cols-2 gap-2 text-xs">
  <Stat label="Rarity Score" value={`${withSets} (${modified})`} />
  <Stat label="Kinship" value={kinship} />
  <Stat label="Haunt" value={hauntId} />
  <Stat label="Level" value={`${level} (${experience} XP)`} />
  <Stat label="XP to level up" value={`${xpToNext} XP to Level ${level + 1}`} />
  <Stat label="Spirit Points" value={spiritPoints ?? "None"} />
  <Stat label="Forge Smithing" value={forgeSmithing ?? "None"} />
  <Stat label="Equipped Set" value={equippedSetName ?? "None"} />
  <Stat label="Age" value={ageLabel} />
  <Stat label="GHST Balance" value={`${ghstPocket} GHST`} />
</div>
```
(`Stat` = a tiny local `{label,value}` row component.) Add named trait descriptors (`value (Descriptor)`) using existing trait tables in `src/lib/traits*`; add a small range map if none exists.

- [ ] **Step 4: Card status badges** — owned gotchi card shows `listed for X GHST` (`g.listing`) and `lent out · last pet Xh ago` (rental sets + `lastInteracted`, already in `ExplorerPage`). Thread a `statusBadge` prop into the card component if needed.

- [ ] **Step 5: Manual verify** — a gotchi's Details shows Spirit Points (value or `None`), Forge Smithing, XP-to-next, Age/Set/GHST; trait rows show descriptors; owned cards show badges.

- [ ] **Step 6: Commit**
```bash
git add -A src
git commit -m "feat(explorer): gotchi detail parity — Spirit Points, Forge Smithing, XP-to-next, status badges"
```

### Task 14: Full verification — "test and prove it works"

- [ ] **Step 1: Unit suite** — `npx vitest run` — all pass (incl. `useDetailNav`, `ownedListings`).
- [ ] **Step 2: Typecheck + build** — `npm run build 2>&1 | tail -20` — success.
- [ ] **Step 3: Drive the app (evidence, not assertions)** — `npm run dev`; use the `verify`/`run` skill or Playwright MCP to, for each of gotchi / wearable / item / parcel / auction across Collection / Owned / Baazaar / Auction: open a card (dialog opens), page ‹/› and arrow keys, copy-link + reopen in fresh tab (auto-opens same item), and on Owned confirm price + edit/cancel + auction. Capture screenshots.
- [ ] **Step 4: Em-dash proof** — `grep -rnP '\xE2\x80\x94' src --include='*.tsx' | grep -vi '\.test\.'` shows only comments.
- [ ] **Step 5: Report** — summarise what was exercised, paste command output + screenshots. If anything failed, say so with the output.
- [ ] **Step 6: Final commit (residual fixes only)**
```bash
git add -A && git commit -m "chore(explorer): parity verification fixes"
```

---

## Self-Review notes

- **Spec coverage:** req1=T1-2; req2 deep-link=T3+migrations; req6 prev/next=T3-8; req3 owned parity=T10,12; req4 edit price=T10; req5 owned auction=T11; req7 gotchi fields incl. Spirit Points=T13. Plus reported chunk-error bug=T0; "test and prove"=T14.
- **Verification-gated (no invented behaviour):** T11 (auction category) + T13 (Spirit Points / Forge Smithing sources) verify before shipping with `None`/disabled fallbacks.
- **Type consistency:** `useDetailNav` returns `{open,index,openItem,close,next,prev,hasNext,hasPrev,shareUrl}` — used verbatim in T5-T11. `buildListedMap`/`fetchOwnedListings`/`ListedMap`/`OwnedListing` consistent across T9-10.
- **Edit semantics:** cancel+re-list (`editListing`) unless a single-tx update is found (open item).
- **Open verification items** (resolved in-task, not blockers): GBM wearable category (T11), Spirit Points source (T13), Forge Smithing source (T13), single-tx listing edit on Base (T10/T11).
