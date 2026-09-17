// Server half of the wallet proof (src/lib/wisp/walletProof.ts). Preparing a
// message writes nothing: its nonce is an HMAC over every field, so only a
// message this server built can verify. A nonce is recorded only after a real
// signature from the wallet checks out, which is also what stops a replay.

import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { getAddress, isAddress, recoverMessageAddress } from "viem";
import { createSiweMessage, parseSiweMessage } from "viem/siwe";
import { getDb } from "./db";
import {
  PROOF_CHAIN_ID, PROOF_MESSAGE_MAX, PROOF_SIGN_WINDOW_MS, SESSION_TTL_MS, GRANT_DEFAULT_DAYS, GRANT_MAX_DAYS,
  SESSION_RESOURCE, SESSION_STATEMENT, grantResource, grantStatement, statementAppName, isSessionDomain, parseSessionDomains,
} from "../../src/lib/wisp/walletProof";

export type ProofPurpose = { kind: "session" } | { kind: "grant"; keyTag: string };

export class ProofError extends Error {}

let ensured: object | null = null;
function db() {
  const d = getDb();
  if (ensured === d) return d;
  d.exec(`
    CREATE TABLE IF NOT EXISTS wisp_proof_secret (id INTEGER PRIMARY KEY CHECK (id = 1), secret TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS wisp_proof_used (nonce TEXT PRIMARY KEY, expires_at INTEGER NOT NULL);
  `);
  ensured = d;
  return d;
}

function secret(): string {
  const fromEnv = (process.env.WISP_PROOF_SECRET || "").trim();
  if (fromEnv.length >= 32) return fromEnv;
  const d = db();
  const row = d.prepare(`SELECT secret FROM wisp_proof_secret WHERE id = 1`).get() as { secret: string } | undefined;
  if (row) return row.secret;
  d.prepare(`INSERT OR IGNORE INTO wisp_proof_secret (id, secret) VALUES (1, ?)`).run(randomBytes(32).toString("hex"));
  return (d.prepare(`SELECT secret FROM wisp_proof_secret WHERE id = 1`).get() as { secret: string }).secret;
}

function hmac(parts: string[]): string {
  return createHmac("sha256", secret()).update(parts.join("\n")).digest("hex");
}

