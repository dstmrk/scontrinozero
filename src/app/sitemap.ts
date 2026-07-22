import type { MetadataRoute } from "next";
import { categorySlugs } from "@/lib/per/categories";
import { confrontoContent } from "@/lib/confronto/comparisons";
import { guideArticles, guideSlugs } from "@/lib/guide/articles";
import { helpArticles, helpSlugs } from "@/lib/help/articles";
import { toolSlugs } from "@/lib/strumenti/tools";
import { marketingBaseUrl } from "@/lib/seo-indexable";

// Base = apex marketing (non NEXT_PUBLIC_APP_URL, che è il dominio app): gli URL
// in sitemap devono stare sull'host indicizzabile, mai su quello in noindex.
const baseUrl = marketingBaseUrl();

// Le pagine senza data nel registry (statiche, /per, /strumenti, legal) usano
// una data hand-maintained: bump quando il contenuto cambia davvero. Meglio una
// data stabile e onesta di un `new Date()` a ogni build, che azzera il segnale
// di freshness per i crawler.
const STATIC_PAGES_UPDATED = new Date("2026-07-22");
const LEGAL_PAGES_UPDATED = new Date("2026-07-12");

/** Massimo (lessicografico, valido su date ISO) di una lista di date YYYY-MM-DD. */
function maxIsoDate(dates: readonly string[]): Date {
  const max = dates.toSorted((a, b) => a.localeCompare(b)).at(-1);
  if (!max) {
    throw new Error("maxIsoDate requires at least one date");
  }
  return new Date(max);
}

const guideHubLastModified = maxIsoDate(
  guideSlugs.map((slug) => guideArticles[slug].updatedAt),
);
const helpHubLastModified = maxIsoDate(
  helpSlugs.map((slug) => helpArticles[slug].dateModified),
);

const marketingPages = ["/prezzi", "/funzionalita"].map((path) => ({
  url: `${baseUrl}${path}`,
  lastModified: STATIC_PAGES_UPDATED,
  changeFrequency: "monthly" as const,
  priority: 0.8,
}));

const categoryLandingPages = categorySlugs.map((slug) => ({
  url: `${baseUrl}/per/${slug}`,
  lastModified: STATIC_PAGES_UPDATED,
  changeFrequency: "monthly" as const,
  priority: 0.7,
}));

const toolPages = toolSlugs.map((slug) => ({
  url: `${baseUrl}/strumenti/${slug}`,
  lastModified: STATIC_PAGES_UPDATED,
  changeFrequency: "monthly" as const,
  priority: 0.6,
}));

const guidePages = guideSlugs.map((slug) => ({
  url: `${baseUrl}/guide/${slug}`,
  lastModified: new Date(guideArticles[slug].updatedAt),
  changeFrequency: "monthly" as const,
  priority: 0.7,
}));

const helpPages = helpSlugs.map((slug) => ({
  url: `${baseUrl}/help/${slug}`,
  lastModified: new Date(helpArticles[slug].dateModified),
  changeFrequency: "monthly" as const,
  priority: 0.6,
}));

const legalPages = [
  "/privacy",
  "/privacy/v01",
  "/termini",
  "/termini/v01",
  "/cookie-policy",
  "/cookie-policy/v01",
].map((path) => ({
  url: `${baseUrl}${path}`,
  lastModified: LEGAL_PAGES_UPDATED,
  changeFrequency: "yearly" as const,
  priority: 0.3,
}));

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    {
      url: baseUrl,
      lastModified: STATIC_PAGES_UPDATED,
      changeFrequency: "monthly",
      priority: 1,
    },
    ...marketingPages,
    {
      url: `${baseUrl}/per`,
      lastModified: STATIC_PAGES_UPDATED,
      changeFrequency: "monthly",
      priority: 0.7,
    },
    ...categoryLandingPages,
    {
      url: `${baseUrl}/confronto`,
      lastModified: new Date(confrontoContent.lastUpdated),
      changeFrequency: "monthly",
      priority: 0.7,
    },
    {
      url: `${baseUrl}/strumenti`,
      lastModified: STATIC_PAGES_UPDATED,
      changeFrequency: "monthly",
      priority: 0.6,
    },
    ...toolPages,
    {
      url: `${baseUrl}/guide`,
      lastModified: guideHubLastModified,
      changeFrequency: "monthly",
      priority: 0.7,
    },
    ...guidePages,
    ...legalPages,
    {
      url: `${baseUrl}/help`,
      lastModified: helpHubLastModified,
      changeFrequency: "monthly",
      priority: 0.6,
    },
    ...helpPages,
  ];
}
