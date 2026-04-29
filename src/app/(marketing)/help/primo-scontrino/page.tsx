import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { JsonLd, helpArticleBreadcrumb } from "@/components/json-ld";

export const metadata: Metadata = {
  title: "Come emettere il primo scontrino elettronico | ScontrinoZero Help",
  description:
    "Guida passo-passo per emettere il primo scontrino elettronico con ScontrinoZero: apertura cassa, aggiunta prodotti, selezione pagamento e trasmissione AdE.",
};

export default function PrimoScontrinoPage() {
  return (
    <section className="px-4 py-16">
      <JsonLd
        data={helpArticleBreadcrumb(
          "primo-scontrino",
          "Primo scontrino elettronico",
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
          Da desktop, apri la dashboard e clicca <strong>Cassa</strong> nel menu
          in alto. Su mobile trovi <strong>Cassa</strong> nella barra di
          navigazione in basso.
        </p>

        <h2 className="mt-10 text-xl font-semibold">
          Passaggio 2 — Aggiungi gli articoli
        </h2>
        <p className="text-muted-foreground mt-3 text-sm leading-relaxed">
          Ogni scontrino è composto da una o più righe (massimo 100). Puoi
          aggiungerle in due modi:
        </p>
        <ul className="text-muted-foreground mt-2 list-disc space-y-2 pl-5 text-sm leading-relaxed">
          <li>
            <strong>Riga manuale rapida</strong> — premi il pulsante{" "}
            <strong>+</strong> nel carrello, inserisci il prezzo con il
            tastierino numerico, scegli quantità e aliquota IVA, quindi premi{" "}
            <strong>Aggiungi</strong>. La descrizione è facoltativa: se la lasci
            vuota la riga comparirà come &quot;Vendita&quot;.
          </li>
          <li>
            <strong>Prodotti dal catalogo</strong> — tocca un prodotto salvato
            in precedenza nella Dashboard per inserirlo nel carrello con prezzo
            e IVA già compilati (piano Starter: fino a 5 prodotti nel catalogo;
            piano Pro: illimitati).
          </li>
        </ul>
        <p className="text-muted-foreground mt-3 text-sm leading-relaxed">
          Puoi mescolare le due modalità: aggiungi prodotti dal catalogo e
          inserisci righe manuali per gli articoli non catalogati. Le aliquote
          disponibili sono 4%, 5%, 10%, 22% e sei codici natura a 0% (N1–N6) per
          le operazioni non imponibili, esenti o escluse.
        </p>

        <h2 className="mt-10 text-xl font-semibold">
          Passaggio 3 — Conferma il carrello e scegli il pagamento
        </h2>
        <p className="text-muted-foreground mt-3 text-sm leading-relaxed">
          Quando il carrello è pronto premi <strong>Continua</strong>. Nella
          schermata di riepilogo vedi le righe, il totale e scegli come il
          cliente ha pagato:
        </p>
        <ul className="text-muted-foreground mt-2 list-disc space-y-1 pl-5 text-sm leading-relaxed">
          <li>
            <strong>Contanti</strong>
          </li>
          <li>
            <strong>Carta</strong> (bancomat, carta di credito, altri strumenti
            elettronici)
          </li>
        </ul>
        <p className="text-muted-foreground mt-3 text-sm leading-relaxed">
          Il metodo di pagamento è obbligatorio: lo scontrino accetta un solo
          metodo per documento (non sono previsti pagamenti misti). Se scegli{" "}
          <strong>Carta</strong> puoi anche inserire il{" "}
          <strong>Codice lotteria</strong> (8 caratteri, scontrini da almeno €1)
          per far partecipare il cliente alla Lotteria degli Scontrini.
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
            Il pulsante si trasforma in <strong>Invio in corso…</strong> mentre
            ScontrinoZero accede al portale Fatture e Corrispettivi
            dell&apos;Agenzia delle Entrate con le tue credenziali Fisconline e
            trasmette il documento commerciale.
          </li>
          <li>
            Alla conferma dell&apos;AdE (in genere 1-3 secondi) si apre la
            schermata di successo con l&apos;<strong>Identificativo AdE</strong>{" "}
            (numero progressivo) e l&apos;<strong>ID transazione</strong>.
          </li>
          <li>
            Nello Storico lo scontrino compare con il badge{" "}
            <strong>Emesso</strong>. Se la trasmissione fallisce il pulsante
            mostra l&apos;errore direttamente in cassa, prima di chiudere lo
            scontrino.
          </li>
        </ol>

        <h2 className="mt-10 text-xl font-semibold">
          Passaggio 5 — Condividi lo scontrino col cliente
        </h2>
        <p className="text-muted-foreground mt-3 text-sm leading-relaxed">
          Dalla schermata di successo hai due pulsanti:
        </p>
        <ul className="text-muted-foreground mt-2 list-disc space-y-1 pl-5 text-sm leading-relaxed">
          <li>
            <strong>Invia ricevuta</strong> — da mobile apre il menu di
            condivisione del sistema (WhatsApp, email, SMS…); da desktop copia
            negli appunti il link pubblico della ricevuta, nella forma{" "}
            <code>/r/&lt;id&gt;</code>.
          </li>
          <li>
            <strong>Nuovo scontrino</strong> — azzera il carrello e torna alla
            cassa per la vendita successiva.
          </li>
        </ul>
        <p className="text-muted-foreground mt-3 text-sm leading-relaxed">
          Aprendo il link pubblico, tu o il cliente potete scaricare il PDF e
          stamparlo con la funzione di stampa del browser o del sistema
          operativo (inclusa una stampante termica Bluetooth associata al
          dispositivo).
        </p>
        <p className="text-muted-foreground mt-3 text-sm leading-relaxed">
          Consegnare il documento commerciale al cliente — in forma cartacea o
          digitale — è obbligatorio ai sensi del DM 7/12/2016 e del D.Lgs.
          127/2015.
        </p>

        {/* ─── Domande frequenti ─── */}
        <h2 className="mt-10 text-xl font-semibold">Domande frequenti</h2>
        <div className="mt-3 space-y-4">
          <div>
            <p className="text-sm font-medium">
              L&apos;emissione mi ha restituito un errore — cosa faccio?
            </p>
            <p className="text-muted-foreground mt-1 text-sm leading-relaxed">
              L&apos;invio all&apos;AdE è sincrono: se qualcosa va storto il
              messaggio compare subito in cassa e lo scontrino non viene chiuso.
              Le cause più frequenti sono credenziali Fisconline scadute o
              errate (verifica in{" "}
              <strong>Impostazioni → Agenzia delle Entrate</strong>), portale
              AdE momentaneamente non disponibile, oppure codici di errore AdE
              riportati tra parentesi nel messaggio. Correggi l&apos;eventuale
              dato e premi di nuovo <strong>Emetti scontrino</strong>.
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
              filtrare per <strong>Periodo</strong> e <strong>Stato</strong>{" "}
              (Emesso, Annullato, Tutti), aprire il dettaglio di ogni scontrino
              e condividere di nuovo la ricevuta al cliente.
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
