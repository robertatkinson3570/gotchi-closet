// Aavegotchi diamond on Base (hosts LendingFacet, WhitelistFacet, etc.)
// Source: Aavegotchi wiki (post-Base migration)
export const AAVEGOTCHI_DIAMOND_BASE = "0xA99c4B08201F2913Db8D28e71d020c4298F29dBF" as const;

// GHST token on Base
export const GHST_TOKEN_BASE = "0xcD2F22236DD9Dfe2356D7C543161D4d260FD9BcB" as const;

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

// Bigint helper: max uint256
export const MAX_UINT256 = (BigInt(2) ** BigInt(256)) - BigInt(1);
