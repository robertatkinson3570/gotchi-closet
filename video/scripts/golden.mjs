// Golden-frame regression check. Run from video/: node scripts/golden.mjs [--update]
// Renders one still per composition from fixture defaultProps and compares
// against golden/expected/. Bootstrap or accept changes with --update.
import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import pixelmatch from "pixelmatch";
import { PNG } from "pngjs";

const CASES = [
  { comp: "Spotlight", frame: 400 },
  { comp: "FitReveal", frame: 120 },
  { comp: "SaleAlert", frame: 100 },
  { comp: "PulseRecap", frame: 200 },
];
const update = process.argv.includes("--update");
const expectedDir = "golden/expected";
const currentDir = "golden/current";
fs.mkdirSync(expectedDir, { recursive: true });
fs.mkdirSync(currentDir, { recursive: true });

let failed = 0;
for (const { comp, frame } of CASES) {
  const current = path.join(currentDir, `${comp}.png`);
  execSync(`pnpm exec remotion still src/index.ts ${comp} ${current} --frame=${frame}`, {
    stdio: "inherit",
  });
  const expected = path.join(expectedDir, `${comp}.png`);
  if (!fs.existsSync(expected) || update) {
    fs.copyFileSync(current, expected);
    console.log(`[golden] ${comp}: baseline written`);
    continue;
  }
  const a = PNG.sync.read(fs.readFileSync(expected));
  const b = PNG.sync.read(fs.readFileSync(current));
  const diff = pixelmatch(a.data, b.data, null, a.width, a.height, { threshold: 0.1 });
  const pct = (diff / (a.width * a.height)) * 100;
  if (pct > 0.5) {
    console.error(`[golden] ${comp}: FAIL — ${pct.toFixed(2)}% pixels differ`);
    failed++;
  } else {
    console.log(`[golden] ${comp}: ok (${pct.toFixed(2)}%)`);
  }
}
process.exit(failed ? 1 : 0);
