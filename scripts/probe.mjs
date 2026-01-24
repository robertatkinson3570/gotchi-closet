const endpoint = "https://api.goldsky.com/api/public/project_cmh3flagm0001r4p25foufjtt/subgraphs/aavegotchi-core-base/prod/gn";
const owner = "0x1cf07f7c5853599dcaa5b3bb67ac0cf1ae7bdb82";
const query = `query($owner: ID!){ user(id: $owner){ id gotchisOwned { id name numericTraits equippedWearables baseRarityScore hauntId collateral } } }`;
fetch(endpoint, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ query, variables: { owner } })
})
  .then((res) => res.json())
  .then((json) => console.log(JSON.stringify(json)))
  .catch((err) => console.error(err));
