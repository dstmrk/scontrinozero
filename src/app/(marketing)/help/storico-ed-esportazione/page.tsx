import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Badge } from "@/components/ui/badge";

export const metadata: Metadata = {
  title:
    "Storico scontrini: filtri, ricerca ed esportazione | ScontrinoZero Help",
  description:
    "Come navigare lo storico degli scontrini in ScontrinoZero, usare i filtri di ricerca e esportare i dati in CSV per la contabilità.",
};

export default function StoricoEdEsportazionePage() {
  return (
    <section className="px-4 py-16">
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
            Storico scontrini: filtri, ricerca ed esportazione
          </h1>
          <Badge variant="secondary">Gestione scontrini</Badge>
        </div>
        <p className="text-muted-foreground mt-3 text-sm leading-relaxed">
          La sezione <strong>Storico</strong> raccoglie tutti gli scontrini
          emessi e annullati. Puoi filtrare per data e importo, aprire il
          dettaglio di ogni documento e — con il piano Pro — esportare tutto
          in CSV per il commercialista.
        </p>
        <p className="text-muted-foreground mt-1 text-sm">
          <strong>Ultimo aggiornamento:</strong> aprile 2026
        </p>

        {/* ─── Come accedere ─── */}
        <h2 className="mt-10 text-xl font-semibold">Come accedere allo Storico</h2>
        <ol className="text-muted-foreground mt-3 list-decimal space-y-2 pl-5 text-sm leading-relaxed">
          <li>
            Dalla dashboard, tocca <strong>Storico</strong> nella barra
            laterale (o nel menu in basso su mobile).
          </li>
          <li>
            Vedrai l&apos;elenco degli scontrini in ordine cronologico
            inverso, dal più recente al più vecchio.
          </li>
          <li>
            Ogni riga mostra: data, ora, importo totale, metodo di pagamento
            e stato (Trasmesso, In elaborazione, Annullato).
          </li>
        </ol>

        {/* ─── Filtri disponibili ─── */}
        <h2 className="mt-10 text-xl font-semibold">Filtri disponibili</h2>
        <p className="text-muted-foreground mt-3 text-sm leading-relaxed">
          Usa i filtri in cima alla lista per restringere i risultati:
        </p>
        <div className="mt-3 space-y-3">
          <div>
            <p className="text-sm font-medium">Intervallo di date</p>
            <p className="text-muted-foreground mt-1 text-sm leading-relaxed">
              Seleziona una data di inizio e una di fine per vedere solo gli
              scontrini di quel periodo. Utile per riepilogo mensile o
              trimestrale.
            </p>
          </div>
          <div>
            <p className="text-sm font-medium">Stato</p>
            <p className="text-muted-foreground mt-1 text-sm leading-relaxed">
              Filtra per <strong>Trasmesso</strong>,{" "}
              <strong>In elaborazione</strong> o <strong>Annullato</strong>.
              Il filtro &quot;In elaborazione&quot; è utile per individuare
              rapidamente documenti la cui trasmissione all&apos;AdE è ancora
              in corso.
            </p>
          </div>
          <div>
            <p className="text-sm font-medium">Importo</p>
            <p className="text-muted-foreground mt-1 text-sm leading-relaxed">
              Inserisci un importo minimo e/o massimo per trovare scontrini di
              un certo valore — comodo per identificare una transazione
              specifica.
            </p>
          </div>
        </div>

        {/* ─── Dettaglio scontrino ─── */}
        <h2 className="mt-10 text-xl font-semibold">
          Aprire il dettaglio di uno scontrino
        </h2>
        <p className="text-muted-foreground mt-3 text-sm leading-relaxed">
          Tocca una riga per aprire il dettaglio completo del documento. Qui
          trovi:
        </p>
        <ul className="text-muted-foreground mt-2 list-disc space-y-1 pl-5 text-sm leading-relaxed">
          <li>Numero documento e data/ora di emissione.</li>
          <li>Elenco delle righe con descrizione, aliquota IVA e importo.</li>
          <li>Totale e ripartizione per metodo di pagamento.</li>
          <li>Codice lotteria (se applicabile).</li>
          <li>
            Stato trasmissione AdE con timestamp di conferma.
          </li>
          <li>
            Link al PDF dello scontrino (condivisibile via WhatsApp, email,
            ecc.).
          </li>
        </ul>
        <p className="text-muted-foreground mt-3 text-sm leading-relaxed">
          Dal dettaglio puoi anche avviare l&apos;
          <strong>annullamento</strong> dello scontrino, se è in stato
          Trasmesso.
        </p>

        {/* ─── Export CSV ─── */}
        <h2 className="mt-10 text-xl font-semibold">
          Esportazione CSV{" "}
          <Badge className="ml-1" variant="secondary">
            Piano Pro
          </Badge>
        </h2>
        <p className="text-muted-foreground mt-3 text-sm leading-relaxed">
          Gli utenti con piano <strong>Pro</strong> possono esportare lo
          storico scontrini in formato CSV. Il file è compatibile con Excel,
          Google Sheets e qualsiasi software di contabilità.
        </p>
        <h3 className="mt-5 text-base font-semibold">Come esportare</h3>
        <ol className="text-muted-foreground mt-2 list-decimal space-y-2 pl-5 text-sm leading-relaxed">
          <li>
            Vai in <strong>Storico</strong> e imposta i filtri desiderati
            (periodo, stato).
          </li>
          <li>
            Clicca su <strong>Esporta CSV</strong> in alto a destra.
          </li>
          <li>
            Il file viene generato e scaricato automaticamente nel browser.
          </li>
        </ol>
        <h3 className="mt-5 text-base font-semibold">
          Cosa contiene il CSV
        </h3>
        <p className="text-muted-foreground mt-2 text-sm leading-relaxed">
          Il file include una riga per ogni scontrino con le colonne:
        </p>
        <ul className="text-muted-foreground mt-2 list-disc space-y-1 pl-5 text-sm leading-relaxed">
          <li>Numero documento</li>
          <li>Data e ora di emissione</li>
          <li>Stato (Trasmesso / Annullato)</li>
          <li>Importo lordo totale</li>
          <li>IVA per aliquota (4%, 10%, 22%, Esente)</li>
          <li>Metodo di pagamento (Contante, Carta, Altro)</li>
          <li>Codice lotteria (se presente)</li>
        </ul>
        <p className="text-muted-foreground mt-3 text-sm leading-relaxed">
          Se sei nel piano Starter e vuoi accedere all&apos;export CSV,
          puoi passare a Pro dalla sezione{" "}
          <strong>Dashboard &gt; Impostazioni &gt; Abbonamento</strong>.
        </p>

        {/* ─── Casi d'uso comuni ─── */}
        <h2 className="mt-10 text-xl font-semibold">Casi d&apos;uso comuni</h2>
        <div className="mt-3 space-y-4">
          <div>
            <p className="text-sm font-medium">
              Riepilogo mensile per il commercialista
            </p>
            <p className="text-muted-foreground mt-1 text-sm leading-relaxed">
              Filtra per il mese di riferimento, esporta il CSV e invialo al
              commercialista. Il file contiene già la ripartizione IVA per
              aliquota, pronta per la liquidazione.
            </p>
          </div>
          <div>
            <p className="text-sm font-medium">
              Trovare uno scontrino specifico per un cliente
            </p>
            <p className="text-muted-foreground mt-1 text-sm leading-relaxed">
              Usa il filtro per data e importo per identificare rapidamente lo
              scontrino. Dal dettaglio puoi riaprire il PDF e ricondividerlo
              via WhatsApp o email.
            </p>
          </div>
          <div>
            <p className="text-sm font-medium">
              Verificare scontrini in attesa di conferma AdE
            </p>
            <p className="text-muted-foreground mt-1 text-sm leading-relaxed">
              Filtra per stato <strong>In elaborazione</strong>: se vedi
              documenti fermi da più di 15 minuti, potrebbe esserci un
              problema di connessione o un errore AdE. Consulta la guida{" "}
              <Link
                href="/help/errori-ade"
                className="text-primary hover:underline"
              >
                Errori comuni di accesso AdE
              </Link>{" "}
              per diagnosticare.
            </p>
          </div>
        </div>

        {/* ─── Articoli correlati ─── */}
        <h2 className="mt-10 text-xl font-semibold">Articoli correlati</h2>
        <ul className="mt-3 space-y-1 text-sm">
          <li>
            <Link
              href="/help/annullare-scontrino"
              className="text-primary hover:underline"
            >
              Annullare uno scontrino: quando si può e come fare
            </Link>
          </li>
          <li>
            <Link
              href="/help/cassetto-fiscale"
              className="text-primary hover:underline"
            >
              Dove verificare i corrispettivi nel cassetto fiscale
            </Link>
          </li>
          <li>
            <Link
              href="/help/piani-e-prezzi"
              className="text-primary hover:underline"
            >
              Piani disponibili: Starter, Pro e self-hosted gratuito
            </Link>
          </li>
        </ul>

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
