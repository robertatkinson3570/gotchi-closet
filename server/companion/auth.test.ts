import { describe, expect, it } from "vitest";
import { privateKeyToAccount } from "viem/accounts";
import { premiumMessage, globalRoomMessage } from "../../src/lib/companion/premiumAuth";
import { premiumSignatureValid, verifyRoomSignature } from "./auth";

// Well-known Hardhat/Anvil test account #0 — public test key, never used for funds.
const account = privateKeyToAccount(
  "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80"
);

describe("premiumSignatureValid", () => {
  it("accepts a fresh signature from the same wallet", async () => {
    const signedAt = Date.now();
    const signature = await account.signMessage({ message: premiumMessage(account.address, signedAt) });
    expect(await premiumSignatureValid(account.address, signedAt, signature)).toBe(true);
  });

  it("rejects a stale signature (older than 24h)", async () => {
    const signedAt = Date.now() - 48 * 60 * 60 * 1000;
    const signature = await account.signMessage({ message: premiumMessage(account.address, signedAt) });
    expect(await premiumSignatureValid(account.address, signedAt, signature)).toBe(false);
  });

  it("rejects a signature claimed for a different wallet", async () => {
    const signedAt = Date.now();
    const signature = await account.signMessage({ message: premiumMessage(account.address, signedAt) });
    const other = "0x0000000000000000000000000000000000000123";
    expect(await premiumSignatureValid(other, signedAt, signature)).toBe(false);
  });

  it("rejects malformed input", async () => {
    expect(await premiumSignatureValid(account.address, Date.now(), "0xdead")).toBe(false);
    expect(await premiumSignatureValid("nope", Date.now(), "0xdead")).toBe(false);
  });
});

describe("verifyRoomSignature", () => {
  it("accepts a fresh room signature from the same wallet", async () => {
    const signedAt = Date.now();
    const signature = await account.signMessage({ message: globalRoomMessage(account.address, signedAt) });
    expect(await verifyRoomSignature(account.address, signedAt, signature)).toBe(true);
  });

  it("rejects a premium signature reused for the room (different message)", async () => {
    const signedAt = Date.now();
    const signature = await account.signMessage({ message: premiumMessage(account.address, signedAt) });
    expect(await verifyRoomSignature(account.address, signedAt, signature)).toBe(false);
  });

  it("rejects a stale room signature", async () => {
    const signedAt = Date.now() - 48 * 60 * 60 * 1000;
    const signature = await account.signMessage({ message: globalRoomMessage(account.address, signedAt) });
    expect(await verifyRoomSignature(account.address, signedAt, signature)).toBe(false);
  });
});
