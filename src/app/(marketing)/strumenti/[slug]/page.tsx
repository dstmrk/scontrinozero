import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  JsonLd,
  breadcrumbListJsonLd,
  webApplicationJsonLd,
} from "@/components/json-ld";
import { ScorporoIvaTool } from "@/components/marketing/tools/scorporo-iva-tool";
import { VerificaLotteriaTool } from "@/components/marketing/tools/verifica-lotteria-tool";
import { CalcolatoreRisparmioTool } from "@/components/marketing/tools/calcolatore-risparmio-tool";
import {
  tools,
  toolSlugs,
  isToolSlug,
  type ToolSlug,
} from "@/lib/strumenti/tools";
import { helpArticles } from "@/lib/help/articles";

const SITE_URL = "https://scontrinozero.it";

interface PageParams {
  readonly params: Promise<{ readonly slug: string }>;
}

export function generateStaticParams() {
  return toolSlugs.map((slug) => ({ slug }));
}

export async function generateMetadata({
  params,
}: PageParams): Promise<Metadata> {
  const { slug } = await params;
  if (!isToolSlug(slug)) {
    return { title: "Strumento non trovato | ScontrinoZero" };
  }
  const t = tools[slug];
  return {
    title: t.metaTitle,
    description: t.metaDescription,
    openGraph: {
      title: t.metaTitle,
      description: t.metaDescription,
      url: `${SITE_URL}/strumenti/${t.slug}`,
    },
    alternates: {
      canonical: `${SITE_URL}/strumenti/${t.slug}`,
    },
  };
}

function ToolWidget({ slug }: { readonly slug: ToolSlug }) {
  switch (slug) {
    case "scorporo-iva":
      return <ScorporoIvaTool />;
    case "verifica-codice-lotteria":
      return <VerificaLotteriaTool />;
    case "calcolatore-risparmio-rt":
      return <CalcolatoreRisparmioTool />;
  }
}

export default async function ToolPage({ params }: PageParams) {
  const { slug } = await params;
  if (!isToolSlug(slug)) {
    notFound();
  }
  const t = tools[slug];
  const pageUrl = `${SITE_URL}/strumenti/${t.slug}`;
  const relatedArticles = t.relatedHelp
    .map((helpSlug) => helpArticles[helpSlug])
    .filter((a) => a !== undefined);
  const otherTools = toolSlugs.filter((s) => s !== t.slug);

  return (
    <>
      <JsonLd
        data={webApplicationJsonLd({
          name: t.title,
          description: t.metaDescription,
          url: pageUrl,
        })}
      />
      <JsonLd
        data={breadcrumbListJsonLd([
          { name: "Home", url: SITE_URL },
          { name: "Strumenti", url: `${SITE_URL}/strumenti/scorporo-iva` },
          { name: t.title, url: pageUrl },
        ])}
      />

      <section className="px-4 py-16">
        <article className="mx-auto max-w-3xl">
          <Link
            href="/"
            className="text-muted-foreground hover:text-foreground mb-8 inline-flex items-center gap-1 text-sm transition-colors"
          >
            <ArrowLeft className="h-4 w-4" />
            {"Tutti gli strumenti"}
          </Link>

          <h1 className="text-3xl font-extrabold tracking-tight md:text-4xl">
            {t.title}
          </h1>
          <p className="text-muted-foreground mt-4 text-lg leading-relaxed">
            {t.heroIntro}
          </p>

          <ToolWidget slug={t.slug} />

          <h2 className="mt-12 text-xl font-semibold">{"Come funziona"}</h2>
          <ol className="text-muted-foreground mt-3 list-decimal space-y-2 pl-5 text-sm leading-relaxed">
            {t.howItWorks.map((step) => (
              <li key={step}>{step}</li>
            ))}
          </ol>

          <h2 className="mt-12 text-xl font-semibold">{"Domande frequenti"}</h2>
          <div className="mt-3 space-y-5">
            {t.faq.map((item) => (
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

          {otherTools.length > 0 && (
            <>
              <h2 className="mt-12 text-xl font-semibold">
                {"Altri strumenti"}
              </h2>
              <ul className="mt-3 space-y-1 text-sm">
                {otherTools.map((otherSlug) => (
                  <li key={otherSlug}>
                    <Link
                      href={`/strumenti/${otherSlug}`}
                      className="text-primary hover:underline"
                    >
                      {tools[otherSlug].title}
                    </Link>
                  </li>
                ))}
              </ul>
            </>
          )}

          <div className="bg-muted/40 border-border mt-10 rounded-lg border p-5 text-center">
            <p className="text-sm font-semibold">
              {"Vuoi emettere scontrini con ScontrinoZero?"}
            </p>
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
        </article>
      </section>
    </>
  );
}
