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
- **GotchiCards:** Displays key information like token ID, haunt, BRS, level, kinship, trait bars, and eye rarity.
- **Modals & Drawers:** Uses full-screen modals for features like Catwalk and detail drawers for Gotchi information, with collapsible sections.

**Technical Implementations:**
- **Wearables Explorer:** Includes functionality for "All", "Owned", and "Baazaar" modes, displaying images, names, rarity, slot, trait modifiers, and BRS. It supports various filters (Slot, Rarity, Sets, Trait modifiers) and sorts (Name, ID, Rarity, Slot, Total Stats, Quantity, Price). "Owned" mode shows all wallet wearables with quantity badges, supporting multi-wallet addresses.
- **Gotchi Explorer:** Offers comprehensive filtering (Token ID, name, rarity, traits, level, wearables, haunt, GHST pocket, equipped set, double mythical eyes, GHST balance) and sorting options (rarity, level, kinship, XP, token ID, traits, price). It includes a "Family Photo" view for owned Gotchis and a "Take a Picture" feature.
- **Catwalk:** Animates Gotchis walking a runway in rarity order, each performing a deterministic "model-style" move. It includes a progress counter and respects `prefers-reduced-motion`.
- **Wardrobe Lab:** A wizard-style optimization tool for Gotchis supporting multi-wallet, with respec simulation to optimize traits towards extremes (0 or 99) and considering wearable/set delta modifiers. Results display BRS before/after values and wearable images.
- **Wearable Selector:** Features a 3-way toggle for "All | Owned | Baazaar". "Baazaar" mode displays GHST prices fetched from the Goldsky Base core subgraph. "Owned" mode shows only owned wearables with inventory counts, which decrement upon equipping.
- **Multi-wallet Support:** Allows adding up to 3 additional wallet addresses, with Gotchis loaded from all active wallets.
- **"Lock & Set" Feature:** Enables reserving wearables for a specific build, excluding them from the available pool.
- **Best Sets Feature:** Displays all wearable sets ranked by projected BRS gain, using reference data from `aadventure.io`.
- **Respec Simulator:** Uses `computeSimTraits()` to calculate `simBase` and `simModified` traits, fetching birth traits via contract calls.

## External Dependencies
- **Goldsky Subgraph:** Used for fetching Aavegotchi data, including user item balances, wearables, and Baazaar listings.
- **Aavegotchi Diamond Contract:** Interacted with via contract calls (e.g., `getGotchiBaseNumericTraits`).
- **WalletConnect:** For connecting user wallets (optional, configured via `VITE_WALLETCONNECT_PROJECT_ID`).
- **Base RPC URL:** For blockchain interactions (`VITE_BASE_RPC_URL`).
- **aadventure.io:** Provides reference data for wearable sets (`data/setsByTraitDirection.json`).
- **wiki.aavegotchi.com:** Used as a fallback source for specific Base chain wearable images.