import type { Metadata } from "next";
import { getHelpArticle } from "./articles";

const SITE_URL = "https://scontrinozero.it";

/**
 * Costruisce i metadata SEO di una pagina del centro assistenza dal registry
 * `helpArticles` (unica fonte di verità): titolo SEO, descrizione, canonical e
 * Open Graph.
 *
 * Il title è **assoluto**: bypassa il template root ("%s | ScontrinoZero"),
 * che aggiungerebbe 16 caratteri di suffisso a un metaTitle già vicino al
 * limite di troncamento della SERP (~60 caratteri). Con il suffisso il brand
 * non verrebbe comunque mostrato e a essere tagliata sarebbe la coda della
 * keyword; il brand resta visibile in SERP tramite il site name dichiarato in
 * `webSiteJsonLd` e tramite il breadcrumb del dominio.
 *
 * Tenere i metadata qui evita la duplicazione tra il registry e i 23 file di
 * pagina e garantisce che canonical/OG siano presenti e coerenti ovunque.
 */
export function helpArticleMetadata(slug: string): Metadata {
  const article = getHelpArticle(slug);
  const url = `${SITE_URL}/help/${slug}`;
  return {
    title: { absolute: article.metaTitle },
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
