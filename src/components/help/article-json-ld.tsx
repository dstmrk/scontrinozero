import { JsonLd, articleJsonLd } from "@/components/json-ld";
import { getHelpArticle, HELP_REVIEWED_DATE } from "@/lib/help/articles";

const SITE_URL = "https://scontrinozero.it";

/**
 * Structured data Article per un articolo del centro assistenza. Legge titolo
 * e descrizione dal registry `helpArticles` (unica fonte di verità) e usa la
 * data di revisione condivisa `HELP_REVIEWED_DATE` come datePublished/Modified.
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
        datePublished: HELP_REVIEWED_DATE,
        dateModified: HELP_REVIEWED_DATE,
      })}
    />
  );
}
