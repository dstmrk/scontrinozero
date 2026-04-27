import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Badge } from "@/components/ui/badge";

export const metadata: Metadata = {
  title: "Come contattare l'assistenza | ScontrinoZero Help",
  description:
    "Canali di supporto disponibili, tempi di risposta e come segnalare un problema a ScontrinoZero.",
};

export default function ContattoAssistenzaPage() {
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
            Come contattare l&apos;assistenza
          </h1>
          <Badge variant="secondary">Supporto</Badge>
        </div>
        <p className="text-muted-foreground mt-3 text-sm leading-relaxed">
          Il supporto ScontrinoZero è disponibile via email. Prima di
          contattarci, ti consigliamo di cercare una risposta in questo Help
          Center: la maggior parte delle domande frequenti ha già una guida
          dedicata.
        </p>
        <p className="text-muted-foreground mt-1 text-sm">
          <strong>Ultimo aggiornamento:</strong> aprile 2026
        </p>

        {/* ─── Email ─── */}
        <h2 className="mt-10 text-xl font-semibold">Contatto via email</h2>
        <p className="text-muted-foreground mt-3 text-sm leading-relaxed">
          Scrivi a{" "}
          <a
            href="mailto:info@scontrinozero.it"
            className="text-primary font-medium hover:underline"
          >
            info@scontrinozero.it
          </a>{" "}
          per qualsiasi domanda su funzionalità, abbonamento o problemi tecnici.
        </p>

        {/* ─── Tempi di risposta ─── */}
        <h2 className="mt-10 text-xl font-semibold">Tempi di risposta</h2>
        <div className="text-muted-foreground mt-3 overflow-x-auto text-sm">
          <table className="w-full border-collapse">
            <thead>
              <tr className="border-b">
                <th className="py-2 pr-6 text-left text-xs font-semibold tracking-wide uppercase">
                  Piano
                </th>
                <th className="py-2 text-left text-xs font-semibold tracking-wide uppercase">
                  Tempo di risposta
                </th>
              </tr>
            </thead>
            <tbody>
              <tr className="border-b">
                <td className="py-2 pr-6 font-medium">Pro</td>
                <td className="py-2">Entro 24 ore (giorni lavorativi)</td>
              </tr>
              <tr>
                <td className="py-2 pr-6 font-medium">Starter</td>
                <td className="py-2">Entro 48 ore (giorni lavorativi)</td>
              </tr>
            </tbody>
          </table>
        </div>

        {/* ─── Cosa includere ─── */}
        <h2 className="mt-10 text-xl font-semibold">
          Cosa includere nella richiesta
        </h2>
        <p className="text-muted-foreground mt-3 text-sm leading-relaxed">
          Per ricevere aiuto più velocemente, includi nell&apos;email:
        </p>
        <ul className="text-muted-foreground mt-2 list-disc space-y-1 pl-5 text-sm leading-relaxed">
          <li>
            Una descrizione chiara del problema (cosa stavi facendo, cosa ti
            aspettavi, cosa è successo invece).
          </li>
          <li>Screenshot o testo del messaggio di errore, se presente.</li>
          <li>Dispositivo e browser usati (es. iPhone 15, Safari 17).</li>
          <li>L&apos;email dell&apos;account ScontrinoZero interessato.</li>
        </ul>

        {/* ─── Segnalare un bug ─── */}
        <h2 className="mt-10 text-xl font-semibold">Segnalare un bug</h2>
        <p className="text-muted-foreground mt-3 text-sm leading-relaxed">
          ScontrinoZero è open source. Se hai trovato un bug tecnico puoi aprire
          una issue direttamente su <strong>GitHub</strong> (link nel footer del
          sito) oppure inviare una email: includiamo nel repo i bug segnalati
          dagli utenti.
        </p>

        {/* ─── Problemi critici ─── */}
        <h2 className="mt-10 text-xl font-semibold">
          Problemi urgenti (scontrino bloccato)
        </h2>
        <p className="text-muted-foreground mt-3 text-sm leading-relaxed">
          Se non riesci a emettere scontrini a causa di un errore di accesso
          AdE, consulta prima{" "}
          <Link
            href="/help/errori-ade"
            className="text-primary hover:underline"
          >
            Errori comuni di accesso AdE e come risolverli
          </Link>
          . La maggior parte dei problemi si risolve cliccando{" "}
          <strong>Verifica connessione</strong> in Impostazioni → Credenziali
          AdE, senza dover contattare il supporto.
        </p>

        {/* ─── Articoli correlati ─── */}
        <h2 className="mt-10 text-xl font-semibold">Articoli correlati</h2>
        <ul className="mt-3 space-y-1 text-sm">
          <li>
            <Link
              href="/help/errori-ade"
              className="text-primary hover:underline"
            >
              Errori comuni di accesso AdE e come risolverli
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
