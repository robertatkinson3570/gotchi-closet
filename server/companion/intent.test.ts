import { expect, test, describe } from "vitest";
import { detectNav, isHelpIntent, CAPABILITIES_REPLY } from "./intent";

describe("detectNav — deterministic navigation across the whole site", () => {
  const cases: [string, string][] = [
    ["take me to the baazaar", "/baazaar"],
    ["take me to deals", "/baazaar"],
    ["show me deals", "/baazaar"],
    ["open the marketplace", "/baazaar"],
    ["go to my lands", "/lending/lands"],
    ["take me to parcels", "/lending/lands"],
    ["show me the reservoirs", "/lending/lands"],
    ["go to lending", "/lending"],
    ["take me to rentals", "/lending"],
    ["take me to lendings", "/lending"],
    ["show me my rentals", "/lending"],
    ["open get tokens", "/get-tokens"],
    ["take me to swap", "/get-tokens"],
    ["show me the forge", "/forge"],
    ["go to staking", "/staking"],
    ["take me to the dao", "/dao"],
    ["show me governance", "/dao"],
    ["open the leaderboard", "/leaderboard"],
    ["take me to pulse", "/pulse"],
    ["go to the explorer", "/explorer"],
    ["show me games", "/games"],
    ["open megaphone", "/megaphone"],
  ];
  for (const [msg, route] of cases) {
    test(`"${msg}" -> ${route}`, () => expect(detectNav(msg)).toBe(route));
  }

  test("data questions do NOT navigate (no motion verb)", () => {
    expect(detectNav("any deals now?")).toBeNull();
    expect(detectNav("what lendings do i have?")).toBeNull();
    expect(detectNav("what do i own?")).toBeNull();
    expect(detectNav("how does channeling work?")).toBeNull();
  });
});

describe("isHelpIntent", () => {
  test("triggers on help/capability phrasings", () => {
    for (const m of ["help", "what can you do", "what can you do?", "list commands", "commands", "what do you do", "your abilities"]) {
      expect(isHelpIntent(m)).toBe(true);
    }
  });
  test("does not trigger on normal chat", () => {
    for (const m of ["empty my reservoirs", "any deals now?", "how are you"]) {
      expect(isHelpIntent(m)).toBe(false);
    }
  });
  test("CAPABILITIES_REPLY lists the core things", () => {
    expect(CAPABILITIES_REPLY).toMatch(/baazaar/i);
    expect(CAPABILITIES_REPLY).toMatch(/reservoir|channel|collect/i);
    expect(CAPABILITIES_REPLY).toMatch(/own|rent/i);
  });
});
