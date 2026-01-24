import { Helmet } from "react-helmet-async";

type SeoProps = {
  title: string;
  description: string;
  canonical?: string;
  jsonLd?: Record<string, unknown> | Record<string, unknown>[];
};

const DEFAULT_SITE =
  import.meta.env.VITE_SITE_URL || "https://gotchicloset.xyz";

export function Seo({ title, description, canonical, jsonLd }: SeoProps) {
  const canonicalUrl = canonical || DEFAULT_SITE;
  const jsonLdArray = Array.isArray(jsonLd) ? jsonLd : jsonLd ? [jsonLd] : [];

  return (
    <Helmet>
      <title>{title}</title>
      <meta name="description" content={description} />
      <link rel="canonical" href={canonicalUrl} />
      {jsonLdArray.map((block, idx) => (
        <script
          key={idx}
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(block) }}
        />
      ))}
    </Helmet>
  );
}

