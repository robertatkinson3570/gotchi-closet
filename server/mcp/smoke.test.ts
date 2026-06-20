import { describe, it, expect, vi, afterAll } from "vitest";

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

import { getPersona, getSoul, buildChatContext, getRoastSetup, verifySoul } from "./tools";
import { closeDb } from "../companion/db";

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
