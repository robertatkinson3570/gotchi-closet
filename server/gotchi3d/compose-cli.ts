/**
 * One-shot compose worker: `tsx server/gotchi3d/compose-cli.ts <hash>`
 * composes the model into the shared cache dir and exits. Exists so the API
 * process NEVER runs gltf-transform's CPU-heavy passes (texture resize, weld)
 * on its event loop — a single compose blocked every request for tens of
 * seconds (measured 57s TTFB on a disk-warm poster while the prewarm ran).
 */
import { composeGotchiGlb } from "./compose";

const hash = process.argv[2];
if (!hash) {
  console.error("usage: compose-cli <hash>");
  process.exit(1);
}
composeGotchiGlb(hash)
  .then((file) => process.exit(file ? 0 : 2))
  .catch((e) => {
    console.error(`[gotchi3d] compose-cli failed for ${hash}`, e);
    process.exit(3);
  });
