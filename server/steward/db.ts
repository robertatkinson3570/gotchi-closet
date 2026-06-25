// server/steward/db.ts
// Steward enrollment + log store. Mirrors server/companion/db.ts (better-sqlite3, WAL,
// prepared statements). Invariant: each chore (pet|channel|claim) is held by at most one
// ACTIVE enrollment per owner. Tests use STEWARD_DB_PATH=":memory:".
import Database from "better-sqlite3";
import path from "node:path";
import fs from "node:fs";
import { CHORES, type Chore } from "./abi";
import { encryptSoul, decryptSoul } from "../soul/crypto";

export type Status = "active" | "paused" | "revoked";
// "session" = EIP-7702 scoped session key (player pays gas; can pet/channel/claim).
// "operator" = pet-only via setPetOperatorForAll (Ledger-friendly, relayer pets gaslessly).
export type AuthMode = "session" | "operator";
export interface Chores { pet: boolean; channel: boolean; claim: boolean; }
export interface Enrollment {
  id: number; owner: string; gotchiId: number; chores: Chores; intervalSec: number;
  smartAccount: string | null; sessionKey: string | null; status: Status;
  authMode: AuthMode; createdAt: number; lastRunAt: number | null;
}

export const MIN_INTERVAL_SEC = 8 * 60 * 60;

export class ChoreConflictError extends Error {
  constructor(public conflicts: Chore[]) {
    super(`chores already assigned to another active steward: ${conflicts.join(", ")}`);
    this.name = "ChoreConflictError";
  }
}

let db: Database.Database | null = null;
function dbPath(): string { return process.env.STEWARD_DB_PATH || path.resolve("./data/steward.db"); }
export function closeStewardDb(): void { if (db) { db.close(); db = null; } }

export function getStewardDb(): Database.Database {
  if (db) return db;
  const p = dbPath();
  if (p !== ":memory:") {
    const dir = path.dirname(p);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  }
  db = new Database(p);
  db.pragma("journal_mode = WAL");
  db.exec(`
    CREATE TABLE IF NOT EXISTS steward_enrollments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      owner TEXT NOT NULL, gotchi_id INTEGER NOT NULL,
      chores TEXT NOT NULL, interval_sec INTEGER NOT NULL,
      smart_account TEXT, session_key TEXT,
      status TEXT NOT NULL, created_at INTEGER NOT NULL, last_run_at INTEGER,
      auth_mode TEXT NOT NULL DEFAULT 'session'
    );
    CREATE INDEX IF NOT EXISTS idx_steward_owner ON steward_enrollments(owner, status);
    CREATE TABLE IF NOT EXISTS steward_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      owner TEXT NOT NULL, gotchi_id INTEGER NOT NULL,
      action TEXT NOT NULL, detail TEXT NOT NULL, tx_hash TEXT, ts INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_steward_log_owner ON steward_log(owner, id);
  `);
  // Idempotent migration for DBs created before auth_mode existed.
  const cols = db.prepare(`PRAGMA table_info(steward_enrollments)`).all() as { name: string }[];
  if (!cols.some((c) => c.name === "auth_mode")) {
    db.exec(`ALTER TABLE steward_enrollments ADD COLUMN auth_mode TEXT NOT NULL DEFAULT 'session'`);
  }
  return db;
}

interface Row {
  id: number; owner: string; gotchi_id: number; chores: string; interval_sec: number;
  smart_account: string | null; session_key: string | null; status: Status;
  auth_mode: AuthMode; created_at: number; last_run_at: number | null;
}
// The session key is stored ENCRYPTED at rest (it can sign scoped userOps). Public reads
// redact it entirely; only the cron's run path decrypts it (withSecret=true).
function toEnrollment(r: Row, withSecret = false): Enrollment {
  let sessionKey: string | null = null;
  if (withSecret && r.session_key) {
    try { sessionKey = decryptSoul(r.session_key); } catch { sessionKey = null; }
  }
  return {
    id: r.id, owner: r.owner, gotchiId: r.gotchi_id, chores: JSON.parse(r.chores),
    intervalSec: r.interval_sec, smartAccount: r.smart_account, sessionKey,
    status: r.status, authMode: r.auth_mode ?? "session", createdAt: r.created_at, lastRunAt: r.last_run_at,
  };
}

export function claimedChores(owner: string, excludeId?: number): Set<Chore> {
  const rows = getStewardDb()
    .prepare(`SELECT id, chores FROM steward_enrollments WHERE owner=? AND status='active'`)
    .all(owner.toLowerCase()) as { id: number; chores: string }[];
  const set = new Set<Chore>();
  for (const r of rows) {
    if (excludeId !== undefined && r.id === excludeId) continue;
    const c = JSON.parse(r.chores) as Chores;
    for (const k of CHORES) if (c[k]) set.add(k);
  }
  return set;
}

