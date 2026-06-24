// server/routes/steward.ts
import { Router } from "express";
import { enroll, listEnrollments, getEnrollment, setStatus, editChores, getLog, ChoreConflictError } from "../steward/db";
import { parseEnrollBody } from "../steward/validate";

export const stewardRouter = Router();

stewardRouter.post("/enroll", (req, res) => {
  const parsed = parseEnrollBody(req.body);
  if (!parsed.ok) return res.status(400).json({ error: parsed.error });
  try { res.json(enroll(parsed.value)); }
  catch (e) {
    if (e instanceof ChoreConflictError) return res.status(409).json({ error: e.message, conflicts: e.conflicts });
    throw e;
  }
});

stewardRouter.get("/status", (req, res) => {
  const owner = String(req.query.owner || "");
  if (!owner) return res.status(400).json({ error: "owner required" });
  res.json({ enrollments: listEnrollments(owner) });
});

stewardRouter.get("/log", (req, res) => {
  const owner = String(req.query.owner || "");
  if (!owner) return res.status(400).json({ error: "owner required" });
  res.json({ log: getLog(owner) });
});

function mutateStatus(req: any, res: any, status: "active" | "paused" | "revoked") {
  const id = Number(req.body?.id);
  if (!getEnrollment(id)) return res.status(404).json({ error: "not found" });
  setStatus(id, status);
  res.json(getEnrollment(id));
}
stewardRouter.post("/pause", (req, res) => mutateStatus(req, res, "paused"));
stewardRouter.post("/resume", (req, res) => mutateStatus(req, res, "active"));
stewardRouter.post("/revoke", (req, res) => mutateStatus(req, res, "revoked"));

stewardRouter.post("/edit-chores", (req, res) => {
  const id = Number(req.body?.id);
  if (!getEnrollment(id)) return res.status(404).json({ error: "not found" });
  const chores = { pet: !!req.body.chores?.pet, channel: !!req.body.chores?.channel, claim: !!req.body.chores?.claim };
  try { res.json(editChores(id, chores)); }
  catch (err) {
    if (err instanceof ChoreConflictError) return res.status(409).json({ error: err.message, conflicts: err.conflicts });
    throw err;
  }
});
