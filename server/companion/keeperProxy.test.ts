import { describe, expect, it, vi, afterEach } from "vitest";
import { proxyKeeperStanding, proxyKeeperRegister } from "./keeperProxy";

const WALLET = "0x1111111111111111111111111111111111111111";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("proxyKeeperStanding", () => {
  it("400s a bad wallet or tokenId before ever calling GVR", async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    expect((await proxyKeeperStanding("1", "not-a-wallet", { signedAt: "1", signature: "0xa" })).status).toBe(400);
    expect((await proxyKeeperStanding("not-a-token", WALLET, { signedAt: "1", signature: "0xa" })).status).toBe(400);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("400s a missing signature before calling GVR", async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    expect((await proxyKeeperStanding("1", WALLET, {})).status).toBe(400);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("forwards to GVR's own route with the same wallet, tokenId, signedAt and signature", async () => {
    const fetchSpy = vi.fn(async (url: string) => ({ status: 200, json: async () => ({ ok: true, url }) }));
    vi.stubGlobal("fetch", fetchSpy);
    const r = await proxyKeeperStanding("3560", WALLET, { signedAt: "12345", signature: "0xabc" });
    expect(r.status).toBe(200);
    const calledUrl = fetchSpy.mock.calls[0]![0] as string;
    expect(calledUrl).toBe(`https://gvr.gotchicloset.com/api/analyst/standing/${WALLET}/3560?signedAt=12345&signature=0xabc`);
    expect(r.body).toEqual({ ok: true, url: calledUrl });
  });

  it("forwards GVR's own refusal status unchanged (e.g. a 401 or a 404)", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ status: 401, json: async () => ({ error: "signature is not the wallet's" }) })));
    const r = await proxyKeeperStanding("1", WALLET, { signedAt: "1", signature: "0xa" });
    expect(r.status).toBe(401);
  });

  it("502s, never throws, when GVR cannot be reached", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("connect ECONNREFUSED"); }));
    const r = await proxyKeeperStanding("1", WALLET, { signedAt: "1", signature: "0xa" });
    expect(r.status).toBe(502);
    expect(r.body.error).toMatch(/couldn't reach GVR/);
  });

  it("B2: forwards an x-keeper-signature header to GVR instead of the query string when the panel sent one", async () => {
    const fetchSpy = vi.fn(async (url: string, init?: { headers?: Record<string, string> }) => ({ status: 200, json: async () => ({ ok: true, url, header: init?.headers?.["x-keeper-signature"] }) }));
    vi.stubGlobal("fetch", fetchSpy);
    const r = await proxyKeeperStanding("3560", WALLET, {}, "12345.0xabc");
    expect(r.status).toBe(200);
    expect(fetchSpy.mock.calls[0]![0]).toBe(`https://gvr.gotchicloset.com/api/analyst/standing/${WALLET}/3560`);
    expect(r.body.header).toBe("12345.0xabc");
  });
});

describe("proxyKeeperRegister", () => {
  it("400s a bad wallet, tokenId or signature before calling GVR", async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    expect((await proxyKeeperRegister({ wallet: "nope", tokenId: "1", signedAt: 1, signature: "0xa" })).status).toBe(400);
    expect((await proxyKeeperRegister({ wallet: WALLET, tokenId: "x", signedAt: 1, signature: "0xa" })).status).toBe(400);
    expect((await proxyKeeperRegister({ wallet: WALLET, tokenId: "1" })).status).toBe(400);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("posts the same wallet, tokenId, signedAt and signature to GVR and relays its answer", async () => {
    const fetchSpy = vi.fn(async (url: string, init: RequestInit) => ({ status: 200, json: async () => ({ ok: true, url, sent: JSON.parse(String(init.body)) }) }));
    vi.stubGlobal("fetch", fetchSpy);
    const r = await proxyKeeperRegister({ wallet: WALLET, tokenId: "3560", signedAt: "1790000000000", signature: "0xabc", extra: "ignored" });
    expect(r.status).toBe(200);
    expect(r.body.url).toMatch(/\/api\/analyst\/register$/);
    expect(r.body.sent).toEqual({ wallet: WALLET, tokenId: "3560", signedAt: 1790000000000, signature: "0xabc" });
  });
});

