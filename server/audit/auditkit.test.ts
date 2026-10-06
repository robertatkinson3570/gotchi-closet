import { describe, it, expect, vi } from "vitest";
import { createAuditor, keyFingerprint } from "./auditkit";

type Call = { url: string; method: string; headers: Record<string, string>; body: any };

/** A fetch that records every call and answers with a receipt (or a failure). */
function fakeFetch(status = 200) {
  const calls: Call[] = [];
  const f = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    calls.push({
      url: String(input),
      method: init?.method ?? "GET",
      headers: Object.fromEntries(Object.entries((init?.headers ?? {}) as Record<string, string>).map(([k, v]) => [k.toLowerCase(), v])),
      body: init?.body ? JSON.parse(String(init.body)) : undefined,
    });
    const body = status < 400 ? { id: "evt_1", position: 1 } : { error: { code: "boom", message: "nope" } };
    return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
  });
  return { calls, fetch: f as unknown as typeof fetch };
}

describe("audit module", () => {
  it("is a no-op without AUDITKIT_API_KEY", async () => {
    const { calls, fetch } = fakeFetch();
    const a = createAuditor({ apiKey: "", fetch });
    expect(a.enabled).toBe(false);
    a.audit("0xABC", "0xABC", "steward.enroll", 1, { gotchiId: 42 });
    await new Promise((r) => setTimeout(r, 10));
    expect(calls).toHaveLength(0);
  });

  it("posts one event per call with the SDK wire shape, one tenant per wallet", async () => {
    const { calls, fetch } = fakeFetch();
    const a = createAuditor({ apiKey: "ak_test", baseUrl: "https://audit.example/", fetch });
    expect(a.enabled).toBe(true);
    a.audit("0xABCDEF0000000000000000000000000000000001", "0xABCDEF0000000000000000000000000000000001", "steward.enroll", 7, {
      gotchiId: 42, chores: ["pet", "claim"], txHash: undefined,
    });
    await vi.waitFor(() => expect(calls).toHaveLength(1));
    const c = calls[0];
    expect(c.url).toBe("https://audit.example/v1/events");
    expect(c.method).toBe("POST");
    expect(c.headers.authorization).toBe("Bearer ak_test");
    expect(c.headers["idempotency-key"]).toMatch(/^[0-9a-f-]{36}$/);
    expect(c.body).toMatchObject({
      tenant: "0xabcdef0000000000000000000000000000000001",
      actor: "0xabcdef0000000000000000000000000000000001",
      action: "steward.enroll",
      target: "7",
      payload: { gotchiId: 42, chores: ["pet", "claim"] },
    });
    expect(c.body.idempotency_key).toBe(c.headers["idempotency-key"]);
    expect("txHash" in c.body.payload).toBe(false);
  });

  it("sends target null and no payload when neither is given; a system actor is kept", async () => {
    const { calls, fetch } = fakeFetch();
    const a = createAuditor({ apiKey: "ak_test", fetch });
    a.audit("0xABC", "steward-cron", "steward.run.pet");
    await vi.waitFor(() => expect(calls).toHaveLength(1));
    expect(calls[0].url).toBe("https://api.auditkit.dev/v1/events");
    expect(calls[0].body.target).toBeNull();
    expect(calls[0].body.actor).toBe("steward-cron");
    expect("payload" in calls[0].body).toBe(false);
  });

  it("never throws and reports delivery failures at most once a minute", async () => {
    const { calls, fetch } = fakeFetch(400);
    const errors: string[] = [];
    let t = 1_000_000;
    const a = createAuditor({ apiKey: "ak_test", fetch, onError: (m) => errors.push(m), now: () => t });
    expect(() => a.audit("0xABC", "0xABC", "wisp.key.mint")).not.toThrow();
    a.audit("0xABC", "0xABC", "wisp.key.mint");
    await vi.waitFor(() => expect(calls).toHaveLength(2));
    await new Promise((r) => setTimeout(r, 10));
    expect(errors).toHaveLength(1);
    expect(errors[0]).toMatch(/auditkit delivery failed/);
    t += 60_001;
    a.audit("0xABC", "0xABC", "wisp.key.mint");
    await vi.waitFor(() => expect(errors).toHaveLength(2));
  });

  it("survives a fetch that throws synchronously", async () => {
    const errors: string[] = [];
    const a = createAuditor({ apiKey: "ak_test", fetch: (() => { throw new Error("offline"); }) as unknown as typeof fetch, onError: (m) => errors.push(m) });
    expect(() => a.audit("0xABC", "0xABC", "wisp.key.rotate")).not.toThrow();
    await vi.waitFor(() => expect(errors).toHaveLength(1));
  });

  it("fingerprints a key without exposing it", () => {
    const fp = keyFingerprint("wsp_" + "a".repeat(48));
    expect(fp).toMatch(/^[0-9a-f]{16}$/);
    expect(fp).not.toContain("wsp_");
    expect(keyFingerprint("wsp_" + "a".repeat(48))).toBe(fp);
  });
});
