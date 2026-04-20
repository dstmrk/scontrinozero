import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Badge } from "@/components/ui/badge";

export const metadata: Metadata = {
  title:
    "Annullare uno scontrino: quando si può e come fare | ScontrinoZero Help",
  description:
    "Scopri quando è possibile annullare uno scontrino elettronico, come farlo da ScontrinoZero e cosa succede sul portale dell'Agenzia delle Entrate.",
};

export default function AnnullareScontrinoPage() {
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
            Annullare uno scontrino: quando si può e come fare
          </h1>
          <Badge variant="secondary">Gestione scontrini</Badge>
        </div>
        <p className="text-muted-foreground mt-3 text-sm leading-relaxed">
          Uno scontrino elettronico non si &quot;cancella&quot;: si emette un{" "}
          <strong>documento di annullo</strong> che rettifica il documento
          originale nel cassetto fiscale dell&apos;Agenzia delle Entrate. Questa
          guida spiega come farlo da ScontrinoZero e in quali casi è possibile.
        </p>
        <p className="text-muted-foreground mt-1 text-sm">
          <strong>Ultimo aggiornamento:</strong> aprile 2026
        </p>

        {/* ─── Quando si può annullare ─── */}
        <h2 className="mt-10 text-xl font-semibold">
          Quando è possibile annullare
        </h2>
        <p className="text-muted-foreground mt-3 text-sm leading-relaxed">
          In ScontrinoZero puoi annullare uno scontrino che è stato{" "}
          <strong>accettato dall&apos;AdE</strong> (nello Storico vedrai il
          badge verde <strong>&quot;Emesso&quot;</strong>). Il caso d&apos;uso
          tipico è:
        </p>
        <ul className="text-muted-foreground mt-2 list-disc space-y-1 pl-5 text-sm leading-relaxed">
          <li>
            Scontrino emesso per errore (importo sbagliato, prodotto errato,
            duplicato).
          </li>
          <li>
            Storno concordato con il cliente prima che la vendita si consolidi
            (p.es. il cliente cambia idea subito dopo l&apos;emissione).
          </li>
        </ul>
        <p className="text-muted-foreground mt-3 text-sm leading-relaxed">
          <strong>Non è possibile annullare:</strong>
        </p>
        <ul className="text-muted-foreground mt-2 list-disc space-y-1 pl-5 text-sm leading-relaxed">
          <li>
            {"Scontrini già annullati (badge "}
            <strong>&quot;Annullato&quot;</strong>
            {")."}
          </li>
          <li>
            {"Scontrini ancora in attesa di conferma AdE (badge giallo "}
            <strong>&quot;PENDING&quot;</strong>
            {": aspetta che diventino "}
            <em>Emesso</em>
            {" prima di annullare."}
          </li>
          <li>
            Scontrini con stato <strong>&quot;Errore&quot;</strong>: non sono
            mai stati registrati dall&apos;AdE, quindi non c&apos;è nulla da
            annullare. Riemetti la vendita dalla Cassa.
          </li>
        </ul>
        <p className="text-muted-foreground mt-3 text-sm leading-relaxed">
          <strong>Reso merce post-vendita:</strong> il Provvedimento AdE sui
          corrispettivi telematici prevede, per il reso di prodotti già
          consegnati, un <em>documento commerciale per reso merce</em> distinto
          dall&apos;annullo. In questa versione ScontrinoZero non espone quel
          tipo di documento: in pratica il reso si gestisce annullando lo
          scontrino originale e, se il reso è parziale, ri-emettendo dalla Cassa
          uno scontrino con il solo importo effettivamente venduto. Per casi
          complessi (reso dopo mesi, parziale con più prodotti) consulta il tuo
          commercialista.
        </p>

        {/* ─── Limiti temporali ─── */}
        <h2 className="mt-10 text-xl font-semibold">Limiti temporali</h2>
        <p className="text-muted-foreground mt-3 text-sm leading-relaxed">
          {
            "Per il Documento Commerciale Online non esiste una finestra rigida di annullo: puoi procedere anche diversi giorni dopo l\u2019emissione (diversamente dai registratori telematici fisici, dove spesso la finestra coincide con la chiusura giornaliera). La best practice fiscale resta però di "
          }
          <strong>
            annullare il prima possibile e comunque entro il periodo
            d&apos;imposta
          </strong>
          {
            ": ogni ritardo rende più complicata la riconciliazione dei corrispettivi giornalieri nel cassetto fiscale."
          }
        </p>

        {/* ─── Come fare ─── */}
        <h2 className="mt-10 text-xl font-semibold">
          Come annullare uno scontrino da ScontrinoZero
        </h2>
        <ol className="text-muted-foreground mt-3 list-decimal space-y-2 pl-5 text-sm leading-relaxed">
          <li>
            Vai nella sezione <strong>Storico</strong> dalla barra laterale.
          </li>
          <li>
            Trova lo scontrino usando i filtri per intervallo di date o
            paginando la lista.
          </li>
          <li>
            Clicca sullo scontrino per aprire il dettaglio, quindi tocca{" "}
            <strong>Annulla scontrino</strong> (il pulsante compare solo se lo
            stato è <em>Emesso</em>).
          </li>
          <li>
            Leggi il riepilogo, poi conferma cliccando di nuovo{" "}
            <strong>Annulla scontrino</strong> nel dialog rosso. Un avviso ti
            ricorda che l&apos;operazione è irreversibile.
          </li>
          <li>
            ScontrinoZero invia il documento di annullo all&apos;AdE. A conferma
            vedrai il <strong>progressivo dell&apos;annullo</strong>; lo
            scontrino originale passa a stato <strong>Annullato</strong>.
          </li>
        </ol>

        {/* ─── Cosa succede dopo ─── */}
        <h2 className="mt-10 text-xl font-semibold">
          Cosa succede dopo l&apos;annullo
        </h2>
        <ul className="text-muted-foreground mt-3 list-disc space-y-2 pl-5 text-sm leading-relaxed">
          <li>
            L&apos;AdE registra il documento di annullo nel cassetto fiscale e
            rettifica i corrispettivi del giorno.
          </li>
          <li>
            Lo scontrino originale <strong>non viene eliminato</strong>: rimane
            nello Storico con badge <em>Annullato</em> e un riferimento al
            documento di annullo.
          </li>
          <li>
            Un secondo tentativo di annullo sullo stesso scontrino viene
            bloccato automaticamente da un vincolo del database: è garantito che
            non puoi creare due annulli per lo stesso documento.
          </li>
          <li>
            Se vuoi emettere uno scontrino corretto al posto di quello
            annullato, fallo separatamente dalla <strong>Cassa</strong> come
            nuova vendita.
          </li>
        </ul>

        {/* ─── Rimborso al cliente ─── */}
        <h2 className="mt-10 text-xl font-semibold">
          Reso merce: devo fare altro?
        </h2>
        <p className="text-muted-foreground mt-3 text-sm leading-relaxed">
          L&apos;annullo dello scontrino è sufficiente ai fini fiscali. Il
          rimborso al cliente (contante, bonifico, voucher) è una questione
          commerciale separata che gestisci tu direttamente — non passa
          attraverso ScontrinoZero.
        </p>

        {/* ─── Errori frequenti ─── */}
        <h2 className="mt-10 text-xl font-semibold">Problemi frequenti</h2>
        <div className="mt-3 space-y-4">
          <div>
            <p className="text-sm font-medium">
              Il pulsante &quot;Annulla scontrino&quot; non compare
            </p>
            <p className="text-muted-foreground mt-1 text-sm leading-relaxed">
              Succede quando lo scontrino non è in stato <em>Emesso</em>: se è
              ancora <strong>PENDING</strong> aspetta la conferma AdE, se è{" "}
              <strong>Errore</strong> non è stato registrato all&apos;origine
              quindi non c&apos;è nulla da annullare, se è già{" "}
              <strong>Annullato</strong> l&apos;operazione è stata fatta.
            </p>
          </div>
          <div>
            <p className="text-sm font-medium">
              Ricevo un errore durante l&apos;annullo — cosa faccio?
            </p>
            <p className="text-muted-foreground mt-1 text-sm leading-relaxed">
              L&apos;errore viene mostrato in rosso nel dialog e lo scontrino
              resta in stato <em>Emesso</em> (l&apos;annullo non è andato a buon
              fine). Puoi <strong>riprovare manualmente</strong> chiudendo e
              riaprendo il dialog: ScontrinoZero usa una chiave di idempotenza
              per garantire che eventuali retry non creino annulli duplicati. Se
              l&apos;errore persiste, controlla lo stato del portale AdE e
              contatta il supporto a{" "}
              <a
                href="mailto:info@scontrinozero.it"
                className="text-primary hover:underline"
              >
                info@scontrinozero.it
              </a>
              {"."}
            </p>
          </div>
          <div>
            <p className="text-sm font-medium">
              Ho annullato per errore — posso tornare indietro?
            </p>
            <p className="text-muted-foreground mt-1 text-sm leading-relaxed">
              No: il documento di annullo trasmesso all&apos;AdE non può essere
              ritirato. Devi emettere un nuovo scontrino dalla Cassa con
              l&apos;importo corretto.
            </p>
          </div>
        </div>

        {/* ─── Link correlati ─── */}
        <h2 className="mt-10 text-xl font-semibold">Articoli correlati</h2>
        <ul className="mt-3 space-y-1 text-sm">
          <li>
            <Link
              href="/help/primo-scontrino"
              className="text-primary hover:underline"
            >
              Come emettere il primo scontrino elettronico
            </Link>
          </li>
          <li>
            <Link
              href="/help/storico-ed-esportazione"
              className="text-primary hover:underline"
            >
              Storico scontrini: filtri, ricerca ed esportazione
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
