/**
 * Direct integration tests for the lending product:
 *  - Subgraph: ACTIVE_LENDINGS, LENDING_BY_ID, HISTORICAL_LENDINGS, WHITELISTS_FOR_ADDRESS
 *  - Backend: api.gotchicloset.com health + listings CRUD
 *  - Contract: GHST balance + Aavegotchi diamond reachability via viem
 *
 * Run:  npx tsx scripts/lendingIntegrationTests.ts
 */

import { createPublicClient, http } from "viem";
import { base } from "viem/chains";

const SUBGRAPH = "https://api.goldsky.com/api/public/project_cmh3flagm0001r4p25foufjtt/subgraphs/aavegotchi-core-base/prod/gn";
const PROD_API = "https://api.gotchicloset.com/api/lending/autorenew";
const PROD_SITE = "https://www.gotchicloset.com";
const DEV_SITE = "http://localhost:5000";

const GHST_BASE = "0xcD2F22236DD9Dfe2356D7C543161D4d260FD9BcB";
const DIAMOND_BASE = "0xA99c4B08201F2913Db8D28e71d020c4298F29dBF";
const HOT_WALLET = "0x737587601e05004a7B8BD7c539B4BED97690ecF3";

type Result = { name: string; ok: boolean; detail: string };
const results: Result[] = [];

function record(name: string, ok: boolean, detail: string) {
  results.push({ name, ok, detail });
  console.log(`${ok ? "✅" : "❌"} ${name} — ${detail}`);
}

async function gql<T = any>(query: string, variables: Record<string, any> = {}): Promise<T> {
  const res = await fetch(SUBGRAPH, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ query, variables }),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const json = await res.json();
  if (json.errors) throw new Error(JSON.stringify(json.errors));
  return json.data as T;
}

// --- Subgraph -----------------------------------------------------------------

async function testActiveLendings() {
  const data = await gql<{ gotchiLendings: any[] }>(`
    query { gotchiLendings(first: 5, where: { cancelled: false, completed: false, borrower: null }) {
      id gotchiTokenId gotchiBRS period upfrontCost
      splitOwner splitBorrower splitOther
      whitelistId whitelist { id name }
      lender originalOwner channellingAllowed timeCreated
      gotchi { id name modifiedRarityScore }
    } }
  `);
  const ok = Array.isArray(data.gotchiLendings) && data.gotchiLendings.length > 0;
  record("Subgraph: ACTIVE_LENDINGS", ok, ok ? `${data.gotchiLendings.length} listings` : "no listings");
  return data.gotchiLendings;
}

async function testLendingById(id: string) {
  const data = await gql<{ gotchiLending: any }>(
    `query Q($id: ID!) { gotchiLending(id: $id) { id gotchiTokenId borrower cancelled completed timeAgreed } }`,
    { id }
  );
  record("Subgraph: LENDING_BY_ID", !!data.gotchiLending, `id=${id} → ${data.gotchiLending ? "found" : "missing"}`);
}

async function testHistorical() {
  const since = Math.floor(Date.now() / 1000) - 30 * 86400;
  const data = await gql<{ gotchiLendings: any[] }>(
    `query Q($since: BigInt!) { gotchiLendings(first: 10, where: { timeAgreed_gt: $since }, orderBy: timeAgreed, orderDirection: desc) { id timeAgreed upfrontCost gotchi { name } } }`,
    { since: String(since) }
  );
  record("Subgraph: HISTORICAL_LENDINGS (30d)", data.gotchiLendings.length > 0, `${data.gotchiLendings.length} agreed last 30d`);
}

async function testWhitelistsForAddress() {
  // Public lender from earlier research — Fantasma whitelist owner-ish
  const addr = "0xc4cb6cb969e8b4e309ab98e4da51b77887afad96"; // user's wallet
  const data = await gql<{ asMember: any[]; asOwner: any[] }>(
    `query Q($address: String!) {
      asMember: whitelists(first: 50, where: { members_contains: [$address] }) { id name }
      asOwner: whitelists(first: 50, where: { ownerAddress: $address }) { id name }
    }`,
    { address: addr }
  );
  record(
    "Subgraph: WHITELISTS_FOR_ADDRESS",
    Array.isArray(data.asMember) && Array.isArray(data.asOwner),
    `member-of=${data.asMember.length}, owner-of=${data.asOwner.length}`
  );
}

// --- Backend ------------------------------------------------------------------

