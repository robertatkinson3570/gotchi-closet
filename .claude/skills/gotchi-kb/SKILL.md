---
name: gotchi-kb
description: Use when the user asks a question about the Aavegotchi or Gotchi Battler Discord — community knowledge, contract addresses, Base migration, DAO governance/proposals, dapp behavior, tokenomics, or Gotchi Battler mechanics — OR wants to refresh/append the latest Discord messages. Backed by a local keyword-search index over exported chats.
---

# Gotchi Discord KB

A local search index over exported Discord chats:
- **Aavegotchi** core channels (last ~year): general-chat, ghst-talk, gotchigang-chat, gotchiverse, baazaar, dao-discussion, ai, devs-chat
- **Gotchi Battler** server (battler-chat, announcements, etc.)
- **AavegotchiDAO forum** proposal threads

Tool: `tools/gotchi-kb/kb.mjs` (Node, no deps). Data + index live at `C:\tools\dce` (outside the repo; ~90MB of others' chat + wallets, intentionally never committed).

## Answer a question (default)

1. Pull **2–6 specific keywords** from the user's question — favor rare/precise terms (contract names, `0x…` addresses, proposal names, feature names) over common words. Quote multi-word phrases.
2. Run:
   ```
   node tools/gotchi-kb/kb.mjs ask "<keywords>" [--channel <name>] [--after YYYY-MM-DD] [--limit 50]
   ```
   - `--channel devs-chat` to scope to a channel (substring match)
   - `--after 2026-01-01` to scope by date
3. Read the returned messages (each shows `[date] (guild/channel) author: text`). Synthesize an answer and **cite channel + date + author**. Quote `0x…` addresses verbatim.
4. If results are thin or off-target, **re-search** with synonyms/alternate terms before concluding. Discord is informal — try abbreviations (RF, BRS, VP, PTD, AGIP), misspellings, and the dapp's wording.
5. Treat it as community chatter, not gospel: prefer statements from team/devs (e.g. coderdan, VR Dev, Immaterial) and corroborate on-chain claims (addresses, selectors) before asserting them as fact.

## Refresh — get the latest (weekly)

Pulls only messages newer than the last export for the 8 core Aavegotchi channels, appends, and rebuilds the index:
```
node tools/gotchi-kb/kb.mjs refresh
```
- Requires a valid Discord user token at `C:\tools\dce\token.txt`.
- If it returns **401/forbidden**, the token expired — re-grab it: open `discord.com/app` in a browser logged in, DevTools → Network → any `/api/` request → copy the `authorization` header into `token.txt`. (User tokens are ToS-gray; this is the user's own account, read-only.)
- To widen what `refresh` covers, edit `REFRESH_CHANNELS` in `kb.mjs`.

## Rebuild index only (after adding exports manually)
```
node tools/gotchi-kb/kb.mjs build
```

## Notes
- The DAO **forum** threads are a one-time backfill (not in `refresh`); re-pull them periodically by re-listing threads with DiscordChatExporter if needed.
- Verified Base addresses extracted from this KB live in the `base-contract-addresses` memory.
