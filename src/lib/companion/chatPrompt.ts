import type { ChatMessage } from "./types";

export function assembleMessages(args: {
  facts: string[];
  lore: string[];
  history: ChatMessage[];
  userMessage: string;
}): ChatMessage[] {
  const { facts, lore, history, userMessage } = args;
  const out: ChatMessage[] = [];
  const ctx: string[] = [];
  if (facts.length) ctx.push(`What you remember about your owner:\n- ${facts.join("\n- ")}`);
  if (lore.length) ctx.push(`Relevant Gotchiverse facts (use only if asked):\n- ${lore.join("\n- ")}`);
  if (ctx.length) out.push({ role: "user", content: `[context]\n${ctx.join("\n\n")}` });
  out.push(...history);
  out.push({ role: "user", content: userMessage });
  return out;
}
