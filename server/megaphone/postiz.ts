// server/megaphone/postiz.ts
// Thin client for the self-hosted Postiz Public API (postiz.sitecrawliq.com). Postiz is the
// actual publisher + scheduler (Temporal) for X / YouTube / Telegram, already OAuth-connected.
// Megaphone just hands it finished videos and reads back where they landed. No secrets here,
// only env: POSTIZ_URL + POSTIZ_API_KEY. Everything no-ops cleanly when unconfigured.

export interface PostizIntegration {
  id: string;
  name: string;
  provider: string; // "x" | "youtube" | "telegram" | ...
  picture?: string;
}

export interface PostizMedia {
  id: string;
  path: string;
}

/** One target channel + the caption/media/settings for it. */
export interface PostizPostEntry {
  integration: { id: string };
  value: { content: string; image: PostizMedia[] }[];
  settings: Record<string, unknown>; // must include __type matching the provider
}

export interface CreatePostResult {
  postId: string | null;
  raw: unknown;
}

export function postizConfigured(): boolean {
  return Boolean(process.env.POSTIZ_URL && process.env.POSTIZ_API_KEY);
}

function base(): string {
  const url = process.env.POSTIZ_URL || "https://postiz.sitecrawliq.com";
  return `${url.replace(/\/$/, "")}/public/v1`;
}

function authHeaders(): Record<string, string> {
  // Postiz expects the raw API key in Authorization (no "Bearer" prefix).
  return { Authorization: process.env.POSTIZ_API_KEY || "" };
}

async function ok<T>(res: Response, label: string): Promise<T> {
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`postiz ${label} HTTP ${res.status}: ${body.slice(0, 300)}`);
  }
  return (await res.json()) as T;
}

export async function listIntegrations(): Promise<PostizIntegration[]> {
  const res = await fetch(`${base()}/integrations`, { headers: authHeaders() });
  const data = await ok<unknown>(res, "integrations");
  // API may return an array or { integrations: [...] } depending on version.
  const arr = Array.isArray(data) ? data : ((data as { integrations?: unknown[] }).integrations ?? []);
  return (arr as Record<string, unknown>[]).map((r) => ({
    id: String(r.id),
    name: String(r.name ?? r.id),
    provider: String(r.provider ?? r.identifier ?? r.platform ?? ""),
    picture: typeof r.picture === "string" ? r.picture : undefined,
  }));
}

/** Upload a media file (multipart, field name "file"). Returns the Postiz media ref. */
export async function uploadMedia(bytes: Buffer, filename: string, mime = "video/mp4"): Promise<PostizMedia> {
  const form = new FormData();
  form.append("file", new Blob([bytes], { type: mime }), filename);
  const res = await fetch(`${base()}/upload`, { method: "POST", headers: authHeaders(), body: form });
  const data = await ok<Record<string, unknown>>(res, "upload");
  return { id: String(data.id), path: String(data.path) };
}

/** Provider-specific settings block (the __type + required fields per platform). */
export function settingsFor(provider: string, opts: { title?: string; tags?: string[] }): Record<string, unknown> {
  const p = provider.toLowerCase();
  if (p === "x" || p === "twitter") return { __type: "x", who_can_reply_post: "everyone" };
  if (p === "youtube") {
    return {
      __type: "youtube",
      title: (opts.title ?? "Aavegotchi").slice(0, 95),
      type: "public",
      tags: opts.tags ?? ["Aavegotchi", "GHST", "Shorts"],
      selfDeclaredMadeForKids: false,
    };
  }
  if (p === "telegram") return { __type: "telegram" };
  // Unknown provider: pass the type through and hope Postiz has defaults.
  return { __type: p };
}

/**
 * Create (schedule or post-now) one Postiz post that fans out to one or more channels.
 * `date` must be ISO 8601; use `type: "now"` for immediate.
 */
export async function createPost(input: {
  type: "now" | "schedule";
  date: string;
  posts: PostizPostEntry[];
}): Promise<CreatePostResult> {
  const res = await fetch(`${base()}/posts`, {
    method: "POST",
    headers: { ...authHeaders(), "Content-Type": "application/json" },
    body: JSON.stringify({ type: input.type, date: input.date, shortLink: false, tags: [], posts: input.posts }),
  });
  const data = await ok<unknown>(res, "create-post");
  // Response shape varies; pull the first id we can find so we can poll it later.
  const postId = extractPostId(data);
  return { postId, raw: data };
}

function extractPostId(data: unknown): string | null {
  if (!data) return null;
  if (Array.isArray(data) && data[0]) {
    const first = data[0] as Record<string, unknown>;
    return first.postId ? String(first.postId) : first.id ? String(first.id) : null;
  }
  const d = data as Record<string, unknown>;
  if (d.id) return String(d.id);
  if (d.postId) return String(d.postId);
  if (Array.isArray(d.posts) && d.posts[0]) {
    const p0 = d.posts[0] as Record<string, unknown>;
    return p0.id ? String(p0.id) : null;
  }
  return null;
}

/** Fetch a post (or the recent list) to read status + the live released URL. */
export async function getPosts(): Promise<Record<string, unknown>[]> {
  const res = await fetch(`${base()}/posts`, { headers: authHeaders() });
  const data = await ok<unknown>(res, "get-posts");
  if (Array.isArray(data)) return data as Record<string, unknown>[];
  const d = data as { posts?: unknown[] };
  return (d.posts ?? []) as Record<string, unknown>[];
}
