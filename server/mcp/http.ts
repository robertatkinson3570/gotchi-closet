// Keyed, rate-limited HTTP MCP endpoint (mounted at /mcp). This is how EXTERNAL
// customers reach Wisp: every request must carry a valid API key, and each tool
// call is metered against the key's plan limits (server/mcp/accounts.ts). Stateless
// StreamableHTTP — a fresh server+transport per request. Still zero LLM calls.

import type { Request, Response } from "express";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { createWispMcpServer } from "./server.js";
import { getAccountByKey, consumeRequest } from "./accounts.js";

function rpcError(res: Response, http: number, code: number, message: string, data?: unknown) {
  res.status(http).json({ jsonrpc: "2.0", error: { code, message, data }, id: null });
}

export async function wispMcpHttpHandler(req: Request, res: Response): Promise<void> {
  if (req.method !== "POST") {
    rpcError(res, 405, -32000, "Wisp MCP is stateless: use POST.");
    return;
  }

  // 1. Require a valid API key (Authorization: Bearer wsp_... or ?key=).
  const authHeader = String(req.headers.authorization || "");
  const bearer = authHeader.startsWith("Bearer ") ? authHeader.slice(7).trim() : "";
  const apiKey = bearer || String(req.query.key || "");
  if (!apiKey) {
    rpcError(res, 401, -32001, "Missing Wisp API key. Send Authorization: Bearer wsp_...");
    return;
  }
  if (!getAccountByKey(apiKey)) {
    rpcError(res, 401, -32001, "Invalid Wisp API key.");
    return;
  }

  // 2. Meter tool calls against the key's plan limits. Handshake/list are free
  //    (but still require a valid key, checked above).
  if ((req.body as { method?: string })?.method === "tools/call") {
    const gate = consumeRequest(apiKey);
    if (!gate.allowed) {
      rpcError(res, 429, -32002, `Wisp: ${gate.reason}. Upgrade or wait for the window to reset.`, {
        plan: gate.plan,
        usedToday: gate.usedToday,
        limitPerDay: gate.limitPerDay,
        usedMonth: gate.usedMonth,
        limitPerMonth: gate.limitPerMonth,
      });
      return;
    }
  }

  // 3. Serve the MCP request (fresh server+transport per request, stateless).
  const server = createWispMcpServer();
  const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
  res.on("close", () => {
    transport.close();
    server.close();
  });
  try {
    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);
  } catch (e: any) {
    if (!res.headersSent) rpcError(res, 500, -32603, e?.message ?? "internal error");
  }
}
