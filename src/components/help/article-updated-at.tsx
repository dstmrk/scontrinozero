import { getHelpArticle } from "@/lib/help/articles";

const MESI = [
  "gennaio",
  "febbraio",
  "marzo",
  "aprile",
  "maggio",
  "giugno",
  "luglio",
  "agosto",
  "settembre",
  "ottobre",
  "novembre",
  "dicembre",
] as const;

/**
 * "2026-08-02" → "agosto 2026".
 *
 * Formatta la stringa ISO **senza** passare da `new Date()`: il parsing di una
 * data-only in JS è UTC, ma la formattazione locale la riporterebbe al giorno
 * prima nei fusi negativi, facendo slittare di un mese le date col giorno 01
 * (e producendo un mismatch di idratazione fra server e client).
 */
export function formatUpdatedAt(isoDate: string): string {
  const [year, month] = isoDate.split("-");
  return `${MESI[Number(month) - 1]} ${year}`;
}

/**
 * Riga "Ultimo aggiornamento" visibile in testa a ogni articolo di /help.
 *
 * Legge `dateModified` dal registry `helpArticles` — la stessa fonte che
 * alimenta l'`Article` JSON-LD (`HelpArticleJsonLd`) e la sitemap. Prima la
 * data era scritta a mano nel JSX di ogni pagina e si era desincronizzata su
 * 19 articoli su 26: il testo visibile diceva "aprile 2026" mentre lo
 * structured data letto da Google e dalle AI diceva luglio. Una sola fonte di
 * verità rende il drift strutturalmente impossibile.
 */
export function HelpArticleUpdatedAt({ slug }: { readonly slug: string }) {
  const article = getHelpArticle(slug);
  return (
    <p className="text-muted-foreground mt-1 text-sm">
      <strong>Ultimo aggiornamento:</strong>{" "}
      <time dateTime={article.dateModified}>
        {formatUpdatedAt(article.dateModified)}
      </time>
    </p>
  );
}
