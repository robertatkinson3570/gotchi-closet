import { CORE_SUBGRAPH, GBM_SUBGRAPH } from "@/lib/subgraph";

// Aavegotchi diamond on Base (hosts LendingFacet, WhitelistFacet, etc.)
// Source: Aavegotchi wiki (post-Base migration)
export const AAVEGOTCHI_DIAMOND_BASE = "0xA99c4B08201F2913Db8D28e71d020c4298F29dBF" as const;

// GHST token on Base
export const GHST_TOKEN_BASE = "0xcD2F22236DD9Dfe2356D7C543161D4d260FD9BcB" as const;

// GLTR token on Base (burned via reduceQueueTime to skip forge queue time).
// Verified on-chain: symbol GLTR, "Aavegotchi GLTR Token". The other GLTR
// addresses in the dapp config are other chains (no bytecode on Base).
export const GLTR_TOKEN_BASE = "0x4D140CE792bEdc430498c2d219AfBC33e2992c9D" as const;

// Forge diamond on Base (smelt wearables -> alloy/cores, forge queue, geodes).
// Address from the dapp's 8453 chain config; verified live (has code, 91 facets).
export const FORGE_DIAMOND_BASE = "0x50aF2d63b839aA32b4166FD1Cb247129b715186C" as const;

// Canonical ForgeFacet signatures (from aavegotchi-contracts). Smelt/forge/claim
// all operate per-gotchi: each wearable is smelted/forged BY a gotchi, and items
// are claimed by the forging gotchi's id (not a queue id).
export const FORGE_ABI = [
  { name: "smeltWearables", type: "function", stateMutability: "nonpayable", inputs: [{ name: "_itemIds", type: "uint256[]" }, { name: "_gotchiIds", type: "uint256[]" }], outputs: [] },
  { name: "forgeWearables", type: "function", stateMutability: "nonpayable", inputs: [{ name: "_itemIds", type: "uint256[]" }, { name: "_gotchiIds", type: "uint256[]" }, { name: "_gltr", type: "uint40[]" }], outputs: [] },
  { name: "claimForgeQueueItems", type: "function", stateMutability: "nonpayable", inputs: [{ name: "_gotchiIds", type: "uint256[]" }], outputs: [] },
  { name: "reduceQueueTime", type: "function", stateMutability: "nonpayable", inputs: [{ name: "_gotchiIds", type: "uint256[]" }, { name: "_amounts", type: "uint40[]" }], outputs: [] },
  { name: "getForgeQueue", type: "function", stateMutability: "view", inputs: [], outputs: [{ type: "tuple[]", components: [
    { name: "itemId", type: "uint256" }, { name: "gotchiId", type: "uint256" }, { name: "id", type: "uint256" }, { name: "readyBlock", type: "uint40" }, { name: "claimed", type: "bool" }] }] },
  { name: "balanceOfOwner", type: "function", stateMutability: "view", inputs: [{ name: "account", type: "address" }], outputs: [{ type: "tuple[]", components: [
    { name: "tokenId", type: "uint256" }, { name: "balance", type: "uint256" }] }] },
  { name: "getForgeQueueItemsByOwner", type: "function", stateMutability: "view", inputs: [{ name: "_owner", type: "address" }], outputs: [{ type: "tuple[]", components: [
    { name: "itemId", type: "uint256" }, { name: "gotchiId", type: "uint256" }, { name: "id", type: "uint256" }, { name: "readyBlock", type: "uint40" }, { name: "claimed", type: "bool" }] }] },
  // Geodes: open (triggers VRF) then claimWinnings once randomness lands.
  { name: "openGeodes", type: "function", stateMutability: "nonpayable", inputs: [{ name: "_geodeTokenIds", type: "uint256[]" }, { name: "_amountPerToken", type: "uint256[]" }], outputs: [] },
  { name: "claimWinnings", type: "function", stateMutability: "nonpayable", inputs: [], outputs: [] },
  { name: "geodeTokenIdFromRsm", type: "function", stateMutability: "view", inputs: [{ name: "rsm", type: "uint8" }], outputs: [{ type: "uint256" }] },
  { name: "getAavegotchiSmithingLevel", type: "function", stateMutability: "view", inputs: [{ name: "gotchiId", type: "uint256" }], outputs: [{ type: "uint256" }] },
] as const;

