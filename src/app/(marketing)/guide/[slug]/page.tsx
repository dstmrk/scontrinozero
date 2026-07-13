import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowRight, Clock } from "lucide-react";
import { appHref } from "@/lib/marketing-to-app-href";
import { Button } from "@/components/ui/button";
import {
  JsonLd,
  articleJsonLd,
  breadcrumbListJsonLd,
  faqPageJsonLd,
  guideArticleBreadcrumbItems,
} from "@/components/json-ld";
import { Breadcrumbs } from "@/components/marketing/breadcrumbs";
import {
  getGuide,
  guideArticles,
  guideImageFrame,
  guideSlugs,
  isGuideSlug,
} from "@/lib/guide/articles";
import { AppScreenshot } from "@/components/marketing/app-screenshot";
import { helpArticles } from "@/lib/help/articles";
import { isToolSlug, tools } from "@/lib/strumenti/tools";

const SITE_URL = "https://scontrinozero.it";

interface PageParams {
  readonly params: Promise<{ readonly slug: string }>;
}

export function generateStaticParams() {
  return guideSlugs.map((slug) => ({ slug }));
}

export async function generateMetadata({
  params,
}: PageParams): Promise<Metadata> {
  const { slug } = await params;
  if (!isGuideSlug(slug)) {
    return { title: "Guida non trovata | ScontrinoZero" };
  }
  const g = guideArticles[slug];
  return {
    title: g.metaTitle,
    description: g.metaDescription,
    openGraph: {
      title: g.metaTitle,
      description: g.metaDescription,
      url: `${SITE_URL}/guide/${g.slug}`,
      type: "article",
    },
    alternates: {
      canonical: `${SITE_URL}/guide/${g.slug}`,
    },
  };
}

function lastDayOfMonth(yyyyMm: string): string {
  const [yStr, mStr] = yyyyMm.split("-");
  const y = Number.parseInt(yStr, 10);
  const m = Number.parseInt(mStr, 10);
  const lastDay = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return `${yyyyMm}-${String(lastDay).padStart(2, "0")}`;
}