function sameHex(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

const allowDev = () => process.env.NODE_ENV !== "production";
/** Read at call time so a test (and a restart) can change the list. */
const sessionHosts = () => parseSessionDomains(process.env.WISP_SESSION_DOMAINS);
const sessionDomainOk = (domain: string) => isSessionDomain(domain, allowDev(), sessionHosts());

function nonceFor(purpose: ProofPurpose, f: { address: string; domain: string; uri: string; statement: string; issuedAt: Date; expirationTime: Date }): string {
  return hmac([
    "wisp-proof-v1", purpose.kind, purpose.kind === "grant" ? purpose.keyTag : "",
    f.address.toLowerCase(), f.domain, f.uri, f.statement, f.issuedAt.toISOString(), f.expirationTime.toISOString(),
  ]).slice(0, 32);
}

/** Build the message the wallet will sign. Throws ProofError on bad input. */
export function prepareProof(args: {
  purpose: ProofPurpose; wallet: string; domain: string; uri: string; appName?: string | null; days?: number; now?: number;
}): string {
  const now = args.now ?? Date.now();
  if (!isAddress(args.wallet, { strict: false })) throw new ProofError("wallet must be a 0x address");
  const domain = String(args.domain ?? "").trim();
  const uri = String(args.uri ?? "").trim();
  if (!/^[a-z0-9.-]{1,200}(:\d{2,5})?$/i.test(domain)) throw new ProofError("domain must be the host of the page asking, e.g. mygame.com");
  if (!/^https?:\/\/[^\s<>"']{1,300}$/.test(uri)) throw new ProofError("uri must be the http(s) URL of the page asking");
  let statement: string;
  let resource: string;
  let ttl: number;
  if (args.purpose.kind === "session") {
    if (!sessionDomainOk(domain)) throw new ProofError("this site cannot ask for a Gotchi Closet session");
    statement = SESSION_STATEMENT;
    resource = SESSION_RESOURCE;
    ttl = SESSION_TTL_MS;
  } else {
    const days = args.days === undefined ? GRANT_DEFAULT_DAYS : Math.floor(Number(args.days));
    if (!Number.isFinite(days) || days < 1 || days > GRANT_MAX_DAYS) throw new ProofError(`days must be 1 to ${GRANT_MAX_DAYS}`);
    statement = grantStatement(statementAppName(args.appName));
    resource = grantResource(args.purpose.keyTag);
    ttl = days * 86_400_000;
  }
  const issuedAt = new Date(Math.floor(now / 1000) * 1000);
  const expirationTime = new Date(issuedAt.getTime() + ttl);
  const address = getAddress(args.wallet.toLowerCase());
  const nonce = nonceFor(args.purpose, { address, domain, uri, statement, issuedAt, expirationTime });
  try {
    return createSiweMessage({ address, chainId: PROOF_CHAIN_ID, domain, uri, version: "1", nonce, issuedAt, expirationTime, statement, resources: [resource] });
  } catch (e) {
    throw new ProofError(`cannot build the sign-in message: ${(e as Error).message.split("\n")[0]}`);
  }
}

export interface VerifiedProof {
  wallet: string;
  domain: string;
  issuedAt: number;
  expiresAt: number;
}

/** Check a signed message against the purpose it must prove. Throws ProofError. */
export async function verifyProof(args: { purpose: ProofPurpose; message: unknown; signature: unknown; now?: number }): Promise<VerifiedProof> {
  const now = args.now ?? Date.now();
  const message = typeof args.message === "string" ? args.message : "";
  const signature = typeof args.signature === "string" ? args.signature : "";
  if (!message || message.length > PROOF_MESSAGE_MAX) throw new ProofError("message required");
  if (!/^0x[0-9a-fA-F]{130}$/.test(signature)) throw new ProofError("signature must be a 65-byte 0x hex signature");

  const p = parseSiweMessage(message);
  if (!p.address || !p.domain || !p.uri || !p.nonce || !p.issuedAt || !p.expirationTime || !p.statement || p.version !== "1" || p.chainId !== PROOF_CHAIN_ID) {
    throw new ProofError("not a Wisp sign-in message");
  }
  const expectedResource = args.purpose.kind === "session" ? SESSION_RESOURCE : grantResource(args.purpose.keyTag);
  if (!p.resources || p.resources.length !== 1 || p.resources[0] !== expectedResource) throw new ProofError("this message was made for something else");
  if (args.purpose.kind === "session" && (p.statement !== SESSION_STATEMENT || !sessionDomainOk(p.domain))) {
    throw new ProofError("this message was made for something else");
  }
  const canonical = createSiweMessage({
    address: p.address, chainId: p.chainId, domain: p.domain, uri: p.uri, version: "1", nonce: p.nonce,
    issuedAt: p.issuedAt, expirationTime: p.expirationTime, statement: p.statement, resources: p.resources,
  });
  if (canonical !== message) throw new ProofError("message was changed after it was prepared");
  const expectedNonce = nonceFor(args.purpose, { address: p.address, domain: p.domain, uri: p.uri, statement: p.statement, issuedAt: p.issuedAt, expirationTime: p.expirationTime });
  if (!sameHex(p.nonce, expectedNonce)) throw new ProofError("message was not prepared by this server");

  const issuedAt = p.issuedAt.getTime();
  const expiresAt = p.expirationTime.getTime();
  if (issuedAt > now + 60_000 || now - issuedAt > PROOF_SIGN_WINDOW_MS) throw new ProofError("message expired before it was signed; prepare a new one");
  if (expiresAt <= now) throw new ProofError("message expired");

  let signer: string;
  try {
    signer = await recoverMessageAddress({ message, signature: signature as `0x${string}` });
  } catch {
    throw new ProofError("signature does not match the message");
  }
  if (signer.toLowerCase() !== p.address.toLowerCase()) throw new ProofError("signature is not from this wallet");

  const d = db();
  d.prepare(`DELETE FROM wisp_proof_used WHERE expires_at < ?`).run(now);
  const used = d.prepare(`INSERT OR IGNORE INTO wisp_proof_used (nonce, expires_at) VALUES (?, ?)`).run(p.nonce, issuedAt + PROOF_SIGN_WINDOW_MS + 60_000);
  if (used.changes !== 1) throw new ProofError("this signature was already used");

  return { wallet: p.address.toLowerCase(), domain: p.domain, issuedAt, expiresAt };
}

// --- Session tokens --------------------------------------------------------

export function issueSessionToken(wallet: string, expiresAt: number): string {
  const w = wallet.toLowerCase();
  return `ws1.${w}.${expiresAt}.${hmac(["wisp-session-v1", w, String(expiresAt)]).slice(0, 48)}`;
}

/** The wallet a session token proves, or null. */
export function sessionWallet(token: unknown, now: number = Date.now()): string | null {
  if (typeof token !== "string" || token.length > 200) return null;
  const m = /^ws1\.(0x[0-9a-f]{40})\.(\d{13})\.([0-9a-f]{48})$/.exec(token);
  if (!m) return null;
  const expiresAt = Number(m[2]);
  if (!(expiresAt > now)) return null;
  return sameHex(m[3]!, hmac(["wisp-session-v1", m[1]!, m[2]!]).slice(0, 48)) ? m[1]! : null;
}

// --- Per-IP limiter for the public proof routes ------------------------------

const hits = new Map<string, { count: number; resetAt: number }>();
export const PROOF_IP_LIMIT = 30;
export const PROOF_IP_WINDOW_MS = 10 * 60_000;

export function proofRateLimited(ip: string | undefined, now: number = Date.now()): boolean {
  const key = ip || "unknown";
  if (hits.size > 50_000) for (const [k, v] of hits) if (v.resetAt < now) hits.delete(k);
  const b = hits.get(key);
  if (!b || b.resetAt < now) {
    hits.set(key, { count: 1, resetAt: now + PROOF_IP_WINDOW_MS });
    return false;
  }
  b.count += 1;
  return b.count > PROOF_IP_LIMIT;
}

// --- Per-key limiter for the keyed grant routes (QA P4-04) --------------------
// A partner app's server is one IP for every player it onboards, so the per-IP
// proof bucket above (shared with Closet's own session routes) let one app run
// about 15 grant flows per 10 minutes. Keyed grant prepare and grant use this
// bucket, per key, instead; the session routes keep the per-IP one.

const grantHits = new Map<string, { count: number; resetAt: number }>();
export const GRANT_KEY_LIMIT = 120;
export const GRANT_KEY_WINDOW_MS = 10 * 60_000;

export function grantRateLimited(apiKey: string, now: number = Date.now()): boolean {
  if (grantHits.size > 50_000) for (const [k, v] of grantHits) if (v.resetAt < now) grantHits.delete(k);
  const b = grantHits.get(apiKey);
  if (!b || b.resetAt < now) {
    grantHits.set(apiKey, { count: 1, resetAt: now + GRANT_KEY_WINDOW_MS });
    return false;
  }
  b.count += 1;
  return b.count > GRANT_KEY_LIMIT;
}
