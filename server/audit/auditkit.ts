// server/audit/auditkit.ts
// Tamper-evident audit trail for security-relevant server actions, written to
// AuditKit (hash-chained, publicly anchored). One AuditKit tenant per wallet.
//
// Contract:
//   - No-op unless AUDITKIT_API_KEY is set (local dev and tests log nothing).
//   - Fire-and-forget: never awaited on a request path, never throws into app
//     logic. Delivery failures are logged at most once a minute.
//   - Payloads carry ids, wallets, token ids, tx hashes and amounts. Never an
//     email, an API key, a session key, a signature or any other secret. A
//     Wisp key is referenced by `keyFingerprint` (see keyFingerprint below).
import { createHash } from "node:crypto";
import { AuditKit } from "@auditkit/sdk";

export type AuditPayload = Record<string, string | number | boolean | null | undefined | string[] | number[]>;

export interface Auditor {
  /** Record one action. `tenantWallet` is the wallet whose log this belongs to;
   *  `actor` is who did it (a wallet, or a system identity like "steward-cron"). */
  audit(tenantWallet: string, actor: string, action: string, target?: string | number | null, payload?: AuditPayload): void;
  /** True when a key is configured and events are being sent. */
  readonly enabled: boolean;
}

export interface AuditorOptions {
  apiKey?: string;
  baseUrl?: string;
  fetch?: typeof fetch;
  /** Error sink; defaults to console.error. */
  onError?: (message: string) => void;
  /** Clock for the once-a-minute error throttle. */
  now?: () => number;
}

const ERROR_THROTTLE_MS = 60_000;
const NO_WALLET = "no-wallet";

/** A wallet or system id as an AuditKit tenant: lowercase; the shared tenant
 *  "no-wallet" for a record that has no wallet behind it (e.g. a Wisp key
 *  minted without one). */
function tenantOf(wallet: string | null | undefined): string {
  const w = (wallet ?? "").trim().toLowerCase();
  return w || NO_WALLET;
}

/** A stable, non-reversible reference to a Wisp API key for the log: the
 *  first 16 hex of sha256(key). The key itself never leaves the process. */
export function keyFingerprint(apiKey: string): string {
  return createHash("sha256").update(apiKey).digest("hex").slice(0, 16);
}

/** Build an auditor from explicit options (tests) or, by default, from the
 *  environment (AUDITKIT_API_KEY, AUDITKIT_BASE_URL). */
export function createAuditor(opts: AuditorOptions = {}): Auditor {
  const apiKey = (opts.apiKey ?? process.env.AUDITKIT_API_KEY ?? "").trim();
  const onError = opts.onError ?? ((m: string) => console.error(m));
  const now = opts.now ?? Date.now;
  if (!apiKey) return { enabled: false, audit: () => {} };

  const baseUrl = (opts.baseUrl ?? process.env.AUDITKIT_BASE_URL ?? "").trim() || undefined;
  const client = new AuditKit({ apiKey, baseUrl, fetch: opts.fetch });
  let lastErrorAt = -Infinity;
  const report = (err: unknown) => {
    const t = now();
    if (t - lastErrorAt < ERROR_THROTTLE_MS) return;
    lastErrorAt = t;
    onError(`[audit] auditkit delivery failed: ${err instanceof Error ? err.message : String(err)}`);
  };

  return {
    enabled: true,
    audit(tenantWallet, actor, action, target, payload) {
      try {
        client
          .log({
            tenant: tenantOf(tenantWallet),
            actor: tenantOf(actor),
            action,
            target: target === undefined || target === null ? null : String(target),
            payload: payload === undefined ? undefined : compact(payload),
          })
          .catch(report);
      } catch (err) {
        report(err);
      }
    },
  };
}

/** Drop undefined fields so the committed payload is exactly what we meant. */
function compact(p: AuditPayload): AuditPayload {
  const out: AuditPayload = {};
  for (const [k, v] of Object.entries(p)) if (v !== undefined) out[k] = v;
  return out;
}

let defaultAuditor: Auditor | null = null;
function auditor(): Auditor {
  return (defaultAuditor ??= createAuditor());
}

/** Reset the process-wide auditor (tests, or after the env changes). */
export function resetAuditor(): void {
  defaultAuditor = null;
}

/** The process-wide auditor, built lazily from the environment on first use. */
export function audit(tenantWallet: string, actor: string, action: string, target?: string | number | null, payload?: AuditPayload): void {
  auditor().audit(tenantWallet, actor, action, target, payload);
}
