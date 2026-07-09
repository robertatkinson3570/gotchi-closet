# GotchiCloset Growth Engine — Implementation Plan

**Date:** 2026-07-03
**Goal:** Get more attention on GotchiCloset (and Aavegotchi overall) within the
existing gotchigang community, modeled on `C:\Cursor\AutoMarketingSprint` (AMS),
using deep research + the gotchi-kb for authentic content and voice.

**Decisions locked (2026-07-03):**
- Automation level: **Full automation** (consistent with how this project already runs —
  nightly `/pulse` crons, steward automation, auto-renew lending). Only one genuine
  account-ban risk is called out as a config choice, not a blocker (§3).
- Channels in scope: **Twitter/X, DAO forum (Discourse), pSEO pages, Discord + DAO calls**.
- Positioning: **Both, sequenced** — lead with sovereignty/insurance, prove it with a
  specific superior feature each cycle.
- Content engine: **weekly deep-research loop** — every week runs fresh deep research on a
  rotating topic, produces new researched content, generates per-platform posts, queues them.

**Answered open questions (2026-07-03):**
- Code lives **in the AMS repo** (`C:\Cursor\AutoMarketingSprint`) as app #10.
- Web-research half uses the **`deep-research` skill harness** (self-contained, no extra MCP cost).
- Post #1 goes out from the **personal / Grim account** (community already knows it from Discord).

---

## 1. Architecture — extend AMS, add a weekly research loop

GotchiCloset becomes **app #10** in the existing AutoMarketingSprint engine on the VPS,
reusing its queue server (:8088), PocketCTO Telegram approval, `lib/style_rules.py`,
`lib/queue_client.py`, `config/apps.json`, and `pseo/generate.py`.

New core piece: a **weekly cron** (`gotchi_weekly/run.py`) that each cycle:
1. Picks this week's **hero topic** from a rotating queue (a feature, or an Aavegotchi
   macro theme — Base migration, treasury/sustainability, DAO proposals, RF season).
2. Runs a **deep-research pass** (§4.2) to gather fresh, cited, verified facts.
3. Feeds research + hard app facts + style rules into content generation → 3 per-platform
   variants (Twitter thread, Discord message, forum post) + a DAO-call demo script.
4. Pushes drafts to the queue → Telegram approval → posters/paste.

**Alternative rejected:** standalone `GotchiMarketingSprint` repo — duplicates queue/
approval/style infra for no benefit; violates reuse-first, low-cost ethos.

---

## 2. Positioning & authenticity guardrails

