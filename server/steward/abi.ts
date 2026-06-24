// server/steward/abi.ts
// Action surface for Steward. Addresses + signatures verified live on Base 8453 on
// 2026-06-23 (selectors resolve via DiamondLoupe facetAddress; claim/channel accept a
// "0x" signature on the geist build). See docs/steward/2026-06-23-steward-design.md.

export const AAVEGOTCHI_DIAMOND = "0xA99c4B08201F2913Db8D28e71d020c4298F29dBF" as const;
export const REALM_DIAMOND = "0x4B0040c3646D3c44B8a28Ad7055cfCF536c05372" as const;

export const PET_ABI = [
  {
    name: "interact",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [{ name: "_tokenIds", type: "uint256[]" }],
    outputs: [],
  },
  // Operator-pattern fallback (Ledger-friendly, no EIP-7702): the owner approves a relayer
  // once, and the relayer may ONLY interact() on their behalf. Selectors verified on Base
  // (see plans/006-gasless-petting.md): setPetOperatorForAll 0xcd675d57, isPetOperatorForAll 0xd7358fea.
  {
    name: "setPetOperatorForAll",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [{ name: "_operator", type: "address" }, { name: "_approved", type: "bool" }],
    outputs: [],
  },
  {
    name: "isPetOperatorForAll",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "_owner", type: "address" }, { name: "_operator", type: "address" }],
    outputs: [{ name: "", type: "bool" }],
  },
] as const;

export const REALM_ABI = [
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
] as const;

export const CHORES = ["pet", "channel", "claim"] as const;
export type Chore = (typeof CHORES)[number];
