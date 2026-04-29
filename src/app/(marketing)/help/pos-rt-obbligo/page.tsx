import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { JsonLd, helpArticleBreadcrumb } from "@/components/json-ld";
import { RelatedHelpArticles } from "@/components/help/related-articles";

export const metadata: Metadata = {
  title:
    "Collegamento POS-RT: chi è obbligato e scadenze 2026 | ScontrinoZero Help",
  description:
    "Tutto sull'obbligo di collegare il POS al registratore telematico dal 2026: fonte normativa, scadenze, sanzioni e come si effettua l'associazione POS-DCO sul portale Fatture e Corrispettivi dell'Agenzia delle Entrate.",
};

export default function PosRtObbligoPage() {
  return (
    <section className="px-4 py-16">
      <JsonLd
        data={helpArticleBreadcrumb(
          "pos-rt-obbligo",
          "POS-RT: obbligo e scadenze 2026",
        )}
      />
      <article className="mx-auto max-w-3xl">
        <Link
          href="/help"
          className="text-muted-foreground hover:text-foreground mb-8 inline-flex items-center gap-1 text-sm transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
          Help Center
        </Link>

        {/* ─── Intestazione ─── */}
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-3xl font-extrabold tracking-tight">
            Collegamento POS-RT: chi è obbligato e scadenze
          </h1>
          <Badge variant="secondary">POS / Normativa</Badge>
        </div>
        <p className="text-muted-foreground mt-3 text-sm leading-relaxed">
          Dal 1° gennaio 2026 è in vigore l&apos;obbligo di collegare il POS al
          registratore telematico (o, come nel caso di ScontrinoZero, alla
          procedura web Documento Commerciale Online che fa le sue veci).
          ScontrinoZero invia in automatico i corrispettivi all&apos;Agenzia
          delle Entrate, ma l&apos;associazione tra il tuo POS e il DCO va
          comunicata <strong>una volta</strong> sul portale{" "}
          <em>Fatture e Corrispettivi</em>: è una procedura a carico
          dell&apos;esercente.
        </p>
        <p className="text-muted-foreground mt-1 text-sm">
          <strong>Ultimo aggiornamento:</strong> aprile 2026
        </p>

        {/* ─── Cosa prevede la normativa ─── */}
        <h2 className="mt-10 text-xl font-semibold">
          Cosa prevede la normativa
        </h2>
        <p className="text-muted-foreground mt-3 text-sm leading-relaxed">
          La <strong>Legge di Bilancio 2025</strong> (L. 30 dicembre 2024 n.
          207, commi 74-76) ha sostituito il comma 3 dell&apos;art. 2 del D.Lgs.
          127/2015. La nuova formulazione richiede la{" "}
          <strong>piena integrazione</strong> tra il processo di registrazione
          dei corrispettivi e quello di pagamento elettronico: lo strumento con
          cui si accettano pagamenti elettronici deve essere <em>sempre</em>{" "}
          collegato a quello con cui si memorizzano e trasmettono i
          corrispettivi.
        </p>
        <p className="text-muted-foreground mt-3 text-sm leading-relaxed">
          Il collegamento è <strong>logico</strong>, non fisico: non servono
          cavi né aggiornamenti hardware. Si effettua online, associando la
          matricola del POS al registratore telematico (o al DCO) tramite la
          funzione <em>Gestione collegamenti</em> del portale{" "}
          <em>Fatture e Corrispettivi</em> dell&apos;Agenzia delle Entrate. Il
          servizio è attivo dal <strong>5 marzo 2026</strong>.
        </p>

        {/* ─── Chi è obbligato ─── */}
        <h2 className="mt-10 text-xl font-semibold">Chi è obbligato</h2>
        <p className="text-muted-foreground mt-3 text-sm leading-relaxed">
          L&apos;obbligo riguarda tutti i soggetti che:
        </p>
        <ul className="text-muted-foreground mt-2 list-disc space-y-1 pl-5 text-sm leading-relaxed">
          <li>
            Sono tenuti alla memorizzazione e trasmissione telematica dei
            corrispettivi (art. 2 D.Lgs. 127/2015), <strong>incluso</strong> chi
            usa la procedura web Documento Commerciale Online.
          </li>
          <li>
            Accettano pagamenti con carte di debito, credito o tramite
            applicazioni di pagamento digitale.
          </li>
        </ul>
        <p className="text-muted-foreground mt-3 text-sm leading-relaxed">
          Sono inclusi negozi al dettaglio, ristoranti, bar, ambulanti con POS,
          professionisti e in generale chiunque emetta scontrini elettronici.
        </p>
        <p className="text-muted-foreground mt-3 text-sm leading-relaxed">
          <strong>Eccezione:</strong> chi usa il POS{" "}
          <strong>esclusivamente</strong> per operazioni esenti
          dall&apos;obbligo di certificazione (es. tabacchi e generi di
          monopolio, vendite a distanza) può dichiararlo come{" "}
          <em>POS non collegato</em> nel portale AdE, senza associarlo. Se però
          lo stesso POS viene usato anche occasionalmente per operazioni
          soggette a certificazione, il collegamento torna obbligatorio.
        </p>

        {/* ─── ScontrinoZero e la conformità ─── */}
        <h2 className="mt-10 text-xl font-semibold">
          ScontrinoZero e la conformità
        </h2>
        <p className="text-muted-foreground mt-3 text-sm leading-relaxed">
          ScontrinoZero usa la procedura{" "}
          <strong>Documento Commerciale Online</strong> dell&apos;Agenzia delle
          Entrate, che equivale a un registratore telematico virtuale. Non è
          richiesto nessun hardware aggiuntivo per la trasmissione dei
          corrispettivi.
        </p>
        <p className="text-muted-foreground mt-3 text-sm leading-relaxed">
          Quando emetti uno scontrino e selezioni <strong>Carta</strong> come
          metodo di pagamento, ScontrinoZero trasmette all&apos;AdE il codice
          pagamento elettronico{" "}
          <code className="bg-muted rounded px-1 font-mono text-xs">PE</code>{" "}
          insieme al documento. La selezione del metodo di pagamento è{" "}
          <strong>manuale</strong>: ScontrinoZero non si interfaccia con il POS
          fisico, è l&apos;esercente a scegliere nell&apos;app come è stato
          incassato lo scontrino.
        </p>
        <div className="mt-4 rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm dark:border-amber-800 dark:bg-amber-950">
          <strong>Procedura obbligatoria a carico dell&apos;esercente:</strong>{" "}
          accedi al portale Fatture e Corrispettivi, apri la funzione{" "}
          <em>Gestione collegamenti</em> e associa la matricola del tuo POS al
          DCO. Per chi usa la procedura DCO l&apos;associazione{" "}
          <strong>non è delegabile</strong> a intermediari (commercialista,
          CAF): la deve fare direttamente l&apos;operatore titolare delle
          credenziali Fisconline. Servono il numero di matricola del POS, i dati
          identificativi dello strumento di pagamento e l&apos;indirizzo
          dell&apos;esercizio.
        </div>

        {/* ─── Scadenze ─── */}
        <h2 className="mt-10 text-xl font-semibold">Scadenze principali</h2>
        <div className="text-muted-foreground mt-3 overflow-x-auto text-sm">
          <table className="w-full border-collapse">
            <thead>
              <tr className="border-b">
                <th className="py-2 pr-6 text-left text-xs font-semibold tracking-wide uppercase">
                  Data
                </th>
                <th className="py-2 text-left text-xs font-semibold tracking-wide uppercase">
                  Cosa cambia
                </th>
              </tr>
            </thead>
            <tbody>
              <tr className="border-b">
                <td className="py-2 pr-6 font-medium">1° gen. 2026</td>
                <td className="py-2">
                  Entrata in vigore dell&apos;obbligo di collegamento POS-RT (L.
                  207/2024, commi 74-76).
                </td>
              </tr>
              <tr className="border-b">
                <td className="py-2 pr-6 font-medium">5 mar. 2026</td>
                <td className="py-2">
                  Attivazione del servizio <em>Gestione collegamenti</em> sul
                  portale Fatture e Corrispettivi dell&apos;AdE.
                </td>
              </tr>
              <tr className="border-b">
                <td className="py-2 pr-6 font-medium">20 apr. 2026</td>
                <td className="py-2">
                  Scadenza prima comunicazione per i POS già attivi al 1°
                  gennaio 2026 o utilizzati entro il 31 gennaio 2026.
                </td>
              </tr>
              <tr className="border-b">
                <td className="py-2 pr-6 font-medium">POS nuovi</td>
                <td className="py-2">
                  Comunicazione tra il 6° giorno e l&apos;ultimo giorno
                  lavorativo del 2° mese successivo all&apos;attivazione del
                  POS.
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        {/* ─── Sanzioni ─── */}
        <h2 className="mt-10 text-xl font-semibold">Sanzioni</h2>
        <p className="text-muted-foreground mt-3 text-sm leading-relaxed">
          Per il <strong>mancato collegamento</strong> tra POS e strumento di
          memorizzazione dei corrispettivi si applica la sanzione amministrativa
          da <strong>€1.000 a €4.000</strong> (art. 11 comma 5 D.Lgs. 471/97,
          richiamato dall&apos;art. 2 comma 6 D.Lgs. 127/2015 nella versione
          modificata dalla L. 207/2024). È inoltre prevista la sospensione della
          licenza o dell&apos;autorizzazione all&apos;esercizio
          dell&apos;attività da <strong>3 giorni a 1 mese</strong> (art. 12
          comma 3 D.Lgs. 471/97).
        </p>
        <p className="text-muted-foreground mt-3 text-sm leading-relaxed">
          ScontrinoZero copre la <em>trasmissione</em> dei corrispettivi
          all&apos;AdE, ma l&apos;<em>associazione POS-DCO</em> sul portale
          Fatture e Corrispettivi è una procedura separata che spetta
          all&apos;esercente: assicurati di completarla entro le scadenze sopra
          indicate per evitare sanzioni.
        </p>

        <RelatedHelpArticles slug="pos-rt-obbligo" />

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
