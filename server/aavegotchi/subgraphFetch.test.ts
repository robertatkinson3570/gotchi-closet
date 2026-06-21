import { describe, it, expect, vi, afterEach } from "vitest";
import { subgraphFetch } from "./subgraphFetch";

const res = (ok: boolean): Response =>
  ({ ok, status: ok ? 200 : 502, json: async () => ({ data: {} }) }) as Response;

afterEach(() => vi.restoreAllMocks());

describe("subgraphFetch failover", () => {
  it("uses primary and does not call backup when primary is ok", async () => {
    const f = vi.fn(async () => res(true));
    vi.stubGlobal("fetch", f);
    const r = await subgraphFetch({ query: "x" }, { primary: "P", backup: "B" });
    expect(r.ok).toBe(true);
    expect(f).toHaveBeenCalledTimes(1);
    expect(f.mock.calls[0][0]).toBe("P");
  });

  it("fails over to backup when primary returns non-ok", async () => {
    const f = vi.fn(async (url: string) => res(url === "B"));
    vi.stubGlobal("fetch", f);
    const r = await subgraphFetch({ query: "x" }, { primary: "P", backup: "B" });
    expect(r.ok).toBe(true);
    expect(f).toHaveBeenCalledTimes(2);
    expect(f.mock.calls[1][0]).toBe("B");
  });

  it("fails over to backup when primary throws", async () => {
    const f = vi.fn(async (url: string) => {
      if (url === "P") throw new Error("network");
      return res(true);
    });
    vi.stubGlobal("fetch", f);
    const r = await subgraphFetch({ query: "x" }, { primary: "P", backup: "B" });
    expect(r.ok).toBe(true);
    expect(f).toHaveBeenCalledTimes(2);
  });

  it("does not retry when no backup is configured", async () => {
    const f = vi.fn(async () => res(false));
    vi.stubGlobal("fetch", f);
    const r = await subgraphFetch({ query: "x" }, { primary: "P", backup: "" });
    expect(r.ok).toBe(false);
    expect(f).toHaveBeenCalledTimes(1);
  });
});