function conflictsAgainst(owner: string, want: Chores, excludeId?: number): Chore[] {
  const taken = claimedChores(owner, excludeId);
  return CHORES.filter((k) => want[k] && taken.has(k));
}

export function enroll(input: {
  owner: string; gotchiId: number; chores: Chores; intervalSec: number;
  smartAccount?: string; sessionKey?: string; authMode?: AuthMode;
}): Enrollment {
  const owner = input.owner.toLowerCase();
  const interval = Math.max(MIN_INTERVAL_SEC, Math.floor(input.intervalSec));
  const conflicts = conflictsAgainst(owner, input.chores);
  if (conflicts.length) throw new ChoreConflictError(conflicts);
  const info = getStewardDb()
    .prepare(
      `INSERT INTO steward_enrollments
       (owner, gotchi_id, chores, interval_sec, smart_account, session_key, status, created_at, last_run_at, auth_mode)
       VALUES (?,?,?,?,?,?, 'active', ?, NULL, ?)`
    )
    .run(owner, input.gotchiId, JSON.stringify(input.chores), interval,
      input.smartAccount ?? null, input.sessionKey ? encryptSoul(input.sessionKey) : null, Date.now(),
      input.authMode ?? "session");
  return getEnrollment(Number(info.lastInsertRowid))!;
}

export function getEnrollment(id: number): Enrollment | null {
  const r = getStewardDb().prepare(`SELECT * FROM steward_enrollments WHERE id=?`).get(id) as Row | undefined;
  return r ? toEnrollment(r) : null;
}

export function listEnrollments(owner: string): Enrollment[] {
  return (getStewardDb()
    .prepare(`SELECT * FROM steward_enrollments WHERE owner=? ORDER BY id`)
    .all(owner.toLowerCase()) as Row[]).map((r) => toEnrollment(r));
}

// Run path only: enrollments WITH the decrypted session key, for the cron to submit userOps.
// Never expose these over the API.
export function listEnrollmentsForRun(owner: string): Enrollment[] {
  return (getStewardDb()
    .prepare(`SELECT * FROM steward_enrollments WHERE owner=? ORDER BY id`)
    .all(owner.toLowerCase()) as Row[]).map((r) => toEnrollment(r, true));
}

// Run path only: a SINGLE enrollment with its decrypted session key, for manual "run now".
// Never expose the result over the API (it carries the secret).
export function getEnrollmentForRun(id: number): Enrollment | null {
  const r = getStewardDb().prepare(`SELECT * FROM steward_enrollments WHERE id=?`).get(id) as Row | undefined;
  return r ? toEnrollment(r, true) : null;
}

export function setStatus(id: number, status: Status): void {
  if (status === "revoked") {
    // Destroy the session key on revoke so it can NEVER sign again. The on-chain smart session
    // is left enabled but keyless (effectively dead — we held the only copy, encrypted); the
    // owner can fully remove it from their wallet afterwards for cleanliness.
    getStewardDb().prepare(`UPDATE steward_enrollments SET status=?, session_key=NULL WHERE id=?`).run(status, id);
  } else {
    getStewardDb().prepare(`UPDATE steward_enrollments SET status=? WHERE id=?`).run(status, id);
  }
}

export function editChores(id: number, chores: Chores): Enrollment {
  const cur = getEnrollment(id);
  if (!cur) throw new Error(`enrollment ${id} not found`);
  const conflicts = conflictsAgainst(cur.owner, chores, id);
  if (conflicts.length) throw new ChoreConflictError(conflicts);
  getStewardDb().prepare(`UPDATE steward_enrollments SET chores=? WHERE id=?`).run(JSON.stringify(chores), id);
  return getEnrollment(id)!;
}

export function recordRun(id: number, ts: number): void {
  getStewardDb().prepare(`UPDATE steward_enrollments SET last_run_at=? WHERE id=?`).run(ts, id);
}

export interface LogEntry { action: string; detail: string; txHash: string | null; ts: number; }
export function appendLog(owner: string, gotchiId: number, action: string, detail: string, txHash: string | null): void {
  getStewardDb()
    .prepare(`INSERT INTO steward_log (owner, gotchi_id, action, detail, tx_hash, ts) VALUES (?,?,?,?,?,?)`)
    .run(owner.toLowerCase(), gotchiId, action, detail, txHash, Date.now());
}
export function getLog(owner: string, limit = 50): LogEntry[] {
  return (getStewardDb()
    .prepare(`SELECT action, detail, tx_hash as txHash, ts FROM steward_log WHERE owner=? ORDER BY id DESC LIMIT ?`)
    .all(owner.toLowerCase(), limit) as LogEntry[]);
}
