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
          Dopo ogni addebito riuscito Stripe invia automaticamente una ricevuta
          all&apos;indirizzo email del tuo account. L&apos;email proviene da{" "}
          <strong>receipt@stripe.com</strong> con oggetto{" "}
          <em>&ldquo;Il tuo ricevuto da ScontrinoZero&rdquo;</em>. Se non la
          trovi, controlla la cartella spam.
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
            Vai su <strong>Dashboard → Impostazioni → Abbonamento</strong>.
          </li>
          <li>
            Clicca <strong>Gestisci abbonamento</strong>: si apre il portale
            Stripe.
          </li>
          <li>
            Nella sezione <strong>Cronologia fatturazione</strong> trovi tutti i
            pagamenti con il relativo PDF scaricabile.
          </li>
        </ol>

        {/* ─── Nota IVA ─── */}
        <h2 className="mt-10 text-xl font-semibold">
          Nota sulla detraibilità IVA
        </h2>
        <p className="text-muted-foreground mt-3 text-sm leading-relaxed">
          Le ricevute Stripe indicano l&apos;importo pagato ma non contengono
          gli estremi per la detrazione IVA (partita IVA, indirizzo fiscale). Se
          hai bisogno di una <strong>fattura fiscale</strong> detraibile per la
          tua attività, contattaci a{" "}
          <a
            href="mailto:info@scontrinozero.it"
            className="text-primary hover:underline"
          >
            info@scontrinozero.it
          </a>{" "}
          indicando i tuoi dati fiscali (ragione sociale, P.IVA, indirizzo) e il
          periodo di riferimento.
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
