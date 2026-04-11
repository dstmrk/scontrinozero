import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Badge } from "@/components/ui/badge";

export const metadata: Metadata = {
  title: "Come emettere il primo scontrino elettronico | ScontrinoZero Help",
  description:
    "Guida passo-passo per emettere il primo scontrino elettronico con ScontrinoZero: apertura cassa, aggiunta prodotti, selezione pagamento e trasmissione AdE.",
};

export default function PrimoScontinoPage() {
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
            Come emettere il primo scontrino elettronico
          </h1>
          <Badge variant="secondary">Partenza rapida</Badge>
        </div>
        <p className="text-muted-foreground mt-3 text-sm leading-relaxed">
          Questa guida ti accompagna dall&apos;apertura della cassa fino
          all&apos;invio dello scontrino all&apos;Agenzia delle Entrate. Il
          processo richiede circa 30 secondi una volta che la configurazione è
          completata.
        </p>
        <p className="text-muted-foreground mt-1 text-sm">
          <strong>Ultimo aggiornamento:</strong> aprile 2026
        </p>

        {/* ─── Prerequisiti ─── */}
        <h2 className="mt-10 text-xl font-semibold">Prima di iniziare</h2>
        <p className="text-muted-foreground mt-3 text-sm leading-relaxed">
          Assicurati di aver completato questi passaggi:
        </p>
        <ul className="text-muted-foreground mt-2 list-disc space-y-1 pl-5 text-sm leading-relaxed">
          <li>
            Onboarding completato (P.IVA, ragione sociale e dati attività
            inseriti).
          </li>
          <li>
            Credenziali AdE collegate e verificate. Non le hai ancora?{" "}
            <Link
              href="/help/come-collegare-ade"
              className="text-primary hover:underline"
            >
              Segui questa guida
            </Link>
            .
          </li>
          <li>
            Regime fiscale configurato correttamente (es. regime forfettario,
            IVA ordinaria).
          </li>
        </ul>

        {/* ─── Passaggi ─── */}
        <h2 className="mt-10 text-xl font-semibold">
          Passaggio 1 — Apri la Cassa
        </h2>
        <p className="text-muted-foreground mt-3 text-sm leading-relaxed">
          Dal menu laterale della dashboard, clicca su <strong>Cassa</strong>.
          Su mobile trovi il pulsante <strong>Cassa</strong> nella barra di
          navigazione in basso.
        </p>

        <h2 className="mt-10 text-xl font-semibold">
          Passaggio 2 — Aggiungi i prodotti o l&apos;importo
        </h2>
        <p className="text-muted-foreground mt-3 text-sm leading-relaxed">
          Hai due modi per aggiungere quanto venduto:
        </p>
        <ul className="text-muted-foreground mt-2 list-disc space-y-2 pl-5 text-sm leading-relaxed">
          <li>
            <strong>Importo libero</strong> — digita direttamente l&apos;importo
            totale della vendita usando il tastierino numerico. Ideale per
            vendite rapide.
          </li>
          <li>
            <strong>Prodotti dal catalogo</strong> — seleziona uno o più
            prodotti salvati in precedenza (Piano Starter: fino a 5 prodotti;
            Piano Pro: illimitati). L&apos;importo si calcola automaticamente.
          </li>
        </ul>
        <p className="text-muted-foreground mt-3 text-sm leading-relaxed">
          Puoi mescolare le due modalità: aggiungi prodotti dal catalogo e
          aggiungi righe manuali per prodotti non catalogati.
        </p>

        <h2 className="mt-10 text-xl font-semibold">
          Passaggio 3 — Seleziona il metodo di pagamento
        </h2>
        <p className="text-muted-foreground mt-3 text-sm leading-relaxed">
          Scegli come il cliente ha pagato:
        </p>
        <ul className="text-muted-foreground mt-2 list-disc space-y-1 pl-5 text-sm leading-relaxed">
          <li>
            <strong>Contanti</strong>
          </li>
          <li>
            <strong>Carta / POS</strong> (bancomat, carta di credito)
          </li>
          <li>
            <strong>Bonifico / altro</strong>
          </li>
          <li>
            <strong>Pagamento misto</strong> — puoi suddividere l&apos;importo
            tra più metodi (es. €10 contanti + €5 carta).
          </li>
        </ul>
        <p className="text-muted-foreground mt-3 text-sm leading-relaxed">
          Il metodo di pagamento è obbligatorio e viene incluso nel documento
          commerciale trasmesso all&apos;AdE.
        </p>

        <h2 className="mt-10 text-xl font-semibold">
          Passaggio 4 — Emetti lo scontrino
        </h2>
        <p className="text-muted-foreground mt-3 text-sm leading-relaxed">
          Tocca il pulsante <strong>Emetti scontrino</strong>. Ecco cosa
          succede:
        </p>
        <ol className="text-muted-foreground mt-3 list-decimal space-y-2 pl-5 text-sm leading-relaxed">
          <li>
            Lo scontrino appare immediatamente nella schermata di successo con
            numero progressivo e importo (&quot;effetto ottimistico&quot;: lo
            vedi subito, la trasmissione AdE avviene in background).
          </li>
          <li>
            ScontrinoZero invia il documento al portale Fatture e Corrispettivi
            dell&apos;Agenzia delle Entrate e riceve la conferma.
          </li>
          <li>
            Lo stato dello scontrino passa da <strong>In elaborazione</strong> a{" "}
            <strong>Trasmesso</strong> (di solito entro pochi secondi, raramente
            qualche minuto se il portale AdE è sotto carico).
          </li>
        </ol>

        <h2 className="mt-10 text-xl font-semibold">
          Passaggio 5 — Condividi o stampa
        </h2>
        <p className="text-muted-foreground mt-3 text-sm leading-relaxed">
          Dalla schermata di conferma puoi:
        </p>
        <ul className="text-muted-foreground mt-2 list-disc space-y-1 pl-5 text-sm leading-relaxed">
          <li>
            <strong>Condividere il link</strong> — il cliente riceve un link
            alla pagina pubblica dello scontrino (valido permanentemente).
          </li>
          <li>
            <strong>Scaricare il PDF</strong> — per inviarlo via WhatsApp, email
            o stamparlo.
          </li>
          <li>
            <strong>Stampare direttamente</strong> — se hai una stampante
            termica Bluetooth configurata.
          </li>
        </ul>
        <p className="text-muted-foreground mt-3 text-sm leading-relaxed">
          Consegnare il documento al cliente (link, PDF o stampa) è obbligatorio
          per legge.
        </p>

        {/* ─── Domande frequenti ─── */}
        <h2 className="mt-10 text-xl font-semibold">Domande frequenti</h2>
        <div className="mt-3 space-y-4">
          <div>
            <p className="text-sm font-medium">
              Lo scontrino è rimasto in stato &quot;In elaborazione&quot; a
              lungo — cosa faccio?
            </p>
            <p className="text-muted-foreground mt-1 text-sm leading-relaxed">
              Il portale AdE può essere lento o in manutenzione. Lo scontrino
              viene ritentato automaticamente. Puoi controllare lo stato nello{" "}
              <strong>Storico</strong>. Se dopo 30 minuti è ancora in
              elaborazione, controlla che le credenziali AdE siano valide nelle
              impostazioni.
            </p>
          </div>
          <div>
            <p className="text-sm font-medium">
              Ho sbagliato importo — posso modificare lo scontrino?
            </p>
            <p className="text-muted-foreground mt-1 text-sm leading-relaxed">
              Gli scontrini fiscali non si modificano. Devi{" "}
              <Link
                href="/help/annullare-scontrino"
                className="text-primary hover:underline"
              >
                annullare lo scontrino errato
              </Link>{" "}
              e emetterne uno corretto.
            </p>
          </div>
          <div>
            <p className="text-sm font-medium">
              Dove trovo gli scontrini già emessi?
            </p>
            <p className="text-muted-foreground mt-1 text-sm leading-relaxed">
              Nella sezione <strong>Storico</strong> della dashboard. Puoi
              filtrare per data, importo e stato di trasmissione, e scaricare il
              PDF di qualsiasi scontrino precedente.
            </p>
          </div>
        </div>

        {/* ─── Link correlati ─── */}
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
              href="/help/regime-forfettario"
              className="text-primary hover:underline"
            >
              Regime forfettario: configurazione IVA corretta
            </Link>
          </li>
          <li>
            <Link
              href="/help/come-collegare-ade"
              className="text-primary hover:underline"
            >
              Come collegare ScontrinoZero all&apos;Agenzia delle Entrate
            </Link>
          </li>
        </ul>

        {/* ─── Footer articolo ─── */}
        <div className="border-border mt-12 border-t pt-6">
          <p className="text-muted-foreground text-xs">
            {"Hai trovato un errore in questa guida? "}
            <a
              href="mailto:supporto@scontrinozero.it"
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
