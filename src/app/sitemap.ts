import type { MetadataRoute } from "next";
import { categorySlugs } from "@/lib/per/categories";
import { comparisonSlugs } from "@/lib/confronto/comparisons";

const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://scontrinozero.it";

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

const comparisonPages = comparisonSlugs.map((slug) => ({
  url: `${baseUrl}/confronto/${slug}`,
  lastModified: new Date(),
  changeFrequency: "monthly" as const,
  priority: 0.65,
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
    ...categoryLandingPages,
    ...comparisonPages,
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
    ...[
      "/help/prima-configurazione",
      "/help/primo-scontrino",
      "/help/installare-app",
      "/help/come-collegare-ade",
      "/help/credenziali-fisconline",
      "/help/cassetto-fiscale",
      "/help/errori-ade",
      "/help/sicurezza-credenziali",
      "/help/annullare-scontrino",
      "/help/chiusura-giornaliera",
      "/help/storico-ed-esportazione",
      "/help/regime-forfettario",
      "/help/aliquote-iva",
      "/help/normativa-pos-2026",
      "/help/piani-e-prezzi",
      "/help/api",
      "/help/cambio-piano",
      "/help/fatture-e-ricevute",
      "/help/contatto-assistenza",
      "/help/pos-rt-obbligo",
      "/help/intestazione-scontrino",
    ].map((path) => ({
      url: `${baseUrl}${path}`,
      lastModified: new Date(),
      changeFrequency: "monthly" as const,
      priority: 0.6,
    })),
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
