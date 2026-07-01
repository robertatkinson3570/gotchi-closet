# The Aavegotchi Downfall (2022 to 2026)

A focused account of how Aavegotchi declined, from "no revenue" to the studio handing over the
keys. Reconstructed from the Gotchi KB (DAO call transcripts, governance/AGIP threads, the blog,
and announcement channels) with the on-chain treasury trace woven in. Citations are
(channel, date, author). On-chain figures were traced via Blockscout and public RPC on 2026-06-21.

Companion files: the full history is in [`TIMELINE.md`](./TIMELINE.md) and [`timeline.json`](./timeline.json);
the wallet map is in the KB channel `onchain-wallets`.

---

## Phase 0 — The original sin: no revenue (2022 to 2024)
The model always ran on token appreciation plus DAO funding, never real revenue. PC kept promising
revenue would come and it never did:
- *"Pixelcraft is obviously also trying to be a revenue positive company which will funnel back funds to the DAO, 20% of the gross... it's a tricky market out there, trying our best."* (dao-call-transcripts, 2025-02-01)
- Gameplay had already stalled by 2023: *"the leaderboards are quite fixed... not a lot of upwards mobility without investing a lot up front."* (dao-call-transcripts, 2023-05-15)

## Phase 1 — Overextension (2023 to 2024)
The March 2023 DAICO raised 30,000,000 DAI; Pixelcraft took its 25% (~$7.57M, confirmed on-chain
arriving in the PC Safe `0x86cEee5D` on 2023-03-17). It then funded too many parallel bets at once:
the 3D Gotchiverse, Gotchi Guardians, Spirit Force Arena, and an entire L3 blockchain (Geist,
mainnet Oct 2024). In Sept 2024 it asked for $3M more (AGIP 133), which passed 8.74M to 1.65M
(snapshot, 2024-10-13). On-chain burn ran roughly $400k/month against 13 full-time staff.

## Phase 2 — The reckoning (early 2025)
Three strategy reversals landed almost at once:
- *"Following Pixelcraft's decision to sunset Geist and the open vote to migrate Aavegotchi from Polygon to Base, plans for a new GOTCHI token have also been cancelled."* (Make Aavegotchi Based Again, 2025-03-06, coderdan)
- The candid post-mortem: *"we converted 1/3 of it to GHST around $1 hoping it would appreciate (that obviously turned out to be a bad bet)... we made the decision to sunset Geist and reduce staff."* (dao-discussion, 2025-07-02, coderdan)
- The DAO opened a thread literally titled **"The Aavegotchi DAO: A Crisis of Identity"** (2025-05-10).

## Phase 3 — Exit signals (mid 2025)
- A VC surfaced to buy the entire ecosystem: **"Serious Acquisition Offers for the entire Aavegotchi Project"** (2025-06-30), formalized as the AavegotchiDAO Acquisition Proposal, which the DAO **rejected 1.12M to 4.76M** (snapshot, 2025-07-22).
- Aavegotchi migrated to Base and froze its Polygon contracts (blog: "Aavegotchi Has Migrated to Base", 2025-07-25).

## Phase 4 — Conceding the model is dead (late 2025)
- The revenue admission turned blunt: *"buybacks need revenue. If you don't have revenue, you shouldn't be doing buybacks... that's not sustainable and people in the market see that."* (dao-call-transcripts, 2025-10-04)
- With no revenue and a shrinking treasury, the DAO voted a **Partial Treasury Distribution** (PTD, AGIP 155; snapshot 2025-11-05 and 2025-12-08), returning treasury ETH to GHST holders.
- The follow-on governance thread was titled **"Life after Distribution"** (2025-12-31).

## Phase 5 — The studio walks (2026)
- Community mood: **"Bringing Aavegotchi from the ashes to rise like a Phoenix!"** (2026-02-17).
- DAO calls began openly planning for life *"after Pixelcraft shuts down,"* including a **"Great Freeze" to permanently snapshot all Aavegotchi NFTs into immutable Ethereum NFTs** (dao-call-transcripts, 2026-05-31).
- PC made it official: **"Aavegotchi: Beyond the One Studio Model"** (blog, 2026-05-20), opening a June 1 to Sept 1 window to hand the project to the DAO.
- The symbolic end: **"Gotchiverse GV3D is now officially offline"** (smol-aannouncements, 2026-06-15, Jesse | goldenXross), with PC pivoting to open-sourcing GV2D and then GV3D.

## On-chain treasury facts (Ethereum, traced 2026-06-21)
- Pixelcraft Safe `0x86cEee5D` received ~$10.6M of DAO funding: $7,569,810 DAI (2023-03-17) + $3,000,001 USDC (AGIP 133, 2024-10/11).
- Spend out (payroll, ops, fiat off-ramp) was ~$11.2M: $4.11M (2023), $4.92M (2024, peak), $2.13M (2025, winding down). The gap over funding was covered by ~$1.3M of realized BTC/AAVE gains.
- Treasury management: bought 32.2 WBTC (~$1.13M cost), DCA-sold it into strength across 2024-2025 (avg ~$78.7k/BTC, ~$1.87M realized into the Safe). Prudent for the company, but holders held GHST, which fell.
- The main Ethereum DAO treasury (`0xFFE6280a`) is now drained to ~0.00001 ETH after the PTD returned ETH to holders.
- No GHST was sold from the PC treasury Safe. There is no on-chain sign of a GHST dump or a rug; the failure was strategic, not criminal.

## The one-line version
A studio funded ~$10.6M of community treasury with no working revenue model, over-built into a 3D
world and its own blockchain (both later cancelled), burned ~$400k/month, hedged its own runway into
BTC while holders rode GHST down, then when the money and the market both ran out, the DAO
distributed the treasury back to holders and Pixelcraft handed over the keys and walked. Not a heist,
a slow strategy failure with the lights switched off product by product.

## Coda (2026-06-20)
Five days after Pixelcraft took GV3D offline, a community member brought the 2D world back on Base:
*"GV2 is back from the dead and trippy to see again! Finished resurrecting GV2 and migrating the
whole thing over to Base."* (gotchiverse, 2026-06-20, Grim R). The studio spent ~$10.6M over two-plus
years and walked; the revival was vibe-coded over a weekend, for free, "because I wanted to." The
record closes on the phoenix, not the ashes.

---

*Generated 2026-06-21 from the Gotchi KB. Re-query any claim with
`node tools/gotchi-kb/kb.mjs ask "<terms>"`.*
