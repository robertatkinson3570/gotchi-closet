const endpoint =
  "https://api.goldsky.com/api/public/project_cmh3flagm0001r4p25foufjtt/subgraphs/aavegotchi-core-base/prod/gn";

const query = `
  query IntrospectAavegotchiType {
    __type(name: "Aavegotchi") {
      fields { name type { kind name ofType { kind name } } }
    }
  }
`;

async function run() {
  const res = await fetch(endpoint, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ query }),
  });
  const json = await res.json();
  const fields = json?.data?.__type?.fields || [];
  const names = fields.map((f: any) => f.name);
  const keywords = ["base", "original", "numeric", "skill", "spirit", "respec"];
  const matches = names.filter((name: string) =>
    keywords.some((keyword) => name.toLowerCase().includes(keyword))
  );
  console.log("Potential baseline/skill fields:", matches);
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});

