# Dapp Parity — Overview & Verified Reference

**Date:** 2026-06-18
**Status:** Reference (source of truth for the parity specs below)
**Project:** gotchi-closet

This is the shared, on-chain-verified reference for the dapp-parity feature specs.
Every value below was pulled from the live dapp's Base (8453) config chunk and/or
confirmed against the Goldsky subgraphs on 2026-06-18. Feature specs reference this
file instead of repeating addresses.

---

## 0. Cross-cutting requirements (apply to EVERY feature)

1. **Verify-then-build.** Confirm each contract call by eth_call simulation from a
   real holder before wiring UI. "Diamond: Function does not exist" = wrong sig; a
   business revert = correct ABI. Don't infer absence — cross-check a second source.
2. **Place in existing surfaces.** Do **not** add new top-level pages when a feature
   fits an existing one. Default home = the **Explorer** (the single hub) and the
   existing owned-asset modals. New routes only when a feature has no intuitive home
   and a route is what users expect (e.g. `/stats`, `/get-tokens`). Each spec states
   its placement explicitly.
3. **Confirm against the dapp as part of testing.** Every feature's acceptance step
   includes a side-by-side Playwright check vs `dapp.aavegotchi.com` (same data, same
   numbers, same categories) plus 0 console errors on our deploy.
4. **Proper images for every asset** (see §4). No broken/placeholder art in shipped
   views; always have a fallback.
5. **Sexy-beast, cutting-edge styling.** Every new surface is a flagship visual
   moment — premium, polished, intuitive. Match the app's existing award-winning manage/
   equip styling: gradient hero headers, glassy cards, ring/hover motion, tasteful
   micro-interactions, full dark-mode + mobile responsiveness. No plain/boilerplate UI
   ships. Reuse the established component vocabulary (gradient buttons, `ring-primary`
   accents, rounded-2xl modals) so it feels of-a-piece.
6. **Deploy discipline:** `pnpm build` → commit (Co-Authored-By trailer) → push
   `main` → `vercel --prod` → live-verify with Playwright.

---

## 1. Base (8453) contract addresses (from dapp config)

| Key | Address |
|---|---|
| ghst | `0xcD2F22236DD9Dfe2356D7C543161D4d260FD9BcB` |
| usdc | `0x833589fcd6edb6e08f4c7c32d4f71b54bda02913` |
| fud (alchemica) | `0x2028b4043e6722Ea164946c82fe806c4a43a0fF4` |
| fomo | `0xA32137bfb57d2b6A9Fd2956Ba4B54741a6D54b58` |
| alpha | `0x15e7CaC885e3730ce6389447BC0f7AC032f31947` |
| kek | `0xE52b9170fF4ece4C35E796Ffd74B57Dec68Ca0e5` |
| gltr | `0x4D140CE792bEdc430498c2d219AfBC33e2992c9D` |
| gltrStaking | `0xaB449DcA14413a6ae0bcea9Ea210B57aCe280d2c` |
| aavegotchiDiamond | `0xA99c4B08201F2913Db8D28e71d020c4298F29dBF` |
| wearableDiamond | `0x052e6c114a166B0e91C2340370d72D4C33752B4b` |
| forgeDiamond | `0x50aF2d63b839aA32b4166FD1Cb247129b715186C` |
| realmDiamond | `0x4B0040c3646D3c44B8a28Ad7055cfCF536c05372` |
| installationsDiamond | `0xebba5b725A2889f7f089a6cAE0246A32cad4E26b` |
| tilesDiamond | `0x617fdB8093b309e4699107F48812b407A7c37938` |
| fakeGotchisNFT (ERC721) | `0xAb59CA4A16925b0a4BaC5026C94bEB20A29Df479` |
| fakeCardsDiamond (ERC1155) | `0xe46B8902dAD841476d9Fee081F1d62aE317206A9` |
| gbmDiamond (auctions) | `0x80320A0000C7A6a34086E2ACAD6915Ff57FfDA31` |
| guardianSkinsDiamond (ERC1155) | `0x898d0F54d8CF60698972a75be7Ea1B45aAb66e59` |
| guardianProfileDiamond (ERC721) | `0xdc27a8BF85508387cB8c3B97BA77f3941eDFF45f` |
| gotchiDomainDiamond | `0xF6c1b83977DE3dEffC476f5048A0a84d3375d498` |
| LP tokens (staking) | ghstUsdcLP `0x56C11053159a24c0731b4b12356BC1f0578FB474`, ghstWethLP `0x0DFb9Cb66A18468850d6216fCc691aa20ad1e091`, ghstFudLP `0xeae2fB93e291C2eB69195851813DE24f97f1ce71`, ghstFomoLP `0x62ab7d558A011237F8a57ac0F97601A764e85b88`, ghstAlphaLP `0x0Ba2A49aedf9A409DBB0272db7CDF98aEb1E1837`, ghstKekLP `0x699B4eb36b95cDF62c74f6322AaA140E7958Dc9f`, ghstGltrLP `0xa83b31D701633b8EdCfba55B93dDBC202D8A4621` |

> Most are already in `src/lib/lending/contracts.ts`. New ones to add: fud/fomo/alpha/kek,
> usdc, wearableDiamond, fakeGotchisNFT, fakeCardsDiamond, guardianSkinsDiamond,
> guardianProfileDiamond, gotchiDomainDiamond, gltrStaking, LP tokens.

---

## 2. Subgraphs (Goldsky project `project_cmh3flagm0001r4p25foufjtt`)

Base prod endpoints (`…/subgraphs/<name>/prod/gn`):

