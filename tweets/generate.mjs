// tweets/generate.mjs
// Local daily promo-tweet generator. Runs where the private gotchi-kb + LLM keys live.
// Drafts varied tweets across four sources, avoids repeating anything already generated,
// and pushes candidates to the Megaphone review queue (POST /api/megaphone/tweets/ingest).
//
// Env:
//   MEGAPHONE_API_BASE   default https://api.gotchicloset.com
//   MEGAPHONE_INGEST_KEY required (shared secret; must match the server)
//   GROQ_API_KEY         preferred (free tier) OR OPENAI_API_KEY
//   TWEET_COUNT          default 12
//   TWEET_KB             set to "0" to skip the community-builds (gotchi-kb) source
//
// Usage: node tweets/generate.mjs
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";

const HERE = path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1"));
const ROOT = path.resolve(HERE, "..");
const API = process.env.MEGAPHONE_API_BASE || "https://api.gotchicloset.com";
const INGEST_KEY = process.env.MEGAPHONE_INGEST_KEY || "";
const COUNT = Number(process.env.TWEET_COUNT || 12);

if (!INGEST_KEY) {
  console.error("MEGAPHONE_INGEST_KEY is required");
  process.exit(1);
}

const feat = JSON.parse(fs.readFileSync(path.join(HERE, "features.json"), "utf8"));

async function recentTexts() {
  try {
    const r = await fetch(`${API}/api/megaphone/tweets/recent`, { headers: { "x-ingest-key": INGEST_KEY } });
    if (!r.ok) return [];
    return (await r.json()).texts ?? [];
  } catch {
    return [];
  }
}

async function liveData() {
  try {
    const p = await (await fetch(`${API}/api/pulse`)).json();
    if (p.building) return null;
    const w = p.windows || {};
    const latest = p.latest || {};
    return {
      ghstUsd: latest.ghst_price_usd,
      vol30d: w.sales_volume_ghst_30d,
      buyers30d: w.sales_buyers_30d,
      sales30d: w.sales_count_30d,
      summoned30d: w.gotchis_summoned_30d,
    };
  } catch {
    return null;
  }
}

// Community builds from the local Discord KB (best-effort; skipped if unavailable).
function kbBuilds() {
  if (process.env.TWEET_KB === "0") return [];
  const kb = path.join(ROOT, "tools", "gotchi-kb", "kb.mjs");
  if (!fs.existsSync(kb)) return [];
  try {
    const out = execFileSync("node", [kb, "ask", "building OR built OR shipped OR launched OR made a", "--limit", "40"], {
      encoding: "utf8",
      timeout: 60000,
    });
    // Keep lines that carry a URL — those are the "someone shipped a thing" signals.
    return out
      .split("\n")
      .filter((l) => /https?:\/\//.test(l) && /\b(built|building|shipped|launched|made|created|tool|dashboard|game)\b/i.test(l))
      .slice(0, 12);
  } catch {
    return [];
  }
}

function buildPrompt({ recent, data, builds }) {
  const featureLines = feat.features.map((f) => `- ${f.name} (${feat.site}${f.url}): ${f.hook}`).join("\n");
  const dataLine = data
    ? `Live data you may reference (only if it makes a good tweet): GHST ~$${data.ghstUsd?.toFixed?.(3) ?? "?"}, 30d volume ${Math.round(data.vol30d || 0).toLocaleString()} GHST, ${data.buyers30d || 0} buyers, ${data.sales30d || 0} sales, ${data.summoned30d || 0} gotchis summoned. Link data tweets to ${feat.site}/pulse.`
    : "No live data available this run.";
  const buildLines = builds.length
    ? `Community builds spotted in the Aavegotchi Discord (write supportive shout-outs, include their link, never overclaim):\n${builds.join("\n")}`
    : "No community builds available this run; skip the builds source.";
  const avoid = recent.length ? `Do NOT repeat or closely paraphrase any of these ${recent.length} already-used tweets:\n${recent.slice(0, 120).map((t) => `• ${t}`).join("\n")}` : "";

  return `You write short promo tweets for GotchiCloset (@${feat.handle}), a free community-built Aavegotchi app on Base, and to hype Aavegotchi itself.

Produce EXACTLY ${COUNT} tweets as a JSON array. Each item: {"text": string, "source": "app"|"data"|"ecosystem"|"builds", "link": string|null}.

Spread them across sources: mostly "app" (promote specific GotchiCloset features from the list), a couple "data", a couple "ecosystem" (hype Aavegotchi/GHST/Base generally), and "builds" only if community builds are provided.

Voice rules (follow strictly):
${feat.voiceRules.map((r) => "- " + r).join("\n")}

Every tweet must be distinct from the others AND from the already-used list. Vary openers, angles, and length.

GotchiCloset features to promote (pick varied ones, use the matching link):
${featureLines}

Cross-cutting angles:
${feat.crossCutting.map((c) => "- " + c).join("\n")}

${dataLine}

${buildLines}

${avoid}

Return ONLY the JSON array, no prose.`;
}

async function callLLM(prompt) {
  const groq = process.env.GROQ_API_KEY;
  const openai = process.env.OPENAI_API_KEY;
  const cfg = groq
    ? { url: "https://api.groq.com/openai/v1/chat/completions", key: groq, model: process.env.GROQ_MODEL || "llama-3.3-70b-versatile" }
    : openai
      ? { url: "https://api.openai.com/v1/chat/completions", key: openai, model: process.env.OPENAI_MODEL || "gpt-4o-mini" }
      : null;
  if (!cfg) throw new Error("set GROQ_API_KEY or OPENAI_API_KEY");
  const r = await fetch(cfg.url, {
    method: "POST",
    headers: { Authorization: `Bearer ${cfg.key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: cfg.model,
      temperature: 1.0,
      messages: [
        { role: "system", content: "You are a witty, concise crypto-native social writer. Output valid JSON only." },
        { role: "user", content: prompt },
      ],
    }),
  });
  if (!r.ok) throw new Error(`LLM ${r.status}: ${(await r.text()).slice(0, 200)}`);
  const txt = (await r.json()).choices?.[0]?.message?.content ?? "";
  const match = txt.match(/\[[\s\S]*\]/);
  if (!match) throw new Error("LLM did not return a JSON array");
  return JSON.parse(match[0]);
}

async function main() {
  const [recent, data] = await Promise.all([recentTexts(), liveData()]);
  const builds = kbBuilds();
  console.log(`sources: ${recent.length} recent to avoid, data=${!!data}, builds=${builds.length}`);
  const tweets = await callLLM(buildPrompt({ recent, data, builds }));
  const clean = tweets
    .filter((t) => t && typeof t.text === "string" && t.text.trim())
    .map((t) => ({ text: t.text.trim(), source: t.source || "app", link: t.link || null }));
  console.log(`generated ${clean.length} tweets`);

  const r = await fetch(`${API}/api/megaphone/tweets/ingest`, {
    method: "POST",
    headers: { "x-ingest-key": INGEST_KEY, "Content-Type": "application/json" },
    body: JSON.stringify({ candidates: clean }),
  });
  if (!r.ok) throw new Error(`ingest ${r.status}: ${(await r.text()).slice(0, 200)}`);
  const res = await r.json();
  console.log(`ingested: +${res.added} new, ${res.skipped} duplicates skipped. Review at ${feat.site}/megaphone`);
}

main().catch((e) => {
  console.error("FAIL:", e.message);
  process.exit(1);
});
