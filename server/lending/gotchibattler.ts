/**
 * Server-side scraper for gotchibattler.com tournament + lending data.
 * Their site is a SPA so a real headless render is the most reliable path,
 * but we try the lightweight HTML/JSON fetch first.
 *
 * Cache results in memory with a 10-minute TTL.
 */

const ROOT = "https://gotchibattler.com";
const STATUS_URL = `${ROOT}/tournaments/status/_ALL_`;
const TOURNAMENT_URL = (id: number, tab: string = "lending") =>
  `${ROOT}/tournaments/id/${id}/tab/${tab}`;

const CACHE_TTL_MS = 10 * 60_000;

let statusCache: { ts: number; data: TournamentStatus[] } | null = null;
let tournamentCache: Map<number, { ts: number; data: TournamentDetail }> = new Map();

export type TournamentStatus = {
  id: number;
  name: string | null;
  status: string | null;
  startsAt: number | null;
  endsAt: number | null;
};

export type TournamentDetail = {
  id: number;
  name: string | null;
  status: string | null;
  lendingCount: number | null;
  url: string;
};

async function fetchHtml(url: string): Promise<string> {
  const res = await fetch(url, {
    headers: {
      "user-agent": "Mozilla/5.0 (compatible; GotchiClosetScraper/1.0; +https://www.gotchicloset.com)",
      accept: "text/html,application/xhtml+xml,application/xml;q=0.9",
    },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.text();
}

// Try to extract __NEXT_DATA__ JSON if Next.js, or fall back to nothing.
function extractNextData<T>(html: string): T | null {
  const m = html.match(/<script\s+id="__NEXT_DATA__"\s+type="application\/json">([\s\S]*?)<\/script>/);
  if (!m) return null;
  try {
    return JSON.parse(m[1]) as T;
  } catch {
    return null;
  }
}

export async function getTournamentStatuses(force = false): Promise<TournamentStatus[]> {
  if (!force && statusCache && Date.now() - statusCache.ts < CACHE_TTL_MS) {
    return statusCache.data;
  }
  try {
    const html = await fetchHtml(STATUS_URL);
    const next = extractNextData<any>(html);
    let list: TournamentStatus[] = [];
    if (next) {
      // Best-effort path through Next.js page props. Adjust once we observe their shape.
      const candidates = (next?.props?.pageProps?.tournaments ?? next?.props?.pageProps?.data ?? []) as any[];
      list = (Array.isArray(candidates) ? candidates : []).map((t: any) => ({
        id: Number(t.id ?? t.tournamentId ?? 0),
        name: t.name ?? t.title ?? null,
        status: t.status ?? null,
        startsAt: t.startsAt ?? t.startDate ?? null,
        endsAt: t.endsAt ?? t.endDate ?? null,
      }));
    }
    statusCache = { ts: Date.now(), data: list };
    return list;
  } catch (err) {
    console.warn("[gotchibattler] status scrape failed:", err);
    if (statusCache) return statusCache.data;
    return [];
  }
}

export async function getTournamentDetail(id: number, force = false): Promise<TournamentDetail | null> {
  if (!force) {
    const cached = tournamentCache.get(id);
    if (cached && Date.now() - cached.ts < CACHE_TTL_MS) return cached.data;
  }
  try {
    const html = await fetchHtml(TOURNAMENT_URL(id));
    const next = extractNextData<any>(html);
    const t = next?.props?.pageProps?.tournament ?? null;
    const detail: TournamentDetail = {
      id,
      name: t?.name ?? t?.title ?? null,
      status: t?.status ?? null,
      lendingCount: t?.lendings?.length ?? t?.lendingCount ?? null,
      url: TOURNAMENT_URL(id),
    };
    tournamentCache.set(id, { ts: Date.now(), data: detail });
    return detail;
  } catch (err) {
    console.warn(`[gotchibattler] detail scrape failed for ${id}:`, err);
    return tournamentCache.get(id)?.data ?? null;
  }
}

// Find the most recent active or upcoming tournament — best effort heuristic.
export async function getActiveTournamentId(): Promise<number | null> {
  const statuses = await getTournamentStatuses();
  if (!statuses.length) return null;
  const now = Date.now() / 1000;
  // Prefer ones ongoing (now between startsAt and endsAt) else the next upcoming else the highest id
  const active = statuses.find(
    (t) => t.startsAt && t.endsAt && now >= t.startsAt && now <= t.endsAt
  );
  if (active) return active.id;
  const upcoming = statuses
    .filter((t) => t.startsAt && t.startsAt > now)
    .sort((a, b) => (a.startsAt ?? 0) - (b.startsAt ?? 0))[0];
  if (upcoming) return upcoming.id;
  // fallback: highest id seen
  return statuses.reduce((a, b) => (b.id > a ? b.id : a), 0) || null;
}
