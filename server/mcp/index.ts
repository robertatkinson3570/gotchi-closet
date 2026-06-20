// Wisp MCP server (stdio). Exposes the gotchi soul/companion/roast engine as
// read + context tools for any MCP client. BRING-YOUR-OWN-LLM: this server makes
// NO LLM calls — clients generate with their own model + keys. See ./tools.ts.
//
// Run: `npm run mcp` (or `tsx server/mcp/index.ts`). Connect from Claude Desktop
// or any MCP client over stdio.

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import {
  getSoul,
  getPersona,
  buildChatContext,
  getRoastSetup,
  verifySoul,
} from "./tools.js";

const tokenId = z.string().regex(/^\d+$/, "tokenId must be a numeric string");

const ok = (v: unknown) => ({
  content: [{ type: "text" as const, text: JSON.stringify(v, null, 2) }],
});
const fail = (e: unknown) => ({
  isError: true,
  content: [{ type: "text" as const, text: `error: ${(e as Error)?.message ?? String(e)}` }],
});

const server = new McpServer({ name: "wisp-gotchi-soul", version: "0.1.0" });

server.registerTool(
  "get_soul",
  {
    description:
      "Soul summary for a gotchi: depth, level, kinship, and on-chain seal status.",
    inputSchema: { tokenId },
  },
  async ({ tokenId }) => {
    try { return ok(await getSoul(tokenId)); } catch (e) { return fail(e); }
  }
);

server.registerTool(
  "get_persona",
  {
    description:
      "The gotchi's persona/system prompt. Load it into YOUR model to speak as this gotchi (bring your own LLM).",
    inputSchema: { tokenId },
  },
  async ({ tokenId }) => {
    try { return ok(await getPersona(tokenId)); } catch (e) { return fail(e); }
  }
);

server.registerTool(
  "build_chat_context",
  {
    description:
      "A ready chat turn { systemPrompt, messages } for YOUR model to generate the gotchi's reply. No LLM is called here.",
    inputSchema: { tokenId, message: z.string().min(1), wallet: z.string().optional() },
  },
  async ({ tokenId, message, wallet }) => {
    try { return ok(await buildChatContext(tokenId, message, wallet)); } catch (e) { return fail(e); }
  }
);

server.registerTool(
  "get_roast_setup",
  {
    description:
      "Roast battle scaffold (archetypes, voices, rules) for two gotchis. YOUR model writes the burns.",
    inputSchema: { tokenIdA: tokenId, tokenIdB: tokenId },
  },
  async ({ tokenIdA, tokenIdB }) => {
    try { return ok(await getRoastSetup(tokenIdA, tokenIdB)); } catch (e) { return fail(e); }
  }
);

server.registerTool(
  "verify_soul",
  {
    description: "On-chain seal status for a gotchi (configured + latest seal record).",
    inputSchema: { tokenId },
  },
  async ({ tokenId }) => {
    try { return ok(await verifySoul(tokenId)); } catch (e) { return fail(e); }
  }
);

server.registerPrompt(
  "embody_gotchi",
  {
    description: "Load a gotchi's soul as a prompt so your model becomes that gotchi.",
    argsSchema: { tokenId },
  },
  async ({ tokenId }) => {
    const { systemPrompt } = await getPersona(tokenId);
    return {
      messages: [
        {
          role: "user" as const,
          content: {
            type: "text" as const,
            text: `Embody this gotchi for the rest of our conversation. Stay in character.\n\n${systemPrompt}`,
          },
        },
      ],
    };
  }
);

async function main() {
  await server.connect(new StdioServerTransport());
  // stdout is the MCP channel — log only to stderr.
  console.error("[wisp mcp] gotchi-soul server ready on stdio");
}

main().catch((e) => {
  console.error("[wisp mcp] fatal:", e);
  process.exit(1);
});
