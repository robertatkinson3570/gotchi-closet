# Wisp MCP — gotchi soul, bring your own LLM

An [MCP](https://modelcontextprotocol.io) server that exposes a gotchi's **soul, persona, memory context, and roast scaffold** to any AI client. It is **bring-your-own-LLM**: this server makes **zero LLM calls** — your model generates the words; Wisp provides the soul.

## Run

```bash
npm run mcp        # tsx server/mcp/index.ts  (stdio transport)
```

## Connect from Claude Desktop

Add to `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "wisp": {
      "command": "npx",
      "args": ["tsx", "server/mcp/index.ts"],
      "cwd": "/absolute/path/to/gotchi-closet"
    }
  }
}
```

Then ask Claude to "embody gotchi 1589" (the `embody_gotchi` prompt) or call any tool.

## Tools (all deterministic — no LLM)

| Tool | Args | Returns |
|---|---|---|
| `get_soul` | `tokenId` | depth, level, kinship, seal status |
| `get_persona` | `tokenId` | `{ systemPrompt }` — load into YOUR model to speak as the gotchi |
| `build_chat_context` | `tokenId, message, wallet?` | `{ systemPrompt, messages }` — feed to YOUR model to get the reply |
| `get_roast_setup` | `tokenIdA, tokenIdB` | archetypes + voices + rules; YOUR model writes the burns |
| `verify_soul` | `tokenId` | on-chain seal status |
| `get_history` | `tokenId, wallet, limit?, client?` | the shared companion log (Closet, GVR and keyed apps as `wsp_<first8>`), newest-last; `client` filters |
| `get_keeper_report` | `wallet, tokenId, signedAt, signature` | the holder's latest nightly keeper report from GVR: facts and cites only, no voice (the holder signs the keeper read message) |

Prompt: `embody_gotchi(tokenId)` — loads the gotchi's persona so your model becomes it.

## How a client uses it (BYO-LLM)

1. Call `build_chat_context(tokenId, message)` → get `{ systemPrompt, messages }`.
2. Send that to **your own** model (OpenAI, Anthropic, local, …) with **your** keys.
3. Show the reply. Wisp never touched an LLM; you own the model + cost.

## Invariant

`server/mcp/*` makes **no LLM calls** (CI check: `grep -rnE "llmProvider|complete\(" server/mcp/*.ts` must match only comments). Generation is always the client's job. The optional hosted-generation tier (future) is the only sanctioned exception and lives behind paid billing.

## Hosted chat for third-party apps (Wisp key)

Keeper Gotchi slice 08 (`docs/briefs/keeper-gotchi/08-wisp-chat.md` in GVR). A third-party app pays for a Wisp plan and its users get gotchi **companion chat on our models**, as a peer client of Gotchi Closet and GVR: same gotchi, same shared history. This is the one sanctioned exception to "zero LLM calls", and it lives on the HTTP chat route only, never on an MCP tool.

```
1. Create a Wisp account and key: POST https://api.gotchicloset.com/api/mcp/account  → { apiKey: "wsp_…", plan: "free" }
2. Buy a plan (the existing /api/mcp/quote + /api/mcp/buy flow); chat unlocks on holder / pro / studio.
   Free has no chat. A lapsed plan falls back to free and is refused the same way.
3. Set your app context: PATCH /api/mcp/account   Authorization: Bearer wsp_…
           { "context": { "appName": "Gotchi Garden", "appUrl": "https://…", "kbLines": ["…", "…"], "navMap": { "greenhouse": "/greenhouse" } } }
   appName replaces Gotchi Closet in the gotchi's idea of where it lives; kbLines (max 20 × 200 chars) are folded as
   <data> facts after the lore, never instructions; navMap makes "take me to the greenhouse" answer { navigate: "/greenhouse" }.
   GET /api/mcp/account (same header) shows { plan, chat, chatPerDay, chatPerMinute, chatUsedToday, context }.
4. Ask the player for a wallet grant (Sign-In with Ethereum, free, no gas). Without one, chat still works as a guest:
   the same gotchi and public chain data, but no history is read or written and the reply says memory: false.
           POST /api/mcp/grants/prepare   Bearer wsp_…   { "wallet": "0x…", "domain": "yourgame.com", "uri": "https://yourgame.com/play", "days": 90 }
        →  { message }   the player signs it in their wallet (personal_sign), unchanged, within 10 minutes
           POST /api/mcp/grants           Bearer wsp_…   { "message": "…", "signature": "0x…" }
        →  { wallet, domain, grantedAt, expiresAt }   (days 1 to 365, default 90; one signature per grant, never reusable)
   GET /api/mcp/grants lists your live grants; DELETE /api/mcp/grants/0x… drops one. The holder sees and removes
   grants from the companion panel on Gotchi Closet. Key rotation keeps them.
5. Chat:   POST https://api.gotchicloset.com/api/companion/chat
           Authorization: Bearer wsp_…
           { "tokenId": "9638", "wallet": "0x…", "message": "what's my gotchi up to?" }
        →  { reply, navigate?, memory, client: "wsp_ab12cd34", plan, usedToday, limitPerDay }
        →  429 { error: "chat cap reached", reason, plan, usedToday, limitPerDay, resetsAt } at the cap, on a lapsed plan
           ("plan lapsed") or on a free key ("chat not in plan"); never a model call in any of those.
        →  401 { error: "Wisp key required" } for a bad key.
6. History: GET /api/companion/history/9638/0x…?client=all   (Bearer wsp_…; ?client=closet | gvr | wsp_ab12cd34 filters)
   Your app may also write the player's side of turns it answered on its own model: POST /api/companion/history { wallet, tokenId, turns: [{ role, content, ts? }] }
   (Bearer wsp_…; every turn is tagged with your key whatever the body says). Both answer 403 for a wallet without a grant.
   A key writes role user turns freely. A role assistant turn from a key is accepted only when it is the exact reply
   POST /api/companion/chat produced for that wallet and gotchi in the last 10 minutes (an echo); any other text in the
   gotchi's voice is 400. Your own model's replies are your app's, never the gotchi's, and are not written to the shared log.
   When the holder removes your app from the companion panel, the grant is revoked and every row your key wrote for that
   wallet is deleted with it.
7. Facts without a model: MCP tools get_history and get_keeper_report (metered by your tool quota, zero LLM calls).
   POST /mcp takes one JSON-RPC request per call; an array body (a JSON-RPC batch) is refused with -32600 "batches are not supported".
   Over a key, get_history, build_chat_context with a wallet and the steward reads also need the wallet's grant,
   build_chat_context never includes Closet's private remembered facts, and steward_run_now is not offered.
Your users' turns land in the same log Closet and GVR write to; the gotchi remembers across all three.
```

What a keyed turn gets and does not get: the persona, the soul, the lore and (with the wallet's grant) the shared history, plus the public subgraph
summaries (holdings, lending, deals, DAO, estate). It never gets the wallet's private desk memory (Closet's remembered
facts and action log) or GVR's ledger facts, it never remembers a fact from a keyed turn, and it cannot act: the gotchi
says your app can show the user where to do that. A Wisp key never reaches the analyst (`/api/companion/ask` answers
403 to a keyed request); keyed chat is companion chat only.

Partner keys: developers the owner picks (`npx tsx scripts/wisp-partner.ts add <key or tag> [note]`, `list`, `remove`) use
Wisp free and never lapse; their players pay. Chat through a partner key is metered per player (`PARTNER_LIMITS` in
`src/lib/wisp/pricing.ts`): a player who granted the app gets `playerFreePerDay` turns a day across every partner app, or
`playerPaidPerDay` when their own wallet holds a paid Wisp plan; players who have not granted share the key's `guestPerDay`
pool. Refusals add `player plan required`, `player daily cap reached` and `guest daily cap reached`; replies carry
`playerUsedToday` and `playerLimitPerDay`. There is no HTTP route that sets the flag.

Metering: `chatPerDay` and `chatPerMinute` per plan in `src/lib/wisp/pricing.ts` (holder 200 / 6, pro 2,000 / 12,
studio 20,000 / 20). Hosted chat lands on the same local model rail as GVR's own companion and analyst chat, which is why
a per-minute burst cap exists beside the day cap. Prices are unchanged.

## v1 limitations

- The MCP tools are read-only; metering is per key (`/mcp`, plan limits in `src/lib/wisp/pricing.ts`). Persistent chat memory is the shared log above.
- Aavegotchi-only (trait/lore are Aavegotchi-coded); the collection-agnostic refactor makes the same tools serve any collection.
- stdio transport only; a remote HTTP transport + API-key auth is the storefront step.
