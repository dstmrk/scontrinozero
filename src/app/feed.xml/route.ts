import { headers } from "next/headers";
import { guideArticles, guideSlugs } from "@/lib/guide/articles";
import { isIndexableHost, marketingBaseUrl } from "@/lib/seo-indexable";

/**
 * `/feed.xml`: feed RSS 2.0 delle guide editoriali. Segnale di freshness e
 * canale di discovery per crawler, aggregatori e AI. Alimentato dallo stesso
 * registry delle pagine (`guideArticles`), quindi non può driftare.
 * Servito solo sull'apex marketing indicizzabile, come llms.txt.
 */

function escapeXml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

/** RFC 822, richiesto da RSS 2.0 (es. "Tue, 22 Jul 2026 00:00:00 GMT"). */
function toRfc822(isoDate: string): string {
  return new Date(`${isoDate}T00:00:00Z`).toUTCString();
}

function buildFeed(baseUrl: string): string {
  const sortedSlugs = [...guideSlugs].toSorted((a, b) => {
    const byDate = guideArticles[b].publishedAt.localeCompare(
      guideArticles[a].publishedAt,
    );
    // Chiave secondaria stabile a parità di data
    return byDate !== 0 ? byDate : a.localeCompare(b);
  });

  const lastBuildDate = toRfc822(
    sortedSlugs
      .map((slug) => guideArticles[slug].updatedAt)
      .toSorted((a, b) => a.localeCompare(b))
      .at(-1) ?? new Date().toISOString().slice(0, 10),
  );

  const items = sortedSlugs.map((slug) => {
    const a = guideArticles[slug];
    const url = `${baseUrl}/guide/${slug}`;
    return [
      "    <item>",
      `      <title>${escapeXml(a.title)}</title>`,
      `      <link>${url}</link>`,
      `      <guid isPermaLink="true">${url}</guid>`,
      `      <description>${escapeXml(a.metaDescription)}</description>`,
      `      <pubDate>${toRfc822(a.publishedAt)}</pubDate>`,
      "    </item>",
    ].join("\n");
  });

  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">',
    "  <channel>",
    "    <title>ScontrinoZero — Guide</title>",
    `    <link>${baseUrl}/guide</link>`,
    "    <description>Guide pratiche su scontrino elettronico, documento commerciale online, corrispettivi telematici e adempimenti per esercenti italiani.</description>",
    "    <language>it-it</language>",
    `    <lastBuildDate>${lastBuildDate}</lastBuildDate>`,
    `    <atom:link href="${baseUrl}/feed.xml" rel="self" type="application/rss+xml"/>`,
    ...items,
    "  </channel>",
    "</rss>",
    "",
  ].join("\n");
}

export async function GET(): Promise<Response> {
  const host = (await headers()).get("host");

  if (!isIndexableHost(host)) {
    return new Response("Not Found", { status: 404 });
  }

  return new Response(buildFeed(marketingBaseUrl()), {
    status: 200,
    headers: {
      "content-type": "application/rss+xml; charset=utf-8",
    },
  });
}
