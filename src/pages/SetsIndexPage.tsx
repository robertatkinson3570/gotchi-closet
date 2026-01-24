import wearableSets from "../../data/wearableSets.json";
import { Seo } from "@/components/Seo";
import { siteUrl } from "@/lib/site";
import { toSlug } from "@/lib/slug";
import { Link } from "react-router-dom";
import { TRAIT_KEYS } from "@/lib/constants";

type WearableSet = {
  id: string;
  name: string;
  wearableIds: number[];
  traitBonuses: number[];
  setBonusBRS?: number;
};

const sets = wearableSets as WearableSet[];

export default function SetsIndexPage() {
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "ItemList",
    itemListElement: sets.map((set, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: set.name,
      url: siteUrl(`/sets/${toSlug(set.name)}`),
    })),
  };

  return (
    <div className="min-h-screen bg-background">
      <Seo
        title="Aavegotchi Wearable Sets – Bonuses, Traits, and Previews"
        description="Browse all Aavegotchi wearable sets with trait bonuses, requirements, and live previews on your Gotchi."
        canonical={siteUrl("/sets")}
        jsonLd={jsonLd}
      />
      <div className="mx-auto w-full max-w-5xl px-4 py-10 space-y-6">
        <header className="space-y-2">
          <h1 className="text-2xl font-semibold">
            All Aavegotchi Wearable Sets
          </h1>
          <p className="text-sm text-muted-foreground">
            Every full set, its required wearables, and how it changes NRG/AGG/SPK/BRN.
          </p>
          <div className="text-sm text-muted-foreground">
            <Link className="underline" to="/traits/nrg">Trait guides</Link>{" "}
            · <Link className="underline" to="/rarity-score">Rarity score</Link>{" "}
            · <Link className="underline" to="/wearables">Wearables</Link>
          </div>
        </header>

        <div className="grid gap-4 sm:grid-cols-2">
          {sets.map((set) => {
            const bonuses = TRAIT_KEYS.slice(0, 4).map((key, idx) => ({
              key,
              value: set.traitBonuses?.[idx] ?? 0,
            }));
            return (
              <div
                key={set.id}
                className="rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--surface))] p-4"
              >
                <div className="flex items-center justify-between">
                  <h2 className="text-base font-semibold">
                    <Link className="underline" to={`/sets/${toSlug(set.name)}`}>
                      {set.name}
                    </Link>
                  </h2>
                  <span className="text-xs text-muted-foreground">
                    {set.wearableIds.length} items
                  </span>
                </div>
                <div className="mt-2 text-sm text-muted-foreground">
                  {bonuses.map((bonus) => (
                    <span key={bonus.key} className="mr-3">
                      {bonus.key} {bonus.value >= 0 ? `+${bonus.value}` : bonus.value}
                    </span>
                  ))}
                </div>
                <div className="mt-2 text-xs text-muted-foreground">
                  Rarity boost: {set.setBonusBRS ?? "—"}
                </div>
              </div>
            );
          })}
        </div>

        <section className="text-sm text-muted-foreground">
          <p>
            Want to preview a set on your Gotchi? Open the fitting room and load
            your wallet address.
          </p>
          <Link className="underline" to="/">Go to fitting room</Link>
        </section>
      </div>
    </div>
  );
}

