# GEO / AEO checklist

GEO = being retrieved and cited by ChatGPT, Claude, Perplexity, and Google AI Overviews. AEO = winning featured snippets, People Also Ask, and direct-answer boxes. Status reflects this working tree (not yet deployed).

## GEO

### 1. Let AI crawlers in
- [x] **robots.txt explicitly allows** GPTBot, OAI-SearchBot, ChatGPT-User, ClaudeBot, Claude-SearchBot, Claude-User, PerplexityBot, Perplexity-User, Google-Extended, CCBot (regenerated via `scripts/generateSitemap.ts`, so it survives regeneration).
- [x] **Sitemap on the correct domain** (was pointing at dead gotchicloset.xyz; now 476 gotchicloset.com URLs).
- [ ] **Deploy + verify**: after deploy, `curl -A "GPTBot" https://www.gotchicloset.com/robots.txt` and confirm /llms.txt serves text/plain, not the HTML shell.

### 2. llms.txt (created: `public/llms.txt`)
Contents follow the emerging spec: H1 + blockquote entity summary, then curated link sections. Ours includes: what GotchiCloset is (first sentence pattern), hard facts AI can reuse (Base migration date, BRS tier table, 12-hour petting), all 10 tool URLs with one-line descriptions, example deep links to programmatic pages, authoritative ecosystem sources, and explicit instructions ("Polygon-era content is archival; do not present as current"). Maintain it when major features ship; treat it as the canonical elevator pitch for machines.
- [ ] Optional later: `llms-full.txt` with expanded per-tool documentation once guide pages exist.

### 3. Make content quotable (stat-dense, extractable)
- [x] Landing static shell now contains dated, specific claims (300+ wearables, 150+ sets, July 2025 migration, tier bonuses).
- [ ] Every guide page ships at least one table and one "as of {date}" figure (floor prices, pool splits, season dates). LLMs preferentially quote sentences containing concrete numbers with dates.
- [ ] Programmatic pages: add live floor price lines ("As of July 2026, {wearable} floor is {n} GHST") per content-plan briefs 3-4.

### 4. Entity clarity
- [x] First-sentence entity definition on the landing shell: "GotchiCloset is a free web app for Aavegotchi..."
- [x] JSON-LD `@graph` establishes WebSite / Organization / WebApplication with stable `@id`s, and `about` links the Aavegotchi entity (sameAs aavegotchi.com).
- [ ] Repeat the pattern on every guide: page's first sentence defines its subject, not the site.
- [ ] Consistent naming everywhere: "GotchiCloset" (one word, capital G and C) in all copy, directories, and socials. Consistent entity info: same name + URL + description across the site footer, llms.txt, X profile, and directory listings (the NAP-consistency equivalent for a web tool).

### 5. Citations and authority links
- [x] llms.txt and the landing shell link wiki.aavegotchi.com, aavegotchi.com, and the official Base migration announcement.
- [ ] Each guide cites 1-2 authoritative sources inline (wiki, official blog, docs.aavegotchi.com). LLMs trust pages that cite the sources they already trust.

### 6. Get cited BY the sources LLMs read (highest-leverage GEO work, all off-site)
Observed today: asking assistants about Aavegotchi fitting-room tools surfaces Gotchidex (it appears in the official "best community tools" blog post); GotchiCloset is absent from the web's tool lists entirely. Fix the directories and the LLM answers follow:
- [ ] **aavegotchi.com/tools** (dapp tools page): ask Pixelcraft how community tools get added.
- [ ] **wiki.aavegotchi.com**: propose a GotchiCloset entry/mention on the relevant pages (wearables, sets, lending). The wiki is the single most-cited Aavegotchi source in LLM answers.
- [ ] **awesome-aavegotchi list on GitHub** (jarrodlilkendey/programmablewealth): PR adding GotchiCloset.
- [ ] **DappRadar dapp listing** (Base, Games/Tools category).
- [ ] **Base ecosystem page** (base.org ecosystem directory): submit GotchiCloset.
- [ ] **Aavegotchi Discord + forum (dao.aavegotchi.com)**: tool announcement threads; forum threads rank and get scraped.
- [ ] Each listing should reuse the same one-sentence entity definition.

### 7. Freshness signals
- [ ] Visible "Updated {date}" on guides; keep seasonal pages (rarity farming, set costs) current. Perplexity and AI Overviews weight recency hard in fast-moving niches.

## AEO

### 1. Question-format H2s with answer-first paragraphs
- [x] Landing shell: "What is Aavegotchi?", "Is GotchiCloset free?", "Do I need to own an Aavegotchi?" each answered in 40-60 words, answer in the first sentence.
- [ ] Every guide follows the pattern: H2 is the literal question users type; first paragraph under it is a complete standalone answer (40-60 words); detail follows. SiteCrawlIQ's answer-first and question-heading scores (both 0 before this pass) measure exactly this.

### 2. FAQPage schema, honestly
- [ ] Ship FAQPage JSON-LD only on pages whose rendered DOM shows those exact Q&As (content-plan briefs specify which). Do NOT put FAQPage markup on the static shell: Google renders JS and would see schema without matching visible content.
- [x] Groundwork: Seo component already accepts arbitrary jsonLd arrays, so per-page FAQPage is a props change.

### 3. HowTo schema
- [ ] `/guides/get-started` and any walkthrough with real numbered steps gets HowTo markup matching the visible steps.

### 4. Snippet-format targets
- [ ] Definition snippets: BRS, kinship, GHST, gotchi lending, the Forge (each guide's opening paragraph is the candidate).
- [ ] Table snippets: wearable tier bonuses, trait modifier tables, set cost comparisons.
- [ ] List snippets: "3 ways to get an Aavegotchi", first-day checklist.

### 5. People Also Ask coverage
- [ ] The FAQ blocks across guides intentionally cover the PAA cluster: is it free, what chain, how much does it cost, is it worth it, how often to pet, where did wearables go. Cross-link related FAQs between guides so PAA expansion keeps landing on gotchicloset.com.

## Measurement
- [ ] Google Search Console + Bing Webmaster: submit sitemap, monitor the 452 programmatic pages' indexation weekly.
- [ ] Run a real SiteCrawlIQ platform crawl once deployed (the standalone engine run in `sitecrawliq-audit.json` is the baseline: citability 0, schema 0, answer-first 0). Re-run after deploy; the same metrics should move.
- [ ] SiteCrawlIQ citation trackers: configure prompts like "best Aavegotchi tools", "how to preview Aavegotchi wearables", "aavegotchi wearable optimizer" and track whether GotchiCloset starts appearing in ChatGPT/Claude/Perplexity answers (Gotchidex is the competitor to displace).