async function testApiHealth() {
  try {
    const res = await fetch(`${PROD_API}/health`, { signal: AbortSignal.timeout(15_000) });
    if (!res.ok) {
      record("API: health (prod)", false, `HTTP ${res.status}`);
      return;
    }
    const json = await res.json();
    record(
      "API: health (prod)",
      json.ok === true && typeof json.operator === "string",
      `operator=${json.operator?.slice(0, 8)}…, enabledCount=${json.enabledCount}`
    );
  } catch (err: any) {
    record("API: health (prod)", false, err?.message ?? String(err));
  }
}

async function testApiListingsForOwner() {
  try {
    const res = await fetch(
      `${PROD_API}/listings/0xc4cb6cb969e8b4e309ab98e4da51b77887afad96`,
      { signal: AbortSignal.timeout(15_000) }
    );
    if (!res.ok) {
      record("API: GET /listings/:owner", false, `HTTP ${res.status}`);
      return;
    }
    const json = await res.json();
    record(
      "API: GET /listings/:owner",
      Array.isArray(json),
      `${json.length} templates registered`
    );
  } catch (err: any) {
    record("API: GET /listings/:owner", false, err?.message ?? String(err));
  }
}

// --- Contract (viem read-only) ------------------------------------------------

async function testContractReads() {
  const client = createPublicClient({
    chain: base,
    transport: http("https://mainnet.base.org"),
  });

  try {
    const balance = await client.getBalance({ address: HOT_WALLET as `0x${string}` });
    const eth = Number(balance) / 1e18;
    record("Contract: hot wallet ETH balance", balance > 0n, `${eth.toFixed(6)} ETH`);
  } catch (err: any) {
    record("Contract: hot wallet ETH balance", false, err?.message ?? String(err));
  }

  try {
    const ghstBalance = await client.readContract({
      address: GHST_BASE as `0x${string}`,
      abi: [{ name: "balanceOf", type: "function", stateMutability: "view", inputs: [{ name: "a", type: "address" }], outputs: [{ name: "", type: "uint256" }] }],
      functionName: "balanceOf",
      args: [HOT_WALLET as `0x${string}`],
    });
    const ghst = Number(ghstBalance) / 1e18;
    record("Contract: GHST balance of hot wallet", true, `${ghst.toFixed(2)} GHST (expected: 0; this wallet only does listings)`);
  } catch (err: any) {
    record("Contract: GHST balance of hot wallet", false, err?.message ?? String(err));
  }

  try {
    // Verify the diamond is reachable + has bytecode
    const code = await client.getCode({ address: DIAMOND_BASE as `0x${string}` });
    const ok = !!code && code !== "0x";
    record("Contract: Aavegotchi diamond bytecode", ok, ok ? `${code!.length} chars` : "no bytecode at address");
  } catch (err: any) {
    record("Contract: Aavegotchi diamond bytecode", false, err?.message ?? String(err));
  }
}

// --- HTTP smoke ---------------------------------------------------------------

async function testSiteHtml(label: string, url: string) {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(15_000) });
    if (!res.ok) {
      record(label, false, `HTTP ${res.status}`);
      return;
    }
    const html = await res.text();
    const looksRight = html.includes("<title>GotchiCloset") || html.includes("/assets/index-");
    record(label, looksRight, looksRight ? `OK (${html.length} bytes)` : "html missing expected markers");
  } catch (err: any) {
    record(label, false, err?.message ?? String(err));
  }
}

// --- Run ----------------------------------------------------------------------

(async () => {
  console.log("\n=== Lending integration tests ===\n");
  console.log("Subgraph...");
  const lendings = await testActiveLendings();
  if (lendings && lendings.length) {
    await testLendingById(lendings[0].id);
  }
  await testHistorical();
  await testWhitelistsForAddress();

  console.log("\nBackend...");
  await testApiHealth();
  await testApiListingsForOwner();

  console.log("\nContract reads...");
  await testContractReads();

  console.log("\nHTTP smoke...");
  await testSiteHtml("HTTP: prod homepage", PROD_SITE);
  await testSiteHtml("HTTP: prod /lending", `${PROD_SITE}/lending`);
  await testSiteHtml("HTTP: dev homepage", DEV_SITE);
  await testSiteHtml("HTTP: dev /lending", `${DEV_SITE}/lending`);

  console.log("\n=== Summary ===");
  const passed = results.filter((r) => r.ok).length;
  const failed = results.filter((r) => !r.ok).length;
  console.log(`${passed} passed, ${failed} failed (${results.length} total)`);
  if (failed > 0) {
    console.log("\nFailures:");
    for (const r of results.filter((r) => !r.ok)) {
      console.log(`  ❌ ${r.name}: ${r.detail}`);
    }
    process.exit(1);
  }
})();
