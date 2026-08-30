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

  it("parses a text-form <function=...> call (llama-on-Groq quirk) as a tool call", async () => {
    vi.stubEnv("GROQ_API_KEY", "test-key");
    vi.stubGlobal("fetch", vi.fn(async () => ({
      ok: true,
      json: async () => ({ choices: [{ message: { content: 'sure! <function=navigate>{"path":"/steward"}</function>' } }] }),
    })) as any);
    const out = await completeWithTools("sys", [{ role: "user", content: "take me to steward" }], [], "free");
    expect(out?.toolCall?.name).toBe("navigate");
    expect(out?.toolCall?.args.path).toBe("/steward");
  });

  it("strips stray function markup from plain text so it never leaks to the user", async () => {
    vi.stubEnv("GROQ_API_KEY", "test-key");
    vi.stubGlobal("fetch", vi.fn(async () => ({
      ok: true,
      json: async () => ({ choices: [{ message: { content: "hello <function=foo></function> there" } }] }),
    })) as any);
    const out = await completeWithTools("sys", [{ role: "user", content: "hi" }], [], "free");
    expect(out?.text).not.toContain("<function");
  });
});

describe("the served Groq models (2026-08-29: llama-3.x retired → every chat was the template)", () => {
  it("asks Groq for the gpt-oss pair with a low reasoning budget, and never sends that field to OpenAI", async () => {
    vi.stubEnv("GROQ_API_KEY", "test-key");
    vi.stubEnv("OPENAI_API_KEY", "test-key");
    const calls: any[] = [];
    vi.stubGlobal("fetch", vi.fn(async (_url: string, init: any) => {
      calls.push(JSON.parse(init.body));
      return { ok: false, status: 404, text: async () => "model_not_found" };
    }) as any);
    await complete("sys", [{ role: "user", content: "hi" }], "free");
    expect(calls.map((c) => c.model)).toEqual(["openai/gpt-oss-120b", "openai/gpt-oss-20b"]);
    for (const c of calls) expect(c.reasoning_effort).toBe("low");
    calls.length = 0;
    await complete("sys", [{ role: "user", content: "hi" }], "premium");
    expect(calls.map((c) => c.model)).toEqual(["gpt-4o-mini"]);
    expect(calls[0]).not.toHaveProperty("reasoning_effort");
  });
});
