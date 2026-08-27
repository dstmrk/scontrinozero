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

export const metadata = helpArticleMetadata("metodi-di-pagamento");

/**
 * Mirror in testo piano della FAQ visibile a video: alimenta lo structured data
 * FAQPage. Tenere allineato al contenuto renderizzato sotto. Il markup non
 * produce più rich result (Google li ha ritirati il 7 maggio 2026): quello che
 * paga è la FAQ visibile, che è contenuto citabile dalle AI — skill
 * `marketing-content`.
 */
const faqItems: readonly FaqItem[] = [
  {
    question: "Ho incassato con un bonifico: quale metodo devo scegliere?",
    answer:
      "Scegli Elettronico. Il bonifico è una forma di pagamento elettronico, e la voce Elettronico di ScontrinoZero trasmette all'Agenzia delle Entrate esattamente quella modalità: sullo scontrino compare la riga «Pagamento elettronico». Lo chiarisce la FAQ n. 11 del documento «Collegamento POS-RT» dell'Agenzia, pubblicata il 19 febbraio 2026: se il pagamento avviene tramite bonifico, il documento commerciale deve indicare che si tratta di una forma di pagamento elettronico e il relativo ammontare.",
  },
  {
    question: "E se il cliente paga con un assegno?",
    answer:
      "Scegli Contanti. Secondo la FAQ n. 27 dello stesso documento dell'Agenzia delle Entrate, pubblicata il 17 marzo 2026 e aggiornata il 25 marzo 2026, in caso di pagamento con assegno bancario o circolare il documento commerciale deve indicare che si tratta di una forma di pagamento contante.",
  },
  {
    question:
      "Posso dividere un pagamento tra contanti e carta sullo stesso scontrino?",
    answer:
      "Sì, con il piano Pro. Nel riepilogo tocca «+ Pagamento misto» e digita quanto incassi in contanti: la quota elettronica è il resto. Il documento commerciale riporta le due righe separate, Pagamento contante e Pagamento elettronico, e la loro somma è l'importo pagato. Con il piano Starter resta un solo metodo per scontrino.",
  },
  {
    question: "Il metodo scelto influisce sulla Lotteria degli Scontrini?",
    answer:
      "Sì. Il campo per il codice lotteria compare solo quando selezioni Elettronico, perché alla Lotteria degli Scontrini partecipano soltanto gli acquisti sopra 1 € pagati con strumenti elettronici. Con pagamento in contanti il codice non può essere trasmesso, e nemmeno con un pagamento misto: basta una quota in contanti perché il documento non sia più pagato esclusivamente con mezzi elettronici.",
  },
];

