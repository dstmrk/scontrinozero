import type { MetadataRoute } from "next";
import { headers } from "next/headers";
import { isIndexableHost } from "@/lib/seo-indexable";

const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://scontrinozero.it";

export default async function robots(): Promise<MetadataRoute.Robots> {
  const host = (await headers()).get("host");

  // Host non indicizzabili (sandbox, dominio app, self-host custom): scoraggia
  // il crawl con Disallow totale e non pubblicizza la sitemap. La de-index vera
  // e propria è garantita dall'header X-Robots-Tag: noindex impostato nel proxy.
  if (!isIndexableHost(host)) {
    return {
      rules: {
        userAgent: "*",
        disallow: "/",
      },
    };
  }

  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/dashboard/", "/onboarding/"],
    },
    sitemap: `${baseUrl}/sitemap.xml`,
  };
}
