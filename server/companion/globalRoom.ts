import { getDb } from "./db";

export interface StoredGlobalMessage {
  id: number;
  tokenId: string;
  gotchiName: string;
  wallet: string;
  text: string;
  isAI: boolean;
  ts: number;
}

let ensuredDb: object | null = null;
function ensureSchema() {
  const db = getDb();
  if (ensuredDb === db) return;
  db.exec(`
    CREATE TABLE IF NOT EXISTS global_messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      token_id TEXT NOT NULL,
      gotchi_name TEXT NOT NULL,
      wallet TEXT NOT NULL,
      text TEXT NOT NULL,
      is_ai INTEGER NOT NULL DEFAULT 0,
      ts INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_global_id ON global_messages(id);
  `);
  ensuredDb = db;
}

interface Row { id: number; token_id: string; gotchi_name: string; wallet: string; text: string; is_ai: number; ts: number; }
function toMsg(r: Row): StoredGlobalMessage {
  return { id: r.id, tokenId: r.token_id, gotchiName: r.gotchi_name, wallet: r.wallet, text: r.text, isAI: r.is_ai === 1, ts: r.ts };
}

export function appendGlobalMessage(m: {
  tokenId: string; gotchiName: string; wallet: string; text: string; isAI: boolean;
}): StoredGlobalMessage {
  ensureSchema();
  const ts = Date.now();
  const info = getDb().prepare(
    `INSERT INTO global_messages (token_id, gotchi_name, wallet, text, is_ai, ts) VALUES (?,?,?,?,?,?)`
  ).run(String(m.tokenId), m.gotchiName, m.wallet.toLowerCase(), m.text, m.isAI ? 1 : 0, ts);
  return { id: Number(info.lastInsertRowid), tokenId: String(m.tokenId), gotchiName: m.gotchiName, wallet: m.wallet.toLowerCase(), text: m.text, isAI: m.isAI, ts };
}

export function recentGlobalMessages(limit = 50): StoredGlobalMessage[] {
  ensureSchema();
  const rows = getDb().prepare(
    `SELECT * FROM global_messages ORDER BY id DESC LIMIT ?`
  ).all(limit) as Row[];
  return rows.reverse().map(toMsg);
}

export function globalMessagesSince(id: number, limit = 100): StoredGlobalMessage[] {
  ensureSchema();
  const rows = getDb().prepare(
    `SELECT * FROM global_messages WHERE id > ? ORDER BY id ASC LIMIT ?`
  ).all(id, limit) as Row[];
  return rows.map(toMsg);
}
