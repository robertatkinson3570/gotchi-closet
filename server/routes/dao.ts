import { Router } from "express";
import { getQuorumReport } from "../dao/quorum";

const router = Router();

// DAO-wide votable voting power ("live quorum"). 202 while the first compute
// is still running — the client polls until the report lands.
router.get("/quorum", (_req, res) => {
  const { report, building } = getQuorumReport();
  if (building) {
    res.status(202).json({ building: true });
    return;
  }
  res.setHeader("Cache-Control", "public, max-age=300");
  res.json(report);
});

export default router;
