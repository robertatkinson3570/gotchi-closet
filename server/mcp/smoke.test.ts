import { describe, it, expect, vi, afterAll, beforeAll } from "vitest";

// Hermetic: mock the subgraph fetch so the smoke test makes no network calls.
vi.mock("../companion/gotchiState", () => ({
  fetchGotchiState: vi.fn(async (id: string) => ({
    name: `Gotchi #${id}`,
    numericTraits: [50, 80, 20, 60, 0, 0],
    kinship: 500,
    level: 5,
    createdAt: 1_700_000_000,
    equippedWearables: [],
    owner: "0x0000000000000000000000000000000000000abc",
  })),
}));

import { getPersona, getSoul, buildChatContext, getRoastSetup, verifySoul, stewardStatus, stewardLog, stewardPreview, stewardRunNow } from "./tools";
import { createWispMcpServer } from "./server";
import { closeDb } from "../companion/db";
import { getStewardDb, closeStewardDb, enroll } from "../steward/db";

afterAll(() => closeDb());

describe("wisp mcp tools — zero-LLM context provider", () => {
  it("getPersona returns a non-empty systemPrompt", async () => {
    const r = await getPersona("1");
    expect(typeof r.systemPrompt).toBe("string");
    expect(r.systemPrompt.length).toBeGreaterThan(50);
  });

  it("getSoul returns numeric depth + level + a valid seal status", async () => {
    const r = await getSoul("1");
    expect(typeof r.depth).toBe("number");
    expect(typeof r.level).toBe("string");
    expect(["unconfigured", "unsealed", "sealed"]).toContain(r.sealStatus);
  });

  it("buildChatContext assembles { systemPrompt, messages } with no LLM", async () => {
    const r = await buildChatContext("1", "hi fren");
    expect(typeof r.systemPrompt).toBe("string");
    expect(Array.isArray(r.messages)).toBe(true);
    expect(r.messages.length).toBeGreaterThan(0);
    expect(r.messages[r.messages.length - 1]).toEqual({ role: "user", content: "hi fren" });
  });

  it("getRoastSetup returns archetypes + rules for both sides", async () => {
    const r = await getRoastSetup("1", "2");
    expect(r.a.archetype).toBeTruthy();
    expect(r.b.archetype).toBeTruthy();
    expect(r.a.systemPrompt.length).toBeGreaterThan(20);
    expect(r.rules.length).toBeGreaterThan(20);
  });

  it("verifySoul returns a configured flag", async () => {
    const r = await verifySoul("1");
    expect(typeof r.configured).toBe("boolean");
  });
});

describe("wisp mcp tools — steward dogfood surface", () => {
  beforeAll(() => { process.env.STEWARD_DB_PATH = ":memory:"; getStewardDb(); });
  afterAll(() => closeStewardDb());

  it("registers the four steward tools on the MCP server", () => {
    const server = createWispMcpServer();
    expect(server).toBeTruthy();
    // The created server exposes registered tools internally; the construction above
    // exercises registerTool for steward_status/log/preview/run_now without throwing.
    const names = Object.keys((server as any)._registeredTools ?? {});
    expect(names).toEqual(
      expect.arrayContaining(["steward_status", "steward_log", "steward_preview", "steward_run_now"])
    );
  });

  it("steward_status / steward_log read the enrollment store (pure DB, no network)", () => {
    enroll({ owner: "0xAbC", gotchiId: 7, chores: { pet: true, channel: false, claim: false }, intervalSec: 28800 });
    expect(stewardStatus("0xabc")).toHaveLength(1);
    expect(stewardStatus("0xabc")[0].gotchiId).toBe(7);
    expect(Array.isArray(stewardLog("0xabc"))).toBe(true);
  });

  it("exposes the network-bound preview/run handlers as async functions", () => {
    // preview/run perform on-chain reads (and run submits via the session key), so they are
    // not executed here — assert they are wired as callable async tools.
    expect(typeof stewardPreview).toBe("function");
    expect(typeof stewardRunNow).toBe("function");
  });
});
