/**
 * Central react-query key factory.
 *
 * Every query key in the app lives here so a producer (`useQuery`) and its
 * consumers (`invalidateQueries` / `cancelQueries`, often in other files) can
 * never drift apart from a typo. That drift is a *silent* failure — a mistyped
 * key compiles fine but quietly misses its cache entry (stale data, missed
 * invalidation), which is exactly what this module prevents.
 *
 * Convention: call with no/partial args to get a prefix for invalidation
 * (e.g. `qk.gotchis()` matches every `qk.gotchis(owner)`), since react-query
 * matches keys by prefix.
 */
export const qk = {
  // Owned gotchis — produced with an owner, invalidated broadly by tx hooks.
  gotchis: (owner?: string) => (owner ? (["gotchis", owner] as const) : (["gotchis"] as const)),
  gotchiSearch: (q: string) => ["gotchi-search", q] as const,
  baazaarNameMatch: (idsKey: string) => ["baazaar-name-match", idsKey] as const,

  // Baazaar / marketplace.
  baazaar: () => ["baazaar"] as const,
  baazaarMarket: (kind: string, category: number) => ["baazaar", "market", kind, category] as const,
  baazaarParcelMeta: (ids: string[]) => ["baazaar", "parcel-meta", ids] as const,
  baazaarActivity: () => ["baazaar-activity"] as const,
  gbmAuctions: () => ["gbm-auctions"] as const,
  ownerListings: (owner?: string | null) => ["owner-listings", owner] as const,
  gotchiListing: (tokenId: string) => ["gotchi-listing", tokenId] as const,

  // Rendered art.
  gotchiSvg: (id: string) => ["gotchi-svg-base", id] as const,
  fakeGotchiImg: (id: string) => ["fake-gotchi-img", id] as const,

  // Gotchiverse land.
  installationTypes: (ids?: unknown) => (ids === undefined ? (["installation-types"] as const) : (["installation-types", ids] as const)),
  landParcels: (owner?: string) => (owner ? (["land-parcels", owner] as const) : (["land-parcels"] as const)),
  landParcelIds: (address?: string) => (address ? (["land-parcel-ids", address] as const) : (["land-parcel-ids"] as const)),
  parcelInstallations: (parcelId?: string | null) => ["parcel-installations", parcelId] as const,
  parcelDetail: (parcelId?: string | null) => (parcelId ? (["parcel-detail", parcelId] as const) : (["parcel-detail"] as const)),
  parcelLastSale: (parcelId?: string | null) => ["parcel-last-sale", parcelId] as const,
  channelable: (...parts: unknown[]) => ["channelable", ...parts] as const,
};
