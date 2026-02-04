# GotchiCloset

## Overview
GotchiCloset is a React/TypeScript web application for Aavegotchi that enables users to dress their Gotchis with wearables. It aims to provide a comprehensive and intuitive platform for Aavegotchi enthusiasts to explore, manage, and optimize their Gotchi and wearable collections. Key capabilities include a multi-asset explorer for Gotchis and Wearables, a powerful Wardrobe Lab for trait optimization, and a unique "Catwalk" feature for showcasing dressed Gotchis.

## User Preferences
The user wants the agent to be efficient and prioritize core functionalities. The agent should focus on implementing features that enhance user interaction with their Gotchis and wearables, such as improved browsing, filtering, and optimization tools. The agent should ensure that new features are integrated seamlessly and existing functionalities are robust. When making changes, the agent should aim for clean and modular code, particularly in the `src/components/explorer/` and `src/lib/explorer/` directories for explorer-related enhancements.

## System Architecture
The application is built with a React 18 frontend using TypeScript and Vite, styled with Tailwind CSS. State management is handled by Zustand and React Query. Web3 interactions leverage Wagmi, Viem, and ethers.js. The backend is an Express.js API server.

**UI/UX Decisions:**
- **Theming:** Features a dark, ghostly, and haunted aesthetic, particularly for the "Catwalk" modal, incorporating elements like floating orbs, portal swirls, mist, and sparkles.
- **Responsive Design:** Utilizes responsive grids and mobile-optimized components (e.g., bottom sheets, sticky headers) for a consistent experience across devices.
- **Asset Exploration:** Provides high-density, responsive grids for both Gotchi and Wearable explorers, featuring infinite scroll with lazy loading. Filters are collapsible, and sorting options are comprehensive.
- **Catwalk:** Implements a 3D perspective runway with animated Gotchis, preloading assets for a smooth user experience.
- **GotchiCards:** Displays key information like token ID, haunt, BRS, level, kinship, trait bars, and eye rarity. **Trait rows now show breakdown sublabels** (e.g., "Wearables: -2 | Sets: +3") when wearables or sets are contributing modifiers, making it clear why final trait values differ from base.
- **Editor Panel:** Sleek, compact design with gradient borders matching the site's purple/violet theme. Features icon-based action buttons in a grid layout, and the "Build Applied" section spans the full width at the bottom for consistent spacing whether a build is applied or not.
- **Modals & Drawers:** Uses full-screen modals for features like Catwalk and detail drawers for Gotchi information, with collapsible sections.

