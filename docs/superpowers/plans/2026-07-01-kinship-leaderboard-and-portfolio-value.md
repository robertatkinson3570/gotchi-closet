# Kinship/XP Leaderboard + Portfolio Floor Value Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship two small community-requested features: (1) a public Kinship + XP leaderboard page at `/leaderboard`, and (2) a rough "floor value" total at the top of the Explorer's Owned view.

**Architecture:** Both features are read-only views over the existing Goldsky core subgraph (`CORE_SUBGRAPH` in `src/lib/subgraph.ts`). No new backend, no new contracts, no new deps. The leaderboard is a new lazy-loaded page + nav entry following the `StatsPage` conventions (react-query + raw `fetch` POST to the subgraph, Tailwind UI). The portfolio value is two tiny queries (gotchi floor listing + owned-gotchi count) rendered as one row inside the existing `OwnedOverview` component. Pure math/formatting goes in `src/lib/` with vitest coverage; components are verified by typecheck + manual run.

**Tech Stack:** React 18 + TypeScript, react-query v5 (`@tanstack/react-query`), react-router, Tailwind, lucide-react icons, vitest. Subgraph: Aavegotchi core on Base (Goldsky).

**Background for the implementer (zero-context primer):**
- Aavegotchis are NFTs with on-chain stats. `kinship` rises when the owner "pets" the gotchi (every 12h), `experience` (XP) comes from DAO voting/events. The community asked for a way to see these leaderboards (Discord, general-chat 2026-06-29).
- The core subgraph entity is `aavegotchis` with fields `id`, `gotchiId`, `name`, `kinship`, `experience`, `level`, `lastInteracted` (unix seconds), `owner { id }`, `status` (3 = summoned/alive — always filter on this).
- "Floor price" = cheapest active Baazaar listing. Baazaar listings live in the same subgraph: entity `erc721Listings`, gotchis are `category: 3`, active = `cancelled: false, timePurchased: "0"`. Prices are wei strings (1 GHST = 1e18 wei).
- Repo conventions you MUST follow:
  - Pages self-fetch with `useQuery` + a local `fetch` POST helper (see `src/pages/StatsPage.tsx`). No urql for new code.
  - Every react-query key comes from the `qk` factory in `src/lib/queryKeys.ts` — never inline a key array in a component.
  - Pages are lazy-loaded in `src/app/router.tsx`.
  - Unit tests: vitest, colocated `*.test.ts` next to the source file (see `src/lib/rarity.test.ts`).
  - Run tests with `npx vitest run <file>`; full suite `npm run test:unit`; types `npm run typecheck`.

**Files overview:**

| File | Action | Responsibility |
|---|---|---|
| `src/lib/portfolio.ts` | Create | Pure wei→GHST + floor-value math |
| `src/lib/portfolio.test.ts` | Create | Tests for the above |
| `src/lib/format.ts` | Modify | Add `timeAgo()` relative-time helper |
| `src/lib/format.test.ts` | Create | Tests for `timeAgo()` |
| `src/lib/leaderboard.ts` | Create | Query builder + fetcher for leaderboard rows |
| `src/lib/leaderboard.test.ts` | Create | Tests for the query builder |
| `src/hooks/useGhstUsd.ts` | Create | GHST→USD spot hook (extracted from StatsPage, DRY) |
| `src/pages/StatsPage.tsx` | Modify | Import the extracted hook, delete local copy |
| `src/lib/queryKeys.ts` | Modify | Add `gotchiFloor`, `ownedGotchiCount`, `leaderboard` keys |
| `src/components/explorer/OwnedOverview.tsx` | Modify | Add "Floor value (rough)" row |
| `src/pages/LeaderboardPage.tsx` | Create | The leaderboard page |
| `src/app/router.tsx` | Modify | Add `/leaderboard` route |
| `src/components/layout/RootLayout.tsx` | Modify | Add Trophy nav entry |

---

### Task 1: Portfolio math (pure lib, TDD)

