import { useState, useMemo, useCallback, useEffect, useRef } from "react";
import { ExplorerTopBar } from "@/components/explorer/ExplorerTopBar";
import { ExplorerFilters } from "@/components/explorer/ExplorerFilters";
import { ExplorerGrid } from "@/components/explorer/ExplorerGrid";
import { FamilyPhotoGrid } from "@/components/explorer/FamilyPhotoGrid";
import { TakePictureButton } from "@/components/explorer/TakePictureButton";
import { SortSheet } from "@/components/explorer/SortSheet";
import { WearableExplorerGrid } from "@/components/explorer/WearableExplorerGrid";
import { WearableExplorerFilters } from "@/components/explorer/WearableExplorerFilters";
import { WearableSortSheet } from "@/components/explorer/WearableSortSheet";
import { useExplorerData } from "@/hooks/useExplorerData";
import { useWearableExplorerData } from "@/hooks/useWearableExplorerData";
import { useAddressState } from "@/lib/addressState";
import { useAppStore } from "@/state/useAppStore";
import { fetchAllWearables, fetchAllWearableSets } from "@/graphql/fetchers";
import { cacheGet, cacheSet, cacheIsStale, CACHE_KEYS } from "@/lib/cache";
import type { DataMode, ExplorerFilters as FiltersType } from "@/lib/explorer/types";
import { defaultFilters } from "@/lib/explorer/types";
import { getActiveFilterCount } from "@/lib/explorer/filters";
import { defaultBaazaarSort } from "@/lib/explorer/sorts";
import type { AssetType } from "@/lib/explorer/wearableTypes";
import { MarketGrid } from "@/components/explorer/MarketGrid";
import { AuctionGrid } from "@/components/explorer/AuctionGrid";
import { GotchiManageModal, type ManageGotchi } from "@/components/explorer/GotchiActionsPanel";
import { OwnedOverview } from "@/components/explorer/OwnedOverview";
import { OwnedMarketGrid } from "@/components/explorer/OwnedMarketGrid";
import { useQuery } from "@tanstack/react-query";
import { CORE_SUBGRAPH, coreSubgraphFetch } from "@/lib/subgraph";
import { BAAZAAR_CATEGORY, AAVEGOTCHI_DIAMOND_BASE, REALM_DIAMOND_BASE, INSTALLATION_DIAMOND_BASE, TILE_DIAMOND_BASE, FAKE_GOTCHIS_NFT_BASE, FAKE_CARDS_DIAMOND_BASE, FORGE_DIAMOND_BASE, GUARDIAN_SKINS_DIAMOND_BASE } from "@/lib/lending/contracts";
import { ChevronLeft, ChevronRight, Tag, X, Loader2 } from "lucide-react";
import { usePublicClient, useWriteContract } from "wagmi";
import { BASE_CHAIN_ID } from "@/lib/chains";
import { parseRevert } from "@/lib/lending/parseRevert";
import { useToast } from "@/ui/use-toast";
import setsData from "../../data/setsByTraitDirection.json";
import { env } from "@/lib/env";
import { SoulCertificate } from "@/components/soul/SoulCertificate";
import { useSealedTokens } from "@/state/useSealedTokens";

const ADD_LISTING_ABI = [
  { name: "addERC721Listing", type: "function", stateMutability: "nonpayable", inputs: [{ name: "_erc721TokenAddress", type: "address" }, { name: "_erc721TokenId", type: "uint256" }, { name: "_category", type: "uint256" }, { name: "_priceInWei", type: "uint256" }], outputs: [] },
] as const;

export type ViewMode = "cards" | "family";
const VIEW_MODE_KEY = "gc_explorer_viewMode";
const ASSET_TYPE_KEY = "gc_explorer_assetType";

