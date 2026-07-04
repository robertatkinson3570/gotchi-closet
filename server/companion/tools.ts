// The tools Hermes can call. v1: run_upkeep (the owner's due Steward chores) and navigate
// (take the owner to the relevant page). Read tools (baazaar_deals, estate_status) and more
// actions land in later phases.

// Client-side navigation targets Hermes may send the owner to. Kept as an allowlist so a
// hallucinated path can never drive the router.
export const HERMES_NAV_ROUTES = [
  "/steward", "/get-tokens", "/baazaar", "/explorer", "/pulse",
  "/lending", "/forge", "/staking", "/dao", "/leaderboard", "/games", "/megaphone",
] as const;

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
  {
    type: "function",
    function: {
      name: "navigate",
      description:
        "Take the owner to a page in GotchiCloset. Use when they ask to go somewhere, or to bring " +
        "them to where a thing happens — e.g. /steward for automation & upkeep, /get-tokens to swap " +
        "alchemica, /baazaar for the marketplace, /explorer to browse gotchis, /pulse for stats, " +
        "/lending to rent, /forge, /staking, /dao, /leaderboard, /games, /megaphone.",
      parameters: {
        type: "object",
        properties: {
          path: {
            type: "string",
            enum: [
              "/steward", "/get-tokens", "/baazaar", "/explorer", "/pulse",
              "/lending", "/forge", "/staking", "/dao", "/leaderboard", "/games", "/megaphone",
            ],
            description: "the route to navigate to",
          },
        },
        required: ["path"],
      },
    },
  },
];
