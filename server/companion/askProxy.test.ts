import { describe, expect, it, vi, afterEach } from "vitest";
import { proxyAnalystAsk } from "./askProxy";

const WALLET = "0x1111111111111111111111111111111111111111";
const good = { tokenId: "3560", wallet: WALLET, message: "where is my money", signedAt: 12345, signature: "0xabc" };

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("proxyAnalystAsk", () => {
  it("400s a bad wallet, tokenId, empty message or missing signature before ever calling GVR", async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    expect((await proxyAnalystAsk({ ...good, wallet: "nope" })).status).toBe(400);
    expect((await proxyAnalystAsk({ ...good, tokenId: "x" })).status).toBe(400);
    expect((await proxyAnalystAsk({ ...good, message: "   " })).status).toBe(400);
    expect((await proxyAnalystAsk({ ...good, signature: undefined })).status).toBe(400);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("forwards the same wallet, tokenId, message, history and signature to GVR's ask route, and the answer back unchanged", async () => {
    const fetchSpy = vi.fn(async (url: string, init: any) => ({ status: 200, json: async () => ({ ok: true, url, sent: JSON.parse(init.body) }) }));
    vi.stubGlobal("fetch", fetchSpy);
    const r = await proxyAnalystAsk({ ...good, history: [{ role: "user", content: "hi" }, { role: "bad" }, { role: "assistant", content: "x".repeat(500) }] });
    expect(r.status).toBe(200);
    expect(r.body.url).toMatch(/\/api\/analyst\/ask$/);
    expect(r.body.sent).toMatchObject({ tokenId: "3560", wallet: WALLET, message: "where is my money", signedAt: 12345, signature: "0xabc", collection: "aavegotchi" });
    expect(r.body.sent.history).toEqual([{ role: "user", content: "hi" }, { role: "assistant", content: "x".repeat(400) }]);
  });

  it("forwards GVR's own refusals with their status (402 holder, 429 capped, 404 off)", async () => {
    for (const status of [402, 429, 404]) {
      vi.stubGlobal("fetch", vi.fn(async () => ({ status, json: async () => ({ refused: "holder" }) })));
      const r = await proxyAnalystAsk(good);
      expect(r.status).toBe(status);
      expect(r.body).toEqual({ refused: "holder" });
    }
  });

  it("502s when GVR cannot be reached", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("ECONNREFUSED"); }));
    const r = await proxyAnalystAsk(good);
    expect(r.status).toBe(502);
    expect(r.body.error).toMatch(/ECONNREFUSED/);
  });
});