| Name | Use | In app? |
|---|---|---|
| aavegotchi-core-base | gotchis, listings, buy orders, FAKE metadata | yes |
| aavegotchi-gbm-baazaar-base | GBM auctions/bids | yes |
| aavegotchi-svg-base | gotchi SVGs by id | yes |
| gotchiverse-base | parcels, installations, tiles | yes |
| aavegotchi-portal-svgs-base | portal SVGs | add |
| aavegotchi-alchemica-base | alchemica supply/data | add |
| aavegotchi-xp-base | XP drops / claims | add |
| socket-bridge-base | cross-chain bridge status (Socket) | add |

---

## 3. Baazaar listing categories (confirmed from live listings)

`addERC721Listing(addr, tokenId, _category, price)` /
`setERC1155Listing(addr, typeId, qty, _category, price)` and the buy-order ABIs all
take these numeric `_category` values:

| Category | # | Kind | Contract |
|---|---|---|---|
| Closed portal | 0 | ERC721 | aavegotchiDiamond |
| Open portal | 2 | ERC721 | aavegotchiDiamond |
| Aavegotchi | 3 | ERC721 | aavegotchiDiamond |
| Parcel | 4 | ERC721 | realmDiamond |
| FAKE Gotchi | 5 | ERC721 | fakeGotchisNFT |
| Wearable | 0 | ERC1155 | aavegotchiDiamond |
| Consumable | 2 | ERC1155 | aavegotchiDiamond |
| Installation | 4 | ERC1155 | installationsDiamond |
| Tile | 5 | ERC1155 | tilesDiamond |
| FAKE Card | 6 | ERC1155 | fakeCardsDiamond |
| Forge items | 7, 8, 9, 11 | ERC1155 | forgeDiamond |
| Guardian Skin | 12 | ERC1155 | guardianSkinsDiamond |
| Guardian Profile | (none on-chain yet) | ERC721 | guardianProfileDiamond |

> ERC721 gotchi (cat 3) buy orders require `bool[3]` validation options; other ERC721
> categories take `[]` (verified this session). Re-verify per new collection.
> **Buy-with-any-token:** core `ERC721Listing` has `purchasedWithSwap`, `swapTokenIn`,
> `swapAmountIn`, `swapGhstReceived` — the dapp can pay a GHST listing with USDC/etc by
> swapping in-tx. See get-tokens spec.

---

## 4. Image sources (verified)

| Asset | Source |
|---|---|
| Gotchi | our `/api/gotchis/preview` (traits) or `/api/gotchis/:id/svg`; svg subgraph; `GotchiSvgById` |
| Portal | aavegotchi-portal-svgs-base subgraph; diamond `getAavegotchiSvg`; `portalAavegotchiTraits` for the 10 options |
| Wearable / item / consumable | `app.aavegotchi.com/images/items/{id}.svg` (current `AssetImage`) |
| Installation / tile | existing `installationImageCandidates` / `tileImageCandidates` |
| Parcel | existing `parcelImageCandidates` |
| FAKE Gotchi / Card | core subgraph `fakeGotchiNFTTokens.metadata { thumbnailHash, fileHash }` -> `https://arweave.net/{hash}` or proxy `dapp.aavegotchi.com/api/image/proxy?hash=…` (existing `FakeGotchiImage`) |
| Forge items | shared CDN `https://d1ct2dwqrn0rul.cloudfront.net/shared-assets/images/{id}.png` (verify id scheme) |
| Guardian skins/profile | arweave metadata (verify exact field) |

Every image component must keep a fallback (placeholder SVG / icon), never a broken `<img>`.

---

## 5. Management ABIs (verified signatures, aavegotchiDiamond unless noted)

```
// Portals — ALREADY BUILT in PortalsPanel.tsx (open + 10-option picker + claim).
// NOTE: on Base the claim is 2-arg; the 3-arg variant "does not exist" (verified).
openPortals(uint256[] _tokenIds)
portalAavegotchiTraits(uint256 _tokenId)            // -> 10 ghost options (traits/collateral)
portalAavegotchisSvg(uint256 _tokenId)              // -> string[10] option SVGs
claimAavegotchi(uint256 _tokenId, uint256 _option)  // Base: 2-arg (NOT 3-arg)

// Gotchi
interact(uint256[] _tokenIds)                       // pet (have)
spendSkillPoints(uint256 _tokenId, int16[4] _values)// (have)
setAavegotchiName(uint256 _tokenId, string _name)
setPetOperatorForAll(address _operator, bool _approved)
useConsumables(uint256 _tokenId, uint256[] _itemIds, uint256[] _quantities)

// Alchemica (gotchiverse / realm)
claimAvailableAlchemica(uint256 _realmId, uint256 _gotchiId, bytes _signature)  // needs backend signature

// Buy orders (have): placeERC721BuyOrder / placeERC1155BuyOrder
// Listings (have): addERC721Listing / setERC1155Listing
// Alchemica balances: ERC20 balanceOf on fud/fomo/alpha/kek
```

---

## 6. Feature specs in this set

1. `baazaar-collections-design.md` — FAKE Gotchis/Cards, Guardians/Skins, Forge tab, buy-with-any-token
2. `unified-inventory-and-consumables-design.md` — full inventory + useConsumables
3. `gotchi-management-extras-design.md` — open portal & summon, pet operator, naming, channel/claim alchemica
4. `marketplace-stats-design.md` — `/stats` volume dashboard
5. `get-tokens-design.md` — swap (CowSwap) / bridge (Socket) / on-ramp
6. `staking-and-governance-design.md` — DAO + ancillary pages (GHST/LP staking excluded as dead)

(Rarity Farming leaderboard and GHST/LP staking intentionally excluded per request.)
