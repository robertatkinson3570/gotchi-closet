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

// Bigint helper: max uint256
export const MAX_UINT256 = (BigInt(2) ** BigInt(256)) - BigInt(1);
