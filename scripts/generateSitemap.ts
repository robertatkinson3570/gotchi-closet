import fs from "fs";
import path from "path";
import wearableSets from "../data/wearableSets.json";
import wearables from "../data/wearables.json";

const SITE_URL =
  process.env.VITE_SITE_URL ||
  process.env.NEXT_PUBLIC_SITE_URL ||
  "https://www.gotchicloset.com";

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
  // Public app pages (crawlable entry points; see src/app/router.tsx)
  "/dress",
  "/wardrobe-lab",
  "/baazaar",
  "/lending",
  "/lending/analytics",
  "/forge",
  "/dao",
  "/staking",
  "/games",
  "/leaderboard",
  "/pulse",
  "/stats",
  "/activity",
  "/get-tokens",
  // Guide pages (src/pages/guides/, briefs 7-18 in seo-output/content-plan.md)
  "/guides",
  "/guides/what-is-aavegotchi",
  "/guides/get-started",
  "/guides/base-migration",
  "/guides/ghst",
  "/guides/baazaar",
  "/guides/rarity-farming",
  "/guides/kinship",
  "/guides/wearable-sets",
  "/guides/gotchi-lending",
  "/guides/forge",
  "/guides/gotchi-battler",
  "/guides/valuation",
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

// robots.txt: everything is allowed, and AI crawlers (GEO: ChatGPT, Claude,
// Perplexity, Gemini, Common Crawl) are named explicitly so the allow is
// unambiguous even if a stricter default block is ever introduced.
const aiCrawlers = [
  "GPTBot",
  "OAI-SearchBot",
  "ChatGPT-User",
  "ClaudeBot",
  "Claude-SearchBot",
  "Claude-User",
  "PerplexityBot",
  "Perplexity-User",
  "Google-Extended",
  "CCBot",
];
const robots =
  `# GotchiCloset: Aavegotchi toolkit on Base\n` +
  `# AI crawlers are welcome. See also: ${SITE_URL}/llms.txt\n\n` +
  `User-agent: *\nAllow: /\n\n` +
  aiCrawlers.map((a) => `User-agent: ${a}\nAllow: /\n`).join("\n") +
  `\nSitemap: ${SITE_URL}/sitemap.xml\n`;
fs.writeFileSync(path.join(outDir, "robots.txt"), robots);

console.log(`sitemap written with ${pages.length} URLs`);

