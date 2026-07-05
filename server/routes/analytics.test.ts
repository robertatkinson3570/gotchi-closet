// server/routes/analytics.test.ts
//
// NOTE: the plan's draft test used `supertest`, but this repo has no supertest
// dependency and its existing route tests (server/routes/companion.test.ts) drive
// requests against a real `app.listen(0)` server via plain `fetch`. Following that
// established convention instead of adding a new test-only dependency.
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import express from "express";
import type { Server } from "node:http";
import { privateKeyToAccount } from "viem/accounts";
import { siteAdminMessage } from "../../src/lib/analytics/auth";
import { closeDb } from "../analytics/store";
import analyticsRouter from "./analytics";

const account = privateKeyToAccount(
  "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80"
);

let tmpDir: string;
let server: Server;
let base: string;

beforeEach(async () => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "analytics-route-"));
  process.env.ANALYTICS_DB_PATH = path.join(tmpDir, "analytics.db");
  process.env.SITE_ADMINS = account.address.toLowerCase();

  const app = express();
  app.use(express.json());
  app.use("/api/analytics", analyticsRouter);

  await new Promise<void>((resolve) => {
    server = app.listen(0, () => {
      const addr = server.address();
      const port = typeof addr === "object" && addr ? addr.port : 0;
      base = `http://127.0.0.1:${port}`;
      resolve();
    });
  });
});

afterEach(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
  closeDb();
  delete process.env.ANALYTICS_DB_PATH;
  delete process.env.SITE_ADMINS;
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe("POST /track", () => {
  it("accepts a pageview and returns 204", async () => {
    const res = await fetch(`${base}/api/analytics/track`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ visitorId: "v1", eventType: "pageview", path: "/explorer" }),
    });
    expect(res.status).toBe(204);
  });

  it("accepts a text/plain beacon body (what the browser sendBeacon posts) and records it", async () => {
    const post = await fetch(`${base}/api/analytics/track`, {
      method: "POST",
      headers: { "Content-Type": "text/plain" },
      body: JSON.stringify({ visitorId: "v-beacon", eventType: "pageview", path: "/explorer" }),
    });
    expect(post.status).toBe(204);

    // Prove it actually landed (the browser bug was silent loss, not a bad status).
    const signedAt = Date.now();
    const signature = await account.signMessage({
      message: siteAdminMessage(account.address, signedAt),
    });
    const read = await fetch(`${base}/api/analytics/events?window=7d`, {
      headers: { "x-wallet": account.address, "x-signed-at": String(signedAt), "x-signature": signature },
    });
    const body = await read.json();
    expect(body.events).toHaveLength(1);
    expect(body.events[0].visitor_id).toBe("v-beacon");
  });

  it("rejects an unknown event type with 400", async () => {
    const res = await fetch(`${base}/api/analytics/track`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ visitorId: "v1", eventType: "hack", path: "/x" }),
    });
    expect(res.status).toBe(400);
  });
});

describe("GET /events (admin only)", () => {
  it("401 without a signature", async () => {
    const res = await fetch(`${base}/api/analytics/events`);
    expect(res.status).toBe(401);
  });

  it("401 with a bad signature", async () => {
    const res = await fetch(`${base}/api/analytics/events`, {
      headers: {
        "x-wallet": account.address,
        "x-signed-at": String(Date.now()),
        "x-signature": "0xdeadbeef",
      },
    });
    expect(res.status).toBe(401);
  });

  it("200 and returns rows with a valid admin signature", async () => {
    await fetch(`${base}/api/analytics/track`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ visitorId: "v1", eventType: "pageview", path: "/explorer" }),
    });

    const signedAt = Date.now();
    const signature = await account.signMessage({
      message: siteAdminMessage(account.address, signedAt),
    });

    const res = await fetch(`${base}/api/analytics/events?window=7d`, {
      headers: {
        "x-wallet": account.address,
        "x-signed-at": String(signedAt),
        "x-signature": signature,
      },
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.events).toHaveLength(1);
    expect(body.events[0].path).toBe("/explorer");
  });
});