// Rarity-score-modifier values that map to geode token ids (common…godlike).
export const GEODE_RSM = [1, 2, 5, 10, 20, 50] as const;

// Alchemica ERC-20s on Base, indexed in the same order the RealmFacet uses
// when emitting `AlchemicaClaimed` events (FUD=0, FOMO=1, ALPHA=2, KEK=3).
export const ALCHEMICA_TOKENS_BASE = [
  { symbol: "FUD", address: "0x2028b4043e6722Ea164946c82fe806c4a43a0fF4" as const },
  { symbol: "FOMO", address: "0xA32137bfb57d2b6A9Fd2956Ba4B54741a6D54b58" as const },
  { symbol: "ALPHA", address: "0x15e7CaC885e3730ce6389447BC0f7AC032f31947" as const },
  { symbol: "KEK", address: "0xE52b9170fF4ece4C35E796Ffd74B57Dec68Ca0e5" as const },
] as const;

// Just the addresses, in the canonical order Aavegotchi uses
// (FUD=0, FOMO=1, ALPHA=2, KEK=3). Pass this to addGotchiListing as
// `revenueTokens` so the on-chain claim function knows which tokens to
// sweep from the gotchi escrow at claim time. Listings created with an
// empty array CANNOT pay out alchemica via claimGotchiLending — the
// contract iterates over revenueTokens to determine what to split.
export const ALCHEMICA_TOKEN_ADDRESSES_BASE = [
  "0x2028b4043e6722Ea164946c82fe806c4a43a0fF4",
  "0xA32137bfb57d2b6A9Fd2956Ba4B54741a6D54b58",
  "0x15e7CaC885e3730ce6389447BC0f7AC032f31947",
  "0xE52b9170fF4ece4C35E796Ffd74B57Dec68Ca0e5",
] as `0x${string}`[];

// Minimal ERC20 ABI for GHST allowance + approve.
export const ERC20_ABI = [
  {
    name: "allowance",
    type: "function",
    stateMutability: "view",
    inputs: [
      { name: "owner", type: "address" },
      { name: "spender", type: "address" },
    ],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    name: "approve",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "spender", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [{ name: "", type: "bool" }],
  },
  {
    name: "balanceOf",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    name: "transfer",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "to", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [{ name: "", type: "bool" }],
  },
] as const;

