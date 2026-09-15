import type { ChatMessage, Tier } from "../../src/lib/companion/types";

interface ProviderCfg {
  /** Short provider name for the log line ("local" / "groq" / "openai"). Never the key. */
  name: string;
  url: string;
  key: string;
  models: string[];
  extra?: Record<string, unknown>;
  /** Abort the request (and move on to the next provider) after this many ms. */
  timeoutMs?: number;
}

const LOCAL_MODEL_DEFAULT = "qwen-moe";
const LOCAL_TIMEOUT_MS_DEFAULT = 12000;

/** The owner's local model (llama-swap on grimtwo over the tailnet), when LOCAL_LLM_URL is set.
 *  llama.cpp IGNORES reasoning_effort "low": a Qwen3 model then spends its whole max_tokens on
 *  reasoning_content and answers content "". "none" plus enable_thinking=false turns thinking
 *  off. The box has 4 slots shared with GVR and a cold prompt cache can take 15-17 s, so the
 *  short timeout hands a slow turn to Groq instead of hanging the chat. */
function localCfg(): ProviderCfg | null {
  const url = (process.env.LOCAL_LLM_URL || "").trim();
  if (!url) return null;
  const timeout = Number.parseInt(process.env.LOCAL_LLM_TIMEOUT_MS || "", 10);
  return {
    name: "local",
    url,
    key: process.env.LOCAL_LLM_KEY || "",
    models: [process.env.LOCAL_LLM_MODEL || LOCAL_MODEL_DEFAULT],
    extra: { reasoning_effort: "none", chat_template_kwargs: { enable_thinking: false } },
    timeoutMs: Number.isFinite(timeout) && timeout > 0 ? timeout : LOCAL_TIMEOUT_MS_DEFAULT,
  };
}

function groqCfg(): ProviderCfg | null {
  const key = process.env.GROQ_API_KEY || "";
  if (!key) return null;
  // 2026-08-29: Groq RETIRED llama-3.3-70b-versatile AND llama-3.1-8b-instant (both answer
  // model_not_found) — every completion returned null and every gotchi collapsed to the
  // "spirits are quiet" template for days, in Closet and in GVR alike. The served models are
  // now the gpt-oss pair (each its own daily free-tier bucket, so the 20b fallback still keeps
  // chat alive when the 120b cap is hit — lower quality beats dead). They are REASONING models:
  // without reasoning_effort=low the thinking eats max_tokens and content comes back "".
  const primary = process.env.GROQ_MODEL || "openai/gpt-oss-120b";
  const fallback = process.env.GROQ_FALLBACK_MODEL || "openai/gpt-oss-20b";
  return {
    name: "groq",
    url: "https://api.groq.com/openai/v1/chat/completions", key,
    models: primary === fallback ? [primary] : [primary, fallback],
    extra: { reasoning_effort: process.env.GROQ_REASONING_EFFORT || "low" },
  };
}

/** The providers a tier tries, in order. Premium = OpenAI only (unchanged). Free = the local
 *  model first when LOCAL_LLM_URL is set, then the Groq pair; with it unset, exactly the Groq pair. */
function chainFor(tier: Tier): ProviderCfg[] {
  if (tier === "premium") {
    const key = process.env.OPENAI_API_KEY || "";
    if (!key) return [];
    return [{ name: "openai", url: "https://api.openai.com/v1/chat/completions", key, models: [process.env.OPENAI_MODEL || "gpt-4o-mini"] }];
  }
  const chain: ProviderCfg[] = [];
  const local = localCfg();
  if (local) chain.push(local);
  const groq = groqCfg();
  if (groq) chain.push(groq);
  return chain;
}

/** One POST, with the provider's timeout covering the body read too. The Authorization header
 *  is sent only when a key is configured; the key itself is never logged. */
async function postJson(cfg: ProviderCfg, body: Record<string, unknown>): Promise<{ ok: boolean; status: number; json: any }> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (cfg.key) headers.Authorization = `Bearer ${cfg.key}`;
  if (!cfg.timeoutMs) {
    const res = await fetch(cfg.url, { method: "POST", headers, body: JSON.stringify(body) });
    return { ok: res.ok, status: res.status, json: res.ok ? await res.json() : null };
  }
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), cfg.timeoutMs);
  try {
    const res = await fetch(cfg.url, { method: "POST", headers, body: JSON.stringify(body), signal: ctl.signal });
    return { ok: res.ok, status: res.status, json: res.ok ? await res.json() : null };
  } finally {
    clearTimeout(timer);
  }
}

