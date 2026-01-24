import { Link, useParams } from "react-router-dom";
import { Seo } from "@/components/Seo";
import { siteUrl } from "@/lib/site";
import { TRAIT_KEYS, TRAIT_LABELS } from "@/lib/constants";
import wearableSets from "../../data/wearableSets.json";
import wearables from "../../data/wearables.json";
import { toSlug } from "@/lib/slug";

type WearableSet = {
  id: string;
  name: string;
  wearableIds: number[];
  traitBonuses: number[];
};

type Wearable = {
  id: number;
  name: string;
  traitModifiers: number[];
};

const sets = wearableSets as WearableSet[];
const allWearables = wearables as Wearable[];

export default function TraitPage() {
  const { trait } = useParams();
  const traitIndex = TRAIT_KEYS.findIndex(
    (key) => key.toLowerCase() === trait
  );
  const traitKey = TRAIT_KEYS[traitIndex];
  const traitLabel = TRAIT_LABELS[traitIndex];

  if (traitIndex < 0) {
    return (
      <div className="min-h-screen bg-background">
        <div className="mx-auto w-full max-w-3xl px-4 py-10">
          <h1 className="text-2xl font-semibold">Trait not found</h1>
          <p className="text-sm text-muted-foreground">
            See all <Link className="underline" to="/traits">traits</Link>.
          </p>
        </div>
      </div>
    );
  }

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: `${traitKey} Trait in Aavegotchi`,
    url: siteUrl(`/traits/${traitKey.toLowerCase()}`),
  };

  const boostingSets =
    traitIndex < 4
      ? sets.filter((set) => (set.traitBonuses?.[traitIndex] || 0) > 0)
      : [];

  const boostingWearables = allWearables
    .filter((w) => (w.traitModifiers?.[traitIndex] || 0) > 0)
    .slice(0, 20);

  return (
    <div className="min-h-screen bg-background">
      <Seo
        title={`${traitKey} Trait in Aavegotchi – How It Affects Builds & Sets`}
        description={`Learn what ${traitKey} does, how it impacts builds, and which wearables or sets boost ${traitKey}.`}
        canonical={siteUrl(`/traits/${traitKey.toLowerCase()}`)}
        jsonLd={jsonLd}
      />
      <div className="mx-auto w-full max-w-4xl px-4 py-10 space-y-6">
        <header className="space-y-2">
          <h1 className="text-2xl font-semibold">
            {traitLabel} ({traitKey}) in Aavegotchi
          </h1>
          <p className="text-sm text-muted-foreground">
            How this trait shapes builds and what to look for in sets.
          </p>
          <div className="text-sm text-muted-foreground">
            <Link className="underline" to="/traits">All traits</Link>{" "}
            · <Link className="underline" to="/sets">Wearable sets</Link>{" "}
            · <Link className="underline" to="/rarity-score">Rarity score</Link>
          </div>
        </header>

        <section className="space-y-2">
          <h2 className="text-base font-semibold">What it affects</h2>
          <p className="text-sm text-muted-foreground">
            {traitLabel} influences how your Gotchi performs and which sets feel
            optimal for your build.
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-base font-semibold">Sets that boost {traitKey}</h2>
          {boostingSets.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No set bonuses directly affect this trait.
            </p>
          ) : (
            <ul className="list-disc pl-5 text-sm text-muted-foreground">
              {boostingSets.slice(0, 8).map((set) => (
                <li key={set.id}>
                  <Link className="underline" to={`/sets/${toSlug(set.name)}`}>
                    {set.name}
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="space-y-2">
          <h2 className="text-base font-semibold">Wearables with +{traitKey}</h2>
          {boostingWearables.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No wearables provide a positive modifier for this trait.
            </p>
          ) : (
            <ul className="list-disc pl-5 text-sm text-muted-foreground">
              {boostingWearables.map((wearable) => (
                <li key={wearable.id}>
                  <Link className="underline" to={`/wearable/${toSlug(wearable.name)}`}>
                    {wearable.name}
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>

        <div className="text-sm text-muted-foreground">
          Try a full build in the{" "}
          <Link className="underline" to="/">fitting room</Link>.
        </div>
      </div>
    </div>
  );
}

