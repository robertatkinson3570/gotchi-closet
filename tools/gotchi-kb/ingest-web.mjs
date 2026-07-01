#!/usr/bin/env node
// ingest-web: scrape a sitemap-driven site into a DiscordChatExporter-format JSON
// file that gotchi-kb build() can index. Used for blog.aavegotchi.com (Ghost) and
// docs.gotchiverse.io (GitBook). Output lands in exports/aavegotchi-web/.
//
//   node ingest-web.mjs blog
//   node ingest-web.mjs docs
//   node ingest-web.mjs probe <url>     -> print extracted text length + sample (debug)
//
import fs from 'node:fs';
import path from 'node:path';

const ROOT = (process.env.GOTCHI_KB_ROOT || 'C:/tools/dce').replace(/\\/g, '/');
const OUTDIR = path.join(ROOT, 'exports/aavegotchi-web');

const CFG = {
  blog: {
    sitemap: 'https://blog.aavegotchi.com/sitemap-posts.xml',
    chId: 'blog', chName: 'blog-aavegotchi', cat: 'Aavegotchi Blog (Ghost)',
    author: 'Aavegotchi Blog', file: 'Aavegotchi Blog [blog].json', idPrefix: 'blog',
  },
  docs: {
    sitemap: 'https://docs.gotchiverse.io/sitemap-pages.xml',
    chId: 'gvdocs', chName: 'gotchiverse-docs', cat: 'Gotchiverse Docs (GitBook)',
    author: 'Gotchiverse Docs', file: 'Gotchiverse Docs [gvdocs].json', idPrefix: 'gvdocs',
  },
};

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';
const CHUNK = 1400;

async function get(url, asText = true) {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const r = await fetch(url, { headers: { 'user-agent': UA, accept: 'text/html,application/xml' } });
      if (!r.ok) { if (r.status === 404) return null; throw new Error('HTTP ' + r.status); }
      return asText ? await r.text() : r;
    } catch (e) {
      if (attempt === 2) { console.error('  ! fetch failed', url, e.message); return null; }
      await new Promise(res => setTimeout(res, 600 * (attempt + 1)));
    }
  }
}

function decodeEntities(s) {
  return s
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&#x27;/g, "'").replace(/&apos;/g, "'")
    .replace(/&hellip;/g, '...').replace(/&mdash;/g, '-').replace(/&ndash;/g, '-')
    .replace(/&#(\d+);/g, (_, n) => { try { return String.fromCodePoint(+n); } catch { return ' '; } })
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => { try { return String.fromCodePoint(parseInt(h, 16)); } catch { return ' '; } });
}

// Pull the main editorial body and strip to readable text.
function extractText(html) {
  let h = html;
  // kill non-content blocks
  h = h.replace(/<script[\s\S]*?<\/script>/gi, ' ')
       .replace(/<style[\s\S]*?<\/style>/gi, ' ')
       .replace(/<noscript[\s\S]*?<\/noscript>/gi, ' ')
       .replace(/<svg[\s\S]*?<\/svg>/gi, ' ')
       .replace(/<nav[\s\S]*?<\/nav>/gi, ' ')
       .replace(/<header[\s\S]*?<\/header>/gi, ' ')
       .replace(/<footer[\s\S]*?<\/footer>/gi, ' ')
       .replace(/<form[\s\S]*?<\/form>/gi, ' ');
  // prefer a main content container if present
  let m = h.match(/<article[\s\S]*?<\/article>/i)
       || h.match(/<main[\s\S]*?<\/main>/i)
       || h.match(/<section[^>]*class=["'][^"']*gh-content[\s\S]*?<\/section>/i);
  let body = m ? m[0] : h;
  // block-level tags -> newlines so words don't fuse
  body = body.replace(/<(p|div|li|h[1-6]|br|tr|section|article)[^>]*>/gi, '\n')
             .replace(/<\/(p|div|li|h[1-6]|tr|section|article)>/gi, '\n');
  let text = decodeEntities(body.replace(/<[^>]+>/g, ' '));
  text = text.replace(/[ \t ]+/g, ' ').replace(/\n[ \t]*\n[\s\n]*/g, '\n\n').replace(/\n{3,}/g, '\n\n').trim();
  return text;
}

// GitBook embeds page content as JSON in __NEXT_DATA__ / window state. Mine "text" leaves as a fallback.
function extractGitbookJson(html) {
  const blocks = [];
  const m = html.match(/<script[^>]*>[\s\S]*?<\/script>/gi) || [];
  let raw = '';
  for (const s of m) if (s.includes('"leaf"') || s.includes('"text"') || s.includes('"document"')) raw += s;
  const re = /"text"\s*:\s*"((?:[^"\\]|\\.)*)"/g; let g;
  while ((g = re.exec(raw))) {
    let t = g[1].replace(/\\n/g, ' ').replace(/\\"/g, '"').replace(/\\\\/g, '\\').replace(/\\u([0-9a-f]{4})/gi, (_, h) => String.fromCharCode(parseInt(h, 16)));
    if (t.trim().length > 1) blocks.push(t.trim());
  }
  return decodeEntities(blocks.join(' ')).replace(/\s+/g, ' ').trim();
}

