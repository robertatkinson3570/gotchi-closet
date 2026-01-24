import { fetchGotchisByOwner } from "../src/graphql/fetchers.ts";
const gotchis = await fetchGotchisByOwner("0x1cf07f7c5853599dcaa5b3bb67ac0cf1ae7bdb82");
console.log(gotchis.length);
