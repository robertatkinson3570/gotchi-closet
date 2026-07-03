import express from "express";
import cors from "cors";
import gotchiRoutes from "./routes/gotchis";
import wearableRoutes from "./routes/wearables";
import lendingAutoRenewRoutes from "./routes/lendingAutoRenew";
import gotchibattlerRoutes from "./routes/gotchibattler";
import companionRoutes from "./routes/companion";
import globalChatRoutes from "./routes/globalChat";
import roastRoutes from "./routes/roast";
import soulRoutes from "./routes/soul";
import arenaRoutes from "./routes/arena";
import mcpBillingRoutes from "./routes/mcpBilling";
import daoRoutes from "./routes/dao";
import mapRoutes from "./routes/map";
import pulseRoutes from "./routes/pulse";
import gamesRoutes from "./routes/games";
import megaphoneRoutes from "./routes/megaphone";
import { stewardRouter } from "./routes/steward";
import { wispMcpHttpHandler } from "./mcp/http";
import { getDebugStats } from "./aavegotchi/serverSvgService";
import { startAutoRenewCron } from "./lending/cron";
import { startStewardCron } from "./steward/cron";
import { startPulseCron } from "./pulse/cron";

export function createApp() {
  const app = express();
  // Behind nginx on the VPS — trust one proxy hop so req.ip is the real client
  // IP (used by the per-IP rate limiters in the routes), not the proxy address.
  app.set("trust proxy", 1);

  // Production origins. Allowed unconditionally — these are the only places
  // the SPA legitimately runs from.
  const prodOrigins: (string | RegExp)[] = [
    "https://www.gotchicloset.com",
    "https://gotchicloset.com",
    // Vercel preview deployments (gotchi-closet-*.vercel.app)
    /^https:\/\/gotchi-closet[a-z0-9-]*\.vercel\.app$/,
  ];
  // Dev origins. Always included so local dev + Replit work.
  const devOrigins: (string | RegExp)[] = [
    "http://localhost:5173",
    "http://localhost:5174",
    "http://localhost:3000",
    "http://localhost:5000",
    /\.replit\.dev$/,
    /\.repl\.co$/,
  ];
  // Optional env override appends extra allowed origins (e.g. staging hosts).
  const envOrigins = (process.env.VITE_DEV_ALLOWED_ORIGINS || "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  const allowedOrigins: (string | RegExp)[] = [...prodOrigins, ...devOrigins, ...envOrigins];
  app.use(
    cors({
      origin: (origin, callback) => {
        // Same-origin or curl/no-origin requests (e.g. server-to-server) are allowed.
        if (!origin) return callback(null, true);
        const ok = allowedOrigins.some((entry) =>
          entry instanceof RegExp ? entry.test(origin) : entry === origin
        );
        if (ok) return callback(null, true);
        // Log + reject. Do NOT echo the origin back, do NOT throw — keep the
        // server resilient to scanner traffic.
        console.warn(`[cors] rejected origin: ${origin}`);
        return callback(null, false);
      },
      credentials: false,
    })
  );
  app.use(express.json({ limit: "2mb" }));
  app.use((req, _res, next) => {
    console.log(`[api] ${req.method} ${req.path}`);
    next();
  });

  app.get("/api/health", (_req, res) => {
    res.json({ ok: true });
  });
  app.get("/api/debug/cache", (_req, res) => {
    res.json(getDebugStats());
  });

  app.use("/api/gotchis", gotchiRoutes);
  app.use("/api/wearables", wearableRoutes);
  app.use("/api/lending/autorenew", lendingAutoRenewRoutes);
  // Mount the more-specific prefix first (Express convention) so the global routes
  // can never be shadowed by a future catch-all on the companion router.
  app.use("/api/companion/global", globalChatRoutes);
  app.use("/api/companion", companionRoutes);
  app.use("/api/roast", roastRoutes);
  app.use("/api/soul", soulRoutes);
  // Public arena — no auth middleware. Must stay after authed routes to avoid shadowing.
  app.use("/api/arena", arenaRoutes);
  // Wisp MCP billing — external developer accounts + ETH/USDC plan purchases. Additive.
  app.use("/api/mcp", mcpBillingRoutes);
  // Steward — non-custodial estate automation (pet/channel/claim) enroll + manage.
  app.use("/api/steward", stewardRouter);
  // DAO-wide votable VP ("live quorum") — public, cached server-side.
  app.use("/api/dao", daoRoutes);
  // Citaadel map — all REALM parcels, cached hourly server-side.
  app.use("/api/map", mapRoutes);
  // Pulse — state-of-the-Aavegotchiverse daily metrics, cached server-side.
  app.use("/api/pulse", pulseRoutes);
  app.use("/api/games", gamesRoutes);
  // Megaphone — content-ops: published video library, /pulse hero, admin publish/pin.
  app.use("/api/megaphone", megaphoneRoutes);
  // Keyed, rate-limited MCP protocol endpoint for external customers (POST only).
  // Distinct from /api/mcp (billing REST). Plan limits enforced in mcp/http.ts.
  app.post("/mcp", wispMcpHttpHandler);

  // Boot auto-renew cron (no-op if AUTORENEW_HOT_WALLET_KEY not set)
  startAutoRenewCron();
  // Boot steward cron (no-op if STEWARD_BUNDLER_URL not set)
  startStewardCron();
  // Boot pulse backfill/refresh (backfills data/pulse.db on first run)
  startPulseCron();

  return app;
}

