import { describe, it, expect } from "vitest";
import { decodeFunctionData } from "viem";
import {
  rootMatches,
  isDeployed,
  pairToEntries,
  encodeCreateTx,
  BATCH_CREATE_XP_ABI,
  SIGPROP_XP,
  COREPROP_XP,
  type PendingXpDrop,
} from "./xpOperator";

const ZERO = "0x0000000000000000000000000000000000000000000000000000000000000000";
const R1 = "0x1111111111111111111111111111111111111111111111111111111111111111";
const R2 = "0x2222222222222222222222222222222222222222222222222222222222222222";

describe("rootMatches", () => {
  it("matches case-insensitively", () => {
    expect(rootMatches(R1, R1.toUpperCase().replace("0X", "0x"))).toBe(true);
  });
  it("is false for zero, missing, or differing roots", () => {
    expect(rootMatches(R1, R2)).toBe(false);
    expect(rootMatches(ZERO, ZERO)).toBe(false);
    expect(rootMatches(R1, undefined)).toBe(false);
  });
});

describe("isDeployed", () => {
  it("is true only when xpAmount > 0", () => {
    expect(isDeployed({ root: R1, xpAmount: 20n })).toBe(true);
    expect(isDeployed({ root: ZERO, xpAmount: 0n })).toBe(false);
  });
});

describe("pairToEntries", () => {
  it("expands a pair into sigprop(10) + coreprop(20) rows when roots exist", () => {
    const drop: PendingXpDrop = { agip: 1, title: "t", sigpropId: "0xsig", corepropId: "0xcore", sigpropRoot: R1, corepropRoot: R2 };
    expect(pairToEntries(drop)).toEqual([
      { propId: "0xsig", root: R1, xpAmount: SIGPROP_XP },
      { propId: "0xcore", root: R2, xpAmount: COREPROP_XP },
    ]);
  });
  it("omits rows whose root has not been generated yet", () => {
    const drop: PendingXpDrop = { agip: 2, title: "t", sigpropId: "0xsig", corepropId: "0xcore", corepropRoot: R2 };
    expect(pairToEntries(drop)).toEqual([{ propId: "0xcore", root: R2, xpAmount: COREPROP_XP }]);
  });
});

describe("encodeCreateTx", () => {
  it("encodes batchCreateXPDrop calldata that round-trips to the same args", () => {
    const prepared = encodeCreateTx([
      { propId: R1, root: R2, xpAmount: 10 },
      { propId: R2, root: R1, xpAmount: 20 },
    ]);
    expect(prepared.safeTx.value).toBe("0");
    expect(prepared.safeTx.data).toBe(prepared.data);

    const decoded = decodeFunctionData({ abi: BATCH_CREATE_XP_ABI, data: prepared.data });
    expect(decoded.functionName).toBe("batchCreateXPDrop");
    expect(decoded.args).toEqual([[R1, R2], [R2, R1], [10n, 20n]]);
  });
});