// LendingFacet methods we currently need.
// AddGotchiListing tuple: (uint32 tokenId, uint96 initialCost, uint32 period,
//                         uint8[3] revenueSplit, address originalOwner, address thirdParty,
//                         uint32 whitelistId, address[] revenueTokens, uint256 permissions)
// agreeGotchiLending: (uint32 listingId, uint32 erc721TokenId, uint96 initialCost,
//                     uint32 period, uint8[3] revenueSplit)
export const LENDING_FACET_ABI = [
  {
    name: "agreeGotchiLending",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "_listingId", type: "uint32" },
      { name: "_erc721TokenId", type: "uint32" },
      { name: "_initialCost", type: "uint96" },
      { name: "_period", type: "uint32" },
      { name: "_revenueSplit", type: "uint8[3]" },
    ],
    outputs: [],
  },
  {
    name: "cancelGotchiLending",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [{ name: "_listingId", type: "uint32" }],
    outputs: [],
  },
  {
    name: "cancelGotchiLendingByToken",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [{ name: "_erc721TokenId", type: "uint32" }],
    outputs: [],
  },
  {
    name: "batchCancelGotchiLendingByToken",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [{ name: "_erc721TokenIds", type: "uint32[]" }],
    outputs: [],
  },
  {
    name: "claimGotchiLending",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [{ name: "_tokenId", type: "uint32" }],
    outputs: [],
  },
  {
    name: "batchClaimGotchiLending",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [{ name: "_tokenIds", type: "uint32[]" }],
    outputs: [],
  },
  {
    name: "claimAndEndGotchiLending",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [{ name: "_tokenId", type: "uint32" }],
    outputs: [],
  },
  {
    name: "batchClaimAndEndGotchiLending",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [{ name: "_tokenIds", type: "uint32[]" }],
    outputs: [],
  },
  {
    name: "claimAndEndAndRelistGotchiLending",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [{ name: "_tokenId", type: "uint32" }],
    outputs: [],
  },
  {
    name: "batchClaimAndEndAndRelistGotchiLending",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [{ name: "_tokenIds", type: "uint32[]" }],
    outputs: [],
  },
  {
    name: "addGotchiListing",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      {
        name: "p",
        type: "tuple",
        components: [
          { name: "tokenId", type: "uint32" },
          { name: "initialCost", type: "uint96" },
          { name: "period", type: "uint32" },
          { name: "revenueSplit", type: "uint8[3]" },
          { name: "originalOwner", type: "address" },
          { name: "thirdParty", type: "address" },
          { name: "whitelistId", type: "uint32" },
          { name: "revenueTokens", type: "address[]" },
          { name: "permissions", type: "uint256" },
        ],
      },
    ],
    outputs: [],
  },
  {
    name: "batchAddGotchiListing",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      {
        name: "listings",
        type: "tuple[]",
        components: [
          { name: "tokenId", type: "uint32" },
          { name: "initialCost", type: "uint96" },
          { name: "period", type: "uint32" },
          { name: "revenueSplit", type: "uint8[3]" },
          { name: "originalOwner", type: "address" },
          { name: "thirdParty", type: "address" },
          { name: "whitelistId", type: "uint32" },
          { name: "revenueTokens", type: "address[]" },
          { name: "permissions", type: "uint256" },
        ],
      },
    ],
    outputs: [],
  },
  {
    name: "setLendingOperator",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "_lendingOperator", type: "address" },
      { name: "_tokenId", type: "uint32" },
      { name: "_approved", type: "bool" },
    ],
    outputs: [],
  },
] as const;

// EscrowFacet on the same Aavegotchi diamond. Lets the gotchi's current owner
// sweep alchemica balances out of each per-token escrow. Gated by
// onlyAavegotchiOwner + onlyUnlocked — meaning the gotchi must NOT be in an
// active rental (lendings lock the token). For self-rental setups this means
// you must end rentals first, then sweep escrows.
export const ESCROW_FACET_ABI = [
  {
    name: "gotchiEscrow",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "_tokenId", type: "uint256" }],
    outputs: [{ name: "", type: "address" }],
  },
  {
    name: "escrowBalance",
    type: "function",
    stateMutability: "view",
    inputs: [
      { name: "_tokenId", type: "uint256" },
      { name: "_erc20Contract", type: "address" },
    ],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    name: "transferEscrow",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "_tokenId", type: "uint256" },
      { name: "_erc20Contract", type: "address" },
      { name: "_recipient", type: "address" },
      { name: "_transferAmount", type: "uint256" },
    ],
    outputs: [],
  },
  {
    name: "batchTransferEscrow",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "_tokenIds", type: "uint256[]" },
      { name: "_erc20Contracts", type: "address[]" },
      { name: "_recipients", type: "address[]" },
      { name: "_transferAmounts", type: "uint256[]" },
    ],
    outputs: [],
  },
] as const;

export const WHITELIST_FACET_ABI = [
  {
    name: "createWhitelist",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "_name", type: "string" },
      { name: "_whitelistAddresses", type: "address[]" },
    ],
    outputs: [],
  },
  {
    name: "updateWhitelist",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "_whitelistId", type: "uint32" },
      { name: "_whitelistAddresses", type: "address[]" },
    ],
    outputs: [],
  },
  {
    name: "removeAddressesFromWhitelist",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "_whitelistId", type: "uint32" },
      { name: "_whitelistAddresses", type: "address[]" },
    ],
    outputs: [],
  },
  {
    name: "transferOwnershipOfWhitelist",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "_whitelistId", type: "uint32" },
      { name: "_whitelistOwner", type: "address" },
    ],
    outputs: [],
  },
  {
    name: "setBorrowLimit",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "_whitelistId", type: "uint32" },
      { name: "_borrowlimit", type: "uint256" },
    ],
    outputs: [],
  },
] as const;

