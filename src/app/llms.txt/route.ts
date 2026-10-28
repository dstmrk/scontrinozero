import { headers } from "next/headers";
import { guideArticles } from "@/lib/guide/articles";
import { helpArticles } from "@/lib/help/articles";
import { categories } from "@/lib/per/categories";
import { tools } from "@/lib/strumenti/tools";
import { confrontoContent } from "@/lib/confronto/comparisons";
import { isIndexableHost, marketingBaseUrl } from "@/lib/seo-indexable";
import { PLAN_PRICES } from "@/lib/plan-prices";
import { TRIAL_DAYS } from "@/lib/plans-shared";

const { starter, pro, team } = PLAN_PRICES;

/**
 * `/llms.txt` (https://llmstxt.org): indice del sito in markdown pensato per i
 * crawler AI (ChatGPT, Claude, Perplexity, AI Overviews). Generato dagli stessi
 * registry editoriali della sitemap, così non può driftare dai contenuti reali.
 *
 * Come robots.ts, è servito solo sull'apex marketing indicizzabile: su sandbox,
 * dominio app e self-host risponde 404 (gli URL elencati sono comunque sempre
 * quelli dell'apex di produzione, mai dell'host corrente).
 */

function section(title: string, lines: readonly string[]): readonly string[] {
  return [`## ${title}`, "", ...lines, ""];
}

function buildLlmsTxt(baseUrl: string): string {
  const guideLines = Object.values(guideArticles).map(
    (a) => `- [${a.title}](${baseUrl}/guide/${a.slug}): ${a.metaDescription}`,
  );
  const helpLines = Object.values(helpArticles).map(
    (a) => `- [${a.title}](${baseUrl}/help/${a.slug}): ${a.description}`,
  );
  const categoryLines = Object.values(categories).map(
    (c) => `- [${c.title}](${baseUrl}/per/${c.slug}): ${c.metaDescription}`,
  );
  const toolLines = Object.values(tools).map(
    (t) =>
      `- [${t.title}](${baseUrl}/strumenti/${t.slug}): ${t.metaDescription}`,
  );

  return [
    "# ScontrinoZero",
    "",
    '> Registratore di cassa virtuale per emettere scontrini elettronici e trasmettere i corrispettivi all\'Agenzia delle Entrate tramite la procedura "documento commerciale online", senza registratore telematico fisico. Web app (PWA) mobile-first per esercenti, micro-attività e regime forfettario in Italia.',
    "",
    `Piani: Starter (${starter.monthly}/mese o ${starter.yearly}/anno), Pro (${pro.monthly}/mese o ${pro.yearly}/anno) e Team (${team.monthly}/mese o ${team.yearly}/anno), cioè Pro con collaboratori illimitati che emettono con le credenziali Fisconline del titolare; prova gratuita di ${TRIAL_DAYS} giorni senza carta; versione self-hosted gratuita.`,
    "",
    `Il testo completo delle guide e delle pagine editoriali è in ${baseUrl}/llms-full.txt.`,
    "",
    ...section("Pagine principali", [
      `- [Funzionalità](${baseUrl}/funzionalita): cosa fa ScontrinoZero: emissione, annullo e storico degli scontrini elettronici, invio digitale o stampa termica.`,
      `- [Prezzi](${baseUrl}/prezzi): piani e prezzi aggiornati, prova gratuita.`,
      `- [${confrontoContent.title}](${baseUrl}/confronto): ${confrontoContent.metaDescription}`,
    ]),
    ...section("Guide", guideLines),
    ...section("Centro assistenza", helpLines),
    ...section("Per categoria di attività", categoryLines),
    ...section("Strumenti gratuiti", toolLines),
  ].join("\n");
}

export async function GET(): Promise<Response> {
  const host = (await headers()).get("host");

  // Stesso criterio di robots.ts: fuori dall'apex marketing il file non esiste.
  if (!isIndexableHost(host)) {
    return new Response("Not Found", { status: 404 });
  }

  return new Response(buildLlmsTxt(marketingBaseUrl()), {
    status: 200,
    headers: {
      "content-type": "text/plain; charset=utf-8",
    },
  });
}
