import type { MetadataRoute } from "next";
import { categorySlugs } from "@/lib/per/categories";
import { guideSlugs } from "@/lib/guide/articles";
import { helpSlugs } from "@/lib/help/articles";
import { toolSlugs } from "@/lib/strumenti/tools";
import { marketingBaseUrl } from "@/lib/seo-indexable";

// Base = apex marketing (non NEXT_PUBLIC_APP_URL, che è il dominio app): gli URL
// in sitemap devono stare sull'host indicizzabile, mai su quello in noindex.
const baseUrl = marketingBaseUrl();

const marketingPages = ["/prezzi", "/funzionalita"].map((path) => ({
  url: `${baseUrl}${path}`,
  lastModified: new Date(),
  changeFrequency: "monthly" as const,
  priority: 0.8,
}));

const categoryLandingPages = categorySlugs.map((slug) => ({
  url: `${baseUrl}/per/${slug}`,
  lastModified: new Date(),
  changeFrequency: "monthly" as const,
  priority: 0.7,
}));

const toolPages = toolSlugs.map((slug) => ({
  url: `${baseUrl}/strumenti/${slug}`,
  lastModified: new Date(),
  changeFrequency: "monthly" as const,
  priority: 0.6,
}));

const guidePages = guideSlugs.map((slug) => ({
  url: `${baseUrl}/guide/${slug}`,
  lastModified: new Date(),
  changeFrequency: "monthly" as const,
  priority: 0.7,
}));

const helpPages = helpSlugs.map((slug) => ({
  url: `${baseUrl}/help/${slug}`,
  lastModified: new Date(),
  changeFrequency: "monthly" as const,
  priority: 0.6,
}));

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    {
      url: baseUrl,
      lastModified: new Date(),
      changeFrequency: "monthly",
      priority: 1,
    },
    ...marketingPages,
    {
      url: `${baseUrl}/per`,
      lastModified: new Date(),
      changeFrequency: "monthly",
      priority: 0.7,
    },
    ...categoryLandingPages,
    {
      url: `${baseUrl}/confronto`,
      lastModified: new Date(),
      changeFrequency: "monthly",
      priority: 0.7,
    },
    ...toolPages,
    {
      url: `${baseUrl}/guide`,
      lastModified: new Date(),
      changeFrequency: "monthly",
      priority: 0.7,
    },
    ...guidePages,
    {
      url: `${baseUrl}/privacy`,
      lastModified: new Date(),
      changeFrequency: "yearly",
      priority: 0.3,
    },
    {
      url: `${baseUrl}/privacy/v01`,
      lastModified: new Date(),
      changeFrequency: "yearly",
      priority: 0.3,
    },
    {
      url: `${baseUrl}/termini`,
      lastModified: new Date(),
      changeFrequency: "yearly",
      priority: 0.3,
    },
    {
      url: `${baseUrl}/termini/v01`,
      lastModified: new Date(),
      changeFrequency: "yearly",
      priority: 0.3,
    },
    {
      url: `${baseUrl}/cookie-policy`,
      lastModified: new Date(),
      changeFrequency: "yearly",
      priority: 0.3,
    },
    {
      url: `${baseUrl}/cookie-policy/v01`,
      lastModified: new Date(),
      changeFrequency: "yearly",
      priority: 0.3,
    },
    {
      url: `${baseUrl}/help`,
      lastModified: new Date(),
      changeFrequency: "monthly",
      priority: 0.6,
    },
    ...helpPages,
    {
      url: `${baseUrl}/login`,
      lastModified: new Date(),
      changeFrequency: "yearly",
      priority: 0.5,
    },
    {
      url: `${baseUrl}/register`,
      lastModified: new Date(),
      changeFrequency: "yearly",
      priority: 0.5,
    },
  ];
}
