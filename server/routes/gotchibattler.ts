import { Router } from "express";
import {
  getTournamentStatuses,
  getTournamentDetail,
  getActiveTournamentId,
} from "../lending/gotchibattler";

const router = Router();

router.get("/tournaments", async (_req, res) => {
  try {
    const list = await getTournamentStatuses();
    res.json({ tournaments: list, fetchedAt: Math.floor(Date.now() / 1000) });
  } catch (err: any) {
    res.status(500).json({ error: err?.message ?? String(err) });
  }
});

router.get("/tournaments/active", async (_req, res) => {
  const id = await getActiveTournamentId();
  if (!id) return res.json({ id: null });
  const detail = await getTournamentDetail(id);
  res.json({ id, detail });
});

router.get("/tournaments/:id", async (req, res) => {
  const id = Number(req.params.id);
  if (!id) return res.status(400).json({ error: "invalid id" });
  const detail = await getTournamentDetail(id);
  res.json({ detail });
});

export default router;
