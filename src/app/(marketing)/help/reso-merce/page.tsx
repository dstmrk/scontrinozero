import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import {
  JsonLd,
  faqPageJsonLd,
  helpArticleBreadcrumb,
  helpArticleBreadcrumbItems,
  type FaqItem,
} from "@/components/json-ld";
import { Breadcrumbs } from "@/components/marketing/breadcrumbs";
import { helpArticleMetadata } from "@/lib/help/metadata";
import { HelpArticleJsonLd } from "@/components/help/article-json-ld";
import { HelpArticleUpdatedAt } from "@/components/help/article-updated-at";
import { RelatedHelpArticles } from "@/components/help/related-articles";

export const metadata = helpArticleMetadata("reso-merce");

/**
 * Mirror in testo piano della FAQ visibile a video: alimenta lo structured data
 * FAQPage. Tenere allineato al contenuto renderizzato sotto — skill
 * `marketing-content`.
 */
const faqItems: readonly FaqItem[] = [
  {
    question: "In quale giorno conta il reso nei corrispettivi?",
    answer:
      "Nel giorno in cui emetti il documento di reso, non in quello della vendita. Il reso è un documento commerciale con la sua data: riduce i corrispettivi della giornata in cui lo trasmetti, mentre lo scontrino originale resta registrato nel giorno della vendita.",
  },
  {
    question: "Posso annullare un reso fatto per errore?",
    answer:
      "No. Il servizio Documento Commerciale Online dell'Agenzia delle Entrate non consente di annullare un documento di reso, e ScontrinoZero non propone l'operazione. Prima di confermare controlla i pezzi scelti e il totale mostrato; per correggere un reso sbagliato confrontati con il tuo commercialista.",
  },
  {
    question: "Il cliente restituisce tutto: faccio un reso o un annullo?",
    answer:
      "Se la merce torna indietro dopo la vendita, fai un reso totale: lo scontrino originale resta valido e il reso documenta la restituzione. L'annullo serve quando lo scontrino non doveva esistere, per esempio un importo sbagliato corretto subito. Una vendita con anche un solo reso non si può più annullare.",
  },
  {
    question: "Il reso è incluso nel mio piano?",
    answer:
      "Sì. Il reso è disponibile su tutti i piani, Starter compreso, e nei 30 giorni di prova gratuita: è un adempimento fiscale dell'esercente, non una funzione aggiuntiva.",
  },
  {
    question:
      "Ho fatto un reso dal portale dell'Agenzia: ScontrinoZero lo vede?",
    answer:
      "Lo Storico mostra solo i resi emessi da ScontrinoZero. Quando però fai un nuovo reso o provi ad annullare la vendita, ScontrinoZero rilegge lo scontrino dall'Agenzia delle Entrate e tiene conto anche dei resi fatti dal portale: non puoi rendere due volte lo stesso pezzo, né annullare una vendita già resa.",
  },
];