// RealmFacet diamond on Base — hosts Gotchiverse land/alchemica functions.
// Source: aavegotchi-gotchiverse-skill addresses.md (post-Base migration).
export const REALM_DIAMOND_BASE = "0x4B0040c3646D3c44B8a28Ad7055cfCF536c05372" as const;

// InstallationDiamond on Base — hosts installation crafting/types/balances.
export const INSTALLATION_DIAMOND_BASE = "0xebba5b725A2889f7f089a6cAE0246A32cad4E26b" as const;

// Minimal Realm ABI for claiming harvested reservoir alchemica from parcels.
// getAvailableAlchemica returns the per-parcel reservoir balance [FUD,FOMO,ALPHA,KEK]
// that harvesters have accumulated and is sweepable now (NOT the in-ground total).
// claimAllAvailableAlchemica sweeps many parcels' reservoirs to the parcel owner
// in one tx; _gotchiId must be a gotchi the owner controls (access mode 0 =
// owner-only here, so any owned gotchi works — locked/lent gotchis are fine).
export const REALM_FACET_ABI = [
  {
    name: "getAvailableAlchemica",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "_realmId", type: "uint256" }],
    outputs: [{ type: "uint256[4]" }],
  },
  {
    name: "claimAllAvailableAlchemica",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "_realmIds", type: "uint256[]" },
      { name: "_gotchiId", type: "uint256" },
      { name: "_signature", type: "bytes" },
    ],
    outputs: [],
  },
  // Claim one parcel's reservoir. On Base/geist the LibSignature backend
  // check was removed, so an empty `0x` signature is accepted.
  {
    name: "claimAvailableAlchemica",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "_realmId", type: "uint256" },
      { name: "_gotchiId", type: "uint256" },
      { name: "_signature", type: "bytes" },
    ],
    outputs: [],
  },
  // Channel a parcel's Aaltar. `_lastChanneled` is the GOTCHI's last-channel
  // timestamp from getLastChanneled(gotchiId). Empty `0x` signature on geist.
  {
    name: "channelAlchemica",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "_realmId", type: "uint256" },
      { name: "_gotchiId", type: "uint256" },
      { name: "_lastChanneled", type: "uint256" },
      { name: "_signature", type: "bytes" },
    ],
    outputs: [],
  },
  // Start a new survey round on a depleted parcel (owner-only, no gotchi).
  {
    name: "startSurveying",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [{ name: "_realmId", type: "uint256" }],
    outputs: [],
  },
  // Last-channel timestamp for a GOTCHI (channeling cooldown is per gotchi).
  {
    name: "getLastChanneled",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "_gotchiId", type: "uint256" }],
    outputs: [{ type: "uint256" }],
  },
  // Equipped Aaltar installation id for a parcel (0 = none). Level derives from id.
  {
    name: "getAltarId",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "_parcelId", type: "uint256" }],
    outputs: [{ type: "uint256" }],
  },
  // Whether a parcel is mid-survey (VRF pending) — survey is disabled until done.
  {
    name: "isSurveying",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "_realmId", type: "uint256" }],
    outputs: [{ type: "bool" }],
  },
  // Per-round surveyed alchemica [FUD,FOMO,ALPHA,KEK] for a survey round.
  {
    name: "getRoundAlchemica",
    type: "function",
    stateMutability: "view",
    inputs: [
      { name: "_realmId", type: "uint256" },
      { name: "_roundId", type: "uint256" },
    ],
    outputs: [{ type: "uint256[]" }],
  },
  // Unix timestamp the parcel's reservoirs were last emptied (claimed).
  {
    name: "lastClaimedAlchemica",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "_realmId", type: "uint256" }],
    outputs: [{ type: "uint256" }],
  },
  // Per-token harvest rate (alchemica/sec from equipped harvesters).
  {
    name: "getHarvestRates",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "_realmId", type: "uint256" }],
    outputs: [{ type: "uint256[]" }],
  },
  // Per-token reservoir capacity (max claimable before it stops filling).
  {
    name: "getCapacities",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "_realmId", type: "uint256" }],
    outputs: [{ type: "uint256[]" }],
  },
  // Per-token alchemica already claimed from this parcel.
  {
    name: "getTotalClaimed",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "_realmId", type: "uint256" }],
    outputs: [{ type: "uint256[]" }],
  },
  // Parcel metadata incl. the custom name (`parcelAddress`, e.g.
  // "generating-very-closer") vs the coordinate code (`parcelId`, "C-...").
  {
    name: "getParcelInfo",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "_realmId", type: "uint256" }],
    outputs: [
      {
        type: "tuple",
        components: [
          { name: "parcelId", type: "string" },
          { name: "parcelAddress", type: "string" },
          { name: "owner", type: "address" },
          { name: "coordinateX", type: "uint256" },
          { name: "coordinateY", type: "uint256" },
          { name: "size", type: "uint256" },
          { name: "district", type: "uint256" },
          { name: "boost", type: "uint256[4]" },
          { name: "timeRemainingToClaim", type: "uint256" },
        ],
      },
    ],
  },
  // Upgrade an equipped installation to its next level (Installation diamond).
  // Pays alchemica; queued by readyBlock (use finalizeUpgradesForParcels when
  // ready, or pass GLTR to skip the wait). geist accepts an empty signature.
  {
    name: "upgradeInstallation",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      {
        name: "_upgradeQueue",
        type: "tuple",
        components: [
          { name: "owner", type: "address" },
          { name: "coordinateX", type: "uint16" },
          { name: "coordinateY", type: "uint16" },
          { name: "readyBlock", type: "uint40" },
          { name: "claimed", type: "bool" },
          { name: "parcelId", type: "uint256" },
          { name: "installationId", type: "uint256" },
        ],
      },
      { name: "_gotchiId", type: "uint256" },
      { name: "_signature", type: "bytes" },
      { name: "_gltr", type: "uint40" },
    ],
    outputs: [],
  },
  // Finalize any ready (readyBlock reached) installation upgrades on parcels.
  {
    name: "finalizeUpgradesForParcels",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [{ name: "_parcelIds", type: "uint256[]" }],
    outputs: [],
  },
  // Craft L1 installations on the Installation diamond. Pays alchemica from the
  // caller (approve the 4 alchemica tokens to the diamond first). L1 farming
  // installs have craftTime 0 → minted instantly. _gltr can be all zeros.
  {
    name: "craftInstallations",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "_installationTypes", type: "uint16[]" },
      { name: "_gltr", type: "uint40[]" },
    ],
    outputs: [],
  },
  // Owned (unequipped) installations for an account: [{ installationId, balance }].
  {
    name: "installationsBalances",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "_account", type: "address" }],
    outputs: [
      {
        type: "tuple[]",
        components: [
          { name: "installationId", type: "uint256" },
          { name: "balance", type: "uint256" },
        ],
      },
    ],
  },
  // Per-parcel access mode for an action right (0 = channeling, 1 = empty
  // reservoir). 0 = owner only, higher = more permissive.
  {
    name: "getParcelsAccessRights",
    type: "function",
    stateMutability: "view",
    inputs: [
      { name: "_parcelIds", type: "uint256[]" },
      { name: "_actionRights", type: "uint256[]" },
    ],
    outputs: [{ type: "uint256[]" }],
  },
  // Place a level-1 installation on the parcel grid at (x,y). geist accepts 0x.
  {
    name: "equipInstallation",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "_realmId", type: "uint256" },
      { name: "_gotchiId", type: "uint256" },
      { name: "_installationId", type: "uint256" },
      { name: "_x", type: "uint256" },
      { name: "_y", type: "uint256" },
      { name: "_signature", type: "bytes" },
    ],
    outputs: [],
  },
  // Remove an installation from the parcel grid at its (x,y) origin.
  {
    name: "unequipInstallation",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "_realmId", type: "uint256" },
      { name: "_gotchiId", type: "uint256" },
      { name: "_installationId", type: "uint256" },
      { name: "_x", type: "uint256" },
      { name: "_y", type: "uint256" },
      { name: "_signature", type: "bytes" },
    ],
    outputs: [],
  },
  // Unix timestamp (seconds) a parcel was last channeled. A parcel can be
  // channeled again once CHANNEL_COOLDOWN_SEC has elapsed since this.
  {
    name: "getParcelLastChanneled",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "_parcelId", type: "uint256" }],
    outputs: [{ type: "uint256" }],
  },
] as const;

