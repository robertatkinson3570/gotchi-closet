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

describe("the local model first on the free tier (LOCAL_LLM_URL, the owner's grimtwo)", () => {
  const LOCAL = "http://local.test:8080/v1/chat/completions";
  const GROQ = "https://api.groq.com/openai/v1/chat/completions";
  const ok = (message: any) => ({ ok: true, status: 200, json: async () => ({ choices: [{ message }] }) });
  const hi = [{ role: "user" as const, content: "hi" }];

  function useLocal(extra: Record<string, string> = {}) {
    vi.stubEnv("LOCAL_LLM_URL", LOCAL);
    vi.stubEnv("LOCAL_LLM_KEY", "local-secret");
    vi.stubEnv("GROQ_API_KEY", "groq-key");
    for (const [k, v] of Object.entries(extra)) vi.stubEnv(k, v);
    vi.spyOn(console, "info").mockImplementation(() => {});
    vi.spyOn(console, "warn").mockImplementation(() => {});
  }

  it("answers from the local model with thinking off, its own key and the qwen-moe default", async () => {
    useLocal();
    const calls: { url: string; init: any; body: any }[] = [];
    vi.stubGlobal("fetch", vi.fn(async (url: string, init: any) => {
      calls.push({ url, init, body: JSON.parse(init.body) });
      return ok({ content: "local boo" });
    }) as any);
    expect(await complete("sys", hi, "free")).toBe("local boo");
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe(LOCAL);
    expect(calls[0].init.headers.Authorization).toBe("Bearer local-secret");
    expect(calls[0].init.signal).toBeDefined();
    expect(calls[0].body.model).toBe("qwen-moe");
    expect(calls[0].body.reasoning_effort).toBe("none");
    expect(calls[0].body.chat_template_kwargs).toEqual({ enable_thinking: false });
    // The log names the provider, never the key.
    const logged = (console.info as any).mock.calls.flat().join(" ");
    expect(logged).toContain("answered by local");
    expect(logged).not.toContain("local-secret");
  });

  it("treats empty content with reasoning_content as a failure and falls through to Groq", async () => {
    useLocal({ LOCAL_LLM_MODEL: "qwen-other" });
    const urls: string[] = [];
    const models: string[] = [];
    vi.stubGlobal("fetch", vi.fn(async (url: string, init: any) => {
      urls.push(url);
      models.push(JSON.parse(init.body).model);
      return url === LOCAL ? ok({ content: "", reasoning_content: "Okay, the user said hi, so I should..." }) : ok({ content: "groq boo" });
    }) as any);
    expect(await complete("sys", hi, "free")).toBe("groq boo");
    expect(urls).toEqual([LOCAL, GROQ]);
    expect(models).toEqual(["qwen-other", "openai/gpt-oss-120b"]);
    expect((console.info as any).mock.calls.flat().join(" ")).toContain("answered by groq");

    urls.length = 0;
    const turn = await completeWithTools("sys", hi, [], "free");
    expect(turn).toEqual({ text: "groq boo", toolCall: null });
    expect(urls).toEqual([LOCAL, GROQ]);
  });

  it("falls through to Groq when the local model times out", async () => {
    useLocal({ LOCAL_LLM_TIMEOUT_MS: "25" });
    const urls: string[] = [];
    vi.stubGlobal("fetch", vi.fn((url: string, init: any) => {
      urls.push(url);
      if (url !== LOCAL) return Promise.resolve(ok({ content: "groq boo" }));
      // A cold prompt cache: never answers until the caller aborts.
      return new Promise((_resolve, reject) => {
        init.signal.addEventListener("abort", () => reject(Object.assign(new Error("aborted"), { name: "AbortError" })));
      });
    }) as any);
    const t0 = Date.now();
    expect(await complete("sys", hi, "free")).toBe("groq boo");
    expect(Date.now() - t0).toBeLessThan(2000);
    expect(urls).toEqual([LOCAL, GROQ]);
    expect((console.warn as any).mock.calls.flat().join(" ")).toContain("timeout after 25ms");
  });

  it("keeps today's order with LOCAL_LLM_URL unset: the Groq pair only, no signal, no local fields", async () => {
    vi.stubEnv("LOCAL_LLM_URL", "");
    vi.stubEnv("LOCAL_LLM_KEY", "local-secret");
    vi.stubEnv("GROQ_API_KEY", "groq-key");
    const info = vi.spyOn(console, "info").mockImplementation(() => {});
    const calls: { url: string; init: any; body: any }[] = [];
    vi.stubGlobal("fetch", vi.fn(async (url: string, init: any) => {
      calls.push({ url, init, body: JSON.parse(init.body) });
      return { ok: false, status: 429, text: async () => "rate limited" };
    }) as any);
    expect(await complete("sys", hi, "free")).toBeNull();
    expect(calls.map((c) => [c.url, c.body.model])).toEqual([[GROQ, "openai/gpt-oss-120b"], [GROQ, "openai/gpt-oss-20b"]]);
    for (const c of calls) {
      expect(Object.keys(c.init)).toEqual(["method", "headers", "body"]);
      expect(c.init.headers).toEqual({ "Content-Type": "application/json", Authorization: "Bearer groq-key" });
      expect(Object.keys(c.body)).toEqual(["model", "reasoning_effort", "max_tokens", "temperature", "messages"]);
    }
    expect(info).not.toHaveBeenCalled();
  });

  it("answers the premium tier from the local model first, like GVR", async () => {
    useLocal();
    vi.stubEnv("OPENAI_API_KEY", "openai-key");
    const urls: string[] = [];
    vi.stubGlobal("fetch", vi.fn(async (url: string) => { urls.push(url); return ok({ content: "local boo" }); }) as any);
    expect(await complete("sys", hi, "premium")).toBe("local boo");
    expect(urls).toEqual([LOCAL]);
  });

  it("falls the premium tier through to OpenAI (never Groq) when the local model fails", async () => {
    useLocal();
    vi.stubEnv("OPENAI_API_KEY", "openai-key");
    const urls: string[] = [];
    vi.stubGlobal("fetch", vi.fn(async (url: string) => {
      urls.push(url);
      return url === LOCAL ? { ok: false, status: 503, json: async () => ({}) } : ok({ content: "premium boo" });
    }) as any);
    expect(await complete("sys", hi, "premium")).toBe("premium boo");
    expect(urls).toEqual([LOCAL, "https://api.openai.com/v1/chat/completions"]);
  });

  it("keeps the premium tier on OpenAI alone with LOCAL_LLM_URL unset", async () => {
    vi.stubEnv("LOCAL_LLM_URL", "");
    vi.stubEnv("OPENAI_API_KEY", "openai-key");
    const urls: string[] = [];
    vi.stubGlobal("fetch", vi.fn(async (url: string) => { urls.push(url); return ok({ content: "premium boo" }); }) as any);
    expect(await complete("sys", hi, "premium")).toBe("premium boo");
    expect(urls).toEqual(["https://api.openai.com/v1/chat/completions"]);
  });
});
