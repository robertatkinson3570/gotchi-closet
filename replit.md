# GotchiCloset

## Overview
GotchiCloset is a React/TypeScript web application for Aavegotchi that allows users to dress their Gotchis with wearables. It uses Vite for the frontend build system and Express for a backend API server.

## Project Architecture
- **Frontend**: React 18 with TypeScript, built with Vite
- **Backend**: Express.js API server (runs on port 8787)
- **Styling**: Tailwind CSS
- **State Management**: Zustand + React Query
- **Web3**: Wagmi, Viem, ethers.js for blockchain interactions

## Project Structure
```
src/           - React frontend source code
  app/         - Application routes and layouts
  components/  - Reusable UI components
  lib/         - Utility functions and helpers
  pages/       - Page components
  providers/   - React context providers
  state/       - Zustand stores
  ui/          - UI primitives (buttons, dialogs, etc.)
server/        - Express backend API
  routes/      - API route handlers
  aavegotchi/  - Aavegotchi-specific logic
api/           - Vercel serverless functions
data/          - Static JSON data files
public/        - Static assets
```

## Development
- Run `npm run dev` to start both frontend (port 5000) and backend (port 8787)
- Frontend proxies `/api` requests to the backend server

## Environment Variables
See `.env.example` for required environment variables:
- `VITE_GOTCHI_SUBGRAPH_URL` - Goldsky subgraph endpoint
- `VITE_BASE_RPC_URL` - Base RPC URL
- `VITE_GOTCHI_DIAMOND_ADDRESS` - Aavegotchi diamond contract address
- `VITE_WALLETCONNECT_PROJECT_ID` - WalletConnect project ID (optional)

## Recent Changes
- 2026-01-28: Ghostly haunted theme for Catwalk fashion show
  - Floating ghost orbs (3 large blurred purple orbs with floatingGhost animation)
  - Portal swirl effect at top center (rotating conic gradient)
  - Drifting mist layers at bottom with ethereal feel
  - Sparkles scattered across scene
  - Glowing runway edges with pulsing purple light
  - Smoother exit animations (1000ms with 4-stage progression)
  - Approach animation with blur fade-in effect (2200ms)
  - Purple ghostly shadow under active gotchi
- 2026-01-28: Major Catwalk visual overhaul - real runway fashion show
  - 3D perspective runway with CSS perspective:900px and rotateX transforms
  - Crowd gotchis on left/right sides as fashion show audience (rotateY facing inward)
  - Active gotchi walks from far (scale 0.3, top) to near (scale 1, center) - forced perspective
  - Approach → Pose → Move → Exit phase flow (no more left/right entry)
  - Removed all flash/flicker effects for stable animations
  - Removed card borders - gotchis render with transparent backgrounds
  - Vignette, haze, and subtle spotlight for depth
  - Located in src/components/catwalk/CatwalkModal.tsx, catwalk.css
- 2026-01-28: Polished Catwalk visual quality
  - Asset preloading with progress bar before show starts
  - Located in src/components/catwalk/usePreloadAssets.ts
- 2026-01-28: Added Catwalk feature on Dress page
  - "Catwalk" button opens full-screen modal overlay
  - Animates all Gotchis in selector walking a runway in rarity order
  - Each Gotchi performs one deterministic "model-style" move (7 move types)
  - Dark haunted stage aesthetic with floating particles and spotlight
  - Shows backstage queue, active Gotchi with name/BRS, progress counter
  - End screen with Replay and Back to Dress buttons
  - Respects prefers-reduced-motion (disables animations with note)
  - ESC/backdrop click to close, no state mutations (visual-only)
  - Located in src/components/catwalk/CatwalkModal.tsx, catwalk.css
- 2026-01-27: Added individual Gotchi search on Dress page
  - Type-ahead search bar at top of carousel (min 2 chars)
  - Search by name (partial match) or exact token ID
  - Results displayed as GotchiCards, click to add to carousel
  - Manually added Gotchis shown with purple ring and X button to remove
  - Session-only persistence (not localStorage)
  - Located in src/lib/hooks/useGotchiSearch.ts, src/components/gotchi/GotchiSearch.tsx