// Registry of buyable Baazaar tabs -> the MarketGrid props that drive them.
// Adding a market category is now a one-line entry instead of another render
// branch (and a missing entry simply isn't a market tab).
type MarketTab = { kind: "erc721" | "erc1155"; category: number; contract: `0x${string}`; itemKind: "item" | "parcel" | "installation" | "tile" | "portal" | "fakegotchi" | "fakecard" | "forge" | "guardian"; tokenAddress?: string; extraCategories?: number[] };
const MARKET_TABS: Record<string, MarketTab> = {
  item: { kind: "erc1155", category: BAAZAAR_CATEGORY.CONSUMABLE, contract: AAVEGOTCHI_DIAMOND_BASE, itemKind: "item" },
  parcel: { kind: "erc721", category: BAAZAAR_CATEGORY.REALM, contract: REALM_DIAMOND_BASE, itemKind: "parcel" },
  installation: { kind: "erc1155", category: BAAZAAR_CATEGORY.INSTALLATION, contract: INSTALLATION_DIAMOND_BASE, itemKind: "installation" },
  tile: { kind: "erc1155", category: BAAZAAR_CATEGORY.TILE, contract: TILE_DIAMOND_BASE, itemKind: "tile" },
  // Portals on the Aavegotchi diamond: closed (erc721 cat 0) + open (cat 2,
  // pick-and-claim) — the dapp lists both on its Portals page.
  portal: { kind: "erc721", category: 0, contract: AAVEGOTCHI_DIAMOND_BASE, itemKind: "portal", extraCategories: [2] },
  // FAKE Gotchis (erc721 cat 5) + FAKE Cards (erc1155 cat 6) — each category is
  // unique to its collection, so a category fetch maps 1:1 to the contract.
  fakegotchi: { kind: "erc721", category: 5, contract: FAKE_GOTCHIS_NFT_BASE, itemKind: "fakegotchi" },
  fakecard: { kind: "erc1155", category: 6, contract: FAKE_CARDS_DIAMOND_BASE, itemKind: "fakecard" },
  // Forge items (alloy/essence/geodes/cores) span categories 7/8/9/11 on the
  // Forge diamond — fetch by contract, art by per-item category.
  forge: { kind: "erc1155", category: 0, contract: FORGE_DIAMOND_BASE, itemKind: "forge", tokenAddress: FORGE_DIAMOND_BASE },
  // Guardian Skins (erc1155 cat 12). Only a collection icon exists for art.
  guardian: { kind: "erc1155", category: 12, contract: GUARDIAN_SKINS_DIAMOND_BASE, itemKind: "guardian" },
};