**Files:**
- Create: `src/lib/portfolio.ts`
- Test: `src/lib/portfolio.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/lib/portfolio.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { weiToGhst, portfolioFloorGhst } from "./portfolio";

describe("weiToGhst", () => {
  it("converts a wei string to GHST units", () => {
    expect(weiToGhst("1500000000000000000")).toBe(1.5);
  });
  it("converts a bigint", () => {
    expect(weiToGhst(2n * 10n ** 18n)).toBe(2);
  });
  it("returns 0 for null, undefined, garbage, and negatives", () => {
    expect(weiToGhst(null)).toBe(0);
    expect(weiToGhst(undefined)).toBe(0);
    expect(weiToGhst("abc")).toBe(0);
    expect(weiToGhst("-5")).toBe(0);
  });
});

describe("portfolioFloorGhst", () => {
  it("sums gotchis at floor plus GHST balance", () => {
    // 3 gotchis x 100 GHST floor + 50 GHST balance = 350
    expect(
      portfolioFloorGhst({
        gotchiCount: 3,
        gotchiFloorWei: "100000000000000000000",
        ghstWei: 50n * 10n ** 18n,
      })
    ).toBe(350);
  });
  it("is 0 with no holdings", () => {
    expect(portfolioFloorGhst({ gotchiCount: 0, gotchiFloorWei: null, ghstWei: 0n })).toBe(0);
  });
  it("counts only GHST when there is no active floor listing", () => {
    expect(
      portfolioFloorGhst({ gotchiCount: 5, gotchiFloorWei: null, ghstWei: 10n * 10n ** 18n })
    ).toBe(10);
  });
  it("treats a negative/NaN count as 0", () => {
    expect(
      portfolioFloorGhst({ gotchiCount: -2, gotchiFloorWei: "1000000000000000000", ghstWei: 0n })
    ).toBe(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/portfolio.test.ts`
Expected: FAIL — `Cannot find module './portfolio'` (or "Failed to resolve import").

- [ ] **Step 3: Write the implementation**

Create `src/lib/portfolio.ts`:

```ts
/**
 * Rough "floor value" of a wallet's Aavegotchi holdings — the way the
 * community hand-estimates it (gotchis at floor price + liquid GHST).
 * Deliberately conservative: trait/wearable/kinship premiums are ignored.
 */

/** Wei (1e18) string/bigint → GHST number. Returns 0 for null/garbage/negative. */
export function weiToGhst(wei: string | bigint | null | undefined): number {
  if (wei == null) return 0;
  const n = Number(wei);
  return Number.isFinite(n) && n >= 0 ? n / 1e18 : 0;
}

export type PortfolioInputs = {
  /** Owned + lent-out gotchis (lent gotchis sit in escrow but are still yours). */
  gotchiCount: number;
  /** priceInWei of the cheapest active Baazaar gotchi listing, or null if none. */
  gotchiFloorWei: string | null;
  /** Wallet GHST balance in wei. */
  ghstWei: bigint;
};

/** Total rough floor value in GHST units. */
export function portfolioFloorGhst(p: PortfolioInputs): number {
  const count = Number.isFinite(p.gotchiCount) && p.gotchiCount > 0 ? p.gotchiCount : 0;
  return count * weiToGhst(p.gotchiFloorWei) + weiToGhst(p.ghstWei);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/portfolio.test.ts`
