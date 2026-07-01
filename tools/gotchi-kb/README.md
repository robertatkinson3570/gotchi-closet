# gotchi-kb

Local, dependency-free search index over the Aavegotchi / Gotchi Battler corpus — Discord chats,
the blog, the Gotchiverse docs, and YouTube transcripts — so you can ask questions against the
community + official knowledge and append the latest.

**Code is in the repo; data is not.** The exports + index + Discord token live at `C:\tools\dce`
(override with `GOTCHI_KB_ROOT`). That keeps other people's messages and wallet addresses out of
git history.

## Usage

```sh
# ask a question (ranked keyword search over 53k+ records)
node tools/gotchi-kb/kb.mjs ask "base diamond setPetOperatorForAll" --limit 20
node tools/gotchi-kb/kb.mjs ask "rarity farming schedule" --channel dao-discussion --after 2026-01-01

# search a specific non-Discord source by its channel name:
node tools/gotchi-kb/kb.mjs ask "migrated to base" --channel blog-aavegotchi
node tools/gotchi-kb/kb.mjs ask "alchemica harvester" --channel gotchiverse-docs
node tools/gotchi-kb/kb.mjs ask "quorum signers" --channel dao-call-transcripts

# pull the latest Discord messages (8 core + 4 announcement channels), append, reindex
node tools/gotchi-kb/kb.mjs refresh

# rebuild the index after adding/refreshing any source
node tools/gotchi-kb/kb.mjs build
```

The easiest way to ask is through Claude Code: invoke the **`gotchi-kb`** skill and ask in plain
English — it runs the search and synthesizes a cited answer.

## What's indexed (~53k records, 134 source files)
- **Aavegotchi chat:** general-chat, ghst-talk, gotchigang-chat, gotchiverse, baazaar, dao-discussion, ai, devs-chat
- **Aavegotchi ANNOUNCEMENTS:** aannouncements, smol-aannouncements, events, dao *(now in the refresh rotation)*
- **AavegotchiDAO forum:** ~100 AGIP / governance proposal threads
- **Blog** (`blog.aavegotchi.com`): full archive, 194 posts → 1,037 chunks (channel `blog-aavegotchi`)
- **Gotchiverse docs** (`docs.gotchiverse.io`): 42 pages → 61 chunks (channel `gotchiverse-docs`)
- **YouTube — main @aavegotchi:** 96 videos w/ captions → 1,805 chunks (channel `aavegotchi-youtube`)
- **YouTube — AavegotchiDAO calls:** 231 videos → 9,761 chunks (channel `dao-call-transcripts`)
- **Gotchi Battler:** battler-chat, announcements, etc.

## Ingestion tools (non-Discord sources)
Each writes a DiscordChatExporter-format JSON into `exports/aavegotchi-web/` (or `-forum-dao/` for
DAO calls), chunked ~1,400 chars, which `build` then indexes. Re-run any of these, then `build`.

```sh
# blog + docs (sitemap-driven HTML scrape -> chunks)
node tools/gotchi-kb/ingest-web.mjs blog
node tools/gotchi-kb/ingest-web.mjs docs

# YouTube transcripts (one yt-dlp pass per video = json3 captions + metadata; cache is resumable)
python tools/gotchi-kb/ingest-youtube.py both          # main @aavegotchi + AavegotchiDAO calls
python tools/gotchi-kb/ingest-youtube.py dao --parse-only   # rebuild JSON from cache, no re-download
```
Requires `pip install --user yt-dlp` (transcript text = straight concat of json3 segs, verified
byte-identical to `youtube-transcript-api`). Caption-less trailers are skipped.

## Derived: historical timeline
`../../timeline/` holds a curated history built from this corpus + cross-checked genesis research:
`TIMELINE.md` (narrative, 8 eras) and `timeline.json` (311 structured events with date/category/
tier/source). Regenerate with `node ../../timeline/build-timeline.mjs`.

## Refresh & the token
`refresh` shells out to DiscordChatExporter (`C:\tools\dce\DiscordChatExporter.Cli.exe`) with
`--after <last message id>` per channel, fetching only new messages for the 12 tracked channels.
It needs a valid user token at `C:\tools\dce\token.txt`. If `refresh` 401s, the token expired —
re-grab it from `discord.com/app` (DevTools → Network → any `/api/` request → copy the
`authorization` header). Blog/docs/YouTube are refreshed by re-running their ingest scripts above,
not by `refresh`.

## Re-create the data on another machine
1. Install DiscordChatExporter CLI to `C:\tools\dce\`; put a Discord user token in `token.txt`.
2. Export the channels (IDs are in `kb.mjs` `REFRESH_CHANNELS`), run the ingest scripts above.
3. `node tools/gotchi-kb/kb.mjs build`.
