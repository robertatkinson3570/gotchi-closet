import { Link } from "react-router-dom";
import { Seo } from "@/components/Seo";
import { siteUrl } from "@/lib/site";
import { TRAIT_KEYS, TRAIT_LABELS } from "@/lib/constants";

export default function TraitsIndexPage() {
  return (
    <div className="min-h-screen bg-background">
      <Seo
        title="Aavegotchi Traits – NRG, AGG, SPK, BRN, Eyes"
        description="Learn how each Aavegotchi trait affects builds, sets, and rarity scoring."
        canonical={siteUrl("/traits")}
      />
      <div className="mx-auto w-full max-w-4xl px-4 py-10 space-y-6">
        <header className="space-y-2">
          <h1 className="text-2xl font-semibold">Aavegotchi Traits</h1>
          <p className="text-sm text-muted-foreground">
            Quick guides for each trait and how it impacts builds and sets.
          </p>
          <div className="text-sm text-muted-foreground">
            <Link className="underline" to="/sets">Wearable sets</Link>{" "}
            · <Link className="underline" to="/rarity-score">Rarity score</Link>{" "}
            · <Link className="underline" to="/wearables">Wearables</Link>
          </div>
        </header>

        <div className="grid gap-3 sm:grid-cols-2">
          {TRAIT_KEYS.map((key, idx) => (
            <Link
              key={key}
              to={`/traits/${key.toLowerCase()}`}
              className="rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--surface))] p-4 text-sm hover:shadow-sm transition"
            >
              <div className="font-semibold">{TRAIT_LABELS[idx]}</div>
              <div className="text-muted-foreground text-xs mt-1">
                {key} builds and set synergies
              </div>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}

