import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { getRelatedArticles } from "@/lib/help/articles";

interface RelatedHelpArticlesProps {
  readonly slug: string;
}

export function RelatedHelpArticles({ slug }: RelatedHelpArticlesProps) {
  const related = getRelatedArticles(slug);
  return (
    <>
      <h2 className="mt-10 text-xl font-semibold">Articoli correlati</h2>
      <ul className="mt-3 space-y-1 text-sm">
        {related.map((article) => (
          <li key={article.slug}>
            <Link
              href={`/help/${article.slug}`}
              className="text-primary hover:underline"
            >
              {article.title}
            </Link>
          </li>
        ))}
      </ul>

      <div className="bg-muted/40 border-border mt-8 rounded-lg border p-5 text-center">
        <p className="text-sm font-semibold">Pronto a iniziare?</p>
        <p className="text-muted-foreground mt-1 text-sm">
          {"30 giorni di prova gratuita, senza carta di credito."}
        </p>
        <Button asChild className="mt-3">
          <Link href="/register">
            {"Crea l'account "}
            <ArrowRight className="ml-1 h-4 w-4" />
          </Link>
        </Button>
      </div>
    </>
  );
}
