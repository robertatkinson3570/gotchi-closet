import { describe, it, expect } from "vitest";
import { keeperReadMessage } from "./keeperAuth";

/** Ported verbatim from GVR packages/shared/src/analystAuth.ts: GVR re-builds this
 *  exact string to recover the signer, so a drift here makes every Keeper read 401. */
describe("keeperReadMessage", () => {
  it("is GVR's string byte for byte (B1: colon, no em dash)", () => {
    expect(keeperReadMessage("0xABCabc0000000000000000000000000000dEaD", 123)).toBe(
      "GVR Keeper: read my standing report\nwallet: 0xabcabc0000000000000000000000000000dead\nts: 123",
    );
  });
});
