const SUBGRAPH_URL =
  "https://api.goldsky.com/api/public/project_cmh3flagm0001r4p25foufjtt/subgraphs/aavegotchi-core-base/prod/gn";

async function gql<T = any>(query: string): Promise<T> {
  const res = await fetch(SUBGRAPH_URL, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ query }),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const json = await res.json();
  if (json.errors) throw new Error(JSON.stringify(json.errors));
  return json.data as T;
}

async function listQueryType() {
  const data = await gql<{ __schema: { queryType: { fields: Array<{ name: string }> } } }>(
    `query { __schema { queryType { fields { name } } } }`
  );
  const names = data.__schema.queryType.fields.map((f) => f.name);
  const lend = names.filter((n) => /lend|rent|borrow|whitelist/i.test(n));
  console.log("Lending-related root queries:", lend);
  return lend;
}

async function listType(typeName: string) {
  const data = await gql<{ __type: { fields: Array<{ name: string; type: any }> } | null }>(
    `query { __type(name: "${typeName}") { fields { name type { kind name ofType { kind name ofType { kind name } } } } } }`
  );
  if (!data.__type) {
    console.log(`Type ${typeName} not found`);
    return;
  }
  console.log(`\n=== ${typeName} fields ===`);
  for (const f of data.__type.fields) {
    const tn = f.type?.name || f.type?.ofType?.name || f.type?.ofType?.ofType?.name || JSON.stringify(f.type);
    console.log(`  ${f.name}: ${tn}`);
  }
}

async function run() {
  await listQueryType();
  for (const t of [
    "GotchiLending",
    "Lending",
    "Whitelist",
    "Aavegotchi",
  ]) {
    await listType(t);
  }
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
