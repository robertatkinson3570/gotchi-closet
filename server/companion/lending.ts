import { subgraphFetch } from "../aavegotchi/subgraphFetch";

// Same Base core subgraph the companion already uses (with SUBGRAPH_URL_BACKUP failover).
const CORE_SUBGRAPH =
  process.env.COMPANION_CORE_SUBGRAPH ||
  "https://api.goldsky.com/api/public/project_cmh3flagm0001r4p25foufjtt/subgraphs/aavegotchi-core-base/prod/gn";

// Active lendings (not cancelled, not completed) where the owner is the LENDER (rented out or
// still just listed) and where they are the BORROWER (renting in). Mirrors src/graphql/myLendingsQueries.
const QUERY = `query($a: Bytes!){
  asLender: gotchiLendings(first: 500, where: { lender: $a, cancelled: false, completed: false }){
    gotchiTokenId timeAgreed borrower gotchi { name }
  }
  asBorrower: gotchiLendings(first: 500, where: { borrower: $a, cancelled: false, completed: false }){
    gotchiTokenId gotchi { name }
  }
}`;

const ZERO = "0x0000000000000000000000000000000000000000";
const agreed = (l: any) => l.borrower && l.borrower.toLowerCase() !== ZERO && Number(l.timeAgreed ?? 0) > 0;

// A one-line summary of the owner's lending position — what they've rented OUT (agreed vs just
// listed) and what they're renting IN — injected into chat so the companion answers "what am I
// renting / do I own or rent these" from real data instead of guessing. null on failure.
export async function fetchLendingSummary(owner: string): Promise<string | null> {
  try {
    const res = await subgraphFetch({ query: QUERY, variables: { a: owner.toLowerCase() } }, { primary: CORE_SUBGRAPH });
    if (!res.ok) return null;
    const json: any = await res.json();
    const lender: any[] = json?.data?.asLender ?? [];
    const borrower: any[] = json?.data?.asBorrower ?? [];
    const rentedOut = lender.filter(agreed);
    const listed = lender.filter((l) => !agreed(l));

    if (!rentedOut.length && !listed.length && !borrower.length) {
      return "The owner has no active lendings right now — nothing rented out, nothing listed, nothing borrowed.";
    }
    const nm = (arr: any[]) => arr.map((l) => l.gotchi?.name || `#${l.gotchiTokenId}`).slice(0, 12).join(", ");
    const parts: string[] = [];
    if (rentedOut.length) parts.push(`rented OUT ${rentedOut.length} gotchi${rentedOut.length === 1 ? "" : "s"} to borrowers (${nm(rentedOut)})`);
    if (listed.length) parts.push(`listed ${listed.length} for rent, not yet taken (${nm(listed)})`);
    if (borrower.length) parts.push(`renting IN ${borrower.length} gotchi${borrower.length === 1 ? "" : "s"} from others (${nm(borrower)})`);
    return `The owner's lendings: ${parts.join("; ")}. These rented-out gotchis are still theirs (they earn the split) but are in a borrower's hands.`;
  } catch {
    return null;
  }
}
