// The tools Hermes can call. v1: run_upkeep (the owner's due Steward chores) and navigate
// (take the owner to the relevant page). Read tools (baazaar_deals, estate_status) and more
// actions land in later phases.

// Client-side navigation targets Hermes may send the owner to. Kept as an allowlist so a
// hallucinated path can never drive the router.
export const HERMES_NAV_ROUTES = [
  "/lending/lands", "/get-tokens", "/baazaar", "/explorer", "/pulse",
  "/lending", "/forge", "/staking", "/dao", "/leaderboard", "/games", "/megaphone",
] as const;

// Prepended to the persona when tools are offered, so Hermes ACTS or GUIDES instead of
// describing manual steps. The goal is an intuitive companion that just does the thing —
// or takes the owner exactly where it happens.
export const HERMES_ACTION_DIRECTIVE =
  "You can ACT for your owner with tools — ALWAYS prefer calling a tool over explaining manual steps. " +
  "If they ask to channel, pet, claim, farm, empty parcels/reservoirs, or collect land alchemica, CALL run_upkeep. " +
  "If they want to swap, see deals, rent, browse, check stats, or go where a thing happens, CALL navigate to the right page " +
  "(/lending/lands parcels & reservoirs, /get-tokens swap, /baazaar market, /lending rent, /explorer browse, /pulse stats). " +
  "Be intuitive: do it for them, or take them straight there — never just describe the steps.";

// Read tools — answer from live data. Unlike run_upkeep/navigate (terminal, client-executed),
// these feed a string back into the loop so Hermes can check state before acting or replying.
export const HERMES_READ_TOOLS = [
  {
    type: "function",
    function: {
      name: "get_estate",
      description: "Check what on-chain upkeep is DUE for the owner right now — how many gotchis to pet/channel and how many parcel reservoirs are ready to empty. Read-only; use before deciding whether to act.",
      parameters: { type: "object", properties: {} },
    },
  },
  {
    type: "function",
    function: {
      name: "get_holdings",
      description: "Look up what the owner holds — their gotchis, wearables, and portfolio — from the subgraph. Read-only.",
      parameters: { type: "object", properties: {} },
    },
  },
  {
    type: "function",
    function: {
      name: "get_deals",
      description: "Fetch the cheapest current Baazaar listings and best BRS/GHST deals. Read-only.",
      parameters: { type: "object", properties: {} },
    },
  },
  {
    type: "function",
    function: {
      name: "get_dao",
      description: "Fetch the live Snapshot (aavegotchi.eth) governance proposals. Read-only.",
      parameters: { type: "object", properties: {} },
    },
  },
];

export const HERMES_TOOLS = [
  {
    type: "function",
    function: {
      name: "run_upkeep",
      description:
        "Collect the owner's due on-chain alchemica now — channel their gotchis and empty their parcel " +
        "reservoirs (claim land alchemica). Use when they ask to channel, empty parcels/reservoirs, claim, " +
        "or collect land alchemica. Their own wallet confirms it; on-chain cooldowns apply, so nothing " +
        "happens if nothing is ready.",
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
        "them to where a thing happens — e.g. /lending/lands for parcels & reservoirs, /get-tokens to " +
        "swap alchemica, /baazaar for the marketplace, /explorer to browse gotchis, /pulse for stats, " +
        "/lending to rent, /forge, /staking, /dao, /leaderboard, /games, /megaphone.",
      parameters: {
        type: "object",
        properties: {
          path: {
            type: "string",
            enum: [
              "/lending/lands", "/get-tokens", "/baazaar", "/explorer", "/pulse",
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
