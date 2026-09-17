import { describe, it, expect, afterAll } from "vitest";
import { tmpdir } from "node:os";
import { join } from "node:path";

process.env.COMPANION_DB_PATH = join(tmpdir(), `wallet-proof-test-${process.pid}.db`);

import { privateKeyToAccount } from "viem/accounts";
import { prepareProof, verifyProof, issueSessionToken, sessionWallet, ProofError, proofRateLimited, PROOF_IP_LIMIT } from "./walletProof";
import { closeDb } from "./db";

afterAll(() => closeDb());

const holder = privateKeyToAccount("0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d");
const stranger = privateKeyToAccount("0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a");
const W = holder.address.toLowerCase();
const T0 = 1_790_000_000_000;
const session = { kind: "session" } as const;
const grant = { kind: "grant", keyTag: "wsp_ab12cd34" } as const;

async function signed(purpose: typeof session | typeof grant, opts: { now?: number; domain?: string; signer?: typeof holder } = {}) {
  const message = prepareProof({ purpose, wallet: W, domain: opts.domain ?? (purpose.kind === "session" ? "gotchicloset.com" : "mygame.example"), uri: "https://mygame.example/play", appName: "My Game", now: opts.now ?? T0 });
  const signature = await (opts.signer ?? holder).signMessage({ message });
  return { message, signature };
}

describe("wallet proof (SIWE)", () => {
  it("a Closet session message is standard SIWE on Base and verifies once", async () => {
    const { message, signature } = await signed(session);
    expect(message).toContain("gotchicloset.com wants you to sign in with your Ethereum account:");
    expect(message).toContain("Chain ID: 8453");
    expect(message).toContain("urn:wisp:closet-session");
    const v = await verifyProof({ purpose: session, message, signature, now: T0 + 60_000 });
    expect(v.wallet).toBe(W);
    expect(v.expiresAt - v.issuedAt).toBe(30 * 86_400_000);
    await expect(verifyProof({ purpose: session, message, signature, now: T0 + 61_000 })).rejects.toThrow(/already used/);
  });

  it("a grant names the app, binds the key tag and defaults to 90 days", async () => {
    const { message, signature } = await signed(grant, { now: T0 + 1000 });
    expect(message).toContain("Let My Game chat with your gotchis as you.");
    // H-08: the grant also unlocks steward_status, steward_log and steward_preview over MCP; the holder signs for that too
    expect(message).toContain("read your steward's status, log and preview");
    expect(message).toContain("urn:wisp:key:wsp_ab12cd34");
    const v = await verifyProof({ purpose: grant, message, signature, now: T0 + 2000 });
    expect(v.expiresAt - v.issuedAt).toBe(90 * 86_400_000);
    expect(v.domain).toBe("mygame.example");
  });

  it("refuses a grant used for another key, or used as a session", async () => {
    const { message, signature } = await signed(grant, { now: T0 + 2000 });
    await expect(verifyProof({ purpose: { kind: "grant", keyTag: "wsp_ffffffff" }, message, signature, now: T0 + 3000 })).rejects.toThrow(ProofError);
    await expect(verifyProof({ purpose: session, message, signature, now: T0 + 3000 })).rejects.toThrow(ProofError);
  });

  it("refuses a signature from another wallet", async () => {
    const { message, signature } = await signed(session, { now: T0 + 3000, signer: stranger });
    await expect(verifyProof({ purpose: session, message, signature, now: T0 + 4000 })).rejects.toThrow(/not from this wallet/);
  });

  it("refuses a message edited after it was prepared, even when the edit is re-signed", async () => {
    const prepared = prepareProof({ purpose: session, wallet: W, domain: "gotchicloset.com", uri: "https://gotchicloset.com", now: T0 + 4000 });
    const longer = prepared.replace(/Expiration Time: .*/, "Expiration Time: 2099-01-01T00:00:00.000Z");
    const signature = await holder.signMessage({ message: longer });
    await expect(verifyProof({ purpose: session, message: longer, signature, now: T0 + 5000 })).rejects.toThrow(/not prepared by this server/);
  });

  it("refuses a message signed after the ten-minute window", async () => {
    const { message, signature } = await signed(session, { now: T0 + 5000 });
    await expect(verifyProof({ purpose: session, message, signature, now: T0 + 5000 + 11 * 60_000 })).rejects.toThrow(/expired before it was signed/);
  });

  it("only Gotchi Closet's own sites may ask for a session", () => {
    expect(() => prepareProof({ purpose: session, wallet: W, domain: "phish.example", uri: "https://phish.example", now: T0 })).toThrow(/cannot ask/);
  });

  it("SEC-11: a lookalike Vercel project cannot ask for a session; a preview host named in WISP_SESSION_DOMAINS can", () => {
    const before = process.env.WISP_SESSION_DOMAINS;
    try {
      delete process.env.WISP_SESSION_DOMAINS;
      expect(() => prepareProof({ purpose: session, wallet: W, domain: "gotchi-closet-freegift.vercel.app", uri: "https://gotchi-closet-freegift.vercel.app", now: T0 })).toThrow(/cannot ask/);
      process.env.WISP_SESSION_DOMAINS = " gotchi-closet-git-main-grimlabs.vercel.app, Preview.Gotchicloset.com ";
      expect(() => prepareProof({ purpose: session, wallet: W, domain: "gotchi-closet-freegift.vercel.app", uri: "https://gotchi-closet-freegift.vercel.app", now: T0 })).toThrow(/cannot ask/);
      const m = prepareProof({ purpose: session, wallet: W, domain: "gotchi-closet-git-main-grimlabs.vercel.app", uri: "https://gotchi-closet-git-main-grimlabs.vercel.app", now: T0 });
      expect(m).toContain("gotchi-closet-git-main-grimlabs.vercel.app wants you to sign in");
      expect(prepareProof({ purpose: session, wallet: W, domain: "preview.gotchicloset.com", uri: "https://preview.gotchicloset.com", now: T0 })).toContain("preview.gotchicloset.com wants you");
    } finally {
      if (before === undefined) delete process.env.WISP_SESSION_DOMAINS; else process.env.WISP_SESSION_DOMAINS = before;
    }
  });

  it("session tokens prove their wallet until they expire, and cannot be forged", () => {
    const token = issueSessionToken(W, T0 + 1000);
    expect(sessionWallet(token, T0)).toBe(W);
    expect(sessionWallet(token, T0 + 1000)).toBeNull();
    const other = stranger.address.toLowerCase();
    expect(sessionWallet(token.replace(W, other), T0)).toBeNull();
    expect(sessionWallet("ws1.nope", T0)).toBeNull();
  });

  it("limits each IP on the public proof routes", () => {
    for (let i = 0; i < PROOF_IP_LIMIT; i++) expect(proofRateLimited("198.51.100.7", T0)).toBe(false);
    expect(proofRateLimited("198.51.100.7", T0)).toBe(true);
    expect(proofRateLimited("198.51.100.8", T0)).toBe(false);
  });
});
