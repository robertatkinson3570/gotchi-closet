import fs from "fs";
import path from "path";
import wearableSets from "../data/wearableSets.json";
import wearables from "../data/wearables.json";

const SITE_URL =
  process.env.VITE_SITE_URL ||
  process.env.NEXT_PUBLIC_SITE_URL ||
  "https://gotchicloset.xyz";

function toSlug(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-");
}

const traitSlugs = ["nrg", "agg", "spk", "brn", "eys", "eyc"];

const pages = [
  "/",
  "/sets",
  "/traits",
  "/rarity-score",
  "/wearables",
  ...traitSlugs.map((t) => `/traits/${t}`),
  ...((wearableSets as Array<{ name: string }>).map((s) => `/sets/${toSlug(s.name)}`)),
  ...((wearables as Array<{ name: string }>).map((w) => `/wearable/${toSlug(w.name)}`)),
];

const urls = pages.map((p) => `  <url><loc>${SITE_URL}${p}</loc></url>`).join("\n");

const xml = `<?xml version="1.0" encoding="UTF-8"?>\n` +
  `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n` +
  `${urls}\n` +
  `</urlset>\n`;

const outDir = path.join(process.cwd(), "public");
fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(path.join(outDir, "sitemap.xml"), xml);
fs.writeFileSync(path.join(outDir, "robots.txt"), `User-agent: *\nAllow: /\nSitemap: ${SITE_URL}/sitemap.xml\n`);

console.log(`sitemap written with ${pages.length} URLs`);

