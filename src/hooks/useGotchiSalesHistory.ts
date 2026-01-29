import { useState, useEffect } from "react";

const BAAZAAR_SUBGRAPH_URL =
  "https://api.goldsky.com/api/public/project_cmh3flagm0001r4p25foufjtt/subgraphs/aavegotchi-core-base/prod/gn";

export interface SaleRecord {
  id: string;
  seller: string;
  buyer: string;
  priceInWei: string;
  timePurchased: number;
  equippedWearables: number[];
}

const SALES_HISTORY_QUERY = `
  query GotchiSalesHistory($tokenId: BigInt!) {
    erc721Listings(
      first: 10
      where: { 
        tokenId: $tokenId
        category: 3
        sold: true
      }
      orderBy: timePurchased
      orderDirection: desc
    ) {
      id
      seller
      buyer
      priceInWei
      timePurchased
      gotchi {
        equippedWearables
      }
    }
  }
`;

export function useGotchiSalesHistory(tokenId: string | null) {
  const [sales, setSales] = useState<SaleRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!tokenId) {
      setSales([]);
      return;
    }

    setLoading(true);
    setError(null);

    fetch(BAAZAAR_SUBGRAPH_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        query: SALES_HISTORY_QUERY,
        variables: { tokenId },
      }),
    })
      .then((res) => res.json())
      .then((data) => {
        if (data.errors) {
          throw new Error(data.errors[0]?.message || "GraphQL error");
        }
        const listings = data.data?.erc721Listings || [];
        setSales(
          listings.map((l: any) => ({
            id: l.id,
            seller: l.seller,
            buyer: l.buyer,
            priceInWei: l.priceInWei,
            timePurchased: parseInt(l.timePurchased, 10),
            equippedWearables: l.gotchi?.equippedWearables?.map((w: string) => parseInt(w, 10)) || [],
          }))
        );
      })
      .catch((err) => {
        setError(err.message);
        setSales([]);
      })
      .finally(() => setLoading(false));
  }, [tokenId]);

  return { sales, loading, error };
}
