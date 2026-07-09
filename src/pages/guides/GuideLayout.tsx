import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { Seo } from "@/components/Seo";
import { siteUrl } from "@/lib/site";
import { getGuide } from "./guides";

export type GuideFaq = { q: string; a: string };

// All guides were first published together on this date; per-page updates bump
// the `updated` props on that page only.
const PUBLISHED_ISO = "2026-07-09";

type GuideLayoutProps = {
  slug: string;
  seoTitle: string;
  seoDescription: string;
  h1: string;
  dek: string;
  /** Human-readable update stamp, e.g. "July 9, 2026" (freshness signal). */
  updated: string;
  /** ISO date matching `updated`, used for Article dateModified. */
  updatedIso: string;
  /** Answer-first opening paragraph: a direct answer to the target query. */
  lead: ReactNode;
  faqs: GuideFaq[];
  /** Slugs of related guides rendered in the footer. */
  related: string[];
  /** Extra JSON-LD blocks (e.g. HowTo) describing visible content only. */
  extraJsonLd?: Record<string, unknown>[];
  children: ReactNode;
};

export function GuideSection({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <section className="space-y-2">
      <h2 className="text-lg font-semibold">{title}</h2>
      <div className="space-y-2 text-sm leading-relaxed text-muted-foreground">
        {children}
      </div>
    </section>
  );
}

export function GuideLayout({
  slug,
  seoTitle,
  seoDescription,
  h1,
  dek,
  updated,
  updatedIso,
  lead,
  faqs,
  related,
  extraJsonLd,
  children,
}: GuideLayoutProps) {
  const canonical = siteUrl(`/guides/${slug}`);

  const jsonLd: Record<string, unknown>[] = [
    {
      "@context": "https://schema.org",
      "@type": "Article",
      headline: h1,
      description: seoDescription,
      url: canonical,
      mainEntityOfPage: canonical,
      datePublished: PUBLISHED_ISO,
      dateModified: updatedIso,
      author: {
        "@type": "Organization",
        name: "GotchiCloset",
        url: siteUrl("/"),
      },
      publisher: {
        "@type": "Organization",
        name: "GotchiCloset",
        url: siteUrl("/"),
      },
      isPartOf: { "@id": "https://www.gotchicloset.com/#website" },
    },
    {
      "@context": "https://schema.org",
      "@type": "FAQPage",
      mainEntity: faqs.map((f) => ({
        "@type": "Question",
        name: f.q,
        acceptedAnswer: { "@type": "Answer", text: f.a },
      })),
    },
    ...(extraJsonLd ?? []),
  ];

  const relatedGuides = related
    .map((s) => getGuide(s))
    .filter((g): g is NonNullable<typeof g> => Boolean(g));

  return (
    <div className="min-h-screen bg-background">
      <Seo
        title={seoTitle}
        description={seoDescription}
        canonical={canonical}
        jsonLd={jsonLd}
      />
      <article className="mx-auto w-full max-w-3xl px-4 py-10 space-y-8">
        <header className="space-y-2">
          <div className="text-xs text-muted-foreground">
            <Link className="underline" to="/guides">
              Guides
            </Link>{" "}
            · Updated {updated}
          </div>
          <h1 className="text-2xl font-semibold">{h1}</h1>
          <p className="text-sm text-muted-foreground">{dek}</p>
        </header>

        <p className="text-sm leading-relaxed">{lead}</p>

        {children}

        <section className="space-y-3">
          <h2 className="text-lg font-semibold">Frequently asked questions</h2>
          {faqs.map((f) => (
            <div
              key={f.q}
              className="rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--surface))] p-4"
            >
              <h3 className="text-sm font-semibold">{f.q}</h3>
              <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
                {f.a}
              </p>
            </div>
          ))}
        </section>

        {relatedGuides.length > 0 && (
          <footer className="space-y-2 border-t border-[hsl(var(--border))] pt-6">
            <h2 className="text-lg font-semibold">Related guides</h2>
            <ul className="list-disc pl-5 text-sm text-muted-foreground">
              {relatedGuides.map((g) => (
                <li key={g.slug}>
                  <Link className="underline" to={`/guides/${g.slug}`}>
                    {g.title}
                  </Link>
                  : {g.short}
                </li>
              ))}
            </ul>
            <p className="text-sm text-muted-foreground">
              Or browse{" "}
              <Link className="underline" to="/guides">
                all Aavegotchi guides
              </Link>
              .
            </p>
          </footer>
        )}
      </article>
    </div>
  );
}
