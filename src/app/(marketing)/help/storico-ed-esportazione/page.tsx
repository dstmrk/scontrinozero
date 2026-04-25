import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Badge } from "@/components/ui/badge";

export const metadata: Metadata = {
  title:
    "Storico scontrini: filtri, ricerca ed esportazione | ScontrinoZero Help",
  description:
    "Come navigare lo storico degli scontrini in ScontrinoZero, usare i filtri di ricerca e ricondividere il PDF dei singoli scontrini. L'export CSV è una funzione in arrivo sul piano Pro.",
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
          La sezione <strong>Storico</strong> raccoglie gli scontrini emessi e
          annullati con successo. Puoi filtrare per periodo e per stato, aprire
          il dettaglio di ogni documento e ricondividerlo come PDF al cliente.
          L&apos;esportazione CSV per il commercialista è una funzione in arrivo
          sul piano Pro.
        </p>
        <p className="text-muted-foreground mt-1 text-sm">
          <strong>Ultimo aggiornamento:</strong> aprile 2026
        </p>

        {/* ─── Come accedere ─── */}
        <h2 className="mt-10 text-xl font-semibold">
          Come accedere allo Storico
        </h2>
        <ol className="text-muted-foreground mt-3 list-decimal space-y-2 pl-5 text-sm leading-relaxed">
          <li>
            Dalla dashboard, tocca <strong>Storico</strong> nella barra di
            navigazione (in alto su desktop, in basso su mobile).
          </li>
          <li>
            Vedrai l&apos;elenco degli scontrini in ordine cronologico inverso,
            dal più recente al più vecchio, con paginazione.
          </li>
          <li>
            Ogni riga mostra: <strong>data</strong>,{" "}
            <strong>progressivo</strong> (numero scontrino assegnato
            dall&apos;AdE), <strong>totale</strong> e <strong>stato</strong>{" "}
            (Emesso o Annullato).
          </li>
        </ol>
        <p className="text-muted-foreground mt-3 text-sm leading-relaxed">
          Lo Storico mostra solo gli scontrini che hanno completato la
          trasmissione all&apos;AdE: emessi correttamente o annullati. Se
          un&apos;emissione fallisce, l&apos;errore viene mostrato subito nella
          schermata di emissione e lo scontrino non viene aggiunto allo Storico.
          Per i casi di errore vedi{" "}
          <Link
            href="/help/errori-ade"
            className="text-primary hover:underline"
          >
            Errori comuni di accesso AdE
          </Link>
          {"."}
        </p>

        {/* ─── Filtri disponibili ─── */}
        <h2 className="mt-10 text-xl font-semibold">Filtri disponibili</h2>
        <p className="text-muted-foreground mt-3 text-sm leading-relaxed">
          Usa i filtri in cima alla lista per restringere i risultati:
        </p>
        <div className="mt-3 space-y-3">
          <div>
            <p className="text-sm font-medium">Periodo</p>
            <p className="text-muted-foreground mt-1 text-sm leading-relaxed">
              Seleziona una data di inizio e una di fine per vedere solo gli
              scontrini di quel periodo. Utile per il riepilogo mensile o
              trimestrale da inviare al commercialista.
            </p>
          </div>
          <div>
            <p className="text-sm font-medium">Stato</p>
            <p className="text-muted-foreground mt-1 text-sm leading-relaxed">
              Le opzioni sono <strong>Emesso</strong>,{" "}
              <strong>Annullato</strong> e <strong>Tutti</strong>. La voce
              &quot;Tutti&quot; mostra comunque solo gli scontrini emessi e
              annullati con successo: gli scontrini la cui emissione è fallita
              non compaiono mai nello Storico.
            </p>
          </div>
        </div>
        <p className="text-muted-foreground mt-3 text-sm leading-relaxed">
          Premi <strong>Cerca</strong> per applicare i filtri. Il numero totale
          di scontrini trovati viene mostrato in alto.
        </p>

        {/* ─── Dettaglio scontrino ─── */}
        <h2 className="mt-10 text-xl font-semibold">
          Aprire il dettaglio di uno scontrino
        </h2>
        <p className="text-muted-foreground mt-3 text-sm leading-relaxed">
          Tocca una riga per aprire la finestra di dettaglio. Mostra:
        </p>
        <ul className="text-muted-foreground mt-2 list-disc space-y-1 pl-5 text-sm leading-relaxed">
          <li>Numero scontrino (progressivo AdE) e data di emissione.</li>
          <li>
            Elenco delle righe con descrizione, quantità, prezzo unitario,
            aliquota IVA e importo riga.
          </li>
          <li>Totale dello scontrino.</li>
        </ul>
        <p className="text-muted-foreground mt-3 text-sm leading-relaxed">
          {"Dalla finestra di dettaglio puoi inoltre:"}
        </p>
        <ul className="text-muted-foreground mt-2 list-disc space-y-1 pl-5 text-sm leading-relaxed">
          <li>
            Premere <strong>Invia ricevuta</strong> per aprire la pagina
            pubblica dello scontrino: il link è condivisibile via WhatsApp,
            email o messaggio, e dalla pagina il cliente può salvare il PDF.
          </li>
          <li>
            Premere <strong>Annulla scontrino</strong> per avviare la procedura
            di annullo, disponibile solo se lo scontrino è in stato{" "}
            <strong>Emesso</strong>. Verrà chiesta una conferma esplicita perché
            l&apos;annullo è irreversibile e viene trasmesso all&apos;AdE come
            documento di annullo.
          </li>
        </ul>

        {/* ─── Export CSV (in arrivo) ─── */}
        <h2 className="mt-10 text-xl font-semibold">
          Esportazione CSV{" "}
          <Badge className="ml-1" variant="secondary">
            In arrivo · Piano Pro
          </Badge>
        </h2>
        <p className="text-muted-foreground mt-3 text-sm leading-relaxed">
          L&apos;esportazione dello storico scontrini in formato CSV è una
          funzione prevista per il piano <strong>Pro</strong> e non è ancora
          disponibile nell&apos;app. Quando sarà rilasciata troverai un pulsante
          dedicato nella pagina Storico e questo articolo verrà aggiornato con i
          dettagli sulle colonne incluse.
        </p>
        <p className="text-muted-foreground mt-3 text-sm leading-relaxed">
          Nel frattempo, per il riepilogo periodico al commercialista puoi
          filtrare lo Storico per periodo, prendere nota dei totali e dei
          progressivi, e condividere all&apos;occorrenza i singoli scontrini
          tramite il bottone <strong>Invia ricevuta</strong>.
        </p>
        <p className="text-muted-foreground mt-3 text-sm leading-relaxed">
          Quando la funzione sarà attiva, gli utenti del piano Starter potranno
          passare al Pro dalla sezione{" "}
          <strong>Impostazioni → Piano e Abbonamento</strong> nella dashboard.
        </p>

        {/* ─── Casi d'uso comuni ─── */}
        <h2 className="mt-10 text-xl font-semibold">Casi d&apos;uso comuni</h2>
        <div className="mt-3 space-y-4">
          <div>
            <p className="text-sm font-medium">
              Riepilogo mensile per il commercialista
            </p>
            <p className="text-muted-foreground mt-1 text-sm leading-relaxed">
              Filtra lo Storico per il mese di riferimento, comunica al
              commercialista il totale degli scontrini emessi e
              l&apos;intervallo di progressivi. L&apos;export CSV strutturato
              arriverà sul piano Pro.
            </p>
          </div>
          <div>
            <p className="text-sm font-medium">
              Trovare uno scontrino specifico per un cliente
            </p>
            <p className="text-muted-foreground mt-1 text-sm leading-relaxed">
              Filtra per periodo per restringere la lista, individua lo
              scontrino dal totale o dal progressivo, aprilo e premi{" "}
              <strong>Invia ricevuta</strong> per ottenere il link pubblico da
              condividere via WhatsApp o email.
            </p>
          </div>
          <div>
            <p className="text-sm font-medium">
              Ricondividere il PDF a un cliente che lo ha perso
            </p>
            <p className="text-muted-foreground mt-1 text-sm leading-relaxed">
              Apri il dettaglio dello scontrino dallo Storico, premi{" "}
              <strong>Invia ricevuta</strong>: si apre una pagina pubblica
              dedicata, dalla quale il cliente può salvare o stampare il PDF. Il
              link non scade.
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
