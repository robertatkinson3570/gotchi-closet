// src/lib/megaphone/types.ts
// Shared types for the Megaphone content-ops surface. Kept framework-free so both the
// Express server and the React client import the same shapes.

/** The four video templates the engine ships (mirrors video/src/Root.tsx composition ids). */
export const TEMPLATES = ["PulseRecap", "Spotlight", "FitReveal", "SaleAlert", "Other"] as const;
export type Template = (typeof TEMPLATES)[number];

export function isTemplate(v: unknown): v is Template {
  return typeof v === "string" && (TEMPLATES as readonly string[]).includes(v);
}

export type VideoStatus = "published" | "hidden";

export type DistributionStatus = "scheduled" | "posted" | "failed";

/** One channel a video was sent to, with its live link once published. */
export interface DistributionPublic {
  integrationId: string;
  provider: string; // "x" | "youtube" | "telegram" | ...
  status: DistributionStatus;
  externalUrl: string | null;
  scheduledFor: number | null;
  postedAt: number | null;
}

/** Full DB row (server-internal). File bytes live on disk, not in the row. */
export interface VideoRow {
  id: number;
  title: string;
  caption: string;
  template: Template;
  video_file: string; // basename on the media volume, e.g. "12.mp4"
  poster_file: string | null; // basename, e.g. "12.jpg"
  duration_s: number | null;
  gotchi_id: string | null;
  status: VideoStatus;
  pinned_pulse: number; // 0/1 — the one video embedded on /pulse
  published_by: string;
  created_at: number;
}

export type TweetStatus = "draft" | "scheduled" | "posted" | "rejected";
export const TWEET_SOURCES = ["builds", "data", "app", "ecosystem"] as const;
export type TweetSource = (typeof TWEET_SOURCES)[number];

/** A generated promo tweet awaiting review / posted. */
export interface TweetPublic {
  id: number;
  text: string;
  source: string;
  link: string | null;
  status: TweetStatus;
  externalUrl: string | null;
  scheduledFor: number | null;
  createdAt: number;
  postedAt: number | null;
}

/** Public projection sent to the browser. */
export interface VideoPublic {
  id: number;
  title: string;
  caption: string;
  template: Template;
  videoUrl: string;
  posterUrl: string | null;
  durationS: number | null;
  gotchiId: string | null;
  pinnedPulse: boolean;
  createdAt: number;
  distributions: DistributionPublic[];
}
