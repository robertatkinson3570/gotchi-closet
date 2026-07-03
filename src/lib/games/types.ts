// src/lib/games/types.ts
// Shared across client and server so the category list and row shape never drift.

export const CATEGORIES = ["Games", "Tools", "Dashboards", "Other"] as const;
export type Category = (typeof CATEGORIES)[number];

export function isCategory(v: unknown): v is Category {
  return typeof v === "string" && (CATEGORIES as readonly string[]).includes(v);
}

export type GameStatus = "pending" | "approved" | "rejected";

/** A row as stored. Image bytes live in image_data (base64, no data: prefix). */
export interface GameRow {
  id: number;
  title: string;
  description: string;
  url: string;
  category: Category;
  image_mime: string;
  image_data: string;
  submitter_wallet: string;
  status: GameStatus;
  created_at: number;
  reviewed_at: number | null;
  reviewed_by: string | null;
}

/** Public-facing shape (no image bytes; image served via imageUrl). */
export interface GamePublic {
  id: number;
  title: string;
  description: string;
  url: string;
  category: Category;
  imageUrl: string;
  createdAt: number;
}
