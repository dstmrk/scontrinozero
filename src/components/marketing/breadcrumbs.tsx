import Link from "next/link";
import { ChevronRight } from "lucide-react";
import type { BreadcrumbItem } from "@/components/json-ld";

/**
 * Breadcrumb HTML visibile per le pagine marketing. Riceve lo stesso array di
 * `BreadcrumbItem` passato a `breadcrumbListJsonLd()`, così la navigazione a
 * video e lo structured data restano un'unica fonte (nessuna divergenza di
 * nomi/ordine tra ciò che vede l'utente e ciò che legge il crawler).
 *
 * Gli `url` degli item sono assoluti (richiesti dallo schema BreadcrumbList):
 * qui ne ricaviamo il path relativo così che `<Link>` faccia soft routing
 * intra-marketing. I link puntano sempre a pagine del gruppo marketing, mai a
 * `/login`/`/register`/`/reset-password`, quindi non serve `appHref` (regola 15).
 */
function toPathname(url: string): string {
  try {
    return new URL(url).pathname;
  } catch {
    return url;
  }
}

export function Breadcrumbs({
  items,
}: {
  readonly items: readonly BreadcrumbItem[];
}) {
  if (items.length === 0) {
    return null;
  }
  return (
    <nav aria-label="breadcrumb" className="mb-8">
      <ol className="text-muted-foreground flex flex-wrap items-center gap-1.5 text-sm">
        {items.map((item, index) => {
          const isLast = index === items.length - 1;
          return (
            <li key={item.url} className="flex items-center gap-1.5">
              {index > 0 && (
                <ChevronRight
                  className="h-3.5 w-3.5 shrink-0"
                  aria-hidden="true"
                />
              )}
              {isLast ? (
                <span
                  aria-current="page"
                  className="text-foreground font-medium"
                >
                  {item.name}
                </span>
              ) : (
                <Link
                  href={toPathname(item.url)}
                  className="hover:text-foreground transition-colors"
                >
                  {item.name}
                </Link>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