Expected: PASS (7 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/portfolio.ts src/lib/portfolio.test.ts
git commit -m "feat(portfolio): pure floor-value math (weiToGhst, portfolioFloorGhst)"
```

---

### Task 2: `timeAgo()` formatter (pure lib, TDD)

**Files:**
- Modify: `src/lib/format.ts` (append; file is currently 15 lines)
- Test: `src/lib/format.test.ts` (create — no test file exists for format.ts yet)

- [ ] **Step 1: Write the failing test**

Create `src/lib/format.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { timeAgo } from "./format";

describe("timeAgo", () => {
  const NOW_MS = 1_800_000_000_000; // fixed "now" so tests are deterministic
  const nowSec = NOW_MS / 1000;

  it("returns em dash for zero/invalid timestamps", () => {
    expect(timeAgo(0, NOW_MS)).toBe("—");
    expect(timeAgo(NaN, NOW_MS)).toBe("—");
    expect(timeAgo(-5, NOW_MS)).toBe("—");
  });
  it("formats under a minute as 'just now'", () => {
    expect(timeAgo(nowSec - 30, NOW_MS)).toBe("just now");
  });
  it("formats minutes", () => {
    expect(timeAgo(nowSec - 5 * 60, NOW_MS)).toBe("5m ago");
  });
  it("formats hours", () => {
    expect(timeAgo(nowSec - 3 * 3600, NOW_MS)).toBe("3h ago");
  });
  it("formats days", () => {
    expect(timeAgo(nowSec - 2 * 86400, NOW_MS)).toBe("2d ago");
  });
  it("clamps future timestamps to 'just now'", () => {
    expect(timeAgo(nowSec + 999, NOW_MS)).toBe("just now");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/format.test.ts`
Expected: FAIL — `timeAgo` is not exported.

- [ ] **Step 3: Write the implementation**

Append to `src/lib/format.ts` (keep the existing exports untouched):

```ts
/** Compact relative time for unix-seconds timestamps: "5m ago", "3h ago", "2d ago".
 *  Pass nowMs explicitly in tests for determinism. */
export function timeAgo(unixSeconds: number, nowMs: number = Date.now()): string {
  if (!Number.isFinite(unixSeconds) || unixSeconds <= 0) return "—";
  const s = Math.max(0, Math.floor(nowMs / 1000) - unixSeconds);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/format.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/format.ts src/lib/format.test.ts
git commit -m "feat(format): timeAgo relative-time helper"
```

---

### Task 3: Leaderboard data module (query builder tested, fetcher thin)

**Files:**
- Create: `src/lib/leaderboard.ts`
- Test: `src/lib/leaderboard.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/lib/leaderboard.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { buildLeaderboardQuery, LEADERBOARD_PAGE_SIZE } from "./leaderboard";

describe("buildLeaderboardQuery", () => {
  it("orders by kinship desc with summoned-only filter", () => {
    const q = buildLeaderboardQuery("kinship", 100, 0);
    expect(q).toContain("orderBy:kinship");
    expect(q).toContain("orderDirection:desc");
    expect(q).toContain("status:3");
    expect(q).toContain("first:100");
    expect(q).toContain("skip:0");
  });
  it("orders by experience for the XP board", () => {
    const q = buildLeaderboardQuery("experience", 100, 200);
    expect(q).toContain("orderBy:experience");
    expect(q).toContain("skip:200");
  });
  it("requests every field the page renders", () => {
    const q = buildLeaderboardQuery("kinship", 10, 0);
    for (const f of ["id", "gotchiId", "name", "kinship", "experience", "level", "lastInteracted", "owner { id }"]) {
      expect(q).toContain(f);
    }
  });
  it("exports a sane page size", () => {
    expect(LEADERBOARD_PAGE_SIZE).toBe(100);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/leaderboard.test.ts`
Expected: FAIL — cannot resolve `./leaderboard`.

- [ ] **Step 3: Write the implementation**

Create `src/lib/leaderboard.ts`:

```ts
/**
 * Kinship / XP leaderboard reads over the core subgraph.
 * Community ask (Discord general-chat 2026-06-29): "is there even a way to
 * see a kinship leaderboard?" — this module answers it with one query.
 */
import { CORE_SUBGRAPH } from "@/lib/subgraph";

export type LeaderboardSort = "kinship" | "experience";
export const LEADERBOARD_PAGE_SIZE = 100;

export type LeaderboardRow = {
  id: string;
  gotchiId: string;
  name: string;
  kinship: number;
  experience: number;
  level: number;
  /** unix seconds of the last pet; 0 when never interacted */
  lastInteracted: number;
  owner: string;
};

/** Pure query builder (unit-tested). status:3 = summoned gotchis only. */
export function buildLeaderboardQuery(sort: LeaderboardSort, first: number, skip: number): string {
  return `{ aavegotchis(first:${first}, skip:${skip}, where:{ status:3 }, orderBy:${sort}, orderDirection:desc){ id gotchiId name kinship experience level lastInteracted owner { id } } }`;
}

export async function fetchLeaderboard(sort: LeaderboardSort, page: number): Promise<LeaderboardRow[]> {
  const query = buildLeaderboardQuery(sort, LEADERBOARD_PAGE_SIZE, page * LEADERBOARD_PAGE_SIZE);
  const res = await fetch(CORE_SUBGRAPH, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query }),
  });
  if (!res.ok) throw new Error(`Leaderboard request failed: ${res.status}`);
  const j = await res.json();
  if (j.errors) throw new Error(j.errors[0]?.message ?? "subgraph error");
  return (j.data?.aavegotchis ?? []).map((g: any): LeaderboardRow => ({
    id: String(g.id),
    gotchiId: String(g.gotchiId ?? g.id),
    name: g.name || `Gotchi #${g.gotchiId ?? g.id}`,
    kinship: Number(g.kinship ?? 0),
    experience: Number(g.experience ?? 0),
    level: Number(g.level ?? 0),
    lastInteracted: Number(g.lastInteracted ?? 0),
    owner: g.owner?.id ?? "",
  }));
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/leaderboard.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/leaderboard.ts src/lib/leaderboard.test.ts
git commit -m "feat(leaderboard): kinship/xp subgraph query builder + fetcher"
```

---

### Task 4: Shared `useGhstUsd` hook (DRY extraction from StatsPage)

**Files:**
- Create: `src/hooks/useGhstUsd.ts`
- Modify: `src/pages/StatsPage.tsx:10,101-115` (delete local `GHST_BASE` + `useGhstUsd`, import the hook)

- [ ] **Step 1: Create the hook**

Create `src/hooks/useGhstUsd.ts` — this is a verbatim move of `src/pages/StatsPage.tsx` lines 101-115 plus the `GHST_BASE` constant from line 10:

```ts
import { useQuery } from "@tanstack/react-query";

const GHST_BASE = "0xcd2f22236dd9dfe2356d7c543161d4d260fd9bcb";

/** GHST spot price in USD via DefiLlama. Returns 0 while loading or on failure. */
export function useGhstUsd() {
  return useQuery({
    queryKey: ["ghst-usd"],
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<number> => {
      try {
        const r = await fetch(`https://coins.llama.fi/prices/current/base:${GHST_BASE}?searchWidth=4h`);
        const j = await r.json();
        return Number(j?.coins?.[`base:${GHST_BASE}`]?.price ?? 0);
      } catch {
        return 0;
      }
    },
  });
}
```

(The `["ghst-usd"]` key intentionally stays a literal here and is not added to `qk` — it predates this change and both callers now share the single definition inside this hook, so drift is impossible.)

- [ ] **Step 2: Update StatsPage**

In `src/pages/StatsPage.tsx`:
1. Delete line 10: `const GHST_BASE = "0xcd2f22236dd9dfe2356d7c543161d4d260fd9bcb";`
2. Delete the whole local `useGhstUsd` function (lines 101-115 in the current file).
3. Add import near the other `@/` imports:

```ts
import { useGhstUsd } from "@/hooks/useGhstUsd";
```

Nothing else changes — `StatsPage` already calls `useGhstUsd()` in its body.

- [ ] **Step 3: Verify types**

Run: `npm run typecheck`
Expected: exit 0, no errors.

- [ ] **Step 4: Commit**

```bash
git add src/hooks/useGhstUsd.ts src/pages/StatsPage.tsx
git commit -m "refactor(stats): extract useGhstUsd into shared hook"
```

---

### Task 5: Query keys for the new queries

**Files:**
- Modify: `src/lib/queryKeys.ts` (append inside the `qk` object, before the closing `};`)

- [ ] **Step 1: Add the three keys**

In `src/lib/queryKeys.ts`, add to the `qk` object (after the `explorerListings` entry):

```ts
  // Leaderboard + portfolio (kinship/XP boards, owned floor value).
  leaderboard: (sort?: string, page?: number) =>
    sort === undefined ? (["leaderboard"] as const) : (["leaderboard", sort, page ?? 0] as const),
  gotchiFloor: () => ["gotchi-floor"] as const,
  ownedGotchiCount: (address?: string) =>
    address ? (["owned-gotchi-count", address] as const) : (["owned-gotchi-count"] as const),
```

- [ ] **Step 2: Verify types**

Run: `npm run typecheck`
Expected: exit 0.

- [ ] **Step 3: Commit**

```bash
git add src/lib/queryKeys.ts
git commit -m "feat(query-keys): leaderboard, gotchi floor, owned count keys"
```

---

### Task 6: Floor-value row in OwnedOverview

**Files:**
- Modify: `src/components/explorer/OwnedOverview.tsx` (currently 56 lines — full replacement below)

- [ ] **Step 1: Replace the component**

Replace the entire contents of `src/components/explorer/OwnedOverview.tsx` with:

```tsx
import { useMemo } from "react";
import { Link } from "react-router-dom";
import { useAccount, useReadContracts } from "wagmi";
import { useQuery } from "@tanstack/react-query";
import { Coins, Sparkles, Wallet } from "lucide-react";
import { BASE_CHAIN_ID } from "@/lib/chains";
import { GHST_TOKEN_BASE, ALCHEMICA_TOKENS_BASE, ERC20_ABI } from "@/lib/lending/contracts";
import { CORE_SUBGRAPH } from "@/lib/subgraph";
import { qk } from "@/lib/queryKeys";
import { portfolioFloorGhst, weiToGhst } from "@/lib/portfolio";
import { useGhstUsd } from "@/hooks/useGhstUsd";
import { PortalsPanel } from "./PortalsPanel";
import { PetOperatorControl } from "./PetOperatorControl";

const TOKENS = [
  { symbol: "GHST", address: GHST_TOKEN_BASE, color: "text-purple-400" },
  ...ALCHEMICA_TOKENS_BASE.map((t, i) => ({ symbol: t.symbol, address: t.address, color: ["text-pink-400", "text-sky-400", "text-emerald-400", "text-amber-400"][i] })),
];

const fmt = (wei: bigint) => {
  const v = Number(wei) / 1e18;
  return v.toLocaleString(undefined, { maximumFractionDigits: v < 1 ? 3 : v < 1000 ? 1 : 0 });
};

const fmtGhst = (v: number) => v.toLocaleString(undefined, { maximumFractionDigits: 0 });

/** Owned-asset overview shown on the Explorer's "Owned" scope: rough floor
 *  value, wallet token balances + the user's portals (open/summon/claim).
 *  Consolidates what used to live on the now-deprecated profile page. */
export function OwnedOverview() {
  const { address, isConnected } = useAccount();
  const { data: balData } = useReadContracts({
    contracts: TOKENS.map((t) => ({ address: t.address as `0x${string}`, abi: ERC20_ABI, functionName: "balanceOf" as const, args: [address as `0x${string}`], chainId: BASE_CHAIN_ID })),
    query: { enabled: !!address },
  });
  const balances = useMemo(
    () => TOKENS.map((t, i) => ({ ...t, bal: balData?.[i]?.status === "success" ? (balData[i].result as bigint) : 0n })),
    [balData]
  );

  // Cheapest active Baazaar gotchi listing (category 3) = the "floor".
  const { data: floorWei = null } = useQuery({
    queryKey: qk.gotchiFloor(),
    staleTime: 60_000,
    queryFn: async (): Promise<string | null> => {
      const q = `{ erc721Listings(first:1, where:{ category:3, cancelled:false, timePurchased:"0" }, orderBy:priceInWei, orderDirection:asc){ priceInWei } }`;
      const res = await fetch(CORE_SUBGRAPH, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ query: q }) });
      const j = await res.json();
      return j.data?.erc721Listings?.[0]?.priceInWei ?? null;
    },
  });

  // Owned + lent-out gotchis (lent ones sit in the lending escrow but remain yours).
  const { data: gotchiCount = 0 } = useQuery({
    queryKey: qk.ownedGotchiCount(address?.toLowerCase()),
    enabled: !!address,
    staleTime: 60_000,
    queryFn: async (): Promise<number> => {
      const q = `{ user(id:"${address!.toLowerCase()}"){ gotchisOwned(first:1000){ id } gotchisLentOut } }`;
      const res = await fetch(CORE_SUBGRAPH, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ query: q }) });
      const j = await res.json();
      const u = j.data?.user;
      return (u?.gotchisOwned?.length ?? 0) + (u?.gotchisLentOut?.length ?? 0);
    },
  });

  const { data: ghstUsd = 0 } = useGhstUsd();
  const ghstWei = balances[0]?.bal ?? 0n;
  const totalGhst = portfolioFloorGhst({ gotchiCount, gotchiFloorWei: floorWei, ghstWei });

  if (!isConnected) return null;

  return (
    <div className="px-2 md:px-4 pt-2 space-y-3">
      <div className="rounded-xl border border-border/40 bg-gradient-to-r from-primary/10 to-transparent p-3 flex items-baseline justify-between gap-3 flex-wrap">
        <div>
          <div className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide inline-flex items-center gap-1.5">
            <Wallet className="w-3.5 h-3.5" /> Floor value (rough)
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-bold tabular-nums">{fmtGhst(totalGhst)}</span>
            <span className="text-sm text-muted-foreground">GHST</span>
            {ghstUsd > 0 && totalGhst > 0 && (
              <span className="text-sm text-emerald-500 font-medium">≈ ${fmtGhst(totalGhst * ghstUsd)}</span>
            )}
          </div>
        </div>
        <div className="text-[11px] text-muted-foreground">
          {gotchiCount} gotchi{gotchiCount === 1 ? "" : "s"} × {fmtGhst(weiToGhst(floorWei))} GHST floor + wallet GHST
        </div>
      </div>
      <div>
        <div className="flex items-center justify-between mb-2">
          <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide inline-flex items-center gap-1.5"><Coins className="w-4 h-4" /> Your tokens</div>
          <Link to="/get-tokens" className="inline-flex items-center gap-1 text-[11px] font-semibold text-primary hover:underline"><Sparkles className="w-3.5 h-3.5" /> Get GHST</Link>
        </div>
        <div className="grid grid-cols-3 sm:grid-cols-5 gap-2">
          {balances.map((t) => (
            <div key={t.symbol} className="rounded-lg border border-border/40 bg-background/60 p-2.5">
              <div className={`text-[11px] font-semibold ${t.color}`}>{t.symbol}</div>
              <div className="text-base font-bold tabular-nums">{fmt(t.bal)}</div>
            </div>
          ))}
        </div>
      </div>
      <PortalsPanel />
      <PetOperatorControl />
    </div>
  );
}
```

Notes for the implementer:
- The only changes vs the original are: the new imports (`useQuery`, `CORE_SUBGRAPH`, `qk`, portfolio fns, `useGhstUsd`, `Wallet` icon), the two `useQuery` blocks, `fmtGhst`, and the new "Floor value" `<div>` — everything else is byte-identical to the current file. Do not restructure further.
- The floor query runs regardless of connection; `enabled: !!address` guards the per-user one. This matches existing patterns (see `ExplorerPage`'s `explorer-rentals` query).

- [ ] **Step 2: Verify types**

Run: `npm run typecheck`
Expected: exit 0.

- [ ] **Step 3: Run the full unit suite (guards against regressions)**

Run: `npm run test:unit`
Expected: all tests pass (includes the new portfolio/format/leaderboard tests).

- [ ] **Step 4: Commit**

```bash
git add src/components/explorer/OwnedOverview.tsx
git commit -m "feat(explorer): rough floor-value row on the Owned overview"
```

---

### Task 7: Leaderboard page

**Files:**
- Create: `src/pages/LeaderboardPage.tsx`

- [ ] **Step 1: Create the page**

Create `src/pages/LeaderboardPage.tsx`:

```tsx
import { useState } from "react";
import { Link } from "react-router-dom";
import { useQuery, keepPreviousData } from "@tanstack/react-query";
import { Trophy, Heart, Zap, Loader2, ChevronLeft, ChevronRight } from "lucide-react";
import { Seo } from "@/components/Seo";
import { siteUrl } from "@/lib/site";
import { GotchiSvgById } from "@/components/explorer/GotchiSvgById";
import { fetchLeaderboard, LEADERBOARD_PAGE_SIZE, type LeaderboardSort } from "@/lib/leaderboard";
import { timeAgo, shortAddress } from "@/lib/format";
import { qk } from "@/lib/queryKeys";

const SORTS: { key: LeaderboardSort; label: string; icon: typeof Heart }[] = [
  { key: "kinship", label: "Kinship", icon: Heart },
  { key: "experience", label: "XP", icon: Zap },
];

// Subgraph skip is capped at 5000; 10 pages of 100 is plenty for a leaderboard.
const MAX_PAGE = 9;

export default function LeaderboardPage() {
  const [sort, setSort] = useState<LeaderboardSort>("kinship");
  const [page, setPage] = useState(0);

  const { data: rows, isLoading, error } = useQuery({
    queryKey: qk.leaderboard(sort, page),
    queryFn: () => fetchLeaderboard(sort, page),
    staleTime: 60_000,
    placeholderData: keepPreviousData,
  });

  const pick = (s: LeaderboardSort) => { setSort(s); setPage(0); };

  return (
    <div className="container mx-auto max-w-[900px] px-4 py-6">
      <Seo
        title="Kinship & XP Leaderboard — GotchiCloset"
        description="Live Aavegotchi kinship and XP leaderboards on Base. See the most loved and most experienced gotchis."
        canonical={siteUrl("/leaderboard")}
      />

      <div className="flex flex-wrap items-center justify-between gap-3 mb-5">
        <h1 className="text-2xl font-bold tracking-tight inline-flex items-center gap-2">
          <Trophy className="w-6 h-6 text-primary" /> Leaderboard
        </h1>
        <div className="flex items-center gap-1.5 text-xs">
          {SORTS.map(({ key, label, icon: Icon }) => (
            <button
              key={key}
              onClick={() => pick(key)}
              className={`h-8 px-3.5 inline-flex items-center gap-1.5 rounded-lg text-xs font-semibold border ${sort === key ? "bg-primary/15 text-primary border-primary/40" : "border-border/40 text-muted-foreground hover:bg-muted/40"}`}
            >
              <Icon className="w-3.5 h-3.5" /> {label}
            </button>
          ))}
        </div>
      </div>

      <p className="text-xs text-muted-foreground mb-4">
        Kinship grows when a gotchi is petted (every 12h) and decays when neglected. XP comes from DAO
        voting and community events. Live from the Base subgraph — summoned gotchis only.
      </p>

      {error && (
        <div className="rounded border border-destructive/40 bg-destructive/5 p-3 text-sm mb-3">
          {(error as Error).message}
        </div>
      )}

      {isLoading || !rows ? (
        <div className="flex justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>
      ) : (
        <>
          <div className="rounded-2xl border border-white/10 bg-muted/10 overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-[11px] uppercase tracking-wide text-muted-foreground border-b border-border/40">
                  <th className="text-left font-semibold px-3 py-2 w-12">#</th>
                  <th className="text-left font-semibold px-3 py-2">Gotchi</th>
                  <th className="text-right font-semibold px-3 py-2">Kinship</th>
                  <th className="text-right font-semibold px-3 py-2 hidden sm:table-cell">XP</th>
                  <th className="text-right font-semibold px-3 py-2 hidden md:table-cell">Last pet</th>
                  <th className="text-right font-semibold px-3 py-2 hidden md:table-cell">Owner</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((g, i) => {
                  const rank = page * LEADERBOARD_PAGE_SIZE + i + 1;
                  return (
                    <tr key={g.id} className="border-b border-border/20 last:border-0 hover:bg-muted/20">
                      <td className="px-3 py-2 text-muted-foreground tabular-nums">{rank}</td>
                      <td className="px-3 py-2">
                        <Link to={`/gotchi/${g.gotchiId}`} className="inline-flex items-center gap-2.5 hover:text-primary">
                          <span className="w-9 h-9 shrink-0 rounded-lg bg-muted/30 overflow-hidden [&_svg]:w-full [&_svg]:h-full">
                            <GotchiSvgById id={g.gotchiId} />
                          </span>
                          <span className="min-w-0">
                            <span className="block font-semibold truncate max-w-[180px] sm:max-w-[260px]">{g.name}</span>
                            <span className="block text-[11px] text-muted-foreground">#{g.gotchiId} · lvl {g.level}</span>
                          </span>
                        </Link>
                      </td>
                      <td className={`px-3 py-2 text-right tabular-nums ${sort === "kinship" ? "font-bold" : ""}`}>{g.kinship.toLocaleString()}</td>
                      <td className={`px-3 py-2 text-right tabular-nums hidden sm:table-cell ${sort === "experience" ? "font-bold" : ""}`}>{g.experience.toLocaleString()}</td>
                      <td className="px-3 py-2 text-right text-muted-foreground hidden md:table-cell">{timeAgo(g.lastInteracted)}</td>
                      <td className="px-3 py-2 text-right hidden md:table-cell">
                        <Link to={`/u/${g.owner}`} className="text-muted-foreground hover:text-primary">{shortAddress(g.owner)}</Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="flex items-center justify-center gap-2 mt-4">
            <button
              onClick={() => setPage((p) => Math.max(0, p - 1))}
              disabled={page === 0}
              className="h-8 px-3 inline-flex items-center gap-1 rounded-lg border border-border/40 text-xs font-semibold text-muted-foreground hover:bg-muted/40 disabled:opacity-40 disabled:pointer-events-none"
            >
              <ChevronLeft className="w-3.5 h-3.5" /> Prev
            </button>
            <span className="text-xs text-muted-foreground tabular-nums">
              {page * LEADERBOARD_PAGE_SIZE + 1}–{page * LEADERBOARD_PAGE_SIZE + rows.length}
            </span>
            <button
              onClick={() => setPage((p) => Math.min(MAX_PAGE, p + 1))}
              disabled={page >= MAX_PAGE || rows.length < LEADERBOARD_PAGE_SIZE}
              className="h-8 px-3 inline-flex items-center gap-1 rounded-lg border border-border/40 text-xs font-semibold text-muted-foreground hover:bg-muted/40 disabled:opacity-40 disabled:pointer-events-none"
            >
              Next <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </>
      )}
    </div>
  );
}
```

Notes for the implementer:
- `GotchiSvgById` takes the numeric token id string — `g.gotchiId` is correct (the svg subgraph is keyed by token id).
- `keepPreviousData` (react-query v5) keeps the previous page visible while the next loads — no flash.
- The `[&_svg]:w-full [&_svg]:h-full` Tailwind arbitrary variants size the inline SVG; this pattern is used elsewhere in the repo (grep `[&_svg]` if unsure).

- [ ] **Step 2: Verify types**

Run: `npm run typecheck`
Expected: exit 0.

- [ ] **Step 3: Commit**

```bash
git add src/pages/LeaderboardPage.tsx
git commit -m "feat(leaderboard): kinship/xp leaderboard page"
```

---

### Task 8: Route + nav wiring

**Files:**
- Modify: `src/app/router.tsx:28` (add lazy import + route)
- Modify: `src/components/layout/RootLayout.tsx:7,24-37` (icon import + NAV entry)

- [ ] **Step 1: Add the route**

In `src/app/router.tsx`, add the lazy import after the `StatsPage` line (line 28):

```ts
const LeaderboardPage = lazy(() => import("@/pages/LeaderboardPage"));
```

Then add the route child after the `stats` entry (line 61):

```ts
      { path: "leaderboard", element: <LeaderboardPage /> },
```

- [ ] **Step 2: Add the nav entry**

In `src/components/layout/RootLayout.tsx`:

1. Line 7 — add `Trophy` to the lucide import list:

```ts
import { Coins, Search, Shirt, MapPin, Activity, Flame, Landmark, Receipt, Bot, Copy, LogOut, Ghost, Trophy } from "lucide-react";
```

2. In the `NAV` array (lines 24-37), add after the `"/activity"` entry:

```ts
  { to: "/leaderboard", title: "Kinship & XP Leaderboard", icon: Trophy },
```

- [ ] **Step 3: Verify types + lint**

Run: `npm run typecheck && npm run lint`
Expected: both exit 0. (Lint enforces `--max-warnings 0` — fix any unused-import warnings now.)

- [ ] **Step 4: Commit**

```bash
git add src/app/router.tsx src/components/layout/RootLayout.tsx
git commit -m "feat(leaderboard): route + nav entry"
```

---

### Task 9: Manual verification (live data)

**Files:** none (verification only)

- [ ] **Step 1: Start the dev server**

Run: `npm run dev`
Expected: vite serves on port 5000 (plus the express server via tsx).

- [ ] **Step 2: Verify the leaderboard**

Open `http://localhost:5000/leaderboard` and check:
- Table renders rows with gotchi thumbnails, names, kinship values in strictly descending order.
- The XP toggle re-sorts (descending `experience`), resets to page 1.
- Next/Prev paging works; rank numbers continue across pages (101 on page 2).
- "Last pet" column shows plausible relative times ("3h ago", "2d ago").
- Clicking a row's gotchi navigates to `/gotchi/<id>`; owner link goes to `/u/<address>`.
- The Trophy icon appears in the header nav and highlights when on the page.

- [ ] **Step 3: Verify the floor value row**

Open `http://localhost:5000/explorer?scope=owned` with a wallet connected (any wallet holding gotchis; a fresh wallet should show `0 gotchis × <floor> + wallet GHST`):
- "Floor value (rough)" row renders above "Your tokens".
- The caption shows gotchi count × current floor; sanity-check the floor against the cheapest gotchi on the Baazaar tab (price ascending).
- USD approximation appears when DefiLlama responds (may be absent offline — that's expected, not a bug).

- [ ] **Step 4: Full suite one last time**

Run: `npm run test:unit && npm run typecheck && npm run lint`
Expected: all green.

- [ ] **Step 5: Final commit (if any fixups were needed)**

```bash
git add -A
git commit -m "fix(leaderboard): manual-verification fixups"
```

Only commit if fixups were actually made; otherwise skip.

---

## Out of scope (deliberately — YAGNI)

- BRS/rarity leaderboard (the dapp already has one; our rarity page covers scoring).
- "Find my gotchi's rank" search, seasonal RF round snapshots, rewards estimates.
- Wearable floor values in the portfolio number (needs per-item floors — different feature).
- Price alerts, watchlists, historical value charts.
- E2E specs (existing smoke/parity suites cover nav; these pages are read-only views).