// Channeling cooldown in seconds. NOTE: the on-chain cooldown actually scales
// with the parcel's Aaltar level (higher altar → shorter cooldown), so this is
// an approximation. Defaults to 8h (the common high-altar value); adjust if your
// parcels differ. Used only to render the "next channel" countdown in the UI.
export const CHANNEL_COOLDOWN_SEC = 8 * 60 * 60;

// Reservoir emptying cooldown in seconds. After a parcel's reservoirs are
// claimed/emptied they can't be emptied again for this long, regardless of how
// fast getAvailableAlchemica re-accumulates. Confirmed at 8h against the live
// "Reservoirs ready" timer (emptied 2h ago → ready in 6h; 3h ago → in 5h),
// independent of Aaltar level. A reservoir is "ready" when
// lastClaimed + RESERVOIR_COOLDOWN_SEC <= now (or it was never emptied).
export const RESERVOIR_COOLDOWN_SEC = 8 * 60 * 60;

// Aaltar installation ids map to levels in two lines: 1–9 and 10–18.
export const altarLevelFromId = (id: number): number =>
  id <= 0 ? 0 : id <= 9 ? id : id - 9;

// Channeling cooldown (seconds) by Aaltar level. The on-chain values live in
// the un-exposed `channelingLimits` mapping; these are best-effort, anchored to
// the two known points (L6 = 4h, L9 = 1h). Adjust if exact values surface.
export const CHANNEL_COOLDOWN_SEC_BY_ALTAR: Record<number, number> = {
  1: 24 * 3600,
  2: 18 * 3600,
  3: 12 * 3600,
  4: 10 * 3600,
  5: 8 * 3600,
  6: 4 * 3600,
  7: 3 * 3600,
  8: 2 * 3600,
  9: 1 * 3600,
};

