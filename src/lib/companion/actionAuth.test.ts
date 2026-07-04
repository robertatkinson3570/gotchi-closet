import { test, expect } from "vitest";
import { actionMessage, ACTION_SIG_TTL_MS } from "./actionAuth";

test("actionMessage is deterministic and lower-cases wallet", () => {
  const m = actionMessage("0xAbC", 123);
  expect(m).toBe(actionMessage("0xabc", 123));
  expect(m).toContain("0xabc");
  expect(m).toContain("123");
});

test("action signature TTL is 24h", () => {
  expect(ACTION_SIG_TTL_MS).toBe(24 * 60 * 60 * 1000);
});
