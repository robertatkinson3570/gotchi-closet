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
  getHistory,
  getKeeperReport,
} from "./tools.js";
import { hasGrant } from "./grants.js";
import { NO_WALLET_GRANT } from "../companion/walletAccess.js";

const tokenId = z.string().regex(/^\d+$/, "tokenId must be a numeric string");
const ownerAddr = z.string().regex(/^0x[0-9a-fA-F]+$/, "owner must be a 0x wallet address");

const ok = (v: unknown) => ({
  content: [{ type: "text" as const, text: JSON.stringify(v, null, 2) }],
});
const fail = (e: unknown) => ({
  isError: true,
  content: [{ type: "text" as const, text: `error: ${(e as Error)?.message ?? String(e)}` }],
});

/** `apiKey`: the Wisp key of an HTTP request. Its wallet-scoped tools answer
 *  only for wallets that granted the key (mcp/grants.ts), it never sees
 *  Closet's private remembered facts, and it cannot force steward runs.
 *  No key: the local stdio server on the operator's own machine. */
export function createWispMcpServer(opts: { apiKey?: string } = {}): McpServer {
  const server = new McpServer({ name: "wisp-gotchi-soul", version: "0.1.0" });
  const keyed = typeof opts.apiKey === "string";
  const mayRead = (wallet: string) => !keyed || hasGrant(opts.apiKey!, wallet);

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
      try {
        if (!keyed) return ok(await buildChatContext(tokenId, message, wallet));
        if (wallet && !mayRead(wallet)) return fail(new Error(NO_WALLET_GRANT));
        return ok(await buildChatContext(tokenId, message, wallet, { facts: false }));
      } catch (e) { return fail(e); }
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
      try { if (!mayRead(owner)) return fail(new Error(NO_WALLET_GRANT)); return ok(stewardStatus(owner)); } catch (e) { return fail(e); }
    }
  );

  server.registerTool(
    "steward_log",
    {
      description: "Recent steward action log for a wallet (automated runs + errors, with tx hashes).",
      inputSchema: { owner: ownerAddr },
    },
    async ({ owner }) => {
      try { if (!mayRead(owner)) return fail(new Error(NO_WALLET_GRANT)); return ok(stewardLog(owner)); } catch (e) { return fail(e); }
    }
  );

  server.registerTool(
    "steward_preview",
    {
      description: "Preview what each active steward WOULD pet/channel/claim right now. No transaction is sent.",
      inputSchema: { owner: ownerAddr },
    },
    async ({ owner }) => {
      try { if (!mayRead(owner)) return fail(new Error(NO_WALLET_GRANT)); return ok(await stewardPreview(owner)); } catch (e) { return fail(e); }
    }
  );

  if (!keyed) server.registerTool(
    "steward_run_now",
    {
      description: "Force a run cycle for this wallet's due stewards (per-enrollment intervals still enforced).",
      inputSchema: { owner: ownerAddr },
    },
    async ({ owner }) => {
      try { return ok(await stewardRunNow(owner)); } catch (e) { return fail(e); }
    }
  );

  // KEEPER GOTCHI (08-wisp-chat.md §8.2): read-only, metered by the same
  // tools/call quota as every other tool, zero LLM calls.
  server.registerTool(
    "get_history",
    {
      description:
        "The shared companion chat log for a gotchi + owner wallet: every client's turns (Gotchi Closet, GVR, keyed apps as wsp_<first8>), newest-last. " +
        "client filters to one writer (closet | gvr | wsp_<first8> | all). No LLM is called.",
      inputSchema: { tokenId, wallet: ownerAddr, limit: z.number().int().min(1).max(100).optional(), client: z.string().max(16).optional() },
    },
    async ({ tokenId, wallet, limit, client }) => {
      try { if (!mayRead(wallet)) return fail(new Error(NO_WALLET_GRANT)); return ok(getHistory(tokenId, wallet, limit ?? 30, client)); } catch (e) { return fail(e); }
    }
  );

  server.registerTool(
    "get_keeper_report",
    {
      description:
        "The holder's latest nightly keeper report from GVR (the Watch, the Lookout, the Scribe, the Ferryman, the Herald): facts and cites only, " +
        "no voice. The holder signs the keeper read message (signedAt + signature) and GVR verifies it. No LLM is called.",
      inputSchema: { wallet: ownerAddr, tokenId, signedAt: z.union([z.number(), z.string()]), signature: z.string().regex(/^0x[0-9a-fA-F]+$/) },
    },
    async ({ wallet, tokenId, signedAt, signature }) => {
      try { return ok(await getKeeperReport(wallet, tokenId, signedAt, signature)); } catch (e) { return fail(e); }
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
