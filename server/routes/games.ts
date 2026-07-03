// server/routes/games.ts
import { Router } from "express";
import { insertPending, listApproved, listPending, review, getImage, pendingCountForWallet, listForWallet, updateForWallet, deleteGame } from "../games/store";
import { verifySubmitSignature, verifyAdminSignature, isAdmin } from "../games/auth";
import { ownsAavegotchi } from "../games/ownership";
import { validateSubmission, validateEdit } from "../../src/lib/games/validate";
import { isCategory } from "../../src/lib/games/types";

const router = Router();
const MAX_PENDING_PER_WALLET = 5;

// Public: approved entries (metadata only). Optional ?category= filter.
router.get("/", (req, res) => {
  const cat = req.query.category;
  const category = typeof cat === "string" && isCategory(cat) ? cat : undefined;
  res.setHeader("Cache-Control", "public, max-age=60");
  res.json({ games: listApproved(category) });
});

// Cosmetic helper — the client uses it to decide whether to render the review tab.
router.get("/is-admin", (req, res) => {
  const wallet = String(req.query.wallet || "");
  res.json({ admin: wallet ? isAdmin(wallet) : false });
});

// Image bytes. Approved rows are public; a pending row's image is served only with a
// valid admin signature (so the review queue can preview it).
router.get("/:id/image", async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).end();
  const row = getImage(id);
  if (!row) return res.status(404).end();
  if (row.status !== "approved") {
    // A non-approved image is visible to an admin (review queue) or to the entry's own
    // submitter (their "My submissions" view) — both must present a valid signature.
    const wallet = String(req.query.wallet || "");
    const signedAt = Number(req.query.signedAt);
    const signature = String(req.query.signature || "");
    const okAdmin = await verifyAdminSignature(wallet, signedAt, signature);
    const okOwner = wallet.toLowerCase() === row.submitter_wallet && (await verifySubmitSignature(wallet, signedAt, signature));
    if (!okAdmin && !okOwner) return res.status(404).end();
  }
  res.setHeader("Content-Type", row.image_mime);
  res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
  res.send(Buffer.from(row.image_data, "base64"));
});

// Submit a new entry → pending. Gated by signature + on-chain ownership.
router.post("/", async (req, res) => {
  const { title, description, url, category, imageBase64, imageMime, wallet, signature, signedAt } = req.body ?? {};

  if (!(await verifySubmitSignature(String(wallet || ""), Number(signedAt), String(signature || "")))) {
    return res.status(403).json({ error: "invalid signature" });
  }

  const v = validateSubmission({ title, description, url, category, imageBase64, imageMime });
  if (!v.ok) return res.status(400).json({ error: v.error });

  if (pendingCountForWallet(wallet) >= MAX_PENDING_PER_WALLET) {
    return res.status(429).json({ error: "you already have 5 submissions awaiting review" });
  }

  let owns: boolean;
  try {
    owns = await ownsAavegotchi(wallet);
  } catch {
    return res.status(503).json({ error: "couldn't verify Aavegotchi ownership, try again" });
  }
  if (!owns) return res.status(403).json({ error: "you must own at least one Aavegotchi to submit" });

  const id = insertPending({ title: title.trim(), description: description.trim(), url, category, image_mime: imageMime, image_data: imageBase64, submitter_wallet: wallet });
  res.json({ ok: true, id });
});

// Admin: list pending queue.
router.get("/pending", async (req, res) => {
  const { wallet, signature, signedAt } = req.query;
  if (!(await verifyAdminSignature(String(wallet || ""), Number(signedAt), String(signature || "")))) {
    return res.status(403).json({ error: "not authorized" });
  }
  res.json({ games: listPending() });
});

// Admin: approve or reject.
router.post("/:id/review", async (req, res) => {
  const id = Number(req.params.id);
  const { action, wallet, signature, signedAt } = req.body ?? {};
  if (!Number.isInteger(id)) return res.status(400).json({ error: "bad id" });
  if (action !== "approve" && action !== "reject") return res.status(400).json({ error: "bad action" });
  if (!(await verifyAdminSignature(String(wallet || ""), Number(signedAt), String(signature || "")))) {
    return res.status(403).json({ error: "not authorized" });
  }
  review(id, action === "approve" ? "approved" : "rejected", wallet);
  res.json({ ok: true });
});

// Owner: list my own submissions (any status). Signature proves wallet ownership so you
// can't enumerate someone else's pending/rejected entries.
router.get("/mine", async (req, res) => {
  const { wallet, signature, signedAt } = req.query;
  const w = String(wallet || "");
  if (!(await verifySubmitSignature(w, Number(signedAt), String(signature || "")))) {
    return res.status(403).json({ error: "invalid signature" });
  }
  res.json({ games: listForWallet(w) });
});

// Owner: edit my own entry and resubmit → back to pending review. Image is optional
// (omit to keep the existing one). Re-checks ownership on-chain, same as a fresh submit.
router.post("/:id/edit", async (req, res) => {
  const id = Number(req.params.id);
  const { title, description, url, category, imageBase64, imageMime, wallet, signature, signedAt } = req.body ?? {};
  if (!Number.isInteger(id)) return res.status(400).json({ error: "bad id" });

  if (!(await verifySubmitSignature(String(wallet || ""), Number(signedAt), String(signature || "")))) {
    return res.status(403).json({ error: "invalid signature" });
  }

  const v = validateEdit({ title, description, url, category, imageBase64, imageMime });
  if (!v.ok) return res.status(400).json({ error: v.error });

  let owns: boolean;
  try {
    owns = await ownsAavegotchi(wallet);
  } catch {
    return res.status(503).json({ error: "couldn't verify Aavegotchi ownership, try again" });
  }
  if (!owns) return res.status(403).json({ error: "you must own at least one Aavegotchi to submit" });

  const image = imageBase64 ? { mime: imageMime, data: imageBase64 } : undefined;
  const ok = updateForWallet(id, wallet, { title: title.trim(), description: description.trim(), url, category }, image);
  if (!ok) return res.status(403).json({ error: "not your submission" });
  res.json({ ok: true });
});

// Admin: hard-delete an entry (removes it from the live grid).
router.post("/:id/delete", async (req, res) => {
  const id = Number(req.params.id);
  const { wallet, signature, signedAt } = req.body ?? {};
  if (!Number.isInteger(id)) return res.status(400).json({ error: "bad id" });
  if (!(await verifyAdminSignature(String(wallet || ""), Number(signedAt), String(signature || "")))) {
    return res.status(403).json({ error: "not authorized" });
  }
  deleteGame(id);
  res.json({ ok: true });
});

export default router;
