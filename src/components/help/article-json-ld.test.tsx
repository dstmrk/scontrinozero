// @vitest-environment node
import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { HelpArticleJsonLd } from "./article-json-ld";
import { getHelpArticle, HELP_REVIEWED_DATE } from "@/lib/help/articles";

function parseLdJson(html: string): Record<string, unknown> {
  const match = html.match(
    /<script type="application\/ld\+json">([\s\S]*?)<\/script>/,
  );
  if (!match) throw new Error("no ld+json script rendered");
  // Il componente JsonLd escapa < > & come < > &: JSON.parse li riconverte.
  return JSON.parse(match[1]) as Record<string, unknown>;
}

describe("HelpArticleJsonLd", () => {
  it("renders an Article structured data for a known slug", () => {
    const html = renderToStaticMarkup(
      <HelpArticleJsonLd slug="primo-scontrino" />,
    );
    const data = parseLdJson(html);
    expect(data["@type"]).toBe("Article");
  });

  it("uses the article title as headline and its description", () => {
    const article = getHelpArticle("regime-forfettario");
    const html = renderToStaticMarkup(
      <HelpArticleJsonLd slug="regime-forfettario" />,
    );
    const data = parseLdJson(html);
    expect(data.headline).toBe(article.title);
    expect(data.description).toBe(article.description);
  });

  it("builds an absolute HTTPS url under /help and uses the shared review date", () => {
    const html = renderToStaticMarkup(
      <HelpArticleJsonLd slug="aliquote-iva" />,
    );
    const data = parseLdJson(html);
    expect(data.url).toBe("https://scontrinozero.it/help/aliquote-iva");
    expect(data.datePublished).toBe(HELP_REVIEWED_DATE);
    expect(data.dateModified).toBe(HELP_REVIEWED_DATE);
  });

  it("throws on an unknown slug (fail-fast, mai schema vuoto)", () => {
    expect(() =>
      renderToStaticMarkup(<HelpArticleJsonLd slug="does-not-exist" />),
    ).toThrow();
  });
});
