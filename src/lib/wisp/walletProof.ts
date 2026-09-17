// Wallet proof for the shared companion history. One standard, Sign-In with
// Ethereum (EIP-4361), for both doors:
//   * a Gotchi Closet session: the holder signs in on the site, the server
//     answers with a 30-day session token;
//   * a Wisp grant: the holder lets one third-party app key read and add to
//     their gotchi's chat history until the grant expires.
// The server builds every message (it owns the nonce), the wallet signs it
// unchanged. Pure module: safe on client and server.

export const PROOF_CHAIN_ID = 8453;
export const PROOF_MESSAGE_MAX = 2000;
/** A prepared message must be signed and returned within this window. */
export const PROOF_SIGN_WINDOW_MS = 10 * 60_000;
export const SESSION_TTL_MS = 30 * 86_400_000;
export const GRANT_DEFAULT_DAYS = 90;
export const GRANT_MAX_DAYS = 365;
export const SESSION_HEADER = "x-wisp-session";

export const SESSION_RESOURCE = "urn:wisp:closet-session";
export function grantResource(keyTag: string): string {
  return `urn:wisp:key:${keyTag}`;
}

export const SESSION_STATEMENT =
  "Sign in to Gotchi Closet so your gotchi can remember your chats. This does not move anything or cost gas.";

export function grantStatement(appName: string): string {
  return (
    `Let ${appName} chat with your gotchis as you. It can read and add to your gotchi's chat history until this expires. ` +
    "It cannot move anything or cost gas."
  );
}

/** The app name as it may appear inside a signed statement: one line, short. */
export function statementAppName(name: string | null | undefined): string {
  // eslint-disable-next-line no-control-regex
  const clean = String(name ?? "").replace(/[\x00-\x1f\x7f<>]/g, " ").replace(/\s+/g, " ").trim().slice(0, 60);
  return clean || "an app";
}

/** The two production hosts. Every other host must be named explicitly. */
export const SESSION_HOSTS: readonly string[] = ["gotchicloset.com", "www.gotchicloset.com"];

/**
 * WISP_SESSION_DOMAINS: comma-separated exact hosts (preview deploys the owner
 * runs) that may also ask for a session. Empty by default. Never a wildcard:
 * any Vercel user can name a project gotchi-closet-<anything>, and a session
 * minted for that host reads a holder's private history (QA SEC-11).
 */
export function parseSessionDomains(raw: string | undefined | null): string[] {
  return String(raw ?? "")
    .split(",")
    .map((h) => h.trim().toLowerCase())
    .filter(Boolean);
}

/** The same hosts as https origins, for the CORS allowlist. */
export function sessionDomainOrigins(raw: string | undefined | null): string[] {
  return parseSessionDomains(raw).map((h) => `https://${h}`);
}

/** Sites allowed to ask for a Gotchi Closet session (the SIWE domain). */
export function isSessionDomain(domain: string, allowDev: boolean, extraHosts: readonly string[] = []): boolean {
  const d = domain.toLowerCase();
  if (SESSION_HOSTS.includes(d)) return true;
  if (extraHosts.includes(d)) return true;
  return allowDev && /^(localhost|127\.0\.0\.1)(:\d{2,5})?$/.test(d);
}
