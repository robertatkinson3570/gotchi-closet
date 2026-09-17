import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

/** House rule (GVR QA H-05, OWNER-21): no em dashes in anything a player reads. */
const here = dirname(fileURLToPath(import.meta.url));
const FILES = ["./KeeperPanel.tsx", "../../lib/companion/keeperAuth.ts", "../../lib/companion/api.ts"];

describe("no em dash in the Keeper surfaces", () => {
  for (const rel of FILES) {
    it(`${rel} has none`, () => {
      const text = readFileSync(resolve(here, rel), "utf8");
      const hits = text.split("\n").map((l, i) => (l.includes("\u2014") ? i + 1 : 0)).filter(Boolean);
      expect(hits).toEqual([]);
    });
  }
});
