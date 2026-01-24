import { useMemo } from "react";
import { Link, useParams } from "react-router-dom";
import wearableSets from "../../data/wearableSets.json";
import wearables from "../../data/wearables.json";
import { Seo } from "@/components/Seo";
import { siteUrl } from "@/lib/site";
import { toSlug } from "@/lib/slug";
import { TRAIT_KEYS } from "@/lib/constants";

type WearableSet = {
  id: string;
  name: string;
  wearableIds: number[];
  traitBonuses: number[];
  setBonusBRS?: number;
};

type Wearable = {
  id: number;
  name: string;
  traitModifiers: number[];
  rarity?: string;
};

const sets = wearableSets as WearableSet[];
const allWearables = wearables as Wearable[];

export default function SetPage() {
  const { slug } = useParams();
  const set = useMemo(
    () => sets.find((s) => toSlug(s.name) === slug),
    [slug]
  );

  if (!set) {
    return (
      <div className="min-h-screen bg-background">
        <div className="mx-auto w-full max-w-3xl px-4 py-10">
          <h1 className="text-2xl font-semibold">Set not found</h1>
          <p className="text-sm text-muted-foreground">
            Try the <Link className="underline" to="/sets">sets index</Link>.
          </p>
        </div>
      </div>
    );
  }

  const requiredWearables = set.wearableIds
    .map((id) => allWearables.find((w) => w.id === id))
    .filter(Boolean) as Wearable[];

  const bonuses = TRAIT_KEYS.slice(0, 4).map((key, idx) => ({
    key,
    value: set.traitBonuses?.[idx] ?? 0,
  }));

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: `${set.name} Wearable Set`,
    url: siteUrl(`/sets/${toSlug(set.name)}`),
  };

  const relatedSets = sets
    .filter((s) => s.id !== set.id)
    .slice(0, 3);

  return (
    <div className="min-h-screen bg-background">
      <Seo
        title={`${set.name} Set – Aavegotchi Traits, Bonuses & Preview`}
        description={`See the ${set.name} wearable set, trait bonuses, rarity score impact, and preview it on your Aavegotchi.`}
        canonical={siteUrl(`/sets/${toSlug(set.name)}`)}
        jsonLd={jsonLd}
      />
      <div className="mx-auto w-full max-w-4xl px-4 py-10 space-y-6">
        <header className="space-y-2">
          <h1 className="text-2xl font-semibold">
            {set.name} Wearable Set
          </h1>
          <p className="text-sm text-muted-foreground">
            Required items, trait bonuses, and when this set is a good pick.
          </p>
          <div className="text-sm text-muted-foreground">
            <Link className="underline" to="/sets">All sets</Link>{" "}
            · <Link className="underline" to="/traits/nrg">Trait guides</Link>{" "}
            · <Link className="underline" to="/rarity-score">Rarity score</Link>
          </div>
        </header>

        <section className="rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--surface))] p-4">
          <h2 className="text-base font-semibold">Trait bonuses</h2>
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
        </section>

        <section className="space-y-2">
          <h2 className="text-base font-semibold">Required wearables</h2>
          <ul className="list-disc pl-5 text-sm text-muted-foreground">
            {requiredWearables.map((wearable) => (
              <li key={wearable.id}>
                <Link className="underline" to={`/wearable/${toSlug(wearable.name)}`}>
                  {wearable.name}
                </Link>
              </li>
            ))}
          </ul>
        </section>

        <section className="space-y-2">
          <h2 className="text-base font-semibold">When it’s good</h2>
          <ul className="list-disc pl-5 text-sm text-muted-foreground">
            {bonuses
              .filter((b) => b.value > 0)
              .map((bonus) => (
                <li key={bonus.key}>
                  Helps builds that want more {bonus.key}.
                </li>
              ))}
            {bonuses.every((b) => b.value === 0) && (
              <li>Best for cosmetic cohesion or set bonus scoring.</li>
            )}
          </ul>
        </section>

        <section className="space-y-2">
          <h2 className="text-base font-semibold">Related sets</h2>
          <ul className="list-disc pl-5 text-sm text-muted-foreground">
            {relatedSets.map((s) => (
              <li key={s.id}>
                <Link className="underline" to={`/sets/${toSlug(s.name)}`}>
                  {s.name}
                </Link>
              </li>
            ))}
          </ul>
        </section>

        <div className="text-sm text-muted-foreground">
          Preview on your Gotchi in the{" "}
          <Link className="underline" to="/">fitting room</Link>.
        </div>
      </div>
    </div>
  );
}

