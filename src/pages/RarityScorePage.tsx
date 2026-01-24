import { Link } from "react-router-dom";
import { Seo } from "@/components/Seo";
import { siteUrl } from "@/lib/site";

export default function RarityScorePage() {
  return (
    <div className="min-h-screen bg-background">
      <Seo
        title="Aavegotchi Rarity Score – Trait BRS, Wearables, Sets"
        description="Understand how Aavegotchi rarity score is calculated from traits, wearables, and set bonuses."
        canonical={siteUrl("/rarity-score")}
      />
      <div className="mx-auto w-full max-w-4xl px-4 py-10 space-y-6">
        <header className="space-y-2">
          <h1 className="text-2xl font-semibold">Aavegotchi Rarity Score</h1>
          <p className="text-sm text-muted-foreground">
            How trait BRS, wearables, and sets combine into total score.
          </p>
          <div className="text-sm text-muted-foreground">
            <Link className="underline" to="/traits">Trait guides</Link>{" "}
            · <Link className="underline" to="/sets">Wearable sets</Link>{" "}
            · <Link className="underline" to="/wearables">Wearables</Link>
          </div>
        </header>

        <section className="space-y-2">
          <h2 className="text-base font-semibold">Trait BRS</h2>
          <p className="text-sm text-muted-foreground">
            Each trait adds BRS based on how far it is from 50. Lower than 50
            uses 100 - t. At or above 50 uses t + 1.
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-base font-semibold">Wearables and sets</h2>
          <p className="text-sm text-muted-foreground">
            Wearables add flat BRS by rarity tier. Completed sets can add
            additional BRS and NRG/AGG/SPK/BRN modifiers.
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-base font-semibold">Use the fitting room</h2>
          <p className="text-sm text-muted-foreground">
            Test how each change affects total BRS in real time.
          </p>
          <Link className="underline text-sm" to="/">
            Open GotchiCloset
          </Link>
        </section>
      </div>
    </div>
  );
}

