import { describe, expect, it } from "vitest";
import { assembleMessages } from "./chatPrompt";

describe("assembleMessages", () => {
  it("prepends remembered facts + lore as a context message, then history, then the user message", () => {
    const msgs = assembleMessages({
      facts: ["you are farming a Mythical set"],
      lore: ["Kinship measures your bond."],
      history: [{ role: "user", content: "earlier" }, { role: "assistant", content: "boo" }],
      userMessage: "how is kinship?",
    });
    expect(msgs[0].role).toBe("user");
    expect(msgs[0].content).toMatch(/Mythical set/);
    expect(msgs[0].content).toMatch(/Kinship measures/);
    expect(msgs[msgs.length - 1]).toEqual({ role: "user", content: "how is kinship?" });
  });

  it("omits the context message when there are no facts or lore", () => {
    const msgs = assembleMessages({ facts: [], lore: [], history: [], userMessage: "hi" });
    expect(msgs).toEqual([{ role: "user", content: "hi" }]);
  });
});
