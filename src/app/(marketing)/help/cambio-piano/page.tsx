import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Badge } from "@/components/ui/badge";

export const metadata: Metadata = {
  title: "Come passare da mensile ad annuale | ScontrinoZero Help",
  description:
    "Guida per cambiare il piano ScontrinoZero da mensile ad annuale e risparmiare fino al 54%. Istruzioni passo-passo per la modifica dell'abbonamento.",
};

export default function CambioPianoPage() {
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
            Come passare da mensile ad annuale
          </h1>
          <Badge variant="secondary">Abbonamento</Badge>
        </div>
        <p className="text-muted-foreground mt-3 text-sm leading-relaxed">
          Passare al piano annuale ti permette di risparmiare il{" "}
          <strong>50% su Starter</strong> (€29,99/anno invece di €59,88) e il{" "}
          <strong>54% su Pro</strong> (€49,99/anno invece di €107,88). Il cambio
          avviene tramite il portale di fatturazione Stripe.
        </p>
        <p className="text-muted-foreground mt-1 text-sm">
          <strong>Ultimo aggiornamento:</strong> aprile 2026
        </p>

        {/* ─── Istruzioni ─── */}
        <h2 className="mt-10 text-xl font-semibold">Istruzioni passo-passo</h2>
        <p className="text-muted-foreground mt-3 text-sm leading-relaxed">
          Questi passaggi valgono se hai già un abbonamento attivo (Starter o
          Pro mensile). Se sei ancora in periodo di prova, dalla stessa
          schermata vedrai direttamente i bottoni per scegliere il piano annuale
          o mensile, senza passare dal portale.
        </p>
        <ol className="text-muted-foreground mt-3 list-decimal space-y-3 pl-5 text-sm leading-relaxed">
          <li>
            Accedi a ScontrinoZero e vai su{" "}
            <strong>Dashboard → Impostazioni → Piano e Abbonamento</strong>.
          </li>
          <li>
            Nella sezione <strong>Gestisci abbonamento</strong> clicca il link{" "}
            <strong>Vai al portale Stripe →</strong>: vieni reindirizzato al
            portale di fatturazione Stripe.
          </li>
          <li>
            Nel portale Stripe, seleziona <strong>Aggiorna piano</strong> (o{" "}
            <em>Update plan</em>).
          </li>
          <li>
            Scegli la versione annuale del tuo piano attuale (Starter annuale o
            Pro annuale) e conferma.
          </li>
          <li>
            Stripe applica un credito proporzionale ai giorni rimanenti del
            ciclo mensile corrente: paghi solo la differenza.
          </li>
        </ol>

        {/* ─── Note importanti ─── */}
        <h2 className="mt-10 text-xl font-semibold">Note importanti</h2>
        <ul className="text-muted-foreground mt-3 list-disc space-y-2 pl-5 text-sm leading-relaxed">
          <li>
            Il cambio è immediato: il nuovo ciclo annuale parte dal giorno del
            cambio.
          </li>
          <li>
            Stripe calcola automaticamente il credito per i giorni non
            utilizzati del periodo mensile: non perdi nulla.
          </li>
          <li>
            Puoi anche passare da <strong>Starter a Pro</strong> nello stesso
            passaggio, scegliendo Pro annuale direttamente.
          </li>
          <li>
            Non è possibile tornare al mensile prima della scadenza del ciclo
            annuale; alla scadenza puoi scegliere liberamente.
          </li>
        </ul>

        {/* ─── Passare da Starter a Pro ─── */}
        <h2 className="mt-10 text-xl font-semibold">
          Passare da Starter a Pro
        </h2>
        <p className="text-muted-foreground mt-3 text-sm leading-relaxed">
          La procedura è identica: nel portale Stripe scegli{" "}
          <strong>Pro annuale</strong> (o Pro mensile) invece di Starter. Le
          funzioni del piano Pro disponibili oggi sono:
        </p>
        <ul className="text-muted-foreground mt-2 list-disc space-y-1 pl-5 text-sm leading-relaxed">
          <li>
            Catalogo rapido <strong>illimitato</strong> (Starter è limitato a 5
            prodotti)
          </li>
          <li>Supporto prioritario via email entro 24 ore</li>
          <li>
            Accesso alla <strong>Developer API</strong> per emettere scontrini
            da sistemi terzi
          </li>
        </ul>
        <p className="text-muted-foreground mt-3 text-sm leading-relaxed">
          Sono inoltre <em>in arrivo</em> sul piano Pro: analytics avanzata con
          dashboard storica, export CSV dello storico scontrini, recupero
          corrispettivi da AdE e sync catalogo prodotti dalla rubrica AdE.
          Quando saranno rilasciate, verranno incluse automaticamente per chi ha
          già un piano Pro attivo. Vedi il dettaglio in{" "}
          <Link
            href="/help/piani-e-prezzi"
            className="text-primary hover:underline"
          >
            Piani disponibili
          </Link>
          {"."}
        </p>

        {/* ─── Fatturazione ─── */}
        <h2 className="mt-10 text-xl font-semibold">
          Dove trovo la ricevuta del pagamento?
        </h2>
        <p className="text-muted-foreground mt-3 text-sm leading-relaxed">
          Dopo ogni pagamento Stripe invia automaticamente una ricevuta
          all&apos;email del tuo account. Puoi scaricare tutte le ricevute
          precedenti dal portale Stripe (stesso link{" "}
          <strong>Gestisci abbonamento</strong>), nella sezione{" "}
          <em>Cronologia fatturazione</em>.
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
              href="/help/fatture-e-ricevute"
              className="text-primary hover:underline"
            >
              Dove trovare fatture e ricevute di pagamento
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
