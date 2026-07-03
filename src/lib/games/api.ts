// src/lib/games/api.ts
import { env } from "@/lib/env";
import type { Category, GamePublic } from "./types";

const base = () => env.companionApiUrl || "";

export interface PendingGame {
  id: number; title: string; description: string; url: string;
  category: Category; image_mime: string; submitter_wallet: string; created_at: number;
}
export interface Sig { wallet: string; signature: string; signedAt: number }

export async function listGames(category?: Category): Promise<GamePublic[]> {
  const q = category ? `?category=${encodeURIComponent(category)}` : "";
  const r = await fetch(`${base()}/api/games${q}`);
  if (!r.ok) throw new Error("failed to load games");
  return (await r.json()).games;
}

export async function checkAdmin(wallet: string): Promise<boolean> {
  const r = await fetch(`${base()}/api/games/is-admin?wallet=${wallet}`);
  if (!r.ok) return false;
  return (await r.json()).admin === true;
}

export interface SubmitBody extends Sig {
  title: string; description: string; url: string; category: Category;
  imageBase64: string; imageMime: string;
}
export async function submitGame(body: SubmitBody): Promise<void> {
  const r = await fetch(`${base()}/api/games`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || "submit failed");
}

export async function listPending(sig: Sig): Promise<PendingGame[]> {
  const q = `?wallet=${sig.wallet}&signature=${sig.signature}&signedAt=${sig.signedAt}`;
  const r = await fetch(`${base()}/api/games/pending${q}`);
  if (!r.ok) throw new Error("failed to load pending");
  return (await r.json()).games;
}

/** Image URL carrying a signature — used by admins (review queue) and owners (their own
 *  pending/rejected entries). The server accepts either an admin or owner signature. */
export function signedImageUrl(id: number, sig: Sig): string {
  return `${base()}/api/games/${id}/image?wallet=${sig.wallet}&signature=${sig.signature}&signedAt=${sig.signedAt}`;
}
/** @deprecated alias kept for the admin review tab. */
export const pendingImageUrl = signedImageUrl;
export function approvedImageUrl(id: number): string {
  return `${base()}/api/games/${id}/image`;
}

export async function reviewGame(id: number, action: "approve" | "reject", sig: Sig): Promise<void> {
  const r = await fetch(`${base()}/api/games/${id}/review`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action, ...sig }),
  });
  if (!r.ok) throw new Error("review failed");
}

export interface MyGame {
  id: number; title: string; description: string; url: string;
  category: Category; image_mime: string; status: "pending" | "approved" | "rejected";
  created_at: number; reviewed_at: number | null;
}

/** My own submissions, any status. Signature proves I own the wallet. */
export async function listMine(sig: Sig): Promise<MyGame[]> {
  const q = `?wallet=${sig.wallet}&signature=${sig.signature}&signedAt=${sig.signedAt}`;
  const r = await fetch(`${base()}/api/games/mine${q}`);
  if (!r.ok) throw new Error("failed to load your submissions");
  return (await r.json()).games;
}

export interface EditBody extends Sig {
  title: string; description: string; url: string; category: Category;
  imageBase64?: string; imageMime?: string;
}
/** Edit my own entry and resubmit (server resets it to pending). Omit image to keep it. */
export async function editGame(id: number, body: EditBody): Promise<void> {
  const r = await fetch(`${base()}/api/games/${id}/edit`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || "edit failed");
}

/** Admin: hard-delete an entry. */
export async function deleteGame(id: number, sig: Sig): Promise<void> {
  const r = await fetch(`${base()}/api/games/${id}/delete`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(sig),
  });
  if (!r.ok) throw new Error("delete failed");
}
