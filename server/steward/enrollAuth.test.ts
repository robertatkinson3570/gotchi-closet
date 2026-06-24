// server/steward/enrollAuth.test.ts
// Proves the enroll-auth approach the route uses: the owner signs enrollMessage(...), the
// server rebuilds the message from the request body and recovers the signer — a valid sig
// recovers the owner; any tampered term recovers a different address (=> 401).
import { describe, it, expect } from "vitest";
import { privateKeyToAccount, generatePrivateKey } from "viem/accounts";
import { recoverMessageAddress } from "viem";
import { enrollMessage } from "../../src/lib/steward/enrollAuth";

describe("enroll auth signature", () => {
  it("recovers the owner from a correctly-signed enroll message", async () => {
    const acct = privateKeyToAccount(generatePrivateKey());
    const params = { owner: acct.address, gotchiId: 4895, chores: { pet: true, channel: false, claim: true }, smartAccount: acct.address, signedAt: 1_700_000_000_000 };
    const message = enrollMessage(params);
    const signature = await acct.signMessage({ message });
    const recovered = await recoverMessageAddress({ message, signature });
    expect(recovered.toLowerCase()).toBe(acct.address.toLowerCase());
  });

  it("a tampered body recovers a different address (rejected)", async () => {
    const acct = privateKeyToAccount(generatePrivateKey());
    const base = { owner: acct.address, gotchiId: 1, chores: { pet: true, channel: false, claim: false }, smartAccount: acct.address, signedAt: 1_700_000_000_000 };
    const signature = await acct.signMessage({ message: enrollMessage(base) });
    // Server would rebuild from the tampered body (chores widened) -> different message.
    const tampered = enrollMessage({ ...base, chores: { pet: true, channel: true, claim: true } });
    const recovered = await recoverMessageAddress({ message: tampered, signature });
    expect(recovered.toLowerCase()).not.toBe(acct.address.toLowerCase());
  });
});
