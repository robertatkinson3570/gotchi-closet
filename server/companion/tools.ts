// The tools Hermes can call. v1: run_upkeep (the owner's due Steward chores) and navigate
// (take the owner to the relevant page). Read tools (baazaar_deals, estate_status) and more
// actions land in later phases.

// Client-side navigation targets Hermes may send the owner to. Kept as an allowlist so a
// hallucinated path can never drive the router.
export const HERMES_NAV_ROUTES = [
  "/steward", "/get-tokens", "/baazaar", "/explorer", "/pulse",
  "/lending", "/forge", "/staking", "/dao", "/leaderboard", "/games", "/megaphone",
] as const;

// Prepended to the persona when tools are offered, so Hermes ACTS or GUIDES instead of
// describing manual steps. The goal is an intuitive companion that just does the thing —
// or takes the owner exactly where it happens.
export const HERMES_ACTION_DIRECTIVE =
  "You can ACT for your owner with tools — ALWAYS prefer calling a tool over explaining manual steps. " +
  "If they ask to channel, pet, claim, farm, or do upkeep (their gotchis or parcels), CALL run_upkeep for the current gotchi. " +
  "If they want to swap, see deals, rent, browse, check stats, or go where a thing happens, CALL navigate to the right page " +
  "(/steward upkeep, /get-tokens swap, /baazaar market, /lending rent, /explorer browse, /pulse stats). " +
  "Be intuitive: do it for them, or take them straight there — never just describe the steps.";

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
