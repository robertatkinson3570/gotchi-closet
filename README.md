# GotchiCloset

A sleek, frontend-only React app for testing Aavegotchi wearables and sets with live trait calculations.

## Features

- 🎨 **Drag & Drop Editor**: Intuitive dressing room interface
- 📊 **Live Trait Calculations**: See trait changes in real-time
- 🎁 **Set Bonuses**: Automatic set completion detection and bonus application
- 📱 **Responsive Design**: Desktop 3-panel layout, mobile tabbed interface
- ⚡ **Performance**: Virtualized lists, local caching, optimized renders
- 🔍 **Advanced Filtering**: Search, slot, rarity, and set filters

## Getting Started

### Prerequisites

- Node.js 18+ and npm

### Installation

1. Clone the repository
2. Install dependencies:

```bash
npm install
```

3. Create a `.env` file in the root directory:

```env
VITE_GOTCHI_SUBGRAPH_URL=https://api.goldsky.com/api/public/project_cmh3flagm0001r4p25foufjtt/subgraphs/aavegotchi-core-base/prod/gn
VITE_GOTCHI_DIAMOND_ADDRESS=0x...
VITE_BASE_RPC_URLS=https://mainnet.base.org,https://base.publicnode.com,https://base.blockpi.network/v1/rpc/public,https://base.llamarpc.com,https://1rpc.io/base
```

4. Start the development server:

```bash
npm run dev
```

5. Open your browser to `http://localhost:5173`

## Usage

1. Enter an Ethereum address on the home page
2. Click "Load Gotchis" to fetch gotchis for that address
3. Select a gotchi from the carousel
4. Click a gotchi to add it to the editor
5. Drag wearables onto slots or tap to equip (mobile)
6. View final traits and set bonuses in the details panel

## Local API proof checklist (SVGs via server)
- `curl http://localhost:8787/api/health` -> `{ ok: true }`
- `curl http://localhost:8787/api/gotchis/10567/svg` -> `200` with `{ svg: "<svg..." }`
- `curl -X POST http://localhost:8787/api/gotchis/svgs -H "content-type: application/json" -d "{\"tokenIds\":[\"10567\",\"9395\"]}"` -> `{ svgs: { "10567": "<svg...", "9395": "<svg..." } }`
- `curl -X POST http://localhost:8787/api/wearables/thumbs -H "content-type: application/json" -d "{\"hauntId\":1,\"collateral\":\"0x0000000000000000000000000000000000000000\",\"numericTraits\":[50,50,50,50,50,50],\"wearableIds\":[1,2,3]}"` -> `{ thumbs: { "1": "<svg...", "2": "<svg..." } }`
- `curl http://localhost:8787/api/debug/cache` -> cache sizes + RPC health
- Open `http://localhost:5173` and verify:
  - `/api/gotchis/10567/svg` returns `200` via proxy
  - Wearable thumbs show SVGs
  - Gotchi SVG renders

## Tech Stack

- **React 18** + **TypeScript**
- **Vite** for build tooling
- **TailwindCSS** for styling
- **shadcn/ui** for UI components
- **urql** for GraphQL queries
- **@dnd-kit** for drag & drop
- **@tanstack/react-virtual** for list virtualization
- **framer-motion** for animations
- **zustand** for state management
- **zod** for validation

## Project Structure

```
src/
  app/          # App setup, router, providers
  components/   # React components
    gotchi/     # Gotchi-related components
    wearables/  # Wearable-related components
    details/    # Details panel components
    layout/     # Layout components
  graphql/     # GraphQL client, queries, fetchers
  lib/          # Utility functions
  state/        # Zustand store and selectors
  styles/       # Global styles
  types/        # TypeScript types
  ui/           # shadcn/ui components
```

## Build

```bash
npm run build
```

The built files will be in the `dist` directory.

## License

MIT

