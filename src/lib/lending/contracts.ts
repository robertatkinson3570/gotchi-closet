// Aavegotchi diamond on Base (hosts LendingFacet, WhitelistFacet, etc.)
// Source: Aavegotchi wiki (post-Base migration)
export const AAVEGOTCHI_DIAMOND_BASE = "0xA99c4B08201F2913Db8D28e71d020c4298F29dBF" as const;

// GHST token on Base
export const GHST_TOKEN_BASE = "0xcD2F22236DD9Dfe2356D7C543161D4d260FD9BcB" as const;

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
    name: "claimGotchiLending",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [{ name: "_tokenId", type: "uint32" }],
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
