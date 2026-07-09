// Temporary standalone runner: drives SiteCrawlIQ's geo-audit + structured-data
// engines against gotchicloset.com raw HTML (no DB required). Output JSON goes to
// the gotchi-closet repo's seo-output directory.
import { runGeoAudit } from "../server/geo-audit";
import { validateStructuredData } from "../server/structured-data";
import * as cheerio from "cheerio";
import { writeFileSync, mkdirSync } from "node:fs";

const BASE = "https://www.gotchicloset.com";
const PATHS = [
  "/",
  "/wearables",
  "/sets",
  "/traits",
  "/rarity-score",
  "/lending",
  "/forge",
  "/dao",
  "/dress",
  "/sets/aastronaut",
  "/traits/nrg",
];

async function main() {
  const htmlContents = new Map<string, string>();
  const pages: any[] = [];
  const onPage: any[] = [];

  const robotsRes = await fetch(`${BASE}/robots.txt`);
  const robots = robotsRes.ok ? await robotsRes.text() : null;

  for (const p of PATHS) {
    const url = `${BASE}${p}`;
    const res = await fetch(url, { headers: { "User-Agent": "SiteCrawlIQ-Audit/1.0" } });
    const html = await res.text();
    htmlContents.set(url, html);
    const $ = cheerio.load(html);
    const text = $("body").text().replace(/\s+/g, " ").trim();
    const wordCount = text ? text.split(" ").length : 0;
    pages.push({ url, statusCode: res.status, wordCount });
    onPage.push({
      url,
      status: res.status,
      title: $("title").text() || null,
      metaDescription: $('meta[name="description"]').attr("content") || null,
      canonical: $('link[rel="canonical"]').attr("href") || null,
      h1Count: $("h1").length,
      h2Count: $("h2").length,
      ogTags: $('meta[property^="og:"]').length,
      twitterTags: $('meta[name^="twitter:"]').length,
      jsonLdBlocks: $('script[type="application/ld+json"]').length,
      rawBodyWordCount: wordCount,
    });
  }

  const geo = await runGeoAudit(BASE, pages, robots, htmlContents);
  const structuredData = validateStructuredData(htmlContents.get(`${BASE}/`)!, `${BASE}/`);

  const result = {
    auditedAt: new Date().toISOString(),
    engine: "SiteCrawlIQ geo-audit + structured-data (standalone, raw HTML, no JS rendering)",
    base: BASE,
    robotsTxt: robots,
    onPage,
    geoAudit: geo,
    structuredDataHomepage: structuredData,
  };

  mkdirSync("C:/Cursor/gotchi-closet/seo-output", { recursive: true });
  writeFileSync(
    "C:/Cursor/gotchi-closet/seo-output/sitecrawliq-audit.json",
    JSON.stringify(result, null, 2)
  );
  console.log("Wrote seo-output/sitecrawliq-audit.json");
  console.log("GEO summary:", JSON.stringify({
    llmsTxtFound: geo.llmsTxtFound,
    citabilityScore: geo.citabilityScore,
    questionHeadings: geo.questionHeadings,
    answerFirstPages: geo.answerFirstPages,
    schemaMarkup: geo.schemaMarkup,
  }, null, 2));
}

main().catch((e) => { console.error(e); process.exit(1); });
