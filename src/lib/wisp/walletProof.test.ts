import { describe, it, expect } from "vitest";
import { isSessionDomain, parseSessionDomains, sessionDomainOrigins } from "./walletProof";

describe("isSessionDomain (SEC-11)", () => {
  it("accepts only the two production hosts and the hosts named explicitly; never a Vercel wildcard", () => {
    expect(isSessionDomain("gotchicloset.com", false)).toBe(true);
    expect(isSessionDomain("WWW.gotchicloset.com", false)).toBe(true);
    expect(isSessionDomain("gotchi-closet-freegift.vercel.app", false)).toBe(false);
    expect(isSessionDomain("gotchi-closet.vercel.app", false)).toBe(false);
    expect(isSessionDomain("gotchi-closet-freegift.vercel.app", true)).toBe(false);
    expect(isSessionDomain("gotchi-closet-git-main-grimlabs.vercel.app", false, ["gotchi-closet-git-main-grimlabs.vercel.app"])).toBe(true);
    expect(isSessionDomain("gotchi-closet-freegift.vercel.app", false, ["gotchi-closet-git-main-grimlabs.vercel.app"])).toBe(false);
    expect(isSessionDomain("localhost:5173", true)).toBe(true);
    expect(isSessionDomain("localhost:5173", false)).toBe(false);
  });

  it("parses WISP_SESSION_DOMAINS as a comma-separated, trimmed, lowercased list, empty by default", () => {
    expect(parseSessionDomains(undefined)).toEqual([]);
    expect(parseSessionDomains("")).toEqual([]);
    expect(parseSessionDomains(" A.example ,, b.example ")).toEqual(["a.example", "b.example"]);
    expect(sessionDomainOrigins("a.example, b.example")).toEqual(["https://a.example", "https://b.example"]);
    expect(sessionDomainOrigins(undefined)).toEqual([]);
  });
});
