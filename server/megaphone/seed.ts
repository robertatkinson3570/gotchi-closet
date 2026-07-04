// server/megaphone/seed.ts
// One-time demo seed: on boot, publish the committed sample videos (one per template) so
// /megaphone and the /pulse hero have content out of the box. Guarded by a meta flag so it
// runs exactly once; after that, admins fully own the library (deletes stay deleted).
import fs from "node:fs";
import path from "node:path";
import { deleteVideosByPublisher, getMeta, insertVideo, pinPulse, setMeta } from "./store";
import { isTemplate, type Template } from "../../src/lib/megaphone/types";

// Bump this when the committed demo set changes so the polished clips replace the old ones.
const SEED_FLAG = "demos_seeded_v3";
const SEED_PUBLISHER = "0x0000000000000000000000000000000000000000";

interface ManifestEntry {
  file: string;
  template: string;
  title: string;
  caption: string;
  gotchiId: string | null;
  durationS: number | null;
  pin?: boolean;
}

function demoDir(): string {
  return process.env.MEGAPHONE_DEMO_DIR || path.resolve("video/demo");
}

export function seedDemos(): void {
  try {
    if (getMeta(SEED_FLAG)) return; // already seeded once

    const dir = demoDir();
    const manifestPath = path.join(dir, "manifest.json");
    if (!fs.existsSync(manifestPath)) return; // nothing to seed

    const entries = JSON.parse(fs.readFileSync(manifestPath, "utf8")) as ManifestEntry[];
    // Replace any prior seed set (published under the seed marker wallet). Real
    // admin-published videos use a different wallet and are never touched.
    deleteVideosByPublisher(SEED_PUBLISHER);
    let seeded = 0;
    for (const e of entries) {
      const mp4Path = path.join(dir, e.file);
      if (!fs.existsSync(mp4Path)) {
        console.warn(`[megaphone-seed] missing ${e.file}, skipping`);
        continue;
      }
      const template: Template = isTemplate(e.template) ? e.template : "Other";
      const v = insertVideo({
        title: e.title,
        caption: e.caption,
        template,
        mp4: fs.readFileSync(mp4Path),
        poster: null,
        durationS: e.durationS,
        gotchiId: e.gotchiId,
        publishedBy: SEED_PUBLISHER,
      });
      if (e.pin) pinPulse(v.id);
      seeded++;
    }

    setMeta(SEED_FLAG, String(Date.now()));
    console.log(`[megaphone-seed] published ${seeded} demo video(s)`);
  } catch (err) {
    // Never let a seeding hiccup take down boot.
    console.warn("[megaphone-seed] skipped:", (err as Error).message);
  }
}