**Sequenced frame (every post):** open with sovereignty/insurance ("manage your gotchis
even if the dapp disappears — free, self-funded, <$100/mo"), then prove it with one
concrete superior feature backed by that week's research.

**Cultural landmines the content MUST avoid (from KB research):**
- **No "bring new players" / price-pump framing** — community resents acquisition
  marketing (Ditchy: "we'd be paying for negative advertising"). Target *existing holders*.
- **No price/financial-advice talk about GHST.** Utility and tooling only.
- **No claiming features the app doesn't have** — hard-facts config gates every draft.
- **No fabricated stats/stories/testimonials.** The ONE real testimonial we may quote:
  PG | Gotchi.World (2026-05-05, gotchigang-chat) — "really appreciate the respec
  simulator!" — verbatim, attributed.

---

## 3. Per-channel autonomy

Full-auto where safe; the one account-ban risk is a config toggle you decide, not a blocker.

| Channel | Autonomy | Note |
|---|---|---|
| **Twitter/X — own account** | 🟢 auto after approval | Own feature threads. Free tier allows limited daily writes. |
| **Twitter/X — reply-watcher** | 🟡 (Phase 4, paid) | Read/search needs Basic tier (~$100/mo). Draft→approve→auto or manual. |
| **pSEO pages** | 🟡 commit-review | Generate from real subgraph data; review diff, deploy. |
| **DAO forum (Discourse)** | 🟢/🟡 | Discourse API posting from your account, or draft→you post. Your call. |
| **Discord — official Aavegotchi servers** | ⚠️ config choice | Bot into servers you don't own isn't possible; user-token auto-posting works but is ToS-risky. **Default: draft→Telegram→you paste.** Flip to auto only if you accept the account risk. |
| **DAO call / Aalpha Hour** | 🔴 human | Engine writes the demo script; you present live. |

---

## 4. Modules to build

### 4.1 `config/apps.json` — add `gotchicloset` entry
Hard-facts block: `id`, `name`, `url`, `tagline`, `short_desc`, `long_desc`,
`categories[]`, `audience`, `channels[]`, `keywords[]`, `testimonials[{author,date,quote}]`,
`negative_constraints[]` (the §2 landmines), and the LIVE feature list from the product
inventory. Dates ISO `YYYY-MM-DD`.

### 4.2 `gotchi_weekly/` — the deep-research content loop (core new piece)
- `topics.json` — rotating hero-topic queue (features + macro themes), with cooldowns so
  nothing repeats too soon.
- `research.py` — runs a **deep-research pass** per topic. Two sources, merged:
  1. **gotchi-kb** (`node tools/gotchi-kb/kb.mjs ask "..."`) for community/on-chain facts,
     current sentiment, and quotable team statements.
  2. **Web deep-research** (the `deep-research` skill / harness) for external context,
     Base ecosystem news, and verification. Fan-out search → fetch → adversarial verify →
     cited findings. Output: a structured `research/<week>-<topic>.json` (claims + citations).
- `generate.py` — research JSON + hard facts + style rules → 3 platform variants + demo
  script. Every factual claim must trace to a citation in the research JSON or app facts;
  unsourced claims are dropped (authenticity gate).
- `run.py` — the weekly orchestrator; cron `0 13 * * THU` (pre-Saturday-DAO-call), pushes
  drafts to the queue.

### 4.3 `twitter/`
- `poster.py` — posts approved own-account threads (queue_client).
- `thread_gen.py` — calendar entry + live app data/screenshot → thread.
- `watcher.py` — Phase 4, gated on paid API: gotchi-keyword search → draft replies → queue.

### 4.4 `gotchi_pseo/` — retarget AMS `pseo/generate.py`
Per-wearable / per-set / per-trait pages ("aavegotchi <wearable> BRS" intent) from the real
subgraph + existing `/wearable/:slug` data. Commit-review into gotchi-closet routes.

### 4.5 `discord/draft.py` + `forum/draft.py`
Channel-targeted message + screenshot ref → Telegram card. Forum = Discourse-formatted
long-form.

### 4.6 `lib/gotchi_style_rules.py`
Crypto-community voice (frens/GM/gotchigang lexicon, no corporate tone) + the §2 negative
constraints hard-coded so no draft can violate them.

---

## 5. Phased rollout

- **Phase 0 (foundation):** `apps.json` entry + `gotchi_style_rules.py` + `gotchi_weekly/`
  topics queue, and run the loop ONCE by hand for the first hero topic (the sovereignty
  pitch + `/pulse`) → 3 drafted variants + demo script you can post this week.
- **Phase 1 (weekly loop live):** `run.py` cron + research.py wired to gotchi-kb + deep-research.
- **Phase 2 (Twitter own-account auto):** `twitter/poster.py` + `thread_gen.py`.
- **Phase 3 (pSEO):** first batch of wearable/set pages.
- **Phase 4 (Discord/forum drip + optional paid reply-watcher):** timed to DAO calls.

---

## 6. Measurement
- Vercel/Plausible by referrer (twitter/discord/forum/organic); track which weekly topics
  drive traffic; double down, prune.
- Monthly gotchi-kb `ask` for organic mentions + DAO-call shoutouts.

---

## 7. Open questions for the user
1. **Twitter handle** — dedicated GotchiCloset account or your personal? (tone + API keys)
2. **Twitter API budget** — pay ~$100/mo for the reply-watcher (Phase 4) or own-posts only?
3. **pSEO scope** — all ~400+ wearables or a curated high-search-volume subset first?
4. **Code location** — AMS repo on the VPS (recommended; queue/approval infra lives there)
   or a `marketing/` folder in gotchi-closet?
5. **Deep-research engine** — use the `deep-research` skill harness, or the ECC
   `deep-research` MCP (firecrawl/exa)? (Affects cost + setup.)