- 2026-01-27: Added multi-wallet support (up to 3 additional wallets)
  - HomePage allows adding/removing up to 3 wallet addresses
  - WalletHeader shows all active wallets with responsive layout
  - DressPage loads gotchis from connected wallet + all added wallets
  - Persists in localStorage (gc_multiWallet)
  - Located in src/lib/multiWallet.ts
- 2026-01-27: Added "Lock & Set" feature for reserving wearables
  - Lock button in EditorPanel reserves current build's wearables
  - Locked Gotchis show amber badge in carousel with override wearables
  - Locked wearables excluded from "Owned" mode available pool
  - Persists per wallet/chain in localStorage (gotchicloset.lockedBuilds.v1)
  - Located in src/lib/lockedBuilds.ts, src/state/selectors.ts (computeLockedCounts, availCountsWithLocked)
- 2026-01-27: Added "Baazaar Only" wearable selector with GHST pricing
  - 3-way toggle: All | Owned | Baazaar (replaces previous My Items toggle)
  - Baazaar mode shows only wearables with active listings on Base Baazaar
  - Displays minimum GHST price for each listed wearable
  - Queries Goldsky Base core subgraph for ERC1155 listings
  - Prices cached per session for performance
  - Mode persists via localStorage (gc_wearableMode)
  - Located in src/lib/baazaar.ts, src/hooks/useBaazaar.ts
- 2026-01-27: Added "Show Only My Wearables" feature with inventory counts
  - Toggle "My Items" in wearable selector shows only wearables owned by loaded gotchis
  - Displays ×N count badges showing available quantity
  - Counts decrement as wearables are equipped in editor, increment on unequip
  - Wearables disappear from list when all copies are in use
  - Toggle state persists via localStorage (gc_ownedWearablesOnly)
  - Located in src/state/selectors.ts (computeOwnedCounts, computeUsedCounts, computeAvailCounts)
- 2026-01-27: Updated logo across all pages with consistent sizing
- 2026-01-25: Added "Best Sets" feature to GotchiCard on Dress page
  - Collapsible panel showing ALL wearable sets ranked by projected BRS gain
  - Uses reference data from aadventure.io stored in data/setsByTraitDirection.json
  - Shows set name, delta badge, and trait direction modifiers (+/-NRG, AGG, SPK, BRN)
  - Sets with negative modifiers benefit gotchis with traits under 50
  - Links to wiki and aadventure for more set info
  - Located in src/lib/bestSets.ts and src/components/gotchi/BestSetsPanel.tsx
- 2026-01-25: Enhanced Wardrobe Lab optimizer with proper respec simulation
  - Fixed trait optimization to push traits toward extremes (0 or 99)
  - Battler mode prioritizes highest/lowest traits for class optimization
  - Added wearable images below each Gotchi in results
  - Shows trait changes with before/after values (e.g., "NRG: 45 → 0 (+55 BRS)")
  - Results sorted by highest BRS score
  - Added "Dress" button in header for easy navigation
- 2026-01-25: Added Wardrobe Lab page (/wardrobe-lab) with wizard-style optimization tool
  - Multi-wallet support (connected + manual addresses from localStorage)
  - 4-step wizard: Scope (gotchi selection), Strategy, Constraints, Run
  - Respec simulation with BRS before/after comparison
  - Navigation via flask icon button on Dress page
- 2026-01-25: Fixed respec to fetch BIRTH traits via contract call getGotchiBaseNumericTraits - now correctly shows original traits without spirit points
- 2026-01-25: Added trait bounds checking (0-99) to respec simulator
- 2026-01-25: Enhanced respec simulator with wearable/set delta modifiers
- 2026-01-25: Fixed Base chain wearable images (IDs 407, 418, 419, 420) by adding wiki.aavegotchi.com as fallback source
- 2026-01-25: Initial Replit setup, configured Vite for port 5000 with allowedHosts

## Key Technical Details
- Respec simulator uses `computeSimTraits()` in `src/lib/respec.ts` to calculate both simBase and simModified traits
- Birth traits fetched via contract call to `getGotchiBaseNumericTraits` on Base diamond contract
- Subgraph trait fields: numericTraits = base + spirit points, modifiedNumericTraits = + wearables, withSetsNumericTraits = + sets
- Unit tests for respec logic in `src/lib/respec.test.ts` - run with `npm run test:unit`
