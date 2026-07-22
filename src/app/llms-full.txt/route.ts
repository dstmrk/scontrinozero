import { headers } from "next/headers";
import { guideArticles, type GuideTable } from "@/lib/guide/articles";
import { helpArticles } from "@/lib/help/articles";
import { categories } from "@/lib/per/categories";
import { tools } from "@/lib/strumenti/tools";
import { confrontoContent } from "@/lib/confronto/comparisons";
import { isIndexableHost, marketingBaseUrl } from "@/lib/seo-indexable";

/**
 * `/llms-full.txt` (https://llmstxt.org): variante full-text di `/llms.txt`.
 * Emette il TESTO COMPLETO dei contenuti che vivono nei registry editoriali
 * (guide con sezioni/tabelle/FAQ, verticali /per, /confronto, strumenti),
 * così un crawler AI può citare i contenuti senza renderizzare le pagine.
 * Gli articoli /help compaiono solo come link: la loro prosa vive nei
 * componenti pagina, non nel registry.
 *
 * Come llms.txt/robots.ts, è servito solo sull'apex marketing indicizzabile.
 */

function markdownTable(table: GuideTable): readonly string[] {
  return [
    `| ${table.headers.join(" | ")} |`,
    `| ${table.headers.map(() => "---").join(" | ")} |`,
    ...table.rows.map((row) => `| ${row.join(" | ")} |`),
  ];
}

function faqBlock(
  faq: readonly { readonly question: string; readonly answer: string }[],
): readonly string[] {
  return faq.flatMap((item) => [`**${item.question}**`, "", item.answer, ""]);
}

function buildLlmsFullTxt(baseUrl: string): string {
  const lines: string[] = [
    "# ScontrinoZero",
    "",
    '> Registratore di cassa virtuale per emettere scontrini elettronici e trasmettere i corrispettivi all\'Agenzia delle Entrate tramite la procedura "documento commerciale online", senza registratore telematico fisico. Web app (PWA) mobile-first per esercenti, micro-attività e regime forfettario in Italia.',
    "",
    "Piani: Starter (4,99 €/mese o 29,99 €/anno) e Pro (8,99 €/mese o 49,99 €/anno), prova gratuita di 30 giorni senza carta; versione self-hosted gratuita.",
    "",
    "Questo file contiene il testo completo delle guide e delle pagine editoriali. L'indice sintetico è in /llms.txt.",
    "",
  ];

  lines.push("## Guide", "");
  for (const a of Object.values(guideArticles)) {
    lines.push(
      `### ${a.title}`,
      "",
      `URL: ${baseUrl}/guide/${a.slug}`,
      `Pubblicato: ${a.publishedAt} — Aggiornato: ${a.updatedAt}`,
      "",
      a.heroIntro,
      "",
    );
    for (const section of a.sections) {
      lines.push(`#### ${section.heading}`, "", section.body, "");
      if (section.table) {
        lines.push(...markdownTable(section.table), "");
      }
    }
    if (a.faq.length > 0) {
      lines.push("#### Domande frequenti", "", ...faqBlock(a.faq));
    }
  }

  lines.push("## Per categoria di attività", "");
  for (const c of Object.values(categories)) {
    lines.push(
      `### ${c.title}`,
      "",
      `URL: ${baseUrl}/per/${c.slug}`,
      "",
      c.useCase,
      "",
      "Obblighi principali:",
      ...c.obligations.map((o) => `- ${o}`),
      "",
      ...faqBlock(c.faq),
    );
  }

  lines.push(`## ${confrontoContent.title}`, "");
  lines.push(
    `URL: ${baseUrl}/confronto`,
    `Dati verificati il: ${confrontoContent.lastUpdated}`,
    "",
    confrontoContent.heroIntro,
    "",
  );
  for (const cat of confrontoContent.categories) {
    lines.push(`### ${cat.title}`, "", cat.intro, "");
  }
  lines.push("### Software comparabili (snapshot pubblico)", "");
  lines.push(
    ...markdownTable({
      headers: ["Servizio", "Prezzo", "Prova"],
      rows: confrontoContent.saasCompetitors.map((s) => [
        s.name,
        s.pricing,
        s.trial,
      ]),
    }),
    "",
    ...faqBlock(confrontoContent.faq),
  );

  lines.push("## Strumenti gratuiti", "");
  for (const t of Object.values(tools)) {
    lines.push(
      `### ${t.title}`,
      "",
      `URL: ${baseUrl}/strumenti/${t.slug}`,
      "",
      t.heroIntro,
      "",
      ...faqBlock(t.faq),
    );
  }

  lines.push("## Centro assistenza (solo indice)", "");
  for (const a of Object.values(helpArticles)) {
    lines.push(`- [${a.title}](${baseUrl}/help/${a.slug}): ${a.description}`);
  }
  lines.push("");

  return lines.join("\n");
}

export async function GET(): Promise<Response> {
  const host = (await headers()).get("host");

  if (!isIndexableHost(host)) {
    return new Response("Not Found", { status: 404 });
  }

  return new Response(buildLlmsFullTxt(marketingBaseUrl()), {
    status: 200,
    headers: {
      "content-type": "text/plain; charset=utf-8",
    },
  });
}
