import { Link, useParams } from "react-router-dom";
import { Seo } from "@/components/Seo";
import { siteUrl } from "@/lib/site";

export default function GotchiPage() {
  const { tokenId } = useParams();
  const title = `Aavegotchi #${tokenId} – Wearables, Traits & Set Optimization`;

  return (
    <div className="min-h-screen bg-background">
      <Seo
        title={title}
        description={`Preview wearables, test sets, and optimize traits for Aavegotchi #${tokenId}.`}
        canonical={siteUrl(`/gotchi/${tokenId}`)}
      />
      <div className="mx-auto w-full max-w-4xl px-4 py-10 space-y-6">
        <header className="space-y-2">
          <h1 className="text-2xl font-semibold">
            Aavegotchi #{tokenId} Wearables & Trait Optimization
          </h1>
          <p className="text-sm text-muted-foreground">
            Use the fitting room to test sets and traits for this Gotchi.
          </p>
          <div className="text-sm text-muted-foreground">
            <Link className="underline" to="/sets">Wearable sets</Link>{" "}
            · <Link className="underline" to="/traits">Trait guides</Link>{" "}
            · <Link className="underline" to="/rarity-score">Rarity score</Link>
          </div>
        </header>

        <section className="space-y-2">
          <h2 className="text-base font-semibold">Best sets for this profile</h2>
          <p className="text-sm text-muted-foreground">
            Build recommendations are based on trait goals. Load a wallet in the
            fitting room to see real-time previews.
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-base font-semibold">Try a manual build</h2>
          <p className="text-sm text-muted-foreground">
            Swap wearables and test set bonuses against your current trait
            targets.
          </p>
        </section>

        <div className="text-sm text-muted-foreground">
          <Link className="underline" to="/">Open the fitting room</Link>
        </div>
      </div>
    </div>
  );
}

