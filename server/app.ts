import express from "express";
import cors from "cors";
import gotchiRoutes from "./routes/gotchis";
import wearableRoutes from "./routes/wearables";
import { getDebugStats } from "./aavegotchi/serverSvgService";

export function createApp() {
  const app = express();

  app.use(
    cors({
      origin: "http://localhost:5173",
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

  return app;
}

