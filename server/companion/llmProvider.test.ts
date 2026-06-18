import { describe, expect, it, vi, afterEach } from "vitest";
import { complete } from "./llmProvider";

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