function title(html) {
  const og = html.match(/<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i);
  const t = html.match(/<title>([^<]+)<\/title>/i);
  return decodeEntities((og?.[1] || t?.[1] || '').replace(/\s*\|\s*Aavegotchi.*$/i, '').trim());
}
function publishedTime(html) {
  const m = html.match(/<meta[^>]+property=["']article:published_time["'][^>]+content=["']([^"']+)["']/i)
        || html.match(/<meta[^>]+name=["']article:published_time["'][^>]+content=["']([^"']+)["']/i);
  return m?.[1] || null;
}

function chunk(text, max = CHUNK) {
  const out = []; let i = 0;
  while (i < text.length) {
    let end = Math.min(i + max, text.length);
    if (end < text.length) {
      const slice = text.slice(i, end);
      const cut = Math.max(slice.lastIndexOf('. '), slice.lastIndexOf('\n'), slice.lastIndexOf('! '), slice.lastIndexOf('? '));
      if (cut > max * 0.5) end = i + cut + 1;
    }
    out.push(text.slice(i, end).trim()); i = end;
  }
  return out.filter(Boolean);
}

async function sitemapUrls(url) {
  const xml = await get(url);
  if (!xml) return [];
  const urls = [];
  const re = /<url>([\s\S]*?)<\/url>/gi; let m;
  while ((m = re.exec(xml))) {
    const loc = m[1].match(/<loc>([^<]+)<\/loc>/i)?.[1];
    const mod = m[1].match(/<lastmod>([^<]+)<\/lastmod>/i)?.[1];
    if (loc) urls.push({ loc: loc.trim(), mod: mod?.trim() });
  }
  return urls;
}

async function run(mode) {
  const cfg = CFG[mode];
  fs.mkdirSync(OUTDIR, { recursive: true });
  let urls = await sitemapUrls(cfg.sitemap);
  if (mode === 'blog') urls = urls.filter(u => !/\/(signin|signup|account|offline|contact|about|contribute|tag\/|author\/|page\/)/i.test(u.loc));
  console.log(`[${mode}] ${urls.length} urls`);
  const messages = [];
  let done = 0, empty = 0;
  const CONC = 5;
  for (let i = 0; i < urls.length; i += CONC) {
    const batch = urls.slice(i, i + CONC);
    await Promise.all(batch.map(async ({ loc, mod }) => {
      const html = await get(loc);
      if (!html) { empty++; return; }
      let text = extractText(html);
      if (text.length < 250) { const gb = extractGitbookJson(html); if (gb.length > text.length) text = gb; }
      const ttl = title(html) || loc;
      const ts = publishedTime(html) || mod || new Date().toISOString();
      const slug = loc.replace(/\/+$/, '').split('/').slice(3).join('-').replace(/[^a-z0-9-]/gi, '').slice(0, 60) || 'root';
      if (text.length < 80) { empty++; console.log(`\n  (thin) ${loc} [${text.length}]`); return; }
      const parts = chunk(`${ttl}\n${loc}\n\n${text}`);
      parts.forEach((c, idx) => messages.push({
        id: `${cfg.idPrefix}-${slug}-${idx}`, type: 'Default', timestamp: ts,
        content: idx === 0 ? c : `${ttl} (cont.)\n${c}`, author: { name: cfg.author }, attachments: [],
      }));
      done++;
    }));
    process.stdout.write(`\r  fetched ${Math.min(i + CONC, urls.length)}/${urls.length}  (ok ${done}, empty ${empty}, chunks ${messages.length})   `);
  }
  console.log('');
  messages.sort((a, b) => (a.timestamp < b.timestamp ? 1 : -1));
  const doc = { guild: { id: 'aavegotchi', name: 'Aavegotchi' }, channel: { id: cfg.chId, name: cfg.chName, category: cfg.cat }, messages };
  const outPath = path.join(OUTDIR, cfg.file);
  fs.writeFileSync(outPath, JSON.stringify(doc));
  console.log(`-> ${outPath}\n   pages ok: ${done}, empty/skipped: ${empty}, messages: ${messages.length}`);
}

const mode = process.argv[2];
if (mode === 'probe') {
  const url = process.argv[3];
  const html = await get(url);
  let t = extractText(html || '');
  const gb = extractGitbookJson(html || '');
  console.log('title:', title(html || ''));
  console.log('published:', publishedTime(html || ''));
  console.log('extractText len:', t.length, '| gitbookJson len:', gb.length);
  console.log('--- sample (best) ---');
  console.log((gb.length > t.length ? gb : t).slice(0, 800));
} else if (CFG[mode]) {
  await run(mode);
} else {
  console.log('usage: node ingest-web.mjs <blog|docs|probe <url>>');
}
