// server/analytics/auth.test.ts
import { afterEach, describe, expect, it } from "vitest";
import { privateKeyToAccount } from "viem/accounts";
import { siteAdminMessage } from "../../src/lib/analytics/auth";
import { verifyAdminSignature, isAdmin } from "./auth";

const account = privateKeyToAccount(
  "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80"
);

afterEach(() => {
  delete process.env.SITE_ADMINS;
});

describe("site admin allowlist", () => {
  it("defaults to the two owner addresses when SITE_ADMINS is unset", () => {
    expect(isAdmin("0xe0d4f8f6F04A42aeD5a7EA4f68Bc612E6A54A3c2")).toBe(true);
    expect(isAdmin("0xc4cb6cb969e8b4e309ab98e4da51b77887afad96")).toBe(true); // case-insensitive
    expect(isAdmin("0x0000000000000000000000000000000000000001")).toBe(false);
  });

  it("SITE_ADMINS overrides the default set", () => {
    process.env.SITE_ADMINS = account.address.toLowerCase();
    expect(isAdmin(account.address)).toBe(true);
    expect(isAdmin("0xe0d4f8f6F04A42aeD5a7EA4f68Bc612E6A54A3c2")).toBe(false);
  });

  it("verifyAdminSignature requires a valid signature AND allowlist membership", async () => {
    process.env.SITE_ADMINS = account.address.toLowerCase();
    const signedAt = Date.now();
    const signature = await account.signMessage({ message: siteAdminMessage(account.address, signedAt) });
    expect(await verifyAdminSignature(account.address, signedAt, signature)).toBe(true);

    process.env.SITE_ADMINS = "0xdead";
    expect(await verifyAdminSignature(account.address, signedAt, signature)).toBe(false);
  });

  it("rejects a stale signature", async () => {
    process.env.SITE_ADMINS = account.address.toLowerCase();
    const signedAt = Date.now() - 48 * 60 * 60 * 1000;
    const signature = await account.signMessage({ message: siteAdminMessage(account.address, signedAt) });
    expect(await verifyAdminSignature(account.address, signedAt, signature)).toBe(false);
  });
});
