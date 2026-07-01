#!/usr/bin/env node
// gotchi-kb: local search index over Discord exports + incremental refresh.
//   node kb.mjs build              -> (re)build messages.jsonl + state.json from all exports
//   node kb.mjs ask "<query>"      -> ranked message search (flags: --channel <s> --after YYYY-MM-DD --limit N)
//   node kb.mjs refresh            -> pull messages newer than last export for tracked channels, append, rebuild
//
// Data (exports, index, token) lives OUTSIDE the repo at GOTCHI_KB_ROOT (default C:/tools/dce),
// so ~90MB of other people's chat + wallet addresses never enters git history.
import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';
import { spawnSync } from 'node:child_process';

const ROOT = (process.env.GOTCHI_KB_ROOT || 'C:/tools/dce').replace(/\\/g, '/');
const KB = path.join(ROOT, 'kb');
const JSONL = path.join(KB, 'messages.jsonl');
const STATE = path.join(KB, 'state.json');
const EXE = path.join(ROOT, 'DiscordChatExporter.Cli.exe');
const TOKEN_FILE = path.join(ROOT, 'token.txt');
const INC = path.join(ROOT, 'exports/_incremental');
const EXPORT_DIRS = [
  path.join(ROOT, 'exports/aavegotchi'),
  path.join(ROOT, 'exports/gotchi-battler'),
  path.join(ROOT, 'exports/aavegotchi-forum-dao'),
  path.join(ROOT, 'exports/aavegotchi-web'), // blog, gotchiverse docs, main YouTube transcripts (ingest-web.mjs / ingest-youtube.py)
  INC,
];
// channels refreshed by `refresh` (8 core message channels + 4 ANNOUNCEMENTS channels)
const REFRESH_CHANNELS = [
  '732491344970383373', // general-chat
  '769205560222285844', // ghst-talk
  '819209108854669353', // gotchigang-chat
  '1320055146281041951',// gotchiverse
  '816515743351832607', // baazaar
  '734081492967489576', // dao-discussion
  '1300820268704596008',// ai
  '796945547860377610', // devs-chat
  '784303575593517087', // aannouncements (ANNOUNCEMENTS)
  '1301529782567047249',// smol-aannouncements (ANNOUNCEMENTS)
  '1236091626439315506',// events (ANNOUNCEMENTS)
  '852381649177804861', // dao (ANNOUNCEMENTS)
];
const STOP = new Set('the a an and or of to in on for is are was be it this that with as at by my me you i do does can how what why when who where which our their his her its'.split(' '));

function build() {
  fs.mkdirSync(KB, { recursive: true });
  const out = fs.createWriteStream(JSONL);
  const state = { channels: {}, builtAt: new Date().toISOString() };
  const seen = new Set();
  let total = 0, files = 0;
  for (const dir of EXPORT_DIRS) {
    if (!fs.existsSync(dir)) continue;
    for (const f of fs.readdirSync(dir)) {
      if (!f.endsWith('.json')) continue;
      let j; try { j = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')); } catch { continue; }
      const msgs = j.messages || []; if (!msgs.length) continue;
      files++;
      const chId = j.channel?.id || f, chName = j.channel?.name || f, cat = j.channel?.category || '', guild = j.guild?.name || '';
      let last = state.channels[chId];
      for (const m of msgs) {
        if (!m.content && !(m.attachments?.length)) continue;
        if (seen.has(m.id)) continue; seen.add(m.id);
        const rec = { id: m.id, g: guild, ch: chName, chId, cat, ts: m.timestamp,
          a: (m.author?.nickname || m.author?.name || '?'), c: m.content || '',
          at: (m.attachments || []).map(x => x.url) };
        out.write(JSON.stringify(rec) + '\n'); total++;
        if (!last || m.timestamp > last.lastTs) last = { name: chName, guild, lastTs: m.timestamp, lastId: m.id };
      }
      state.channels[chId] = last;
    }
  }
  out.end();
  fs.writeFileSync(STATE, JSON.stringify(state, null, 2));
  console.log(`built ${total} messages from ${files} channel files`);
  console.log(`-> ${JSONL}`);
}

function parseArgs(argv) {
  const o = { limit: 30 }; const rest = [];
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--channel') o.channel = argv[++i];
    else if (argv[i] === '--after') o.after = argv[++i];
    else if (argv[i] === '--limit') o.limit = parseInt(argv[++i], 10) || 30;
    else rest.push(argv[i]);
  }
  o.query = rest.join(' ');
  return o;
}