export default function MetodiDiPagamentoPage() {
  return (
    <section className="px-4 py-16">
      <JsonLd
        data={helpArticleBreadcrumb(
          "metodi-di-pagamento",
          "Metodi di pagamento",
        )}
      />
      <HelpArticleJsonLd slug="metodi-di-pagamento" />
      <JsonLd data={faqPageJsonLd(faqItems)} />
      <article className="mx-auto max-w-3xl">
        <Breadcrumbs
          items={helpArticleBreadcrumbItems(
            "metodi-di-pagamento",
            "Metodi di pagamento",
          )}
        />

        {/* ─── Intestazione ─── */}
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-3xl font-extrabold tracking-tight">
            Metodi di pagamento: bonifico, assegno, carta e contanti
          </h1>
          <Badge variant="secondary">Gestione scontrini</Badge>
        </div>
        <p className="text-muted-foreground mt-3 text-sm leading-relaxed">
          In cassa ScontrinoZero propone due metodi: <strong>Contanti</strong>{" "}
          ed <strong>Elettronico</strong>. Un incasso ricevuto con{" "}
          <strong>bonifico</strong> va registrato come Elettronico, perché il
          bonifico è a tutti gli effetti un pagamento elettronico; un{" "}
          <strong>assegno</strong>, bancario o circolare, va invece registrato
          come Contanti. La carta di credito o il bancomat rientrano
          anch&apos;essi in Elettronico, insieme alle app di pagamento.
        </p>
        <HelpArticleUpdatedAt slug="metodi-di-pagamento" />

        {/* ─── Cosa arriva davvero all'AdE ─── */}
        <h2 className="mt-10 text-xl font-semibold">
          Cosa viene trasmesso all&apos;Agenzia delle Entrate
        </h2>
        <p className="text-muted-foreground mt-3 text-sm leading-relaxed">
          Le due voci in cassa corrispondono una a una alle forme di pagamento
          previste dal tracciato del documento commerciale, e con le stesse
          parole: sullo scontrino che consegni al cliente — PDF, link o stampa
          termica — leggi <strong>Pagamento contante</strong> oppure{" "}
          <strong>Pagamento elettronico</strong>. Ciascuna copre più strumenti
          di quanti il nome suggerisca.
        </p>
        <div className="mt-3 overflow-x-auto">
          <table className="text-muted-foreground w-full text-sm">
            <thead>
              <tr className="border-border border-b text-left">
                <th className="text-foreground pb-2 font-semibold">
                  Voce in cassa
                </th>
                <th className="text-foreground pb-2 font-semibold">
                  Forma trasmessa all&apos;AdE
                </th>
                <th className="text-foreground pb-2 font-semibold">
                  Cosa comprende
                </th>
              </tr>
            </thead>
            <tbody className="divide-border divide-y">
              <tr>
                <td className="text-foreground py-2 font-medium">Contanti</td>
                <td className="py-2">Contante</td>
                <td className="py-2">
                  Denaro in banconote e monete, assegni bancari e circolari
                </td>
              </tr>
              <tr>
                <td className="text-foreground py-2 font-medium">
                  Elettronico
                </td>
                <td className="py-2">Pagamento elettronico</td>
                <td className="py-2">
                  Carte di credito, debito e prepagate, bancomat, app di
                  pagamento, bonifici
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        {/* ─── Bonifico ─── */}
        <h2 className="mt-10 text-xl font-semibold">
          Il bonifico è un pagamento elettronico
        </h2>
        <p className="text-muted-foreground mt-3 text-sm leading-relaxed">
          Se incassi con bonifico, sul documento commerciale devi indicare il
          pagamento elettronico: in ScontrinoZero significa selezionare{" "}
          <strong>Elettronico</strong>. È il caso tipico di chi riceve accrediti
          periodici da una piattaforma o da un committente invece di incassare
          allo sportello.
        </p>
        <p className="text-muted-foreground mt-3 text-sm leading-relaxed">
          Il riferimento ufficiale è la <strong>FAQ n. 11</strong> del documento{" "}
          <strong>&laquo;Collegamento POS-RT&raquo;</strong> pubblicato
          dall&apos;Agenzia delle Entrate su{" "}
          <strong>agenziaentrate.gov.it</strong> il{" "}
          <strong>19 febbraio 2026</strong>, che risponde così alla domanda se
          il bonifico debba essere collegato al registratore di cassa:
        </p>
        <blockquote className="border-border text-muted-foreground mt-3 border-l-2 pl-4 text-sm leading-relaxed italic">
          {
            "«No, il bonifico bancario non rientra tra gli strumenti di pagamento elettronico da collegare. In ogni caso se il pagamento avviene tramite bonifico il documento commerciale deve indicare che si tratta di una forma di pagamento elettronico e il relativo ammontare.»"
          }
        </blockquote>
        <p className="text-muted-foreground mt-3 text-sm leading-relaxed">
          Due indicazioni distinte, quindi: il bonifico <strong>non</strong> va
          censito fra gli strumenti di pagamento da collegare — la sua
          tracciabilità è già garantita dall&apos;estratto conto — ma sul
          documento commerciale va comunque indicato come pagamento elettronico.
        </p>

        {/* ─── Assegno ─── */}
        <h2 className="mt-10 text-xl font-semibold">
          L&apos;assegno è un pagamento in contanti
        </h2>
        <p className="text-muted-foreground mt-3 text-sm leading-relaxed">
          È il caso che sorprende più spesso: l&apos;assegno non è un pagamento
          elettronico. Se il cliente salda con assegno, seleziona{" "}
          <strong>Contanti</strong>.
        </p>
        <p className="text-muted-foreground mt-3 text-sm leading-relaxed">
          Lo precisa la <strong>FAQ n. 27</strong> dello stesso documento
          dell&apos;Agenzia delle Entrate, pubblicata il{" "}
          <strong>17 marzo 2026</strong> e aggiornata il{" "}
          <strong>25 marzo 2026</strong>: in caso di pagamento con assegno,
          bancario o circolare, il documento commerciale deve indicare che si
          tratta di una forma di pagamento contante.
        </p>

        {/* ─── Perché la scelta conta ─── */}
        <h2 className="mt-10 text-xl font-semibold">
          Perché la scelta del metodo conta
        </h2>
        <p className="text-muted-foreground mt-3 text-sm leading-relaxed">
          Il metodo non è un dettaglio estetico: viaggia dentro il documento
          commerciale trasmesso all&apos;Agenzia e determina una cosa concreta
          in cassa. Il campo <strong>codice Lotteria degli Scontrini</strong>{" "}
          compare soltanto quando scegli Elettronico, perché alla Lotteria
          partecipano solo gli acquisti sopra <strong>1 €</strong> pagati con
          strumenti elettronici. Se registri come Contanti un incasso ricevuto
          con bonifico, oltre a trasmettere un dato inesatto togli al cliente la
          possibilità di partecipare.
        </p>
        <p className="text-muted-foreground mt-3 text-sm leading-relaxed">
          Di norma a ogni documento commerciale corrisponde{" "}
          <strong>un solo metodo di pagamento</strong>: scegli quello con cui il
          cliente ha saldato l&apos;intero importo dello scontrino. Con il piano
          Pro puoi invece <strong>ripartire l&apos;incasso</strong> fra contanti
          ed elettronico sullo stesso scontrino: nel riepilogo tocca{" "}
          <strong>+ Pagamento misto</strong> e digita la quota in contanti, il
          resto va sull&apos;elettronico. Sul documento compaiono due righe
          distinte, e la loro somma è l&apos;importo pagato. Per le aliquote IVA
          e il catalogo prodotti, vedi{" "}
          <Link
            href="/help/aliquote-iva"
            className="text-primary hover:underline"
          >
            Come gestire le aliquote IVA e il catalogo prodotti
          </Link>
          {"."}
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
        <RelatedHelpArticles slug="metodi-di-pagamento" />

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
