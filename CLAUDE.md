# gotchi-closet — project instructions

## Triggers
- **"Get Discord"** — when I say this, invoke the `gotchi-kb` skill and run `node tools/gotchi-kb/kb.mjs refresh`. That pulls the latest messages (newer than the last export) from the tracked Aavegotchi channels — general-chat, ghst-talk, gotchigang-chat, gotchiverse, baazaar, dao-discussion, ai, devs-chat — appends them, and rebuilds the local search index. Afterward, report how many new messages were added per channel. If the export returns 401/forbidden, the Discord user token at `C:\tools\dce\token.txt` has expired — tell me to re-grab it (discord.com/app → DevTools → Network → any `/api/` request → copy the `authorization` header).

## Discord KB
- Ask questions against the exported Aavegotchi / Gotchi Battler Discord via the `gotchi-kb` skill (`node tools/gotchi-kb/kb.mjs ask "..."`). Chat data + index live at `C:\tools\dce` (outside the repo by design — others' messages/wallets are never committed). Verified Base contract addresses extracted from it are in the `base-contract-addresses` memory.
