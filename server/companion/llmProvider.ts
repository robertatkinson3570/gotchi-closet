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
