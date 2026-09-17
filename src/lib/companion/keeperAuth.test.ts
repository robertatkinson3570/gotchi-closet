import { describe, it, expect } from "vitest";
import { keeperReadMessage, keeperSigTtlMs, keeperSigHeaderValue, KEEPER_SIG_HEADER } from "./keeperAuth";

/** Ported verbatim from GVR packages/shared/src/analystAuth.ts: GVR re-builds this
 *  exact string to recover the signer, so a drift here makes every Keeper read 401. */
describe("keeperReadMessage", () => {
  it("is GVR's string byte for byte, with the purpose line (B1 colon, B2 purpose)", () => {
    expect(keeperReadMessage("0xABCabc0000000000000000000000000000dEaD", 123, "standing")).toBe(
      "GVR Keeper: read my standing report\nwallet: 0xabcabc0000000000000000000000000000dead\nts: 123\npurpose: standing",
    );
    expect(keeperReadMessage("0xabcabc0000000000000000000000000000dead", 1, "ask")).toMatch(/\npurpose: ask$/);
  });
  it("the ask signature lives 5 minutes, a read 30; the header is x-keeper-signature: signedAt.signature", () => {
    expect(keeperSigTtlMs("ask")).toBe(5 * 60_000);
    expect(keeperSigTtlMs("standing")).toBe(30 * 60_000);
    expect(KEEPER_SIG_HEADER).toBe("x-keeper-signature");
    expect(keeperSigHeaderValue({ signedAt: 5, signature: "0xab" })).toBe("5.0xab");
  });
});
