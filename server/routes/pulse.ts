import { Router } from "express";
import { getPulse } from "../pulse/service";

const router = Router();

// State-of-the-Aavegotchiverse payload. 202 while the initial backfill runs —
// the client polls until history lands (same contract as /api/dao/quorum).
router.get("/", (_req, res) => {
  const { payload, building } = getPulse();
  if (building || !payload) {
    res.status(202).json({ building: true });
    return;
  }
  res.setHeader("Cache-Control", "public, max-age=300");
  res.json(payload);
});

export default router;
