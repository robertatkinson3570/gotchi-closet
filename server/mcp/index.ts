// Wisp MCP server — stdio entry (local dev). BRING-YOUR-OWN-LLM: zero LLM calls.
// The tool registration lives in ./server.ts (shared with the keyed HTTP endpoint
// at server/mcp/http.ts, mounted at /mcp). Run: `npm run mcp` or `tsx server/mcp/index.ts`.

import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createWispMcpServer } from "./server.js";

async function main() {
  const server = createWispMcpServer();
  await server.connect(new StdioServerTransport());
  // stdout is the MCP channel — log only to stderr.
  console.error("[wisp mcp] gotchi-soul server ready on stdio");
}

main().catch((e) => {
  console.error("[wisp mcp] fatal:", e);
  process.exit(1);
});
