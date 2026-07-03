// server/games/auth.test.ts
import { afterEach, describe, expect, it } from "vitest";
import { privateKeyToAccount } from "viem/accounts";
import { submitMessage, adminMessage } from "../../src/lib/games/auth";
import { verifySubmitSignature, verifyAdminSignature, isAdmin } from "./auth";

const account = privateKeyToAccount(
  "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80"
);

afterEach(() => {
  delete process.env.GAME_CENTER_ADMINS;
});

describe("verifySubmitSignature", () => {
  it("accepts a fresh signature from the same wallet", async () => {
    const signedAt = Date.now();
    const signature = await account.signMessage({ message: submitMessage(account.address, signedAt) });
    expect(await verifySubmitSignature(account.address, signedAt, signature)).toBe(true);
  });
  it("rejects a stale signature", async () => {
    const signedAt = Date.now() - 48 * 60 * 60 * 1000;
    const signature = await account.signMessage({ message: submitMessage(account.address, signedAt) });
    expect(await verifySubmitSignature(account.address, signedAt, signature)).toBe(false);
  });
});

describe("admin allowlist", () => {
  it("isAdmin is case-insensitive membership in GAME_CENTER_ADMINS", () => {
    process.env.GAME_CENTER_ADMINS = account.address.toLowerCase() + ",0xdead";
    expect(isAdmin(account.address)).toBe(true);
    expect(isAdmin(account.address.toUpperCase())).toBe(true);
    expect(isAdmin("0x0000000000000000000000000000000000000001")).toBe(false);
  });
  it("verifyAdminSignature requires both a valid signature and allowlist membership", async () => {
    const signedAt = Date.now();
    const signature = await account.signMessage({ message: adminMessage(account.address, signedAt) });
    process.env.GAME_CENTER_ADMINS = account.address.toLowerCase();
    expect(await verifyAdminSignature(account.address, signedAt, signature)).toBe(true);
    process.env.GAME_CENTER_ADMINS = "0xdead";
    expect(await verifyAdminSignature(account.address, signedAt, signature)).toBe(false);
  });
});
