// src/lib/games/validate.test.ts
import { describe, expect, it } from "vitest";
import { validateSubmission } from "./validate";

const ok = {
  title: "My Game",
  description: "A fun gotchi game",
  url: "https://example.com",
  category: "Games",
  imageBase64: "aGVsbG8=", // "hello"
  imageMime: "image/png",
};

describe("validateSubmission", () => {
  it("accepts a well-formed submission", () => {
    expect(validateSubmission(ok)).toEqual({ ok: true });
  });
  it("rejects a non-http url", () => {
    expect(validateSubmission({ ...ok, url: "javascript:alert(1)" }).ok).toBe(false);
  });
  it("rejects an unknown category", () => {
    expect(validateSubmission({ ...ok, category: "Nope" }).ok).toBe(false);
  });
  it("rejects an empty title", () => {
    expect(validateSubmission({ ...ok, title: "" }).ok).toBe(false);
  });
  it("rejects an over-long description", () => {
    expect(validateSubmission({ ...ok, description: "x".repeat(281) }).ok).toBe(false);
  });
  it("rejects a non-image mime", () => {
    expect(validateSubmission({ ...ok, imageMime: "text/html" }).ok).toBe(false);
  });
  it("rejects an oversized image", () => {
    const big = "A".repeat(420_000); // ~315 KB decoded, over the 300 KB cap
    expect(validateSubmission({ ...ok, imageBase64: big }).ok).toBe(false);
  });
});
