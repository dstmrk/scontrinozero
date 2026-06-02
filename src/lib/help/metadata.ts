import type { Metadata } from "next";
import { getHelpArticle } from "./articles";

const SITE_URL = "https://scontrinozero.it";

/**
 * Costruisce i metadata SEO di una pagina del centro assistenza dal registry
 * `helpArticles` (unica fonte di verità): titolo SEO, descrizione, canonical e
 * Open Graph. Il template root aggiunge il suffisso "| ScontrinoZero" al title.
 *
 * Tenere i metadata qui evita la duplicazione tra il registry e i 23 file di
 * pagina e garantisce che canonical/OG siano presenti e coerenti ovunque.
 */
export function helpArticleMetadata(slug: string): Metadata {
  const article = getHelpArticle(slug);
  const url = `${SITE_URL}/help/${slug}`;
  return {
    title: article.metaTitle,
    description: article.description,
    openGraph: {
      title: article.metaTitle,
      description: article.description,
      url,
    },
    alternates: {
      canonical: url,
    },
  };
}
