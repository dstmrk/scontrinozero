import { JsonLd, articleJsonLd } from "@/components/json-ld";
import { getHelpArticle } from "@/lib/help/articles";

const SITE_URL = "https://scontrinozero.it";

/**
 * Structured data Article per un articolo del centro assistenza. Legge titolo,
 * descrizione e date di pubblicazione/revisione per-articolo dal registry
 * `helpArticles` (unica fonte di verità).
 * Affianca — senza sostituirlo — il BreadcrumbList già emesso da ogni pagina.
 */
export function HelpArticleJsonLd({ slug }: { readonly slug: string }) {
  const article = getHelpArticle(slug);
  return (
    <JsonLd
      data={articleJsonLd({
        headline: article.title,
        description: article.description,
        url: `${SITE_URL}/help/${slug}`,
        datePublished: article.datePublished,
        dateModified: article.dateModified,
      })}
    />
  );
}
