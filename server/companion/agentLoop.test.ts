import { expect, test } from "vitest";
import { runAgentLoop } from "./agentLoop";

test("runs a tool then answers, feeding the result back", async () => {
  const calls: string[] = []; let t = 0;
  const llm = async (_s: string, msgs: any[]) => {
    t++;
    if (t === 1) return { text: null, toolCall: { id: "1", name: "get_estate", args: {} } };
    expect(JSON.stringify(msgs)).toContain("2 reservoirs ready");
    return { text: "You've got 2 reservoirs ready — collect?", toolCall: null };
  };
  const dispatch = async (n: string) => { calls.push(n); return "2 reservoirs ready"; };
  const out = await runAgentLoop("sys", [{ role: "user", content: "what's ready?" }], [], llm as any, dispatch, 4);
  expect(calls).toEqual(["get_estate"]);
  expect(out).toContain("2 reservoirs ready");
});

test("bounded — never infinite-loops", async () => {
  const llm = async () => ({ text: null, toolCall: { id: "x", name: "loop", args: {} } });
  const out = await runAgentLoop("sys", [{ role: "user", content: "hi" }], [], llm as any, async () => "again", 2);
  expect(typeof out).toBe("string");
});
