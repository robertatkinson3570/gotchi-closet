import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { tmpdir } from "node:os";
import { join } from "node:path";
import express from "express";
import type { Server } from "node:http";

// Isolate to a throwaway DB so this test never touches dev data.
process.env.COMPANION_DB_PATH = join(tmpdir(), `companion-route-test-${process.pid}.db`);

import companionRoutes from "./companion";
import { closeDb } from "../companion/db";

let server: Server;
let base: string;

beforeAll(async () => {
  const app = express();
  app.use(express.json());
  app.use("/api/companion", companionRoutes);
  await new Promise<void>((resolve) => {
    server = app.listen(0, () => {
      const addr = server.address();
      const port = typeof addr === "object" && addr ? addr.port : 0;
      base = `http://127.0.0.1:${port}`;
      resolve();
    });
  });
});

afterAll(() => {
  server?.close();
  closeDb();
});

describe("goals API", () => {
  it("POST /goals without a valid action signature → 401", async () => {
    const res = await fetch(`${base}/api/companion/goals`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        wallet: "0x1111111111111111111111111111111111111111",
        tokenId: "7",
        goal: "keep_emptied",
        actionSignature: "0xdeadbeef",
        actionSignedAt: Date.now(),
      }),
    });
    expect(res.status).toBe(401);
  });

  it("POST /goals missing fields → 400", async () => {
    const res = await fetch(`${base}/api/companion/goals`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ wallet: "0x1111111111111111111111111111111111111111" }),
    });
    expect(res.status).toBe(400);
  });
});