async function ask(opts) {
  if (!fs.existsSync(JSONL)) { console.error('No index. Run: node kb.mjs build'); process.exit(1); }
  const phrases = [...opts.query.matchAll(/"([^"]+)"/g)].map(m => m[1].toLowerCase());
  const bare = opts.query.replace(/"[^"]+"/g, ' ');
  const terms = [...new Set((bare.toLowerCase().match(/0x[0-9a-f]{6,}|[a-z0-9][a-z0-9'.-]{1,}/gi) || [])
    .map(s => s.toLowerCase()).filter(t => !STOP.has(t)))];
  const chFilter = opts.channel?.toLowerCase();
  const need = terms.length >= 3 ? 2 : 1;
  const top = [];
  const rl = readline.createInterface({ input: fs.createReadStream(JSONL), crlfDelay: Infinity });
  let scanned = 0;
  for await (const line of rl) {
    if (!line) continue;
    let r; try { r = JSON.parse(line); } catch { continue; }
    scanned++;
    if (chFilter && !r.ch.toLowerCase().includes(chFilter)) continue;
    if (opts.after && r.ts < opts.after) continue;
    const c = r.c.toLowerCase();
    let score = 0, matched = 0;
    for (const t of terms) { if (c.includes(t)) { matched++; score += 10 + Math.min((c.split(t).length - 1), 5); } }
    for (const p of phrases) { if (c.includes(p)) { score += 60; matched++; } }
    if (matched < need) continue;
    score += matched * 6;
    top.push({ score, r });
  }
  top.sort((x, y) => y.score - x.score || (y.r.ts < x.r.ts ? -1 : 1));
  const results = top.slice(0, opts.limit);
  console.log(`# search: ${terms.join(', ')}${phrases.length ? ' | phrases: ' + phrases.join(' / ') : ''}`);
  console.log(`# ${results.length} shown of ${top.length} matches (scanned ${scanned})\n`);
  for (const { r } of results) {
    console.log(`[${(r.ts || '').slice(0, 10)}] (${r.g}/${r.ch}) ${r.a}: ${r.c.replace(/\s+/g, ' ').slice(0, 600)}`);
    if (r.at?.length) console.log(`    attachments: ${r.at.join(' ')}`);
    console.log('');
  }
}

function refresh() {
  if (!fs.existsSync(EXE)) { console.error('DCE not found at ' + EXE); process.exit(1); }
  if (!fs.existsSync(TOKEN_FILE)) { console.error('No token at ' + TOKEN_FILE); process.exit(1); }
  const token = fs.readFileSync(TOKEN_FILE, 'utf8').trim();
  const state = fs.existsSync(STATE) ? JSON.parse(fs.readFileSync(STATE, 'utf8')) : { channels: {} };
  fs.mkdirSync(INC, { recursive: true });
  for (const chId of REFRESH_CHANNELS) {
    const st = state.channels[chId];
    const after = st?.lastId || '2025-06-19'; // snowflake id is precise; date is fallback
    console.log(`\n=== refresh ${st?.name || chId} (after ${after}) ===`);
    const res = spawnSync(EXE, ['export', '-t', token, '-f', 'Json', '--utc', '--after', String(after), '-o', INC + path.sep, '-c', chId], { stdio: 'inherit' });
    if (res.status !== 0) console.error(`  (channel ${chId} export exited ${res.status})`);
  }
  console.log('\nrebuilding index...');
  build();
}

const cmd = process.argv[2];
if (cmd === 'build') build();
else if (cmd === 'ask') ask(parseArgs(process.argv.slice(3)));
else if (cmd === 'refresh') refresh();
else { console.log('usage: node kb.mjs <build | ask "<query>" [--channel s] [--after YYYY-MM-DD] [--limit N] | refresh>'); }
