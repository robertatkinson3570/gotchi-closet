import type { ChatMessage } from "../../src/lib/companion/types";
import type { ToolTurn } from "./llmProvider";
type Llm = (s: string, m: ChatMessage[], tools: any[], tier: any) => Promise<ToolTurn | null>;
type Dispatch = (name: string, args: Record<string, any>) => Promise<string>;

// Bounded tool loop. Tool results are appended as user turns tagged [tool:<name>] so the model
// sees them on the next pass. Returns the final text (never throws, never runs away).
export async function runAgentLoop(
  systemPrompt: string, messages: ChatMessage[], tools: any[], llm: Llm, dispatch: Dispatch, maxSteps = 4, tier: any = "free"
): Promise<string> {
  const convo: ChatMessage[] = [...messages];
  let last = "";
  for (let step = 0; step < maxSteps; step++) {
    const turn = await llm(systemPrompt, convo, tools, tier);
    if (!turn) break;
    if (turn.toolCall) {
      let result = "(tool failed)";
      try { result = await dispatch(turn.toolCall.name, turn.toolCall.args); } catch { /* keep fallback */ }
      convo.push({ role: "user", content: `[tool:${turn.toolCall.name}] ${result}` });
      continue;
    }
    if (turn.text) { last = turn.text; break; }
    break;
  }
  return last || "…";
}
