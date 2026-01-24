import { Card } from "@/ui/card";
import type { Gotchi } from "@/types";

type GotchiListProps = {
  title: string;
  owner: string;
  gotchis: Gotchi[];
  isLoading: boolean;
  error?: string;
  listTestId?: string;
  ownerTestId?: string;
};

export function GotchiList({
  title,
  owner,
  gotchis,
  isLoading,
  error,
  listTestId,
  ownerTestId,
}: GotchiListProps) {
  return (
    <section className="space-y-3" data-testid={listTestId}>
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-foreground">{title}</h3>
        <span className="text-xs text-muted-foreground" data-testid={ownerTestId}>
          {owner}
        </span>
      </div>
      {isLoading ? (
        <div className="text-sm text-muted-foreground">Loading gotchis...</div>
      ) : error ? (
        <div className="text-sm text-red-500">{error}</div>
      ) : gotchis.length === 0 ? (
        <div className="text-sm text-muted-foreground">
          No gotchis found for this address.
        </div>
      ) : (
        <div className="grid gap-2 sm:grid-cols-2">
          {gotchis.map((gotchi) => (
            <Card key={gotchi.id} className="p-3" data-testid="gotchi-card">
              <div className="text-sm font-medium text-foreground">
                {gotchi.name}
              </div>
              <div className="text-xs text-muted-foreground">
                ID: {gotchi.gotchiId || gotchi.id}
              </div>
            </Card>
          ))}
        </div>
      )}
    </section>
  );
}