/** Only name the answering provider when a local endpoint is configured, so that with
 *  LOCAL_LLM_URL unset the log output is exactly what it was before the local rail existed. */
function logAnswered(kind: string, cfg: ProviderCfg, model: string): void {
  if ((process.env.LOCAL_LLM_URL || "").trim()) console.info(`[llm] ${kind} answered by ${cfg.name} (${model})`);
}

function isThinkingOnly(msg: any): boolean {
  return typeof msg?.reasoning_content === "string" && msg.reasoning_content.trim().length > 0;
}

export async function complete(
  systemPrompt: string,
  messages: ChatMessage[],
  tier: Tier
): Promise<string | null> {
  for (const cfg of chainFor(tier)) {
    for (const model of cfg.models) {
      const tag = cfg.name === "local" ? `local ${model}` : model;
      try {
        const res = await postJson(cfg, {
          model,
          ...cfg.extra,
          max_tokens: 320,
          temperature: 0.8,
          messages: [{ role: "system", content: systemPrompt }, ...messages],
        });
        if (!res.ok) { console.warn(`[llm] complete ${tag} !ok ${res.status}`); continue; } // try next model
        const msg = res.json?.choices?.[0]?.message;
        const text = msg?.content;
        if (typeof text === "string" && text.trim()) { logAnswered("complete", cfg, model); return text.trim(); }
        // Empty content: the next model/provider gets the turn (a thinking-only reply is a failure).
        if (cfg.name === "local") console.warn(`[llm] complete ${tag} empty content${isThinkingOnly(msg) ? " (reasoning only)" : ""}`);
      } catch (e: any) {
        console.warn(`[llm] complete ${tag} threw: ${e?.name === "AbortError" ? `timeout after ${cfg.timeoutMs}ms` : e?.message ?? e}`);
      }
    }
  }
  return null;
}

export interface ToolCall { id: string; name: string; args: Record<string, any>; }
export interface ToolTurn { text: string | null; toolCall: ToolCall | null; }

// Like complete(), but offers the model a set of tools. Returns either a tool call
// (the model wants to act) or plain text (normal reply). null when no key/tier or on error.
export async function completeWithTools(
  systemPrompt: string,
  messages: ChatMessage[],
  tools: any[],
  tier: Tier
): Promise<ToolTurn | null> {
  for (const cfg of chainFor(tier)) {
  for (const model of cfg.models) {
   const tag = cfg.name === "local" ? `local ${model}` : model;
   try {
    const res = await postJson(cfg, {
      model,
      ...cfg.extra,
      max_tokens: 320,
      temperature: 0.7,
      tools,
      tool_choice: "auto",
      messages: [{ role: "system", content: systemPrompt }, ...messages],
    });
    if (!res.ok) { console.warn(`[llm] tools ${tag} !ok ${res.status}`); continue; } // try next model
    const msg: any = res.json?.choices?.[0]?.message;
    let tc = msg?.tool_calls?.[0];
    // Some models (llama on Groq) emit the call as TEXT — <function=name>{json}</function> —
    // instead of the structured tool_calls field. Parse that shape as a real tool call.
    if (!tc && typeof msg?.content === "string") {
      const m = msg.content.match(/<function=([a-zA-Z_][\w]*)>\s*(\{[\s\S]*?\})\s*<\/function>/);
      if (m) tc = { id: "text", type: "function", function: { name: m[1], arguments: m[2] } };
    }
    if (tc?.function?.name) {
      let args: Record<string, any> = {};
      try { args = JSON.parse(tc.function.arguments || "{}"); } catch { args = {}; }
      logAnswered("tools", cfg, model);
      return { text: null, toolCall: { id: tc.id ?? "text", name: tc.function.name, args } };
    }
    // Strip any stray function markup so the user never sees raw tool syntax.
    const raw = typeof msg?.content === "string" ? msg.content.replace(/<function=[\s\S]*?<\/function>/g, "").trim() : "";
    const text = raw.length ? raw : null;
    // The local model answering nothing (typically all reasoning_content, no content) is a
    // failure: hand the turn to the next provider instead of returning an empty reply.
    if (text === null && cfg.name === "local") {
      console.warn(`[llm] tools ${tag} empty content${isThinkingOnly(msg) ? " (reasoning only)" : ""}`);
      continue;
    }
    logAnswered("tools", cfg, model);
    return { text, toolCall: null };
   } catch (e: any) {
    console.warn(`[llm] tools ${tag} threw: ${e?.name === "AbortError" ? `timeout after ${cfg.timeoutMs}ms` : e?.message ?? e}`);
   }
  }
  }
  return null;
}
