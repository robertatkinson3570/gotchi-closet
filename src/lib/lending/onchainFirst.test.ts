import { describe, it, expect } from "vitest";
import { onchainFirstSeconds } from "./onchainFirst";

// The gotchiverse subgraph can lag hours behind chain head, so cooldown
// timestamps (lastClaimedAlchemica / lastChanneledAlchemica) must prefer a
// successful on-chain read and only fall back to the subgraph value.
describe("onchainFirstSeconds", () => {
  it("prefers a successful on-chain read over the subgraph value", () => {
    expect(
      onchainFirstSeconds({ status: "success", result: 1782985003n }, "1782943123")
    ).toBe(1782985003);
  });

  it("trusts a successful on-chain read of 0 (never claimed) over a stale subgraph value", () => {
    expect(onchainFirstSeconds({ status: "success", result: 0n }, "1782943123")).toBe(0);
  });

  it("falls back to the subgraph value when the read failed", () => {
    expect(onchainFirstSeconds({ status: "failure" }, "1782943123")).toBe(1782943123);
  });

  it("falls back to the subgraph value when the read is missing (multicall not loaded yet)", () => {
    expect(onchainFirstSeconds(undefined, "1782943123")).toBe(1782943123);
  });

  it("returns 0 when the read failed and the subgraph value is empty/invalid", () => {
    expect(onchainFirstSeconds(undefined, "")).toBe(0);
    expect(onchainFirstSeconds(undefined, undefined)).toBe(0);
  });
});