// Craftable level-1 farming installations (craftTime 0 → minted instantly).
// `cost` is display units [FUD,FOMO,ALPHA,KEK]; the chain charges the exact
// on-chain cost, so we approve max and don't pass cost in the tx.
export const CRAFTABLE_L1: { id: number; name: string; cost: number[] }[] = [
  { id: 10, name: "Aaltar", cost: [0, 0, 0, 0] },
  { id: 56, name: "FUD Harvester", cost: [125, 63, 0, 0] },
  { id: 65, name: "FOMO Harvester", cost: [104, 83, 0, 0] },
  { id: 74, name: "ALPHA Harvester", cost: [94, 63, 5, 0] },
  { id: 83, name: "KEK Harvester", cost: [115, 73, 0, 3] },
  { id: 92, name: "FUD Reservoir", cost: [290, 100, 0, 0] },
  { id: 101, name: "FOMO Reservoir", cost: [260, 130, 0, 0] },
  { id: 110, name: "ALPHA Reservoir", cost: [225, 90, 10, 0] },
  { id: 119, name: "KEK Reservoir", cost: [275, 110, 0, 5] },
];

// A parcel reservoir counts as "ready to claim" only if some token exceeds this
// (1 full token). Reservoirs refill to tiny dust amounts constantly, so without
// a floor every parcel always looks claimable and claim txs revert on the empty
// ones ("nothing to claim").
export const CLAIM_DUST_MIN = BigInt(10) ** BigInt(18);

// Bigint helper: max uint256
export const MAX_UINT256 = (BigInt(2) ** BigInt(256)) - BigInt(1);

// ---------------------------------------------------------------------------
// Marketplace (Baazaar) + auctions
// ---------------------------------------------------------------------------

