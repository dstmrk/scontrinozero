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
          L&apos;intestazione dello scontrino mostra i tuoi dati fiscali
          (ragione sociale, indirizzo, codice fiscale / P.IVA) così come
          registrati nel portale Fatture e Corrispettivi dell&apos;Agenzia delle
          Entrate. ScontrinoZero li legge direttamente dall&apos;AdE durante la
          configurazione iniziale.
        </p>
        <p className="text-muted-foreground mt-1 text-sm">
          <strong>Ultimo aggiornamento:</strong> aprile 2026
        </p>

        {/* ─── Da dove vengono i dati ─── */}
        <h2 className="mt-10 text-xl font-semibold">
          Da dove vengono i dati dell&apos;intestazione
        </h2>
        <p className="text-muted-foreground mt-3 text-sm leading-relaxed">
          I dati che appaiono sull&apos;intestazione dello scontrino — ragione
          sociale, indirizzo dell&apos;attività, partita IVA / codice fiscale —
          sono quelli registrati nel cassetto fiscale AdE associato alle tue
          credenziali Fisconline. ScontrinoZero li recupera automaticamente
          durante il collegamento all&apos;AdE e non li modifica.
        </p>
        <p className="text-muted-foreground mt-3 text-sm leading-relaxed">
          Se i tuoi dati nell&apos;intestazione sono errati, il motivo è quasi
          sempre che nel portale AdE risulta un indirizzo o una ragione sociale
          diversa da quella che ti aspetti. La correzione va fatta direttamente
          sul portale AdE.
        </p>

        {/* ─── Aggiornare i dati sull'AdE ─── */}
        <h2 className="mt-10 text-xl font-semibold">
          Come aggiornare i dati sul portale AdE
        </h2>
        <ol className="text-muted-foreground mt-3 list-decimal space-y-2 pl-5 text-sm leading-relaxed">
          <li>
            Accedi al portale <strong>Fatture e Corrispettivi</strong> con le
            tue credenziali Fisconline.
          </li>
          <li>
            Vai nella sezione{" "}
            <strong>Corrispettivi → Dati del documento commerciale</strong>.
          </li>
          <li>
            Verifica o aggiorna ragione sociale, indirizzo e altri dati
            dell&apos;intestazione.
          </li>
          <li>Salva le modifiche.</li>
          <li>
            Torna su ScontrinoZero e vai su{" "}
            <strong>Dashboard → Impostazioni → Configurazione attività</strong>,
            poi clicca <strong>Ri-sincronizza dati da AdE</strong> per
            aggiornare i dati memorizzati nell&apos;app.
          </li>
        </ol>
        <div className="mt-4 rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm dark:border-amber-800 dark:bg-amber-950">
          <strong>Attenzione:</strong> i dati fiscali come codice fiscale e
          partita IVA non possono essere modificati liberamente sul portale AdE.
          Richiedono una variazione anagrafica presso l&apos;Agenzia delle
          Entrate o la Camera di Commercio. Per assistenza su questo tipo di
          variazione, rivolgiti a un commercialista.
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
          <li>Indirizzo dell&apos;esercizio</li>
          <li>Partita IVA / codice fiscale</li>
          <li>Data, ora e progressivo del documento</li>
          <li>Righe prodotto/servizio con IVA e importi</li>
          <li>Totale e metodo di pagamento</li>
          <li>Codice lotteria scontrini (se fornito)</li>
          <li>Riferimento AdE (progressivo documento commerciale)</li>
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