**Technical Implementations:**
- **Wearables Explorer:** Includes functionality for "All", "Owned", and "Baazaar" modes, displaying images, names, rarity, slot, trait modifiers, and BRS. It supports various filters (Slot, Rarity, Sets, Trait modifiers) and sorts (Name, ID, Rarity, Slot, Total Stats, Quantity, Price). "Owned" mode shows all wallet wearables with quantity badges, supporting multi-wallet addresses.
- **Gotchi Explorer:** Offers comprehensive filtering (Token ID, name, rarity, traits, level, wearables, haunt, GHST pocket, equipped set, double mythical eyes, GHST balance) and sorting options (rarity, level, kinship, XP, token ID, traits, price). It includes a "Family Photo" view for owned Gotchis and a "Take a Picture" feature. **Server-side filtering** is implemented for the "All" tab - filters like token ID, name, rarity range, level, haunt, GHST pocket, and equipped set are passed to the GraphQL query, returning matching gotchis from the entire database rather than filtering locally loaded data. Filters that can't be done server-side (trait ranges, double myth eyes, wearable counts) are applied client-side after the server response.
- **Spirit Force Colors:** Explorer gotchis now render with correct on-chain spirit force colors matching their collateral type. The `GotchiSvg` component uses preview mode with proper type coercion for `gotchiId` (String) and `tokenId` (String in transformGotchi) to ensure all gotchis use the preview endpoint with collateral data rather than falling back to the direct SVG endpoint.
- **Wearable Modifier Patches:** The wearable fetcher in `src/graphql/fetchers.ts` includes a patch system (`WEARABLE_MODIFIER_PATCHES`) to correct known-incorrect trait modifiers from the subgraph. This ensures wearables like Rofl pets apply correct NRG/BRN-only modifiers (e.g., Uncommon Rofl = NRG -1, BRN -1). **Important:** When any equipped wearable has a patch, `computeBRSBreakdown()` in `rarity.ts` bypasses the subgraph's pre-computed `modifiedNumericTraits`/`withSetsNumericTraits` and uses locally computed traits instead, since the subgraph values were computed with incorrect wearable data.
- **Wearable Set Data Fixes:** The `data/wearableSets.json` file includes corrections for all 149 wearable sets, verified against the official wiki at https://wiki.aavegotchi.com/en/sets. The original data had systematic errors where BRS values were incorrectly placed in the NRG slot and trait modifiers were scrambled. All sets now have correct trait bonuses [NRG, AGG, SPK, BRN] and BRS values.
- **Catwalk:** Animates Gotchis walking a runway in rarity order, each performing a deterministic "model-style" move. It includes a progress counter and respects `prefers-reduced-motion`.
- **Wardrobe Lab:** A wizard-style optimization tool for Gotchis supporting multi-wallet, with respec simulation to optimize traits towards extremes (0 or 99) and considering wearable/set delta modifiers. Results display BRS before/after values and wearable images.
- **Mommy Dress Me Engine (`src/lib/autoDressEngine.ts`):** Auto-dresser with the following rules:
  - **Always starts naked:** Ignores currently equipped wearables when calculating optimizations. Never early-exits claiming "already optimized."
  - **Trait Direction Rules:** Traits below 50 improve by moving DOWN (toward 0), traits above 50 improve by moving UP (toward 99). Wearables with harmful modifiers (wrong direction) are filtered out during pruning.
  - **Extremity Scoring:** Uses distance from 50 as the optimization metric. A trait at 5 has extremity 45, trait at 95 has extremity 45 - both equally valuable.
  - **Modes:** Max BRS (maximize total BRS), One Dominant (maximize single trait extremity), Dual (maximize top 2 trait extremities equally), Balanced (minimize variance while maximizing average extremity).
  - **Naked Baseline Comparison:** Threshold checks compare final build against naked gotchi, not dressed state. This prevents false "no improvement" results.
- **Wearable Selector:** Features a 3-way toggle for "All | Owned | Baazaar". "Baazaar" mode displays GHST prices fetched from the Goldsky Base core subgraph. "Owned" mode shows only owned wearables with inventory counts, which decrement upon equipping.
- **Multi-wallet Support:** Allows adding up to 3 additional wallet addresses, with Gotchis loaded from all active wallets.
- **"Lock & Set" Feature:** Enables reserving wearables for a specific build, excluding them from the available pool.
- **Best Sets Feature:** Displays all wearable sets ranked by projected BRS gain, using reference data from `aadventure.io`. Clicking a set filters wearables to that set. **Data cleaned** to remove duplicate entries (e.g., both "Mythical Wizard" and "Wizard (Mythical)") and phantom sets that don't exist in wearableSets.json. All 149 Best Sets entries now map 1:1 to actual sets. **Name matching** handles inconsistent naming between data sources: tries exact match first, then transforms "SetName (Rarity)" → "Rarity SetName" pattern, then falls back to stripped base name.
- **Respec Simulator:** Uses `computeSimTraits()` to calculate `simBase` and `simModified` traits, fetching birth traits via contract calls.

## External Dependencies
- **Goldsky Subgraph:** Used for fetching Aavegotchi data, including user item balances, wearables, and Baazaar listings.
- **Aavegotchi Diamond Contract:** Interacted with via contract calls (e.g., `getGotchiBaseNumericTraits`).
- **WalletConnect:** For connecting user wallets (optional, configured via `VITE_WALLETCONNECT_PROJECT_ID`).
- **Base RPC URL:** For blockchain interactions (`VITE_BASE_RPC_URL`).
- **aadventure.io:** Provides reference data for wearable sets (`data/setsByTraitDirection.json`).
- **wiki.aavegotchi.com:** Used as a fallback source for specific Base chain wearable images.