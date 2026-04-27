import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Badge } from "@/components/ui/badge";

export const metadata: Metadata = {
  title:
    "Personalizzare intestazione e dati dello scontrino | ScontrinoZero Help",
  description:
    "Come modificare la ragione sociale, l'indirizzo e i dati fiscali che appaiono sull'intestazione dello scontrino emesso da ScontrinoZero.",
};

export default function IntestazioneScontrinoPage() {
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
            Personalizzare intestazione e dati dello scontrino
          </h1>
          <Badge variant="secondary">Configurazione</Badge>
        </div>
        <p className="text-muted-foreground mt-3 text-sm leading-relaxed">
          L&apos;intestazione dello scontrino mostra i tuoi dati fiscali —
          ragione sociale, indirizzo dell&apos;attività e partita IVA. Durante
          il primo collegamento all&apos;AdE, ScontrinoZero pre-popola questi
          campi leggendoli dal portale Fatture e Corrispettivi; in seguito puoi
          modificarli direttamente in app, eccetto P.IVA e codice fiscale che
          restano gestiti dall&apos;Agenzia delle Entrate.
        </p>
        <p className="text-muted-foreground mt-1 text-sm">
          <strong>Ultimo aggiornamento:</strong> aprile 2026
        </p>

        {/* ─── Cosa è modificabile ─── */}
        <h2 className="mt-10 text-xl font-semibold">
          Cosa puoi modificare e cosa no
        </h2>
        <p className="text-muted-foreground mt-3 text-sm leading-relaxed">
          {
            "L'intestazione dello scontrino è composta da due gruppi di dati con regole diverse:"
          }
        </p>
        <ul className="text-muted-foreground mt-3 list-disc space-y-2 pl-5 text-sm leading-relaxed">
          <li>
            <strong>Modificabili in app</strong> — ragione sociale, indirizzo,
            civico, comune, provincia e CAP. Dopo il primo collegamento
            all&apos;AdE puoi aggiornarli in qualsiasi momento dalla dashboard:
            il PDF degli scontrini userà i nuovi valori (vedi nota sotto).
          </li>
          <li>
            <strong>Non modificabili in app</strong> — partita IVA e codice
            fiscale. Sono gestiti dall&apos;Agenzia delle Entrate: per cambiarli
            serve una variazione anagrafica formale (vedi sotto).
          </li>
        </ul>

        {/* ─── Modificare ragione sociale e indirizzo in app ─── */}
        <h2 className="mt-10 text-xl font-semibold">
          Modificare ragione sociale e indirizzo
        </h2>
        <ol className="text-muted-foreground mt-3 list-decimal space-y-2 pl-5 text-sm leading-relaxed">
          <li>
            Apri la dashboard e vai su <strong>Impostazioni</strong> dalla barra
            di navigazione.
          </li>
          <li>
            Individua la card <strong>Attività</strong> e clicca il pulsante di
            modifica accanto al titolo (icona matita, <em>Modifica attività</em>
            {")."}
          </li>
          <li>
            Nel form puoi aggiornare <strong>Ragione sociale</strong>,{" "}
            <strong>Indirizzo</strong>, <strong>Civico</strong>,{" "}
            <strong>Comune</strong>, <strong>Prov.</strong> e{" "}
            <strong>CAP</strong>. Indirizzo e CAP sono obbligatori; gli altri
            campi sono opzionali.
          </li>
          <li>
            Clicca <strong>Salva</strong>. Le modifiche compaiono
            sull&apos;intestazione del prossimo scontrino emesso.
          </li>
        </ol>
        <p className="text-muted-foreground mt-3 text-sm leading-relaxed">
          <strong>Importante:</strong> il PDF degli scontrini è generato al volo
          dai dati attuali dell&apos;attività. Se aggiorni ragione sociale o
          indirizzo, anche il PDF di un documento storico riscaricato mostrerà i
          nuovi valori. Se hai bisogno di conservare l&apos;intestazione
          com&apos;era al momento dell&apos;emissione, salva il PDF in locale
          subito dopo aver emesso lo scontrino.
        </p>

        {/* ─── Variazione P.IVA / CF ─── */}
        <h2 className="mt-10 text-xl font-semibold">
          Modificare partita IVA o codice fiscale
        </h2>
        <p className="text-muted-foreground mt-3 text-sm leading-relaxed">
          P.IVA e codice fiscale non sono modificabili dall&apos;app perché
          identificano fiscalmente la tua attività presso l&apos;Agenzia delle
          Entrate. Per cambiarli devi presentare una variazione anagrafica:
        </p>
        <ul className="text-muted-foreground mt-3 list-disc space-y-2 pl-5 text-sm leading-relaxed">
          <li>
            <strong>Persone fisiche / ditte individuali</strong> — modello{" "}
            <strong>AA9/12</strong> all&apos;Agenzia delle Entrate (entro 30
            giorni dalla variazione).
          </li>
          <li>
            <strong>Società</strong> — modello <strong>AA7/10</strong>{" "}
            all&apos;Agenzia delle Entrate (e Camera di Commercio se la
            variazione riguarda dati iscritti al Registro Imprese).
          </li>
        </ul>
        <div className="mt-4 rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm dark:border-amber-800 dark:bg-amber-950">
          <strong>Suggerimento:</strong> per le variazioni anagrafiche
          AdE/Camera di Commercio rivolgiti al tuo commercialista — è la
          procedura più rapida e sicura. Una volta completata la variazione,
          contattaci scrivendo a{" "}
          <a
            href="mailto:info@scontrinozero.it"
            className="text-primary hover:underline"
          >
            info@scontrinozero.it
          </a>{" "}
          per allineare i dati nel tuo profilo ScontrinoZero.
        </div>

        {/* ─── Dati nel PDF scontrino ─── */}
        <h2 className="mt-10 text-xl font-semibold">
          Dati nel PDF dello scontrino
        </h2>
        <p className="text-muted-foreground mt-3 text-sm leading-relaxed">
          Il PDF generato da ScontrinoZero include automaticamente:
        </p>
        <ul className="text-muted-foreground mt-2 list-disc space-y-1 pl-5 text-sm leading-relaxed">
          <li>Ragione sociale o nome dell&apos;attività</li>
          <li>
            Indirizzo dell&apos;esercizio (via, civico, comune, prov., CAP)
          </li>
          <li>Partita IVA</li>
          <li>Data, ora e progressivo del documento</li>
          <li>Righe prodotto/servizio con IVA e importi</li>
          <li>Subtotale, IVA per aliquota e totale complessivo</li>
          <li>Metodo di pagamento (contante / elettronico)</li>
          <li>Codice lotteria scontrini (se fornito)</li>
          <li>
            Numero del documento commerciale assegnato dall&apos;AdE
            (progressivo)
          </li>
        </ul>
        <p className="text-muted-foreground mt-3 text-sm leading-relaxed">
          Non è attualmente possibile aggiungere un logo aziendale al PDF.
          Questa funzione è pianificata per una release futura.
        </p>

        {/* ─── Articoli correlati ─── */}
        <h2 className="mt-10 text-xl font-semibold">Articoli correlati</h2>
        <ul className="mt-3 space-y-1 text-sm">
          <li>
            <Link
              href="/help/prima-configurazione"
              className="text-primary hover:underline"
            >
              Prima configurazione passo-passo (onboarding completo)
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
          <li>
            <Link
              href="/help/cassetto-fiscale"
              className="text-primary hover:underline"
            >
              Dove verificare i corrispettivi nel cassetto fiscale
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
