const SUBGRAPH_URL =
  "https://api.goldsky.com/api/public/project_cmh3flagm0001r4p25foufjtt/subgraphs/aavegotchi-core-base/prod/gn";

const queries = [
  {
    name: "timeAgreed = '0' AND cancelled=false",
    query: `query { gotchiLendings(first: 5, where: { cancelled: false, timeAgreed: "0" }) { id gotchiTokenId timeAgreed timeCreated } }`,
  },
  {
    name: "timeAgreed: 0 (number, not string)",
    query: `query { gotchiLendings(first: 5, where: { cancelled: false, timeAgreed: 0 }) { id gotchiTokenId timeAgreed timeCreated } }`,
  },
  {
    name: "completed=false AND borrower=null (alt approach)",
    query: `query { gotchiLendings(first: 5, where: { cancelled: false, completed: false, borrower: null }) { id gotchiTokenId timeAgreed timeCreated borrower } }`,
  },
  {
    name: "Just first 5 with NO filter to see field shapes",
    query: `query { gotchiLendings(first: 5) { id gotchiTokenId timeAgreed cancelled completed borrower } }`,
  },
  {
    name: "Total count via skip - active listings approx",
    query: `query { gotchiLendings(first: 1000, where: { cancelled: false, timeAgreed: "0" }) { id } }`,
  },
];

(async () => {
  for (const q of queries) {
    const res = await fetch(SUBGRAPH_URL, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ query: q.query }),
    });
    const json = await res.json();
    console.log(`\n=== ${q.name} ===`);
    if (json.errors) {
      console.log("ERRORS:", JSON.stringify(json.errors, null, 2));
    } else {
      const lendings = json.data?.gotchiLendings ?? [];
      console.log(`returned ${lendings.length} rows`);
      if (lendings.length && q.name.startsWith("Total")) {
        console.log("(truncated)");
      } else {
        console.log(JSON.stringify(lendings.slice(0, 3), null, 2));
      }
    }
  }
})();
