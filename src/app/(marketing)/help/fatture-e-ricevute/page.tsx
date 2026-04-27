import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Badge } from "@/components/ui/badge";

export const metadata: Metadata = {
  title: "Dove trovare fatture e ricevute di pagamento | ScontrinoZero Help",
  description:
    "Come scaricare le ricevute e le fatture del tuo abbonamento ScontrinoZero per la contabilità e il commercialista.",
};

export default function FattureERicevutePage() {
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
            Dove trovare fatture e ricevute di pagamento
          </h1>
          <Badge variant="secondary">Abbonamento</Badge>
        </div>
        <p className="text-muted-foreground mt-3 text-sm leading-relaxed">
          I pagamenti dell&apos;abbonamento ScontrinoZero sono gestiti da
          Stripe. Le ricevute vengono inviate automaticamente via email dopo
          ogni addebito; puoi anche scaricarle in qualsiasi momento dal portale
          di fatturazione.
        </p>
        <p className="text-muted-foreground mt-1 text-sm">
          <strong>Ultimo aggiornamento:</strong> aprile 2026
        </p>

        {/* ─── Ricevuta via email ─── */}
        <h2 className="mt-10 text-xl font-semibold">Ricevute via email</h2>
        <p className="text-muted-foreground mt-3 text-sm leading-relaxed">
          Dopo ogni addebito riuscito Stripe invia automaticamente un&apos;email
          con la ricevuta del pagamento all&apos;indirizzo del tuo account. Il
          mittente è un dominio <strong>@stripe.com</strong>: se non trovi
          l&apos;email, controlla la cartella spam o cerca nella inbox per
          mittente che termina con <strong>stripe.com</strong>.
        </p>
        <p className="text-muted-foreground mt-3 text-sm leading-relaxed">
          L&apos;oggetto e il dominio esatti possono variare in base alla lingua
          del tuo account e alla versione del template di Stripe; se
          l&apos;email non arriva, puoi sempre scaricare la ricevuta dal portale
          di fatturazione (vedi sotto).
        </p>

        {/* ─── Portale Stripe ─── */}
        <h2 className="mt-10 text-xl font-semibold">
          Portale di fatturazione (storico completo)
        </h2>
        <p className="text-muted-foreground mt-3 text-sm leading-relaxed">
          Per scaricare ricevute precedenti o visualizzare lo storico completo
          dei pagamenti:
        </p>
        <ol className="text-muted-foreground mt-3 list-decimal space-y-2 pl-5 text-sm leading-relaxed">
          <li>
            Apri la dashboard, vai su <strong>Impostazioni</strong> e scorri
            fino alla card <strong>Piano e Abbonamento</strong>.
          </li>
          <li>
            Sotto <strong>Gestisci abbonamento</strong>, clicca il link{" "}
            <strong>Vai al portale Stripe →</strong>: si apre il portale di
            fatturazione di Stripe.
          </li>
          <li>
            Nella sezione storico fatture/pagamenti del portale trovi tutte le
            ricevute con il relativo PDF scaricabile.
          </li>
        </ol>
        <p className="text-muted-foreground mt-3 text-sm leading-relaxed">
          <strong>Nota:</strong> il link <em>Vai al portale Stripe →</em>{" "}
          compare solo se hai un abbonamento attivo. Durante il periodo di prova
          gratuita o dopo una cancellazione non ci sono ancora pagamenti da
          consultare.
        </p>

        {/* ─── Nota fattura intestata ─── */}
        <h2 className="mt-10 text-xl font-semibold">
          Vuoi una fattura intestata alla tua attività?
        </h2>
        <p className="text-muted-foreground mt-3 text-sm leading-relaxed">
          Le ricevute generate automaticamente da Stripe riportano
          l&apos;importo pagato ma non includono i tuoi dati fiscali (ragione
          sociale, partita IVA, indirizzo): in fase di checkout ScontrinoZero
          non li raccoglie.
        </p>
        <p className="text-muted-foreground mt-3 text-sm leading-relaxed">
          Se ti serve una fattura intestata alla tua attività, scrivici a{" "}
          <a
            href="mailto:info@scontrinozero.it"
            className="text-primary hover:underline"
          >
            info@scontrinozero.it
          </a>{" "}
          indicando ragione sociale, partita IVA, indirizzo e il periodo di
          riferimento. Ti faremo sapere caso per caso quale documento possiamo
          emettere: la detraibilità IVA dipende dal regime fiscale del venditore
          e va valutata con il tuo commercialista.
        </p>

        {/* ─── Articoli correlati ─── */}
        <h2 className="mt-10 text-xl font-semibold">Articoli correlati</h2>
        <ul className="mt-3 space-y-1 text-sm">
          <li>
            <Link
              href="/help/piani-e-prezzi"
              className="text-primary hover:underline"
            >
              Piani disponibili: Starter, Pro e self-hosted gratuito
            </Link>
          </li>
          <li>
            <Link
              href="/help/cambio-piano"
              className="text-primary hover:underline"
            >
              Come passare da mensile ad annuale
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
