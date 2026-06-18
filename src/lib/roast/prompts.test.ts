import { describe, it, expect } from "vitest";
import {
  archetypeFor,
  roastSystemPrompt,
  judgeSystemPrompt,
  roastLineUser,
} from "./prompts";

describe("archetypeFor", () => {
  it("returns Gladiator when AGG >= 75", () => {
    expect(archetypeFor([50, 75, 50, 50])).toBe("Gladiator");
    expect(archetypeFor([50, 100, 50, 50])).toBe("Gladiator");
  });

  it("returns Dark Oracle when SPK >= 75 (and AGG < 75)", () => {
    expect(archetypeFor([50, 74, 75, 50])).toBe("Dark Oracle");
    expect(archetypeFor([50, 0, 80, 50])).toBe("Dark Oracle");
  });

  it("returns Zen when AGG <= 25 (and SPK < 75)", () => {
    expect(archetypeFor([50, 25, 50, 50])).toBe("Zen");
    expect(archetypeFor([50, 0, 50, 50])).toBe("Zen");
  });

  it("Gladiator wins over Zen at boundary AGG=75", () => {
    // AGG=75 triggers Gladiator before reaching Zen check
    expect(archetypeFor([50, 75, 50, 50])).toBe("Gladiator");
  });

  it("returns Galaxy Brain when BRN >= 75 (AGG 26-74, SPK < 75)", () => {
    expect(archetypeFor([50, 50, 50, 75])).toBe("Galaxy Brain");
    expect(archetypeFor([50, 50, 74, 100])).toBe("Galaxy Brain");
  });

  it("returns Lucky Fool when BRN <= 25 (AGG 26-74, SPK < 75)", () => {
    expect(archetypeFor([50, 50, 50, 25])).toBe("Lucky Fool");
    expect(archetypeFor([50, 50, 50, 0])).toBe("Lucky Fool");
  });

  it("returns Wildcard for mid-range traits", () => {
    expect(archetypeFor([50, 50, 50, 50])).toBe("Wildcard");
    expect(archetypeFor([50, 26, 74, 26])).toBe("Wildcard");
  });

  it("handles empty trait array gracefully (defaults to Wildcard)", () => {
    expect(archetypeFor([])).toBe("Wildcard");
  });
});

describe("roastSystemPrompt", () => {
  it("contains NEVER", () => {
    const prompt = roastSystemPrompt("Ghostly", "Gladiator");
    expect(prompt).toContain("NEVER");
  });

  it("mentions slurs", () => {
    const prompt = roastSystemPrompt("Ghostly", "Dark Oracle");
    expect(prompt.toLowerCase()).toContain("slur");
  });

  it("prohibits asterisk stage directions", () => {
    const prompt = roastSystemPrompt("Ghostly", "Zen");
    expect(prompt.toLowerCase()).toContain("asterisk");
  });

  it("includes the gotchi name", () => {
    const prompt = roastSystemPrompt("NeonFang", "Wildcard");
    expect(prompt).toContain("NeonFang");
  });

  it("includes the archetype voice", () => {
    const prompt = roastSystemPrompt("Ghostly", "Gladiator");
    expect(prompt.toLowerCase()).toContain("gladiator");
  });

  it("mentions protected classes", () => {
    const prompt = roastSystemPrompt("Ghostly", "Galaxy Brain");
    expect(prompt.toLowerCase()).toContain("protected");
  });
});

describe("judgeSystemPrompt", () => {
  it("requests strict JSON", () => {
    const prompt = judgeSystemPrompt();
    expect(prompt.toUpperCase()).toContain("JSON");
  });

  it("includes the 'winner' key", () => {
    const prompt = judgeSystemPrompt();
    expect(prompt).toContain("winner");
  });

  it("includes the 'aScore' key", () => {
    const prompt = judgeSystemPrompt();
    expect(prompt).toContain("aScore");
  });

  it("includes the 'bScore' key", () => {
    const prompt = judgeSystemPrompt();
    expect(prompt).toContain("bScore");
  });

  it("includes the 'verdict' key", () => {
    const prompt = judgeSystemPrompt();
    expect(prompt).toContain("verdict");
  });
});

describe("roastLineUser", () => {
  it("includes the opponent name", () => {
    const content = roastLineUser("Sparkdemon", "Gladiator", []);
    expect(content).toContain("Sparkdemon");
  });

  it("includes the opponent archetype", () => {
    const content = roastLineUser("Sparkdemon", "Dark Oracle", []);
    expect(content).toContain("Dark Oracle");
  });

  it("includes prior lines when provided", () => {
    const content = roastLineUser("Sparkdemon", "Zen", [
      "You call that BRS?",
      "My kinship laughs at yours.",
    ]);
    expect(content).toContain("You call that BRS?");
    expect(content).toContain("My kinship laughs at yours.");
  });

  it("does not include prior-lines section when none provided", () => {
    const content = roastLineUser("Sparkdemon", "Wildcard", []);
    expect(content).not.toContain("Prior burns");
  });
});
