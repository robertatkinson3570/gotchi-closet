import { test, expect, type APIRequestContext } from "@playwright/test";

// Full end-to-end coverage of the Steward REST surface against the REAL running server
// (Playwright's `request` fixture hits the backend directly — no page, no network stubbing).
// On-chain AA (7702 session keys) is NOT exercised here; that needs a Base Sepolia wallet +
// Rhinestone key (see server/steward/aa.ts) and lives outside the deterministic suite.
//
// Each test uses a fresh unique owner so the persistent dev steward.db never collides across
// reruns.
let seq = 0;
function uniqueOwner(): `0x${string}` {
  seq += 1;
  const hex = (BigInt(Date.now()) * 1000n + BigInt(seq)).toString(16).padStart(40, "0").slice(-40);
  return `0x${hex}`;
}

const ALL = { pet: true, channel: true, claim: true };
const PET = { pet: true, channel: false, claim: false };

async function enroll(request: APIRequestContext, body: Record<string, unknown>) {
  return request.post("/api/steward/enroll", { data: body });
}

test.describe("steward api e2e", () => {
  test("enroll → status → log lifecycle", async ({ request }) => {
    const owner = uniqueOwner();
    const res = await enroll(request, { owner, gotchiId: 4895, chores: PET, intervalSec: 28800 });
    expect(res.status()).toBe(200);
    const e = await res.json();
    expect(e.status).toBe("active");
    expect(e.owner).toBe(owner.toLowerCase()); // lowercased server-side
    expect(e.chores).toEqual(PET);
    expect(e.intervalSec).toBe(28800);

    const status = await (await request.get(`/api/steward/status?owner=${owner}`)).json();
    expect(status.enrollments).toHaveLength(1);
    expect(status.enrollments[0].gotchiId).toBe(4895);

    const log = await (await request.get(`/api/steward/log?owner=${owner}`)).json();
    expect(Array.isArray(log.log)).toBe(true);
  });

  test("clamps interval below the 8h floor", async ({ request }) => {
    const owner = uniqueOwner();
    const e = await (await enroll(request, { owner, gotchiId: 1, chores: PET, intervalSec: 60 })).json();
    expect(e.intervalSec).toBe(8 * 60 * 60);
  });

  test("chore-exclusivity: a second steward can't re-claim an owned chore", async ({ request }) => {
    const owner = uniqueOwner();
    expect((await enroll(request, { owner, gotchiId: 1, chores: PET, intervalSec: 28800 })).status()).toBe(200);
    const dup = await enroll(request, { owner, gotchiId: 2, chores: { pet: true, channel: true, claim: false }, intervalSec: 28800 });
    expect(dup.status()).toBe(409);
    expect((await dup.json()).conflicts).toEqual(["pet"]);
  });

  test("two stewards may split non-overlapping chores", async ({ request }) => {
    const owner = uniqueOwner();
    expect((await enroll(request, { owner, gotchiId: 1, chores: PET, intervalSec: 28800 })).status()).toBe(200);
    expect((await enroll(request, { owner, gotchiId: 2, chores: { pet: false, channel: true, claim: true }, intervalSec: 28800 })).status()).toBe(200);
    const status = await (await request.get(`/api/steward/status?owner=${owner}`)).json();
    expect(status.enrollments.filter((x: any) => x.status === "active")).toHaveLength(2);
  });

  test("once one steward holds all 3 chores, no new steward can enroll", async ({ request }) => {
    const owner = uniqueOwner();
    expect((await enroll(request, { owner, gotchiId: 1, chores: ALL, intervalSec: 28800 })).status()).toBe(200);
    const blocked = await enroll(request, { owner, gotchiId: 2, chores: { pet: false, channel: false, claim: true }, intervalSec: 28800 });
    expect(blocked.status()).toBe(409);
  });

  test("pause → resume → revoke, and revoke frees the chores", async ({ request }) => {
    const owner = uniqueOwner();
    const e = await (await enroll(request, { owner, gotchiId: 1, chores: ALL, intervalSec: 28800 })).json();

    const paused = await (await request.post("/api/steward/pause", { data: { id: e.id } })).json();
    expect(paused.status).toBe("paused");
    const resumed = await (await request.post("/api/steward/resume", { data: { id: e.id } })).json();
    expect(resumed.status).toBe("active");
    const revoked = await (await request.post("/api/steward/revoke", { data: { id: e.id } })).json();
    expect(revoked.status).toBe("revoked");

    // chores freed → a new all-3 steward can now enroll
    expect((await enroll(request, { owner, gotchiId: 2, chores: ALL, intervalSec: 28800 })).status()).toBe(200);
  });

  test("edit-chores re-checks exclusivity (ignoring the steward's own current chores)", async ({ request }) => {
    const owner = uniqueOwner();
    const a = await (await enroll(request, { owner, gotchiId: 1, chores: PET, intervalSec: 28800 })).json();
    await enroll(request, { owner, gotchiId: 2, chores: { pet: false, channel: true, claim: false }, intervalSec: 28800 });

    const ok = await request.post("/api/steward/edit-chores", { data: { id: a.id, chores: { pet: true, channel: false, claim: true } } });
    expect(ok.status()).toBe(200);
    expect((await ok.json()).chores.claim).toBe(true);

    const conflict = await request.post("/api/steward/edit-chores", { data: { id: a.id, chores: ALL } });
    expect(conflict.status()).toBe(409); // channel is taken by gotchi 2
  });

  test("validation: rejects no-chores and missing owner", async ({ request }) => {
    const owner = uniqueOwner();
    expect((await enroll(request, { owner, gotchiId: 1, chores: { pet: false, channel: false, claim: false }, intervalSec: 28800 })).status()).toBe(400);
    expect((await enroll(request, { gotchiId: 1, chores: PET, intervalSec: 28800 })).status()).toBe(400);
  });

  test("run-now 404s on an unknown enrollment", async ({ request }) => {
    // A real run hits the chain snapshot, so the deterministic suite only asserts wiring here;
    // the force/no-work path is covered in server/steward/runner.test.ts.
    const r = await request.post("/api/steward/run-now", { data: { id: 999999999 } });
    expect(r.status()).toBe(404);
  });

  test("souls returns {sealed, configured} shape", async ({ request }) => {
    const r = await (await request.get("/api/steward/souls?owner=0x1&ids=1589,4895")).json();
    expect(Array.isArray(r.sealed)).toBe(true);
    expect(typeof r.configured).toBe("boolean");
  });

  test("soul stats returns {level, xpPct, memories} shape", async ({ request }) => {
    const r = await (await request.get("/api/steward/soul?owner=0x1&gotchiId=4895")).json();
    expect(typeof r.level).toBe("string");
    expect(typeof r.xpPct).toBe("number");
    expect(typeof r.memories).toBe("number");
  });
});
