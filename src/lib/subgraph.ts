/**
 * Single source of truth for the Goldsky subgraph endpoints. Previously the
 * project URL was hardcoded in ~14 files; centralizing here means the indexer
 * can be repointed in one place.
 */
const GOLDSKY_PROJECT = "https://api.goldsky.com/api/public/project_cmh3flagm0001r4p25foufjtt/subgraphs";

/**
 * Failover-aware transport for the CORE subgraph. Use `coreSubgraphFetch(CORE_SUBGRAPH, init)`
 * instead of raw fetch — same signature, but routes to the backup
 * mirror (The Graph Network) when Goldsky is down or silently stalled. Raw fetch bypasses
 * failover entirely (that gap left most pages on a stalled Goldsky in the 2026-07 incident).
 * Only the core subgraph has a backup; the others below are fetched directly.
 */
export { failoverFetch as coreSubgraphFetch } from "@/graphql/subgraphFailover";

/** Core Aavegotchi entities: gotchis, erc721/erc1155 listings, purchases. */
export const CORE_SUBGRAPH = `${GOLDSKY_PROJECT}/aavegotchi-core-base/prod/gn`;
/** Gotchiverse: parcels, installations, tiles. */
export const GOTCHIVERSE_SUBGRAPH = `${GOLDSKY_PROJECT}/gotchiverse-base/prod/gn`;
/** GBM auctions (Baazaar). */
export const GBM_SUBGRAPH = `${GOLDSKY_PROJECT}/aavegotchi-gbm-baazaar-base/prod/gn`;
/** Per-gotchi rendered SVGs. */
export const SVG_SUBGRAPH = `${GOLDSKY_PROJECT}/aavegotchi-svg-base/prod/gn`;
/** XP merkle drops + per-gotchi claims. */
export const XP_SUBGRAPH = `${GOLDSKY_PROJECT}/aavegotchi-xp-base/prod/gn`;
