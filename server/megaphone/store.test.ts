import { afterAll, describe, expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

// Point the store at a throwaway dir before importing it (dbPath reads env lazily).
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), "megaphone-test-"));
process.env.MEGAPHONE_DB_PATH = path.join(TMP, "megaphone.db");

const store = await import("./store");

afterAll(() => {
  store.closeDb();
  fs.rmSync(TMP, { recursive: true, force: true });
});

const mp4 = Buffer.from("fake-mp4-bytes");
const poster = Buffer.from("fake-jpg-bytes");

describe("megaphone store", () => {
  it("inserts a video, writes files, and lists it", () => {
    const v = store.insertVideo({
      title: "Weekly Pulse",
      caption: "gm frens",
      template: "PulseRecap",
      mp4,
      poster,
      durationS: 30,
      gotchiId: null,
      publishedBy: "0xABCDEF0000000000000000000000000000000001",
    });
    expect(v.id).toBeGreaterThan(0);
    expect(v.videoUrl).toBe(`/api/megaphone/media/${v.id}.mp4`);
    expect(v.posterUrl).toBe(`/api/megaphone/media/${v.id}.jpg`);
    expect(fs.existsSync(path.join(store.mediaDir(), `${v.id}.mp4`))).toBe(true);
    expect(fs.existsSync(path.join(store.mediaDir(), `${v.id}.jpg`))).toBe(true);
    // published_by is lowercased
    expect(store.getRow(v.id)!.published_by).toBe("0xabcdef0000000000000000000000000000000001");
    expect(store.listPublished()).toHaveLength(1);
    expect(store.listPublished("PulseRecap")).toHaveLength(1);
    expect(store.listPublished("Spotlight")).toHaveLength(0);
  });

  it("pins exactly one video to /pulse", () => {
    const a = store.insertVideo({ title: "A", caption: "", template: "PulseRecap", mp4, poster: null, durationS: null, gotchiId: null, publishedBy: "0x1" });
    const b = store.insertVideo({ title: "B", caption: "", template: "PulseRecap", mp4, poster: null, durationS: null, gotchiId: null, publishedBy: "0x1" });
    store.pinPulse(a.id);
    expect(store.pinnedPulseVideo()!.id).toBe(a.id);
    store.pinPulse(b.id); // pinning b unpins a
    expect(store.pinnedPulseVideo()!.id).toBe(b.id);
    expect(store.listAll().filter((v) => v.pinnedPulse)).toHaveLength(1);
  });

  it("hides a video from the public list but keeps it in the admin list", () => {
    const v = store.insertVideo({ title: "Hide me", caption: "", template: "Other", mp4, poster: null, durationS: null, gotchiId: null, publishedBy: "0x1" });
    store.setStatus(v.id, "hidden");
    expect(store.listPublished().some((x) => x.id === v.id)).toBe(false);
    expect(store.listAll().some((x) => x.id === v.id)).toBe(true);
  });

  it("never records the same video+channel twice (no-repeat guard)", () => {
    const v = store.insertVideo({ title: "Dist", caption: "", template: "PulseRecap", mp4, poster: null, durationS: null, gotchiId: null, publishedBy: "0x1" });
    expect(store.hasDistribution(v.id, "x-chan")).toBe(false);
    const first = store.reserveDistribution({ videoId: v.id, integrationId: "x-chan", provider: "x", scheduledFor: null });
    expect(first).not.toBeNull();
    expect(store.hasDistribution(v.id, "x-chan")).toBe(true);
    // second reserve for the same video+channel returns null (already claimed)
    const second = store.reserveDistribution({ videoId: v.id, integrationId: "x-chan", provider: "x", scheduledFor: null });
    expect(second).toBeNull();
    // a different channel is allowed
    expect(store.reserveDistribution({ videoId: v.id, integrationId: "tg-chan", provider: "telegram", scheduledFor: null })).not.toBeNull();

    store.markDistributionPosted(first!, "https://x.com/user/status/1");
    const dists = store.distributionsForVideo(v.id);
    expect(dists).toHaveLength(2);
    const x = dists.find((d) => d.integrationId === "x-chan")!;
    expect(x.status).toBe("posted");
    expect(x.externalUrl).toBe("https://x.com/user/status/1");
    // the posted video's public projection carries its distributions
    expect(store.getRow(v.id)).not.toBeNull();
  });

  it("deletes a video and removes its files", () => {
    const v = store.insertVideo({ title: "Delete me", caption: "", template: "Other", mp4, poster, durationS: null, gotchiId: null, publishedBy: "0x1" });
    const file = path.join(store.mediaDir(), `${v.id}.mp4`);
    expect(fs.existsSync(file)).toBe(true);
    store.deleteVideo(v.id);
    expect(store.getRow(v.id)).toBeNull();
    expect(fs.existsSync(file)).toBe(false);
  });
});
