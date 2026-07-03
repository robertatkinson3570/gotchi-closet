import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { chooseUrl, STALE_BLOCK_THRESHOLD, shouldProbeBackup, type Health } from "./subgraphFailover";

const P = "https://primary.example";
const B = "https://backup.example";
const h = (
  url: string,
  block: number | null,
  ok = true,
  hasErrors = false
): Health => ({ url, ok, hasErrors, block });

describe("chooseUrl", () => {
  it("uses primary when no backup is configured", () => {
    expect(chooseUrl(h(P, 100), null)).toBe(P);
    expect(chooseUrl(h(P, null, false), null)).toBe(P); // even if primary is down
  });

  it("keeps primary when both are current (within threshold)", () => {
    expect(chooseUrl(h(P, 1000), h(B, 1000))).toBe(P);
    // backup ahead by exactly the threshold is still within tolerance
    expect(chooseUrl(h(P, 1000), h(B, 1000 + STALE_BLOCK_THRESHOLD))).toBe(P);
  });

  it("fails over when primary is silently stalled (backup leads beyond threshold)", () => {
    expect(chooseUrl(h(P, 1000), h(B, 1000 + STALE_BLOCK_THRESHOLD + 1))).toBe(B);
  });

  it("fails over when primary is unreachable and backup is up", () => {
    expect(chooseUrl(h(P, null, false), h(B, 1000))).toBe(B);
  });

  it("fails over when primary has indexing errors", () => {
    expect(chooseUrl(h(P, 1000, true, true), h(B, 1000))).toBe(B);
  });

  it("keeps primary when the backup is the stale/down one", () => {
    expect(chooseUrl(h(P, 2000), h(B, 1000))).toBe(P); // backup behind
    expect(chooseUrl(h(P, 1000), h(B, null, false))).toBe(P); // backup down
  });

  it("when neither is reachable, picks the higher block (least stale)", () => {
    expect(chooseUrl(h(P, 800, false), h(B, 900, false))).toBe(B);
    expect(chooseUrl(h(P, 900, false), h(B, 800, false))).toBe(P);
  });
});

describe("shouldProbeBackup", () => {
  it("skips the metered backup probe when primary is healthy and advancing", () => {
    expect(shouldProbeBackup(h(P, 1010), 1000, true)).toBe(false);
  });

  it("skips on the first poll (no previous block yet)", () => {
    expect(shouldProbeBackup(h(P, 1000), null, true)).toBe(false);
  });

  it("probes when the primary block is not advancing (silent stall)", () => {
    expect(shouldProbeBackup(h(P, 1000), 1000, true)).toBe(true);
    expect(shouldProbeBackup(h(P, 990), 1000, true)).toBe(true); // went backwards
  });

  it("probes when the primary is unreachable or has indexing errors", () => {
    expect(shouldProbeBackup(h(P, null, false), 1000, true)).toBe(true);
    expect(shouldProbeBackup(h(P, 1010, true, true), 1000, true)).toBe(true);
  });

  it("always probes while running on the backup (to detect primary recovery)", () => {
    expect(shouldProbeBackup(h(P, 1010), 1000, false)).toBe(true);
  });
});

/**
 * Routing-state subscription (consumed by the header FailoverPill). Uses a fresh
 * module instance per test (env + fetch stubbed) so refreshActiveUrl() exercises
 * the real flow: probe -> chooseUrl -> notify-on-change.
 */
describe("routing subscription (isOnBackup / subscribeRouting)", () => {
  type Mod = typeof import("./subgraphFailover");
  let mod: Mod;
  // url -> block number (null = endpoint unreachable / network error)
  const blocks = new Map<string, number | null>();

  beforeEach(async () => {
    vi.resetModules();
    vi.stubEnv("VITE_GOTCHI_SUBGRAPH_URL", P);
    vi.stubEnv("VITE_GOTCHI_SUBGRAPH_URL_BACKUP", B);
    vi.spyOn(console, "info").mockImplementation(() => {});
    blocks.clear();
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: RequestInfo | URL) => {
        const block = blocks.get(String(url));
        if (block == null) throw new Error("endpoint down");
        return {
          ok: true,
          json: async () => ({
            data: { _meta: { block: { number: block }, hasIndexingErrors: false } },
          }),
        } as Response;
      })
    );
    mod = await import("./subgraphFailover");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("reports primary routing initially", () => {
    expect(mod.isOnBackup()).toBe(false);
  });

  it("notifies once per routing change, in both directions", async () => {
    const listener = vi.fn();
    mod.subscribeRouting(listener);

    // Primary dies, backup healthy -> fail over, one notification.
    blocks.set(P, null);
    blocks.set(B, 2000);
    await mod.refreshActiveUrl();
    expect(mod.isOnBackup()).toBe(true);
    expect(listener).toHaveBeenCalledTimes(1);

    // Same conditions again -> no routing change, no extra notification.
    await mod.refreshActiveUrl();
    expect(listener).toHaveBeenCalledTimes(1);

    // Primary recovers and catches up -> fail back, second notification.
    blocks.set(P, 2000);
    await mod.refreshActiveUrl();
    expect(mod.isOnBackup()).toBe(false);
    expect(listener).toHaveBeenCalledTimes(2);
  });

  it("stops notifying after unsubscribe", async () => {
    const listener = vi.fn();
    const unsubscribe = mod.subscribeRouting(listener);
    unsubscribe();

    blocks.set(P, null);
    blocks.set(B, 2000);
    await mod.refreshActiveUrl();
    expect(mod.isOnBackup()).toBe(true);
    expect(listener).not.toHaveBeenCalled();
  });
});
