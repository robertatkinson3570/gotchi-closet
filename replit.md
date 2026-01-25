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
- 2026-01-25: Initial Replit setup, configured Vite for port 5000 with allowedHosts
