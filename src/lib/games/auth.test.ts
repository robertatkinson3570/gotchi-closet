// src/lib/games/auth.test.ts
import { describe, expect, it } from "vitest";
import { submitMessage, adminMessage } from "./auth";

describe("games message builders", () => {
  it("lowercases the wallet and embeds the timestamp", () => {
    expect(submitMessage("0xABC", 123)).toBe(
      "GotchiCloset Game Center — submit\nwallet: 0xabc\nts: 123"
    );
    expect(adminMessage("0xABC", 123)).toBe(
      "GotchiCloset Game Center — admin\nwallet: 0xabc\nts: 123"
    );
  });
});
