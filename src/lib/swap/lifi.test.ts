import { describe, expect, it } from "vitest";
import { buildLifiQuoteParams, parseLifiQuoteResponse, fmtUnits } from "./lifi";

describe("buildLifiQuoteParams", () => {
  it("builds same-chain params with default slippage", () => {
    const params = buildLifiQuoteParams({
      fromToken: "0xFUD",
      toToken: "0xGHST",
      fromAmountWei: 1_000_000_000_000_000_000n,
      fromAddress: "0xWALLET",
      chainId: 8453,
    });
    expect(params.get("fromChain")).toBe("8453");
    expect(params.get("toChain")).toBe("8453");
    expect(params.get("fromToken")).toBe("0xFUD");
    expect(params.get("toToken")).toBe("0xGHST");
    expect(params.get("fromAmount")).toBe("1000000000000000000");
    expect(params.get("fromAddress")).toBe("0xWALLET");
    expect(params.get("slippage")).toBe("0.005");
  });

  it("honors a custom slippage", () => {
    const params = buildLifiQuoteParams({
      fromToken: "0xA", toToken: "0xB", fromAmountWei: 1n, fromAddress: "0xC", slippage: "0.01",
    });
    expect(params.get("slippage")).toBe("0.01");
  });
});

describe("parseLifiQuoteResponse", () => {
  it("parses a successful quote", () => {
    const quote = parseLifiQuoteResponse({
      transactionRequest: { to: "0xROUTER", data: "0xdead", value: "0" },
      estimate: {
        toAmount: "2500000000000000000",
        toAmountMin: "2487500000000000000",
        approvalAddress: "0xROUTER",
        gasCosts: [{ amountUSD: "0.12" }],
      },
      toolDetails: { name: "aerodrome" },
    });
    expect(quote.toAmount).toBe(2_500_000_000_000_000_000n);
    expect(quote.toAmountMin).toBe(2_487_500_000_000_000_000n);
    expect(quote.approvalAddress).toBe("0xROUTER");
    expect(quote.tx).toEqual({ to: "0xROUTER", data: "0xdead", value: 0n });
    expect(quote.gasUsd).toBe("0.12");
    expect(quote.tool).toBe("aerodrome");
  });

  it("throws when no route was found", () => {
    expect(() => parseLifiQuoteResponse({ message: "No routes found" })).toThrow("No routes found");
  });

  it("throws a generic message when the API gives no reason", () => {
    expect(() => parseLifiQuoteResponse({})).toThrow("No route found");
  });
});

describe("fmtUnits", () => {
  it("formats 18-decimal amounts with up to 4 decimal places", () => {
    expect(fmtUnits(1_234_500_000_000_000_000n, 18)).toBe("1.2345");
  });
  it("drops to 2 decimal places above 1000", () => {
    expect(fmtUnits(1_500_000_000_000_000_000_000n, 18)).toBe("1,500");
  });
});