export default function ExplorerPage() {
  const { connectedAddress, isConnected } = useAddressState();
  const setWearables = useAppStore((s) => s.setWearables);
  const setSets = useAppStore((s) => s.setSets);
  const setGotchis = useAppStore((s) => s.setGotchis);
  const setFilters = useAppStore((s) => s.setFilters);
  const storeWearables = useAppStore((s) => s.wearables);
  const [assetType, setAssetType] = useState<AssetType>(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem(ASSET_TYPE_KEY);
      return (saved === "wearable" ? "wearable" : "gotchi") as AssetType;
    }
    return "gotchi";
  });
  const [mode, setMode] = useState<DataMode>("all");
  const [manage, setManage] = useState<ManageGotchi | null>(null);
  const [sealGotchi, setSealGotchi] = useState<string | null>(null);
  const publicClient = usePublicClient({ chainId: BASE_CHAIN_ID });
  const { writeContractAsync } = useWriteContract();
  const { toast } = useToast();
  const [selectMode, setSelectMode] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkPrice, setBulkPrice] = useState("");
  const [listing, setListing] = useState<{ done: number; total: number } | null>(null);

  const toggleSel = (gid: string) =>
    setSelected((s) => { const n = new Set(s); if (n.has(gid)) n.delete(gid); else n.add(gid); return n; });

  // Bulk-list selected owned gotchis on the Baazaar (one signature each).
  const doBulkList = async () => {
    const price = Number(bulkPrice);
    if (!publicClient || !(price > 0) || selected.size === 0) return;
    const wei = BigInt(Math.floor(price * 1e18));
    const ids = [...selected];
    setListing({ done: 0, total: ids.length });
    let ok = 0, failed = 0;
    for (const gid of ids) {
      try {
        const hash = await writeContractAsync({ chainId: BASE_CHAIN_ID, address: AAVEGOTCHI_DIAMOND_BASE, abi: ADD_LISTING_ABI, functionName: "addERC721Listing", args: [AAVEGOTCHI_DIAMOND_BASE, BigInt(gid), 3n, wei] });
        await publicClient.waitForTransactionReceipt({ hash, confirmations: 1 });
        ok++;
      } catch (e) {
        failed++;
        if (failed === 1) toast({ title: "A listing failed", description: parseRevert(e).slice(0, 140), variant: "destructive" });
      }
      setListing((p) => (p ? { ...p, done: p.done + 1 } : p));
    }
    toast({ title: "Bulk list complete", description: `Listed ${ok}/${ids.length}${failed ? `, ${failed} failed` : ""} at ${price} GHST.` });
    setListing(null); setSelected(new Set()); setSelectMode(false);
  };

  // Lent-out / borrowed gotchi ids for the connected user, to badge owned cards.
  const { data: rentalSets } = useQuery({
    queryKey: ["explorer-rentals", connectedAddress],
    enabled: mode === "mine" && !!connectedAddress,
    staleTime: 60_000,
    queryFn: async () => {
      const q = `{ user(id:"${connectedAddress!.toLowerCase()}"){ gotchisLentOut gotchisBorrowed } }`;
      const res = await coreSubgraphFetch(CORE_SUBGRAPH, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ query: q }) });
      const j = await res.json();
      const u = j.data?.user ?? {};
      return { lentOut: new Set<string>((u.gotchisLentOut ?? []).map(String)), borrowed: new Set<string>((u.gotchisBorrowed ?? []).map(String)) };
    },
  });
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [showSort, setShowSort] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem(VIEW_MODE_KEY);
      return (saved === "family" ? "family" : "cards") as ViewMode;
    }
    return "cards";
  });

  useEffect(() => {
    localStorage.setItem(VIEW_MODE_KEY, viewMode);
  }, [viewMode]);

  useEffect(() => {
    localStorage.setItem(ASSET_TYPE_KEY, assetType);
  }, [assetType]);

  useEffect(() => {
    if (mode !== "mine" && viewMode === "family") {
      setViewMode("cards");
    }
  }, [mode, viewMode]);

  useEffect(() => {
    if (assetType !== "wearable") return;

    type WearablesState = ReturnType<typeof useAppStore.getState>["wearables"];
    const cachedWearables = cacheGet<WearablesState>(CACHE_KEYS.WEARABLES);
    if (cachedWearables && cachedWearables.length > 0 && storeWearables.length === 0) {
      setWearables(cachedWearables);
    }

    if (storeWearables.length === 0 && (!cachedWearables || cacheIsStale(CACHE_KEYS.WEARABLES))) {
      fetchAllWearables()
        .then((wearables) => {
          setWearables(wearables);
          cacheSet(CACHE_KEYS.WEARABLES, wearables);
        })
        .catch((err) => console.error("Failed to load wearables:", err));
    }

    type SetsState = ReturnType<typeof useAppStore.getState>["sets"];
    const cachedSets = cacheGet<SetsState>(CACHE_KEYS.SETS);
    if (cachedSets) {
      setSets(cachedSets);
    }

    if (!cachedSets || cacheIsStale(CACHE_KEYS.SETS)) {
      fetchAllWearableSets()
        .then((sets) => {
          setSets(sets);
          cacheSet(CACHE_KEYS.SETS, sets);
        })
        .catch((err) => console.error("Failed to load sets:", err));
    }
  }, [assetType, storeWearables.length, setWearables, setSets]);

  useEffect(() => {
    if (assetType !== "wearable") return;
    const wearableMode = mode === "mine" ? "owned" : mode === "baazaar" ? "baazaar" : "all";
    setFilters({ wearableMode });
  }, [assetType, mode, setFilters]);

  const {
    gotchis,
    loading: gotchiLoading,
    hasMore: gotchiHasMore,
    error: gotchiError,
    loadMore: gotchiLoadMore,
    filters: gotchiFilters,
    setFilters: setGotchiFilters,
    sort: gotchiSort,
    setSort: setGotchiSort,
  } = useExplorerData(mode, connectedAddress);

  useEffect(() => {
    if (mode !== "mine") return;
    if (!connectedAddress) return;

    if (gotchis.length > 0) {
      setGotchis(gotchis as any);
    }
  }, [mode, connectedAddress, gotchis, setGotchis]);

  const {
    wearables,
    loading: wearableLoading,
    hasMore: wearableHasMore,
    loadMore: wearableLoadMore,
    filters: wearableFilters,
    setFilters: setWearableFilters,
    resetFilters: resetWearableFilters,
    sort: wearableSort,
    setSort: setWearableSort,
    ownedCounts,
    pricesMap,
  } = useWearableExplorerData(mode);

  // Deep link: /explorer?owner=0x… (e.g. from an auction's seller/bidder link)
  // jumps to that owner's gotchis. Applied once on mount.
  const appliedOwnerRef = useRef(false);
  useEffect(() => {
    if (appliedOwnerRef.current) return;
    const owner = new URLSearchParams(window.location.search).get("owner");
    if (owner && /^0x[a-fA-F0-9]{40}$/.test(owner)) {
      appliedOwnerRef.current = true;
      setAssetType("gotchi");
      setMode("all");
      setGotchiFilters({ ...gotchiFilters, nameContains: "", ownerAddress: owner.toLowerCase() });
    }
  }, [gotchiFilters, setGotchiFilters]);

  // Deep link from the deprecated profile: /explorer?scope=owned lands on the
  // owned view.
  const appliedScopeRef = useRef(false);
  useEffect(() => {
    if (appliedScopeRef.current) return;
    if (new URLSearchParams(window.location.search).get("scope") === "owned") {
      appliedScopeRef.current = true;
      setMode("mine");
    }
  }, []);

  const handleModeChange = useCallback((newMode: DataMode) => {
    setMode(newMode);
  }, []);

  // In the Baazaar scope, always default to newest-listing — both when entering
  // Baazaar and when switching between the Gotchis/Wearables tabs there.
  useEffect(() => {
    if (mode !== "baazaar") return;
    if (assetType === "gotchi") setGotchiSort(defaultBaazaarSort);
    else if (assetType === "wearable") setWearableSort({ field: "listingCreated", direction: "desc" });
  }, [mode, assetType, setGotchiSort, setWearableSort]);

  const filteredGotchisBySearch = useMemo(() => {
    // If searching by owner address, server-side filtering handles it
    if (gotchiFilters.ownerAddress) return gotchis;
    const searchTerm = gotchiFilters.nameContains;
    if (!searchTerm.trim()) return gotchis;
    // For "all" mode, server-side filtering handles name search
    if (mode === "all") return gotchis;
    const s = searchTerm.toLowerCase().trim();
    return gotchis.filter(
      (g) =>
        g.name.toLowerCase().includes(s) ||
        g.tokenId === s ||
        g.tokenId.includes(s) ||
        (g.owner && g.owner.toLowerCase().includes(s))
    );
  }, [gotchis, gotchiFilters.nameContains, gotchiFilters.ownerAddress, mode]);

  // Soul seal status for the currently displayed gotchis (shown on every tab).
  // One batched multicall on the server; cache-aware so paging only reads new ids.
  const displayedGotchiIds = useMemo(
    () => (assetType === "gotchi" ? filteredGotchisBySearch.map((g) => g.tokenId) : []),
    [assetType, filteredGotchisBySearch]
  );
  const { data: sealMap } = useQuery({
    queryKey: ["seal-status", displayedGotchiIds.join(",")],
    enabled: assetType === "gotchi" && displayedGotchiIds.length > 0,
    staleTime: 60_000,
    gcTime: 5 * 60_000,
    // Keep the previous map while a load-more refetches under a new key, so
    // badges don't blink off/on as the accumulated id-list grows each page.
    placeholderData: (prev) => prev,
    queryFn: async () => {
      const apiBase = env.companionApiUrl || "";
      // Deliberate product cap: at most 500 ids per request. Owners rarely hold
      // >500; on the public "all" tab, cards past 500 simply show no badge.
      const res = await fetch(`${apiBase}/api/soul/seals`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tokenIds: displayedGotchiIds.slice(0, 500) }),
      });
      if (!res.ok) return {} as Record<string, boolean>;
      const j = await res.json();
      return (j.sealed ?? {}) as Record<string, boolean>;
    },
  });
  const justSealed = useSealedTokens((s) => s.sealed);
  const sealStatusFor = useCallback(
    (g: { tokenId: string }): "sealed" | "unsealed" | null => {
      // Just-sealed-this-session wins so the badge flips immediately (no refresh).
      if (justSealed[g.tokenId]) return "sealed";
      if (!sealMap || !(g.tokenId in sealMap)) return null;
      return sealMap[g.tokenId] ? "sealed" : "unsealed";
    },
    [sealMap, justSealed]
  );

  const filteredWearablesBySearch = useMemo(() => {
    const searchTerm = gotchiFilters.nameContains;
    if (!searchTerm.trim()) return wearables;
    const s = searchTerm.toLowerCase().trim();
    return wearables.filter(
      (w) =>
        w.name.toLowerCase().includes(s) ||
        String(w.id) === s
    );
  }, [wearables, gotchiFilters.nameContains]);

  const availableSets = useMemo(() => {
    return setsData.sets.map((s) => s.name).sort();
  }, []);

  const gotchiFilterCount = getActiveFilterCount(gotchiFilters);

  const handleGotchiFiltersChange = useCallback((newFilters: FiltersType) => {
    setGotchiFilters(newFilters);
  }, [setGotchiFilters]);

  const handleSearchChange = useCallback((value: string) => {
    const v = value.trim();
    const isAddress = /^0x[a-fA-F0-9]{40}$/.test(v);
    const isTokenId = /^\d+$/.test(v); // pure number → look up by gotchi token id
    if (isAddress) {
      setGotchiFilters({ ...gotchiFilters, nameContains: "", tokenId: "", ownerAddress: v });
    } else if (isTokenId) {
      setGotchiFilters({ ...gotchiFilters, nameContains: "", ownerAddress: "", tokenId: v });
    } else {
      setGotchiFilters({ ...gotchiFilters, nameContains: value, ownerAddress: "", tokenId: "" });
    }
  }, [gotchiFilters, setGotchiFilters]);

  const wearableFilterCount = 
    wearableFilters.slots.length +
    wearableFilters.rarityTiers.length +
    wearableFilters.sets.length +
    (wearableFilters.nrgMin || wearableFilters.nrgMax ? 1 : 0) +
    (wearableFilters.aggMin || wearableFilters.aggMax ? 1 : 0) +
    (wearableFilters.spkMin || wearableFilters.spkMax ? 1 : 0) +
    (wearableFilters.brnMin || wearableFilters.brnMax ? 1 : 0) +
    (wearableFilters.positiveModsOnly ? 1 : 0) +
    (wearableFilters.negativeModsOnly ? 1 : 0) +
    (wearableFilters.hasSetBonus !== null ? 1 : 0) +
    (wearableFilters.statModifyingOnly !== null ? 1 : 0);

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <ExplorerTopBar
        mode={mode}
        onModeChange={handleModeChange}
        search={gotchiFilters.ownerAddress || gotchiFilters.nameContains || gotchiFilters.tokenId || ""}
        onSearchChange={handleSearchChange}
        sort={gotchiSort}
        onSortChange={setGotchiSort}
        onOpenSort={() => setShowSort(true)}
        connectedAddress={connectedAddress}
        isConnected={isConnected}
        viewMode={viewMode}
        onViewModeChange={setViewMode}
        assetType={assetType}
        onAssetTypeChange={setAssetType}
        wearableSort={wearableSort}
        onWearableSortChange={setWearableSort}
      />

      <div className="flex-1 flex">
        <aside className={`hidden lg:flex flex-col border-r border-border/30 bg-muted/10 transition-all duration-300 ${sidebarOpen ? "w-72" : "w-12"} overflow-hidden relative`}>
          {sidebarOpen ? (
            <>
              <div className="flex-1 overflow-y-auto p-3">
                {assetType === "gotchi" ? (
                  <ExplorerFilters
                    filters={gotchiFilters}
                    onFiltersChange={handleGotchiFiltersChange}
                    availableSets={availableSets}
                  />
                ) : assetType === "wearable" ? (
                  <WearableExplorerFilters
                    filters={wearableFilters}
                    setFilters={setWearableFilters}
                    resetFilters={resetWearableFilters}
                    mode={mode}
                  />
                ) : assetType === "auction" ? (
                  <div className="text-xs text-muted-foreground p-1">Live GBM auctions — click a card to view details and bid.</div>
                ) : null}
                {/*
                  Market tabs (items/parcels/installations/tiles/portals) portal
                  their filters into this slot via createPortal. It MUST stay
                  mounted across asset-type changes: if React removes this node
                  in the same commit that unmounts a MarketGrid, the portal's
                  removeChild cleanup targets a node that's already gone and
                  throws NotFoundError, tripping the route error boundary
                  (seen on rapid Portals -> Auctions switches). Always render it;
                  it's empty/zero-height when no market tab is active.
                */}
                <div id="market-filter-slot" className="space-y-2" />
              </div>
              <button
                onClick={() => setSidebarOpen(false)}
                className="absolute right-0 top-0 bottom-0 w-4 hover:bg-primary/10 transition-colors cursor-pointer flex items-center justify-center group"
                title="Collapse filters"
              >
                <ChevronLeft className="h-4 w-4 text-muted-foreground group-hover:text-primary" />
              </button>
            </>
          ) : (
            <button
              onClick={() => setSidebarOpen(true)}
              className="flex-1 flex flex-col items-center justify-center gap-2 hover:bg-primary/10 transition-colors cursor-pointer group"
              title="Expand filters"
            >
              <ChevronRight className="h-5 w-5 text-muted-foreground group-hover:text-primary" />
              <span className="text-xs text-muted-foreground group-hover:text-primary writing-mode-vertical" style={{ writingMode: "vertical-rl" }}>Filters</span>
            </button>
          )}
        </aside>

        <main className="flex-1 min-w-0">
          {mode === "mine" && <OwnedOverview />}
          {assetType === "gotchi" && gotchiFilterCount > 0 && (
            <div className="px-2 md:px-4 py-2 border-b bg-muted/30 flex items-center gap-2 overflow-x-auto">
              <span className="text-xs text-muted-foreground shrink-0">{gotchiFilterCount} active:</span>
              <button
                onClick={() => setGotchiFilters(defaultFilters)}
                className="text-xs text-primary hover:underline shrink-0"
              >
                Clear all
              </button>
            </div>
          )}

          {assetType === "wearable" && wearableFilterCount > 0 && (
            <div className="px-2 md:px-4 py-2 border-b bg-muted/30 flex items-center gap-2 overflow-x-auto">
              <span className="text-xs text-muted-foreground shrink-0">{wearableFilterCount} active:</span>
              <button
                onClick={resetWearableFilters}
                className="text-xs text-primary hover:underline shrink-0"
              >
                Clear all
              </button>
            </div>
          )}

          {MARKET_TABS[assetType] ? (
            (() => {
              // Owned enumeration verified on-chain for these market categories.
              // The single top-bar All/Owned/Baazaar toggle (mode) drives the view;
              // "mine" = Owned. FAKE Cards / Guardian expose no enumeration yet.
              const ownable = assetType === "item" || assetType === "installation" || assetType === "parcel" || assetType === "tile" || assetType === "forge" || assetType === "fakegotchi" || assetType === "portal" || assetType === "fakecard" || assetType === "guardian";
              if (mode === "mine") {
                return ownable
                  ? <OwnedMarketGrid itemKind={assetType as "item" | "installation" | "parcel" | "tile" | "forge" | "fakegotchi" | "portal" | "fakecard" | "guardian"} />
                  : <div className="text-center py-12 text-muted-foreground text-sm">An owned view for this collection isn't available yet — it has no on-chain enumeration. Use the Baazaar tab to browse listings.</div>;
              }
              return <MarketGrid {...MARKET_TABS[assetType]} />;
            })()
          ) : assetType === "auction" ? (
            <AuctionGrid />
          ) : assetType === "gotchi" ? (
            viewMode === "family" && mode === "mine" ? (
              <div>
                <div className="flex justify-end px-2 md:px-3 pt-2">
                  <TakePictureButton 
                    walletAddress={connectedAddress ?? undefined} 
                    isActive={mode === "mine" && viewMode === "family"} 
                  />
                </div>
                <FamilyPhotoGrid
                  gotchis={filteredGotchisBySearch}
                  loading={gotchiLoading}
                  hasMore={gotchiHasMore}
                  error={gotchiError}
                  onLoadMore={gotchiLoadMore}
                />
              </div>
            ) : (
              <ExplorerGrid
                gotchis={filteredGotchisBySearch}
                loading={gotchiLoading}
                hasMore={gotchiHasMore}
                error={gotchiError}
                onLoadMore={gotchiLoadMore}
                onManage={(g) => {
                  if (mode === "mine") {
                    if (selectMode) return toggleSel(g.tokenId);
                    return setManage({ gotchiId: g.tokenId, name: g.name, hauntId: g.hauntId, collateral: g.collateral, numericTraits: g.numericTraits, equippedWearables: g.equippedWearables, locked: rentalSets?.lentOut.has(g.tokenId) || rentalSets?.borrowed.has(g.tokenId), lockReason: rentalSets?.lentOut.has(g.tokenId) ? "Rented out" : rentalSets?.borrowed.has(g.tokenId) ? "Borrowed" : undefined, listed: !!g.listing?.id });
                  }
                  // Not owned → read-only Details view (with owner + listing for Buy).
                  setManage({ gotchiId: g.tokenId, name: g.name, hauntId: g.hauntId, collateral: g.collateral, numericTraits: g.numericTraits, equippedWearables: g.equippedWearables, readOnly: true, owner: g.owner, listingId: g.listing?.id, listingPriceWei: g.listing?.priceInWei });
                }}
                manageLabel={mode === "mine" ? (selectMode ? "Select" : undefined) : "Details"}
                selectedFor={mode === "mine" && selectMode ? (g) => selected.has(g.tokenId) : undefined}
                rentalBadgeFor={mode === "mine" ? (g) => (rentalSets?.lentOut.has(g.tokenId) ? "Rented out" : rentalSets?.borrowed.has(g.tokenId) ? "Borrowed" : null) : undefined}
                sealStatusFor={sealStatusFor}
                onSealFor={mode === "mine" ? (g) => (!rentalSets || rentalSets.borrowed.has(g.tokenId) ? undefined : () => setSealGotchi(g.tokenId)) : undefined}
              />
            )
          ) : mode === "mine" ? (
            // Owned wearables: selectable bulk-list grid (no Make Offer on your own items).
            <OwnedMarketGrid itemKind="wearable" />
          ) : (
            <WearableExplorerGrid
              wearables={filteredWearablesBySearch}
              loading={wearableLoading}
              hasMore={wearableHasMore}
              loadMore={wearableLoadMore}
              mode={mode}
              quantities={ownedCounts}
              prices={pricesMap}
            />
          )}
        </main>
      </div>

      {showSort && assetType === "gotchi" && (
        <div className="lg:hidden">
          <SortSheet
            sort={gotchiSort}
            onSortChange={setGotchiSort}
            onClose={() => setShowSort(false)}
          />
        </div>
      )}

      {showSort && assetType === "wearable" && (
        <WearableSortSheet
          open={showSort}
          onOpenChange={setShowSort}
          sort={wearableSort}
          setSort={setWearableSort}
          mode={mode}
        />
      )}

      {mode === "mine" && assetType === "gotchi" && !selectMode && (
        <button onClick={() => setSelectMode(true)} className="fixed bottom-3 right-3 z-40 inline-flex items-center gap-1.5 h-9 px-4 rounded-full bg-emerald-600 text-white text-sm font-semibold shadow-lg hover:bg-emerald-700">
          <Tag className="w-4 h-4" /> List for sale
        </button>
      )}

      {mode === "mine" && assetType === "gotchi" && selectMode && (
        <div className="fixed bottom-3 left-1/2 -translate-x-1/2 z-40 flex items-center gap-2 rounded-full border border-border bg-background/95 backdrop-blur px-4 py-2 shadow-lg">
          <span className="text-xs font-semibold">{selected.size} selected</span>
          <input type="number" value={bulkPrice} onChange={(e) => setBulkPrice(e.target.value)} placeholder="Price each (GHST)" className="h-8 w-36 rounded border border-border bg-background px-2 text-xs" />
          <button disabled={!!listing || !(Number(bulkPrice) > 0) || selected.size === 0} onClick={doBulkList} className="inline-flex items-center gap-1.5 h-8 px-3 rounded-full bg-emerald-600 text-white text-xs font-semibold disabled:opacity-50">
            {listing ? (<><Loader2 className="w-4 h-4 animate-spin" /> Listing {listing.done}/{listing.total}…</>) : (<><Tag className="w-4 h-4" /> List {selected.size}</>)}
          </button>
          <button onClick={() => { setSelectMode(false); setSelected(new Set()); }} className="text-muted-foreground hover:text-foreground"><X className="w-4 h-4" /></button>
        </div>
      )}

      {manage && <GotchiManageModal gotchi={manage} onClose={() => setManage(null)} />}
      {sealGotchi && <SoulCertificate tokenId={sealGotchi} onClose={() => setSealGotchi(null)} />}
    </div>
  );
}
