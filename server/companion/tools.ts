// The tools Hermes can call. v1: run_upkeep (the owner's due Steward chores). Read tools
// (baazaar_deals, estate_status) and more actions land in later phases.

export const HERMES_TOOLS = [
  {
    type: "function",
    function: {
      name: "run_upkeep",
      description:
        "Perform the owner's gotchi's due on-chain upkeep now (pet / channel alchemica / claim), " +
        "using their enrolled Steward automation. Use when the owner asks you to channel, pet, or claim " +
        "for a gotchi they own. On-chain cooldowns still apply; nothing happens if nothing is due.",
      parameters: {
        type: "object",
        properties: {
          tokenId: { type: "string", description: "the gotchi token id to act on" },
        },
        required: ["tokenId"],
      },
    },
  },
];
