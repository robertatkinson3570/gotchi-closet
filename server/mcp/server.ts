// Builds the Wisp MCP server (tools + prompt). Shared by the stdio entry
// (index.ts) and the keyed HTTP endpoint (http.ts). Zero LLM calls — see tools.ts.

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import {
  getSoul,
  getPersona,
  buildChatContext,
  getRoastSetup,
  verifySoul,
  stewardStatus,
  stewardLog,
  stewardPreview,
  stewardRunNow,
} from "./tools.js";

const tokenId = z.string().regex(/^\d+$/, "tokenId must be a numeric string");
const ownerAddr = z.string().regex(/^0x[0-9a-fA-F]+$/, "owner must be a 0x wallet address");

const ok = (v: unknown) => ({
  content: [{ type: "text" as const, text: JSON.stringify(v, null, 2) }],
});
const fail = (e: unknown) => ({
  isError: true,
  content: [{ type: "text" as const, text: `error: ${(e as Error)?.message ?? String(e)}` }],
});

export function createWispMcpServer(): McpServer {
  const server = new McpServer({ name: "wisp-gotchi-soul", version: "0.1.0" });

  server.registerTool(
    "get_soul",
    {
      description: "Soul summary for a gotchi: depth, level, kinship, and on-chain seal status.",
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
        "The character's persona/system prompt. Load it into YOUR model to speak as this character (bring your own LLM).",
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
        "A ready chat turn { systemPrompt, messages } for YOUR model to generate the reply. No LLM is called here.",
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
        "Roast battle scaffold (archetypes, voices, rules) for two characters. YOUR model writes the burns.",
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

  server.registerTool(
    "steward_status",
    {
      description: "Steward enrollments for a wallet (active/paused/revoked + chores + interval).",
      inputSchema: { owner: ownerAddr },
    },
    async ({ owner }) => {
      try { return ok(stewardStatus(owner)); } catch (e) { return fail(e); }
    }
  );

  server.registerTool(
    "steward_log",
    {
      description: "Recent steward action log for a wallet (automated runs + errors, with tx hashes).",
      inputSchema: { owner: ownerAddr },
    },
    async ({ owner }) => {
      try { return ok(stewardLog(owner)); } catch (e) { return fail(e); }
    }
  );

  server.registerTool(
    "steward_preview",
    {
      description: "Preview what each active steward WOULD pet/channel/claim right now. No transaction is sent.",
      inputSchema: { owner: ownerAddr },
    },
    async ({ owner }) => {
      try { return ok(await stewardPreview(owner)); } catch (e) { return fail(e); }
    }
  );

  server.registerTool(
    "steward_run_now",
    {
      description: "Force a run cycle for this wallet's due stewards (per-enrollment intervals still enforced).",
      inputSchema: { owner: ownerAddr },
    },
    async ({ owner }) => {
      try { return ok(await stewardRunNow(owner)); } catch (e) { return fail(e); }
    }
  );

  server.registerPrompt(
    "embody_gotchi",
    {
      description: "Load a character's soul as a prompt so your model becomes it.",
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
              text: `Embody this character for the rest of our conversation. Stay in character.\n\n${systemPrompt}`,
            },
          },
        ],
      };
    }
  );

  return server;
}
