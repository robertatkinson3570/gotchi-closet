import { describe, expect, it } from "vitest";
import { filterInbound, screenOutbound } from "./contentFilter";

describe("filterInbound", () => {
  it("masks profanity and flags a deflect", () => {
    const r = filterInbound("you stupid shit");
    expect(r.deflected).toBe(true);
    expect(r.masked).not.toContain("shit");
    expect(r.masked).toContain("****");
  });

  it("passes clean text through untouched", () => {
    const r = filterInbound("hello friend, tell me about yourself");
    expect(r.deflected).toBe(false);
    expect(r.masked).toBe("hello friend, tell me about yourself");
  });
});

describe("screenOutbound", () => {
  it("masks any profanity the model emits", () => {
    expect(screenOutbound("that's shit").includes("shit")).toBe(false);
  });
});
