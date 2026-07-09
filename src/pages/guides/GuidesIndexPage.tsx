import { Link } from "react-router-dom";
import { Seo } from "@/components/Seo";
import { siteUrl } from "@/lib/site";
import { GUIDES } from "./guides";

export default function GuidesIndexPage() {
  const jsonLd = [
    {
      "@context": "https://schema.org",
      "@type": "CollectionPage",
      name: "Aavegotchi Guides",
      url: siteUrl("/guides"),
      description:
        "Base-era Aavegotchi guides: getting started, the Base migration, rarity farming, kinship, the Forge, GHST, the Baazaar, lending, sets, battler builds, and valuation.",
      isPartOf: { "@id": "https://www.gotchicloset.com/#website" },
      mainEntity: {
        "@type": "ItemList",
        itemListElement: GUIDES.map((g, i) => ({
          "@type": "ListItem",
          position: i + 1,
          name: g.title,
          url: siteUrl(`/guides/${g.slug}`),
        })),
      },
    },
  ];

  return (
    <div className="min-h-screen bg-background">
      <Seo
        title="Aavegotchi Guides: Base-Era Explainers for Every Mechanic"
        description="Twelve up-to-date Aavegotchi guides for the Base era: getting started, the migration, rarity farming, kinship, the Forge, GHST, the Baazaar, lending, sets, battler builds, and valuation."
        canonical={siteUrl("/guides")}
        jsonLd={jsonLd}
      />
      <div className="mx-auto w-full max-w-3xl px-4 py-10 space-y-8">
        <header className="space-y-2">
          <h1 className="text-2xl font-semibold">Aavegotchi Guides</h1>
          <p className="text-sm text-muted-foreground">
            Written for the Base era (Aavegotchi migrated from Polygon to Base
            on July 25, 2025), so nothing here describes retired Polygon-era
            mechanics as current. Each guide links to the live GotchiCloset
            tool that puts it into practice.
          </p>
        </header>

        <ul className="space-y-3">
          {GUIDES.map((g) => (
            <li
              key={g.slug}
              className="rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--surface))] p-4"
            >
              <Link
                className="text-sm font-semibold underline"
                to={`/guides/${g.slug}`}
              >
                {g.title}
              </Link>
              <p className="mt-1 text-sm text-muted-foreground">{g.short}</p>
            </li>
          ))}
        </ul>

        <div className="text-sm text-muted-foreground">
          Prefer tools to prose? Start with the{" "}
          <Link className="underline" to="/dress">
            dressing room
          </Link>
          , the{" "}
          <Link className="underline" to="/wardrobe-lab">
            Wardrobe Lab optimizer
          </Link>
          , or the{" "}
          <Link className="underline" to="/baazaar">
            Baazaar explorer
          </Link>
          .
        </div>
      </div>
    </div>
  );
}
