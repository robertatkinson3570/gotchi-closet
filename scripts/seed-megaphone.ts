// scripts/seed-megaphone.ts — DEV ONLY. Seeds the local Megaphone store with an
// already-rendered video so /megaphone and the /pulse hero have content to show without
// going through the wallet-signed publish flow. Run: pnpm exec tsx scripts/seed-megaphone.ts
import fs from "node:fs";
import path from "node:path";
import { insertVideo, pinPulse } from "../server/megaphone/store";

const mp4Path = process.argv[2] ?? "video/out/pulserecap-2026-07-03.mp4";
if (!fs.existsSync(mp4Path)) {
  console.error(`no mp4 at ${mp4Path} — render one first (see video/README.md)`);
  process.exit(1);
}
const mp4 = fs.readFileSync(path.resolve(mp4Path));

const v = insertVideo({
  title: "Aavegotchi Weekly Pulse",
  caption: "gm frens. this weeks pulse, auto-generated from live on chain data. 28,340 GHST traded, up 8 percent.",
  template: "PulseRecap",
  mp4,
  poster: null,
  durationS: 27,
  gotchiId: null,
  publishedBy: "0x0000000000000000000000000000000000000001",
});
pinPulse(v.id);
console.log(`seeded video #${v.id} (${(mp4.length / 1024 / 1024).toFixed(1)}MB) and pinned to /pulse`);
console.log(`videoUrl: ${v.videoUrl}`);
