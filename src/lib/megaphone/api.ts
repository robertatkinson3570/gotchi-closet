// src/lib/megaphone/api.ts
// Client for the Megaphone API. Same cross-origin convention as the Game Center: reads are
// public, writes carry an admin wallet signature. Media URLs from the server are relative
// (/api/megaphone/media/..) so they must be prefixed with the API origin here.
import { env } from "@/lib/env";
import type { Template, TweetPublic, TweetStatus, VideoPublic } from "./types";

const base = () => env.companionApiUrl || "";

/** Server returns relative media paths; prefix with the API origin for the browser. */
export function mediaUrl(relative: string | null): string | null {
  if (!relative) return null;
  return `${base()}${relative}`;
}

export interface Sig {
  wallet: string;
  signature: string;
  signedAt: number;
}

export async function listVideos(template?: Template): Promise<VideoPublic[]> {
  const q = template ? `?template=${encodeURIComponent(template)}` : "";
  const r = await fetch(`${base()}/api/megaphone${q}`);
  if (!r.ok) throw new Error("failed to load videos");
  return (await r.json()).videos;
}

export async function pulseHero(): Promise<VideoPublic | null> {
  const r = await fetch(`${base()}/api/megaphone/pulse-hero`);
  if (!r.ok) return null;
  return (await r.json()).video ?? null;
}

/** Whether social distribution is armed (Postiz env present) and auto-on-publish is enabled. */
export async function getPostizStatus(): Promise<{ configured: boolean; auto: boolean }> {
  const r = await fetch(`${base()}/api/megaphone/postiz/status`);
  if (!r.ok) return { configured: false, auto: false };
  const j = await r.json();
  return { configured: j.configured === true, auto: j.auto === true };
}

export async function checkAdmin(wallet: string): Promise<boolean> {
  const r = await fetch(`${base()}/api/megaphone/is-admin?wallet=${wallet}`);
  if (!r.ok) return false;
  return (await r.json()).admin === true;
}

export async function listAllAdmin(sig: Sig): Promise<VideoPublic[]> {
  const q = `?wallet=${sig.wallet}&signature=${sig.signature}&signedAt=${sig.signedAt}`;
  const r = await fetch(`${base()}/api/megaphone/all${q}`);
  if (!r.ok) throw new Error("failed to load videos");
  return (await r.json()).videos;
}

export interface PublishBody extends Sig {
  title: string;
  caption: string;
  template: Template;
  mp4Base64: string;
  posterBase64?: string;
  durationS?: number;
  gotchiId?: string;
}
export async function publishVideo(body: PublishBody): Promise<VideoPublic> {
  const r = await fetch(`${base()}/api/megaphone/publish`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || "publish failed");
  return (await r.json()).video;
}

export async function pinPulse(id: number, sig: Sig): Promise<void> {
  const r = await fetch(`${base()}/api/megaphone/${id}/pin-pulse`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(sig),
  });
  if (!r.ok) throw new Error("pin failed");
}

export async function setStatus(id: number, status: "published" | "hidden", sig: Sig): Promise<void> {
  const r = await fetch(`${base()}/api/megaphone/${id}/status`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ status, ...sig }),
  });
  if (!r.ok) throw new Error("update failed");
}

export interface PostizChannel {
  id: string;
  name: string;
  provider: string;
}

/** Admin: connected Postiz channels (for the per-video distribute picker). */
export async function listPostizChannels(sig: Sig): Promise<{ configured: boolean; integrations: PostizChannel[] }> {
  const q = `?wallet=${sig.wallet}&signature=${sig.signature}&signedAt=${sig.signedAt}`;
  const r = await fetch(`${base()}/api/megaphone/postiz/integrations${q}`);
  if (!r.ok) return { configured: false, integrations: [] };
  return r.json();
}

/** Admin: distribute a video to chosen channels now. */
export async function distributeNow(
  id: number,
  integrationIds: string[],
  sig: Sig,
): Promise<{ posted: number; skipped: number; failed: number }> {
  const r = await fetch(`${base()}/api/megaphone/${id}/distribute`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ integrationIds, ...sig }),
  });
  if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || "distribute failed");
  return r.json();
}

export async function deleteVideo(id: number, sig: Sig): Promise<void> {
  const r = await fetch(`${base()}/api/megaphone/${id}/delete`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(sig),
  });
  if (!r.ok) throw new Error("delete failed");
}

// --- Promo tweets ---

export async function listTweetsAdmin(sig: Sig, status?: TweetStatus): Promise<TweetPublic[]> {
  const q = `?wallet=${sig.wallet}&signature=${sig.signature}&signedAt=${sig.signedAt}${status ? `&status=${status}` : ""}`;
  const r = await fetch(`${base()}/api/megaphone/tweets${q}`);
  if (!r.ok) throw new Error("failed to load tweets");
  return (await r.json()).tweets;
}

export async function setTweetStatus(id: number, status: TweetStatus, sig: Sig): Promise<void> {
  const r = await fetch(`${base()}/api/megaphone/tweets/${id}/status`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ status, ...sig }),
  });
  if (!r.ok) throw new Error("update failed");
}

export async function editTweet(id: number, text: string, sig: Sig): Promise<void> {
  const r = await fetch(`${base()}/api/megaphone/tweets/${id}/edit`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text, ...sig }),
  });
  if (!r.ok) throw new Error("edit failed");
}

export async function postTweet(id: number, sig: Sig): Promise<void> {
  const r = await fetch(`${base()}/api/megaphone/tweets/${id}/post`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(sig),
  });
  if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || "post failed");
}

export async function scheduleTweet(id: number, sig: Sig): Promise<{ scheduledFor: number }> {
  const r = await fetch(`${base()}/api/megaphone/tweets/${id}/schedule`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(sig),
  });
  if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || "schedule failed");
  return r.json();
}

/** Public: posted + scheduled tweets, no wallet needed. */
export async function listPublicTweets(): Promise<TweetPublic[]> {
  const r = await fetch(`${base()}/api/megaphone/tweets/public`);
  if (!r.ok) return [];
  return (await r.json()).tweets;
}
