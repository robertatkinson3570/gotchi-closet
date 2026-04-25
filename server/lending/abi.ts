// Minimal LendingFacet ABI for the auto-renew backend.
export const LENDING_FACET_ABI = [
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
] as const;

export const AAVEGOTCHI_DIAMOND_BASE = "0xA99c4B08201F2913Db8D28e71d020c4298F29dBF";