export default function ResoMercePage() {
  return (
    <section className="px-4 py-16">
      <JsonLd data={helpArticleBreadcrumb("reso-merce", "Reso merce")} />
      <HelpArticleJsonLd slug="reso-merce" />
      <JsonLd data={faqPageJsonLd(faqItems)} />
      <article className="mx-auto max-w-3xl">
        <Breadcrumbs
          items={helpArticleBreadcrumbItems("reso-merce", "Reso merce")}
        />

        {/* ─── Intestazione ─── */}
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-3xl font-extrabold tracking-tight">
            Reso merce: emettere il documento di reso
          </h1>
          <Badge variant="secondary">Gestione scontrini</Badge>
        </div>
        <p className="text-muted-foreground mt-3 text-sm leading-relaxed">
          Quando un cliente restituisce uno o più articoli, da ScontrinoZero
          emetti il <strong>documento commerciale di reso</strong>: apri lo
          scontrino dallo <strong>Storico</strong>, tocca{" "}
          <strong>Fai un reso</strong>, scegli quanti pezzi rendere per ogni
          riga e conferma. Il documento viene trasmesso all&apos;Agenzia delle
          Entrate, cita lo scontrino originale e riduce i corrispettivi del
          giorno in cui lo emetti. Il reso è disponibile su{" "}
          <strong>tutti i piani</strong>, prova gratuita compresa.
        </p>
        <HelpArticleUpdatedAt slug="reso-merce" />

        {/* ─── Reso o annullo ─── */}
        <h2 className="mt-10 text-xl font-semibold">Reso o annullo?</h2>
        <p className="text-muted-foreground mt-3 text-sm leading-relaxed">
          Il reso documenta una{" "}
          <strong>restituzione avvenuta dopo la vendita</strong>: lo scontrino
          originale resta valido, e il reso ne storna solo la parte restituita,
          anche un solo pezzo. L&apos;
          <Link
            href="/help/annullare-scontrino"
            className="text-primary hover:underline"
          >
            annullo
          </Link>{" "}
          invece cancella fiscalmente l&apos;intero scontrino, ed è la strada
          per un documento che non doveva esistere, come un prezzo battuto male.
          L&apos;Agenzia delle Entrate ha confermato con il{" "}
          <strong>Principio di diritto n. 21 del 1° agosto 2019</strong> che la
          procedura di reso merce si applica anche al documento commerciale
          introdotto con i corrispettivi telematici (art. 2 D.Lgs. 127/2015).
        </p>

        {/* ─── Come fare ─── */}
        <h2 className="mt-10 text-xl font-semibold">
          Come fare un reso da ScontrinoZero
        </h2>
        <ol className="text-muted-foreground mt-3 list-decimal space-y-2 pl-5 text-sm leading-relaxed">
          <li>
            Vai nella sezione <strong>Storico</strong> e trova lo scontrino
            della vendita con i filtri per data.
          </li>
          <li>
            Apri il dettaglio e tocca <strong>Fai un reso</strong>. Il pulsante
            compare sugli scontrini <em>Emessi</em> che hanno ancora pezzi da
            rendere.
          </li>
          <li>
            Per ogni riga scrivi quanti pezzi rendi: accanto vedi quanti ne hai
            venduti e quanti ne hai già resi. <strong>Rendi tutto</strong>{" "}
            compila ogni riga con il massimo rendibile. Sotto l&apos;elenco
            compare il <strong>totale del reso</strong>.
          </li>
          <li>
            Tocca <strong>Conferma reso</strong>. A trasmissione avvenuta vedi
            il <strong>progressivo del reso</strong> e puoi consegnare al
            cliente la ricevuta: link, QR code o stampa termica.
          </li>
        </ol>

        {/* ─── Resi parziali ─── */}
        <h2 className="mt-10 text-xl font-semibold">
          Resi parziali e quantità
        </h2>
        <ul className="text-muted-foreground mt-3 list-disc space-y-2 pl-5 text-sm leading-relaxed">
          <li>
            Sulla stessa vendita puoi fare <strong>più resi</strong>, finché
            restano pezzi da rendere. Nello Storico la vendita porta il badge{" "}
            <em>Reso parziale</em> o <em>Reso totale</em>, e nel dettaglio ogni
            riga mostra quanti pezzi sono già stati resi.
          </li>
          <li>
            Le quantità ammettono <strong>al massimo due decimali</strong> (per
            esempio 0,5 kg): è il limite del servizio dell&apos;Agenzia.
          </li>
          <li>
            Se la riga aveva uno <strong>sconto</strong>, il reso ne porta la
            quota dei pezzi resi: rendendo 1 maglia su 2 scontate, il reso
            storna metà dello sconto della riga.
          </li>
        </ul>

        {/* ─── Dopo il reso ─── */}
        <h2 className="mt-10 text-xl font-semibold">
          Cosa succede dopo il reso
        </h2>
        <ul className="text-muted-foreground mt-3 list-disc space-y-2 pl-5 text-sm leading-relaxed">
          <li>
            Il reso compare nello <strong>Storico</strong> come riga a sé, con
            il badge <em>Reso</em> e l&apos;importo in negativo. Aprendolo puoi
            reinviare o ristampare la ricevuta di reso.
          </li>
          <li>
            Nell&apos;
            <Link
              href="/help/storico-ed-esportazione"
              className="text-primary hover:underline"
            >
              export CSV
            </Link>{" "}
            ha stato <em>reso</em>, totale negativo e, nella colonna{" "}
            <code>rif_vendita</code>, il numero dello scontrino reso.
          </li>
          <li>
            Nelle{" "}
            <Link
              href="/help/analytics-e-report"
              className="text-primary hover:underline"
            >
              Analytics
            </Link>{" "}
            i ricavi sono al netto dei resi, nel giorno del reso.
          </li>
          <li>
            Una vendita con almeno un reso{" "}
            <strong>non si può più annullare</strong>: l&apos;annullo
            stornerebbe di nuovo anche la parte già resa.
          </li>
        </ul>

        {/* ─── Rimborso ─── */}
        <h2 className="mt-10 text-xl font-semibold">
          E il rimborso al cliente?
        </h2>
        <p className="text-muted-foreground mt-3 text-sm leading-relaxed">
          Il documento di reso rettifica i corrispettivi; il rimborso al cliente
          (contanti, storno sulla carta, buono) lo gestisci tu e non passa da
          ScontrinoZero. Per i casi meno lineari, come un rimborso con buono o
          un cambio merce con aliquote diverse, confrontati con il tuo
          commercialista.
        </p>

        {/* ─── FAQ (mirror di faqItems: tenere allineati) ─── */}
        <h2 className="mt-10 text-xl font-semibold">Domande frequenti</h2>
        <div className="mt-3 space-y-4">
          {faqItems.map((faq) => (
            <div key={faq.question}>
              <p className="text-sm font-medium">{faq.question}</p>
              <p className="text-muted-foreground mt-1 text-sm leading-relaxed">
                {faq.answer}
              </p>
            </div>
          ))}
        </div>

        <RelatedHelpArticles slug="reso-merce" />

        {/* ─── Footer articolo ─── */}
        <div className="border-border mt-12 border-t pt-6">
          <p className="text-muted-foreground text-xs">
            {"Hai trovato un errore in questa guida? "}
            <a
              href="mailto:info@scontrinozero.it"
              className="text-primary hover:underline"
            >
              Segnalacelo
            </a>
            {"."}
          </p>
        </div>
      </article>
    </section>
  );
}
