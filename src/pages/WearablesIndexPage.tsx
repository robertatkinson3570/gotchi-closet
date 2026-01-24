import { Link } from "react-router-dom";
import wearables from "../../data/wearables.json";
import { Seo } from "@/components/Seo";
import { siteUrl } from "@/lib/site";
import { toSlug } from "@/lib/slug";

type Wearable = {
  id: number;
  name: string;
  rarity?: string;
};

const allWearables = wearables as Wearable[];

export default function WearablesIndexPage() {
  return (
    <div className="min-h-screen bg-background">
      <Seo
        title="Aavegotchi Wearables – Stats, Slots, and Build Ideas"
        description="Browse Aavegotchi wearables with trait modifiers and slot info."
        canonical={siteUrl("/wearables")}
      />
      <div className="mx-auto w-full max-w-5xl px-4 py-10 space-y-6">
        <header className="space-y-2">
          <h1 className="text-2xl font-semibold">Aavegotchi Wearables</h1>
          <p className="text-sm text-muted-foreground">
            A quick index of wearables with links to their trait modifiers.
          </p>
          <div className="text-sm text-muted-foreground">
            <Link className="underline" to="/sets">Wearable sets</Link>{" "}
            · <Link className="underline" to="/traits">Trait guides</Link>{" "}
            · <Link className="underline" to="/rarity-score">Rarity score</Link>
          </div>
        </header>

        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {allWearables.map((wearable) => (
            <Link
              key={wearable.id}
              to={`/wearable/${toSlug(wearable.name)}`}
              className="rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--surface))] p-3 text-sm hover:shadow-sm transition"
            >
              <div className="font-medium">{wearable.name}</div>
              <div className="text-xs text-muted-foreground">
                {wearable.rarity || "—"}
              </div>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}

