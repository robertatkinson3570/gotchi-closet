const SNAPSHOT_SPACE = process.env.SNAPSHOT_SPACE || "aavegotchi.eth";

const QUERY = `{ proposals(first: 6, where: { space: "${SNAPSHOT_SPACE}" }, orderBy: "created", orderDirection: desc){ id title state votes choices scores scores_total } }`;

function leading(p: any): string {
  const scores = (p.scores ?? []).map(Number);
  const choices = p.choices ?? [];
  if (!scores.length || !choices.length) return "";
  let mi = 0;
  for (let i = 1; i < scores.length; i++) if (scores[i] > scores[mi]) mi = i;
  const total = scores.reduce((s: number, v: number) => s + v, 0);
  if (total <= 0) return "";
  return ` — leading: ${choices[mi]} ${Math.round((scores[mi] / total) * 100)}%`;
}

// A one-line summary of Aavegotchi DAO governance from Snapshot (aavegotchi.eth), injected into
// chat context so Hermes answers "what's live in the DAO / what's being voted on" from real,
// current data. null on failure.
export async function fetchDaoSummary(): Promise<string | null> {
  try {
    const res = await fetch("https://hub.snapshot.org/graphql", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query: QUERY }),
    });
    if (!res.ok) return null;
    const json: any = await res.json();
    const ps: any[] = json?.data?.proposals ?? [];
    if (!ps.length) return "No recent Aavegotchi DAO proposals found on Snapshot.";
    const active = ps.filter((p) => p.state === "active");
    const activeLine = active.length
      ? `Open for voting now: ${active.map((p) => `"${p.title}" (${Number(p.votes) || 0} votes${leading(p)})`).join("; ")}.`
      : "Nothing is open for voting right now.";
    const recent = ps.slice(0, 3).map((p) => `"${p.title}" [${p.state}]`).join("; ");
    return `Aavegotchi DAO on Snapshot — ${activeLine} Most recent proposals: ${recent}.`;
  } catch {
    return null;
  }
}
