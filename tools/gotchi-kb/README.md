# gotchi-kb

Local, dependency-free search index over exported Aavegotchi / Gotchi Battler Discord chats — so you can ask questions against the community knowledge and append the latest weekly.

**Code is in the repo; chat data is not.** The ~90 MB of exports + the index + the Discord token live at `C:\tools\dce` (override with the `GOTCHI_KB_ROOT` env var). That keeps other people's messages and wallet addresses out of git history.

## Usage

```sh
# ask a question (keyword search over 32k+ messages, ranked)
node tools/gotchi-kb/kb.mjs ask "base diamond setPetOperatorForAll" --limit 20
node tools/gotchi-kb/kb.mjs ask "rarity farming schedule" --channel dao-discussion --after 2026-01-01

# pull the latest (newer than last export) for the 8 core channels, append, reindex
node tools/gotchi-kb/kb.mjs refresh

# rebuild the index after manually adding exports
node tools/gotchi-kb/kb.mjs build
```

The easiest way to "ask questions" is through Claude Code: invoke the **`gotchi-kb`** skill (`.claude/skills/gotchi-kb/`) and ask in plain English — it runs the search and synthesizes a cited answer.

## What's indexed
- Aavegotchi (last ~year): general-chat, ghst-talk, gotchigang-chat, gotchiverse, baazaar, dao-discussion, ai, devs-chat
- Gotchi Battler: battler-chat, announcements, etc.
- AavegotchiDAO forum: ~100 proposal threads (one-time backfill)

## Refresh & the token
`refresh` shells out to DiscordChatExporter (`C:\tools\dce\DiscordChatExporter.Cli.exe`) with `--after <last message id>` per channel, so it only fetches new messages. It needs a valid user token at `C:\tools\dce\token.txt`. If `refresh` 401s, the token expired — re-grab it from `discord.com/app` (DevTools → Network → any `/api/` request → copy the `authorization` header).

## Re-create the data on another machine
1. Install DiscordChatExporter CLI to `C:\tools\dce\`.
2. Put a Discord user token in `C:\tools\dce\token.txt`.
3. Export the channels (see this repo's commit history / the skill for IDs), then `node tools/gotchi-kb/kb.mjs build`.
