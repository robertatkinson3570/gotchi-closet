import { describe, expect, it } from "vitest";
import { encryptSoul, decryptSoul } from "./crypto";

describe("soul/crypto", () => {
  it("round-trips an ASCII string", () => {
    const s = "Hello, Gotchi!";
    expect(decryptSoul(encryptSoul(s))).toBe(s);
  });

  it("round-trips an empty string", () => {
    expect(decryptSoul(encryptSoul(""))).toBe("");
  });

  it("round-trips a unicode / emoji string", () => {
    const s = "👻 Aavegotchi あわたましい 魂 🌟";
    expect(decryptSoul(encryptSoul(s))).toBe(s);
  });

  it("round-trips a long JSON payload", () => {
    const s = JSON.stringify({ version: 1, tokenId: "42", data: "x".repeat(4096) });
    expect(decryptSoul(encryptSoul(s))).toBe(s);
  });

  it("blob is opaque — does not contain the plaintext substring", () => {
    const s = "super-secret-memory-summary";
    const blob = encryptSoul(s);
    expect(blob).not.toContain(s);
    // Also confirm it is base64 (no raw string visible)
    expect(Buffer.from(blob, "base64").toString("utf8")).not.toContain(s);
  });

  it("two encryptions of the same string produce different blobs (random IV)", () => {
    const s = "same plaintext";
    expect(encryptSoul(s)).not.toBe(encryptSoul(s));
  });

  it("tampering with a byte in the ciphertext region makes decryptSoul throw", () => {
    const s = "tamper test value";
    const blob = encryptSoul(s);
    const buf = Buffer.from(blob, "base64");
    // Flip the last byte of the ciphertext.
    buf[buf.length - 1] ^= 0xff;
    const tampered = buf.toString("base64");
    expect(() => decryptSoul(tampered)).toThrow();
  });

  it("truncating the blob makes decryptSoul throw", () => {
    const blob = encryptSoul("truncation test");
    const truncated = blob.slice(0, Math.floor(blob.length / 2));
    expect(() => decryptSoul(truncated)).toThrow();
  });
});
