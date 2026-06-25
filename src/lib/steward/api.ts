// src/lib/steward/api.ts
import type { Chores } from "./cardState";
import { env } from "@/lib/env";

// Steward routes live on the Express server (VPS in prod, not Vercel). Empty in local
// dev so the Vite /api proxy handles it; in prod this is the public API origin.
const BASE = env.companionApiUrl;

export interface Enrollment {
  id: number; owner: string; gotchiId: number; chores: Chores; intervalSec: number;
  smartAccount: string | null; sessionKey: string | null; status: "active" | "paused" | "revoked";
  createdAt: number; lastRunAt: number | null;
}
export interface LogEntry { action: string; detail: string; txHash: string | null; ts: number; }

async function post(path: string, body: unknown) {
  const r = await fetch(`${BASE}/api/steward/${path}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  if (!r.ok) throw Object.assign(new Error((await r.json().catch(() => ({}))).error || r.statusText), { status: r.status });
  return r.json();
}
async function get(path: string) {
  const r = await fetch(`${BASE}/api/steward/${path}`);
  if (!r.ok) throw new Error(r.statusText);
  return r.json();
}

export interface UpkeepPlan {
  summary: { pet: number; channel: number; claim: number };
  calls: { to: `0x${string}`; data: `0x${string}` }[];
}

export const stewardApi = {
  status: (owner: string) => get(`status?owner=${owner}`).then((d) => d.enrollments as Enrollment[]),
  log: (owner: string) => get(`log?owner=${owner}`).then((d) => d.log as LogEntry[]),
  upkeep: (owner: string) => get(`upkeep?owner=${owner}`) as Promise<UpkeepPlan>,
  enroll: (body: { owner: string; gotchiId: number; chores: Chores; intervalSec: number; smartAccount?: string; sessionKey?: string; ownerSig?: string; signedAt?: number; authMode?: "session" | "operator" }) =>
    post("enroll", body) as Promise<Enrollment>,
  pause: (id: number) => post("pause", { id }),
  resume: (id: number) => post("resume", { id }),
  revoke: (id: number) => post("revoke", { id }),
  editChores: (id: number, chores: Chores) => post("edit-chores", { id, chores }),
  runNow: (id: number) => post("run-now", { id }) as Promise<{ ran: boolean; reason?: string; txHash?: string }>,
};
