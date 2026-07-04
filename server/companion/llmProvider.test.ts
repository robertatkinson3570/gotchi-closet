import { describe, expect, it, vi, afterEach } from "vitest";
import { complete, completeWithTools } from "./llmProvider";

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

describe("complete", () => {
  it("returns null when no API key is configured for the tier", async () => {
    vi.stubEnv("GROQ_API_KEY", "");
    const out = await complete("sys", [{ role: "user", content: "hi" }], "free");
    expect(out).toBeNull();
  });

  it("returns the model text on a successful response", async () => {
    vi.stubEnv("GROQ_API_KEY", "test-key");
    vi.stubGlobal("fetch", vi.fn(async () => ({
      ok: true,
      json: async () => ({ choices: [{ message: { content: "boo!" } }] }),
    })) as any);
    const out = await complete("sys", [{ role: "user", content: "hi" }], "free");
    expect(out).toBe("boo!");
  });

  it("returns null on a non-ok response (route will fall back to template)", async () => {
    vi.stubEnv("GROQ_API_KEY", "test-key");
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: false, status: 429, text: async () => "rate limited" })) as any);
    const out = await complete("sys", [{ role: "user", content: "hi" }], "free");
    expect(out).toBeNull();
  });
});

describe("completeWithTools", () => {
  it("returns a tool call when the model emits one", async () => {
    vi.stubEnv("GROQ_API_KEY", "test-key");
    vi.stubGlobal("fetch", vi.fn(async () => ({
      ok: true,
      json: async () => ({ choices: [{ message: { tool_calls: [
        { id: "c1", type: "function", function: { name: "run_upkeep", arguments: '{"tokenId":"7"}' } },
      ] } }] }),
    })) as any);
    const out = await completeWithTools("sys", [{ role: "user", content: "channel my gotchi 7" }],
      [{ type: "function", function: { name: "run_upkeep", description: "d", parameters: { type: "object", properties: {} } } }], "free");
    expect(out?.toolCall?.name).toBe("run_upkeep");
    expect(out?.toolCall?.args.tokenId).toBe("7");
  });

  it("returns text when the model does not call a tool", async () => {
    vi.stubEnv("GROQ_API_KEY", "test-key");
    vi.stubGlobal("fetch", vi.fn(async () => ({
      ok: true, json: async () => ({ choices: [{ message: { content: "boo!" } }] }),
    })) as any);
    const out = await completeWithTools("sys", [{ role: "user", content: "hi" }], [], "free");
    expect(out?.toolCall).toBeNull();
    expect(out?.text).toBe("boo!");
  });
});
