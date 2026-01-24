import { Link, useParams } from "react-router-dom";
import wearables from "../../data/wearables.json";
import wearableSets from "../../data/wearableSets.json";
import { Seo } from "@/components/Seo";
import { siteUrl } from "@/lib/site";
import { toSlug } from "@/lib/slug";
import { TRAIT_KEYS } from "@/lib/constants";

type Wearable = {
  id: number;
  name: string;
  traitModifiers: number[];
  rarity?: string;
  slotPositions?: boolean[];
  setIds?: string[];
};

type WearableSet = {
  id: string;
  name: string;
};

const allWearables = wearables as Wearable[];
const sets = wearableSets as WearableSet[];

export default function WearablePage() {
  const { slug } = useParams();
  const wearable = allWearables.find((w) => toSlug(w.name) === slug);

  if (!wearable) {
    return (
      <div className="min-h-screen bg-background">
        <div className="mx-auto w-full max-w-3xl px-4 py-10">
          <h1 className="text-2xl font-semibold">Wearable not found</h1>
          <p className="text-sm text-muted-foreground">
            Browse <Link className="underline" to="/wearables">all wearables</Link>.
          </p>
        </div>
      </div>
    );
  }

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: `${wearable.name} Wearable`,
    url: siteUrl(`/wearable/${toSlug(wearable.name)}`),
  };

  const traitMods = TRAIT_KEYS.slice(0, 4).map((key, idx) => ({
    key,
    value: wearable.traitModifiers?.[idx] ?? 0,
  }));

  const slotNames = [
    "Body",
    "Face",
    "Eyes",
    "Head",
    "Left Hand",
    "Right Hand",
    "Pet",
    "Background",
  ];

  const slots = wearable.slotPositions
    ? slotNames.filter((_, idx) => wearable.slotPositions?.[idx])
    : [];

  const relatedSets =
    wearable.setIds?.map((id) => sets.find((s) => s.id === id)).filter(Boolean) ||
    [];

  return (
    <div className="min-h-screen bg-background">
      <Seo
        title={`${wearable.name} – Aavegotchi Wearable Traits & Slots`}
        description={`Trait modifiers, slot info, and set usage for ${wearable.name}.`}
        canonical={siteUrl(`/wearable/${toSlug(wearable.name)}`)}
        jsonLd={jsonLd}
      />
      <div className="mx-auto w-full max-w-4xl px-4 py-10 space-y-6">
        <header className="space-y-2">
          <h1 className="text-2xl font-semibold">{wearable.name}</h1>
          <p className="text-sm text-muted-foreground">
            Trait modifiers, slots, and set usage.
          </p>
          <div className="text-sm text-muted-foreground">
            <Link className="underline" to="/wearables">All wearables</Link>{" "}
            · <Link className="underline" to="/sets">Wearable sets</Link>{" "}
            · <Link className="underline" to="/traits">Trait guides</Link>
          </div>
        </header>

        <section className="rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--surface))] p-4">
          <h2 className="text-base font-semibold">Trait modifiers</h2>
          <div className="mt-2 text-sm text-muted-foreground">
            {traitMods.map((mod) => (
              <span key={mod.key} className="mr-3">
                {mod.key} {mod.value >= 0 ? `+${mod.value}` : mod.value}
              </span>
            ))}
          </div>
          <div className="mt-2 text-xs text-muted-foreground">
            Rarity: {wearable.rarity || "—"}
          </div>
        </section>

        <section className="space-y-2">
          <h2 className="text-base font-semibold">Slots</h2>
          <p className="text-sm text-muted-foreground">
            {slots.length > 0 ? slots.join(", ") : "Slot information unavailable."}
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-base font-semibold">Sets that include this wearable</h2>
          {relatedSets.length === 0 ? (
            <p className="text-sm text-muted-foreground">Not part of a set.</p>
          ) : (
            <ul className="list-disc pl-5 text-sm text-muted-foreground">
              {relatedSets.map((set) => (
                <li key={set!.id}>
                  <Link className="underline" to={`/sets/${toSlug(set!.name)}`}>
                    {set!.name}
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>

        <div className="text-sm text-muted-foreground">
          Preview it on your Gotchi in the{" "}
          <Link className="underline" to="/">fitting room</Link>.
        </div>
      </div>
    </div>
  );
}