// NFT contract addresses used as the `_contractAddress` arg when buying. Gotchis
// and parcels live on their respective diamonds; wearables/items on the wearable
// diamond; installations/tiles on theirs.
export const WEARABLE_DIAMOND_BASE = "0x052e6c114a166B0e91C2340370d72D4C33752B4b" as const;
export const TILE_DIAMOND_BASE = "0x617fdB8093b309e4699107F48812b407A7c37938" as const;

// GBM auction subgraph on Base (the dapp's /auction source). Indexes the
// `auctions` entity (id, type, tokenId, highestBid, highestBidder, startsAt,
// endsAt, cancelled, claimed) — GBMFacet has no on-chain enumeration.
export const GBM_BAAZAAR_SUBGRAPH_URL = GBM_SUBGRAPH;
export const CORE_SUBGRAPH_URL = CORE_SUBGRAPH;

// GBM auction contract on Base.
export const GBM_DIAMOND_BASE = "0x80320A0000C7A6a34086E2ACAD6915Ff57FfDA31" as const;

// Baazaar listing category numbers (verified against the dapp's queries +
// live listing data). NOTE: numbers differ by entity — erc721 uses 3=gotchi,
// 4=realm/parcel; erc1155 uses 0=wearable, 2=consumable, 4=installation,
// 5=tile. The erc1155 token lives on the contract in the comment, which is the
// `_contractAddress` the buy tx requires:
//   wearable/consumable -> Aavegotchi diamond (0xA99c…)
//   installation        -> installation diamond (0xebba5b…)
//   tile                -> tile diamond (0x617fdB…)
export const BAAZAAR_CATEGORY = {
  WEARABLE: 0,
  CONSUMABLE: 2,
  AAVEGOTCHI: 3,
  REALM: 4,
  INSTALLATION: 4,
  TILE: 5,
} as const;

// ERC721 Baazaar (gotchis, parcels). The "ToRecipient" variants carry price +
// tokenId so the tx reverts if the listing changed (front-run protection).
// MarketplaceFacet is hosted on the Aavegotchi diamond.
export const ERC721_MARKETPLACE_ABI = [
  {
    name: "executeERC721ListingToRecipient",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "_listingId", type: "uint256" },
      { name: "_contractAddress", type: "address" },
      { name: "_priceInWei", type: "uint256" },
      { name: "_tokenId", type: "uint256" },
      { name: "_recipient", type: "address" },
    ],
    outputs: [],
  },
  {
    // Base diamond takes a _category arg (3 = gotchi, 4 = realm). The 3-arg
    // Polygon-era variant does not exist on Base.
    name: "addERC721Listing",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "_erc721TokenAddress", type: "address" },
      { name: "_erc721TokenId", type: "uint256" },
      { name: "_category", type: "uint256" },
      { name: "_priceInWei", type: "uint256" },
    ],
    outputs: [],
  },
  {
    name: "cancelERC721Listing",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [{ name: "_listingId", type: "uint256" }],
    outputs: [],
  },
] as const;

// ERC1155 Baazaar (wearables, consumables, installations, tiles).
export const ERC1155_MARKETPLACE_ABI = [
  {
    name: "executeERC1155ListingToRecipient",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "_listingId", type: "uint256" },
      { name: "_contractAddress", type: "address" },
      { name: "_itemId", type: "uint256" },
      { name: "_quantity", type: "uint256" },
      { name: "_priceInWei", type: "uint256" },
      { name: "_recipient", type: "address" },
    ],
    outputs: [],
  },
  {
    // Base diamond takes a _category arg (0 wearable, 2 consumable, 4
    // installation, 5 tile). The 4-arg Polygon variant does not exist on Base.
    name: "setERC1155Listing",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "_erc1155TokenAddress", type: "address" },
      { name: "_erc1155TypeId", type: "uint256" },
      { name: "_quantity", type: "uint256" },
      { name: "_category", type: "uint256" },
      { name: "_priceInWei", type: "uint256" },
    ],
    outputs: [],
  },
  {
    name: "cancelERC1155Listing",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [{ name: "_listingId", type: "uint256" }],
    outputs: [],
  },
] as const;
