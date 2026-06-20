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

Prompt: `embody_gotchi(tokenId)` — loads the gotchi's persona so your model becomes it.

## How a client uses it (BYO-LLM)

1. Call `build_chat_context(tokenId, message)` → get `{ systemPrompt, messages }`.
2. Send that to **your own** model (OpenAI, Anthropic, local, …) with **your** keys.
3. Show the reply. Wisp never touched an LLM; you own the model + cost.

## Invariant

`server/mcp/*` makes **no LLM calls** (CI check: `grep -rnE "llmProvider|complete\(" server/mcp/*.ts` must match only comments). Generation is always the client's job. The optional hosted-generation tier (future) is the only sanctioned exception and lives behind paid billing.

## v1 limitations

- Read-only + stateless context; persistent memory writes, seals, and metering come later.
- Aavegotchi-only (trait/lore are Aavegotchi-coded); the collection-agnostic refactor makes the same tools serve any collection.
- stdio transport only; a remote HTTP transport + API-key auth is the storefront step.
