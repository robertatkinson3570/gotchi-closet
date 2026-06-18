import express from "express";
import cors from "cors";
import gotchiRoutes from "./routes/gotchis";
import wearableRoutes from "./routes/wearables";
import lendingAutoRenewRoutes from "./routes/lendingAutoRenew";
import gotchibattlerRoutes from "./routes/gotchibattler";
import companionRoutes from "./routes/companion";
import globalChatRoutes from "./routes/globalChat";
import roastRoutes from "./routes/roast";
import { getDebugStats } from "./aavegotchi/serverSvgService";
import { startAutoRenewCron } from "./lending/cron";

export function createApp() {
  const app = express();

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

  // Boot auto-renew cron (no-op if AUTORENEW_HOT_WALLET_KEY not set)
  startAutoRenewCron();

  return app;
}