export default async function GuidePage({ params }: PageParams) {
  const { slug } = await params;
  if (!isGuideSlug(slug)) {
    notFound();
  }
  const g = getGuide(slug);

  const pageUrl = `${SITE_URL}/guide/${g.slug}`;
  const relatedArticles = g.relatedHelp
    .map((helpSlug) => helpArticles[helpSlug])
    .filter((a) => a !== undefined);
  const relatedGuides = g.relatedGuides.map((s) => guideArticles[s]);
  const relatedTools = (g.relatedTools ?? [])
    .filter(isToolSlug)
    .map((s) => tools[s]);
  const crumbs = guideArticleBreadcrumbItems(g.slug, g.title);

  return (
    <>
      <JsonLd data={breadcrumbListJsonLd(crumbs)} />
      <JsonLd
        data={articleJsonLd({
          headline: g.title,
          description: g.metaDescription,
          url: pageUrl,
          datePublished: g.publishedAt,
          dateModified: lastDayOfMonth(g.updatedAt),
        })}
      />
      {g.faq.length > 0 && <JsonLd data={faqPageJsonLd(g.faq)} />}

      <section className="px-4 py-16">
        <article className="mx-auto max-w-3xl">
          <Breadcrumbs items={crumbs} />

          <h1 className="text-3xl font-extrabold tracking-tight md:text-4xl">
            {g.title}
          </h1>
          <p className="text-muted-foreground mt-3 flex items-center gap-1 text-xs">
            <Clock className="h-3 w-3" />
            {g.readingMinutes}
            {" min di lettura · aggiornato "}
            {g.updatedAt}
          </p>
          <p className="text-muted-foreground mt-4 text-lg leading-relaxed">
            {g.heroIntro}
          </p>

          <div className="mt-10 space-y-8">
            {g.sections.map((section) => (
              <div key={section.heading}>
                <h2 className="text-xl font-semibold">{section.heading}</h2>
                <p className="text-muted-foreground mt-3 leading-relaxed">
                  {section.body}
                </p>
                {section.table && (
                  <div className="mt-4 overflow-x-auto rounded-xl border">
                    <table className="w-full min-w-[36rem] text-sm">
                      <thead>
                        <tr className="bg-muted/50">
                          {section.table.headers.map((header) => (
                            <th
                              key={header}
                              scope="col"
                              className="px-4 py-3 text-left font-semibold"
                            >
                              {header}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody className="divide-y">
                        {section.table.rows.map((row) => (
                          <tr key={row[0]}>
                            <th
                              scope="row"
                              className="px-4 py-3 text-left align-top font-semibold whitespace-nowrap"
                            >
                              {row[0]}
                            </th>
                            {row.slice(1).map((cell, cellIndex) => (
                              <td
                                key={`${row[0]}-${section.table!.headers[cellIndex + 1]}`}
                                className="text-muted-foreground px-4 py-3 align-top"
                              >
                                {cell}
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
                {section.image && (
                  <figure className="mt-6">
                    <AppScreenshot
                      src={section.image.src}
                      alt={section.image.alt}
                      width={section.image.width}
                      height={section.image.height}
                      sizes={guideImageFrame(section.image.src).sizes}
                      className={guideImageFrame(section.image.src).className}
                    />
                    {section.image.caption && (
                      <figcaption className="text-muted-foreground mt-2 text-center text-xs">
                        {section.image.caption}
                      </figcaption>
                    )}
                  </figure>
                )}
              </div>
            ))}
          </div>

          <h2 className="mt-12 text-xl font-semibold">{"Domande frequenti"}</h2>
          <div className="mt-3 space-y-5">
            {g.faq.map((item) => (
              <div key={item.question}>
                <p className="text-sm font-medium">{item.question}</p>
                <p className="text-muted-foreground mt-1 text-sm leading-relaxed">
                  {item.answer}
                </p>
              </div>
            ))}
          </div>

          {relatedArticles.length > 0 && (
            <>
              <h2 className="mt-12 text-xl font-semibold">
                {"Approfondimenti dall'Help Center"}
              </h2>
              <ul className="mt-3 space-y-1 text-sm">
                {relatedArticles.map((article) => (
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
            </>
          )}

          {relatedTools.length > 0 && (
            <>
              <h2 className="mt-12 text-xl font-semibold">
                {"Strumenti gratuiti"}
              </h2>
              <ul className="mt-3 space-y-1 text-sm">
                {relatedTools.map((tool) => (
                  <li key={tool.slug}>
                    <Link
                      href={`/strumenti/${tool.slug}`}
                      className="text-primary hover:underline"
                    >
                      {tool.title}
                    </Link>
                  </li>
                ))}
              </ul>
            </>
          )}

          {relatedGuides.length > 0 && (
            <>
              <h2 className="mt-12 text-xl font-semibold">{"Altre guide"}</h2>
              <ul className="mt-3 space-y-1 text-sm">
                {relatedGuides.map((other) => (
                  <li key={other.slug}>
                    <Link
                      href={`/guide/${other.slug}`}
                      className="text-primary hover:underline"
                    >
                      {other.title}
                    </Link>
                  </li>
                ))}
              </ul>
            </>
          )}

          <p className="text-muted-foreground mt-12 border-t pt-6 text-xs leading-relaxed">
            {
              "Informazione divulgativa, non sostituisce la consulenza del commercialista. Per situazioni specifiche verifica sempre la normativa aggiornata e il tuo codice ATECO."
            }
          </p>

          <div className="bg-muted/40 border-border mt-10 rounded-lg border p-5 text-center">
            <p className="text-sm font-semibold">{"Pronto a provare?"}</p>
            <p className="text-muted-foreground mt-1 text-sm">
              {"30 giorni di prova gratuita, senza carta di credito."}
            </p>
            <Button asChild className="mt-3">
              <a href={appHref("/register")}>
                {"Crea l'account "}
                <ArrowRight className="ml-1 h-4 w-4" />
              </a>
            </Button>
          </div>
        </article>
      </section>
    </>
  );
}
