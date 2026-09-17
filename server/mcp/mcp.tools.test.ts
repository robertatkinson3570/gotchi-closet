import { describe, it, expect, vi, afterAll, afterEach } from "vitest";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { readFileSync, readdirSync } from "node:fs";

process.env.COMPANION_DB_PATH = join(tmpdir(), `wisp-mcp-tools-test-${process.pid}.db`);

// THE SPY ON THE MODEL (08-wisp-chat.md §8.5): the MCP tool server makes zero
// LLM calls. The provider is mocked with counters, and every tool call below
// must leave them at zero.
const llm = vi.hoisted(() => ({ complete: vi.fn(async () => "never"), completeWithTools: vi.fn(async () => ({ text: "never", toolCall: null })) }));
vi.mock("../companion/llmProvider", () => ({ complete: llm.complete, completeWithTools: llm.completeWithTools }));

import { getHistory, getKeeperReport } from "./tools";
import { createWispMcpServer } from "./server";
import { appendMessage, closeDb } from "../companion/db";

const W = "0x4444444444444444444444444444444444444444";
afterAll(() => closeDb());
afterEach(() => vi.unstubAllGlobals());

describe("get_history and get_keeper_report: data with zero LLM calls", () => {
  it("get_history returns the shared log with client per turn, filters by client, caps the limit, and calls no model", () => {
    appendMessage(W, "9638", "user", "closet turn");
    appendMessage(W, "9638", "assistant", "gvr said", "gvr");
    appendMessage(W, "9638", "user", "app said", "wsp_ab12cd34");
    const all = getHistory("9638", W, 30);
    expect(all.wallet).toBe(W);
    expect(all.messages.map((m) => [m.role, m.content, m.client])).toEqual([["user", "closet turn", "closet"], ["assistant", "gvr said", "gvr"], ["user", "app said", "wsp_ab12cd34"]]);
    expect(all.messages.every((m) => typeof m.ts === "number")).toBe(true);
    expect(getHistory("9638", W, 30, "gvr").messages.map((m) => m.content)).toEqual(["gvr said"]);
    expect(getHistory("9638", W, 1, "all").messages).toHaveLength(1);
    expect(() => getHistory("9638", W, 30, "evil")).toThrow(/client/);
    expect(() => getHistory("9638", "nope", 30)).toThrow(/wallet/);
    expect(llm.complete).not.toHaveBeenCalled();
    expect(llm.completeWithTools).not.toHaveBeenCalled();
  });

  it("get_keeper_report forwards the signed read to GVR and returns facts and cites only (no voice, no raw rows); a refusal is an error", async () => {
    const fetchSpy = vi.fn(async (url: string) => ({
      status: 200,
      json: async () => ({
        ok: true, wallet: W, tokenId: "9638", asOfBlock: "51376268", at: 1_758_000_000_000, voiced: true, text: "the VOICED prose",
        report: { lines: [{ key: "permissions", severity: "act", text: "2 approvals can move your money.", facts: [{ key: "n", label: "approvals", value: "2" }], cites: [{ queryId: "kg:1", asOfBlock: "51376268", chains: [8453] }], raw: [{ spender: "0xdead" }] }] },
        actions: [{ kind: "revoke", to: "0xdead" }],
        url,
      }),
    }));
    vi.stubGlobal("fetch", fetchSpy);
    const r = await getKeeperReport(W, "9638", 1_758_000_000_000, "0xabc");
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(String(fetchSpy.mock.calls[0]![0])).toMatch(new RegExp(`/api/analyst/standing/${W}/9638\\?signedAt=1758000000000&signature=0xabc$`));
    expect(r).toEqual({
      wallet: W, tokenId: "9638", asOfBlock: "51376268", at: 1_758_000_000_000,
      lines: [{ key: "permissions", severity: "act", text: "2 approvals can move your money.", facts: [{ key: "n", label: "approvals", value: "2" }], cites: [{ queryId: "kg:1", asOfBlock: "51376268", chains: [8453] }] }],
      actions: [{ kind: "revoke", to: "0xdead" }],
    });
    expect(JSON.stringify(r)).not.toContain("VOICED");
    expect(JSON.stringify(r)).not.toContain("spender"); // the line's raw metric rows are gone; the prepared action keeps its own address
    vi.stubGlobal("fetch", vi.fn(async () => ({ status: 401, json: async () => ({ error: "signature stale; sign again" }) })));
    await expect(getKeeperReport(W, "9638", 1, "0xabc")).rejects.toThrow(/401.*signature stale/);
    expect(llm.complete).not.toHaveBeenCalled();
    expect(llm.completeWithTools).not.toHaveBeenCalled();
  });

  it("the MCP server registers both tools, and no file under server/mcp names the LLM provider outside a comment", () => {
    const names = Object.keys((createWispMcpServer() as any)._registeredTools ?? {});
    expect(names).toEqual(expect.arrayContaining(["get_history", "get_keeper_report"]));
    const dir = join(__dirname);
    for (const f of readdirSync(dir).filter((n) => n.endsWith(".ts") && !n.endsWith(".test.ts"))) {
      const code = readFileSync(join(dir, f), "utf8").split("\n").filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l)).join("\n");
      expect(code, f).not.toMatch(/llmProvider|\bcomplete\(/);
    }
  });
});
