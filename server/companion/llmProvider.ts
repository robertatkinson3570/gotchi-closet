import type { ChatMessage, Tier } from "../../src/lib/companion/types";

interface ProviderCfg { url: string; key: string; model: string; }

function cfgFor(tier: Tier): ProviderCfg | null {
  if (tier === "premium") {
    const key = process.env.OPENAI_API_KEY || "";
    if (!key) return null;
    return { url: "https://api.openai.com/v1/chat/completions", key, model: process.env.OPENAI_MODEL || "gpt-4o-mini" };
  }
  const key = process.env.GROQ_API_KEY || "";
  if (!key) return null;
  return { url: "https://api.groq.com/openai/v1/chat/completions", key, model: process.env.GROQ_MODEL || "llama-3.3-70b-versatile" };
}

export async function complete(
  systemPrompt: string,
  messages: ChatMessage[],
  tier: Tier
): Promise<string | null> {
  const cfg = cfgFor(tier);
  if (!cfg) return null;
  try {
    const res = await fetch(cfg.url, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${cfg.key}` },
      body: JSON.stringify({
        model: cfg.model,
        max_tokens: 450,
        temperature: 0.8,
        messages: [{ role: "system", content: systemPrompt }, ...messages],
      }),
    });
    if (!res.ok) return null;
    const json: any = await res.json();
    const text = json?.choices?.[0]?.message?.content;
    return typeof text === "string" && text.trim() ? text.trim() : null;
  } catch {
    return null;
  }
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
  const cfg = cfgFor(tier);
  if (!cfg) return null;
  try {
    const res = await fetch(cfg.url, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${cfg.key}` },
      body: JSON.stringify({
        model: cfg.model,
        max_tokens: 450,
        temperature: 0.7,
        tools,
        tool_choice: "auto",
        messages: [{ role: "system", content: systemPrompt }, ...messages],
      }),
    });
    if (!res.ok) return null;
    const msg: any = (await res.json())?.choices?.[0]?.message;
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
      return { text: null, toolCall: { id: tc.id ?? "text", name: tc.function.name, args } };
    }
    // Strip any stray function markup so the user never sees raw tool syntax.
    const raw = typeof msg?.content === "string" ? msg.content.replace(/<function=[\s\S]*?<\/function>/g, "").trim() : "";
    const text = raw.length ? raw : null;
    return { text, toolCall: null };
  } catch {
    return null;
  }
}
