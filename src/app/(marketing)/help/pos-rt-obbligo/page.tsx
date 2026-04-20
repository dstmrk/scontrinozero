import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Badge } from "@/components/ui/badge";

export const metadata: Metadata = {
  title:
    "Collegamento POS-RT: chi è obbligato e scadenze 2026 | ScontrinoZero Help",
  description:
    "Tutto sull'obbligo di collegare il POS al registratore telematico dal 2026: chi è obbligato, scadenze, sanzioni e come ScontrinoZero ti mette in regola.",
};

export default function PosRtObbligoPage() {
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
            Collegamento POS-RT: chi è obbligato e scadenze
          </h1>
          <Badge variant="secondary">POS / Normativa</Badge>
        </div>
        <p className="text-muted-foreground mt-3 text-sm leading-relaxed">
          Dal 1° gennaio 2026 scatta l&apos;obbligo di collegare il POS al
          registratore telematico (o a un equivalente sistema di trasmissione
          dei corrispettivi). Chi usa ScontrinoZero è già in regola: il
          collegamento avviene via software, senza hardware aggiuntivo.
        </p>
        <p className="text-muted-foreground mt-1 text-sm">
          <strong>Ultimo aggiornamento:</strong> aprile 2026
        </p>

        {/* ─── Cosa prevede la normativa ─── */}
        <h2 className="mt-10 text-xl font-semibold">
          Cosa prevede la normativa
        </h2>
        <p className="text-muted-foreground mt-3 text-sm leading-relaxed">
          Il D.Lgs. n. 153/2024 (attuativo della Legge Delega fiscale 2023)
          introduce l&apos;obbligo di collegamento tra POS e strumento di
          certificazione dei corrispettivi. L&apos;obiettivo è garantire che
          ogni pagamento elettronico risulti automaticamente certificato
          all&apos;Agenzia delle Entrate.
        </p>
        <p className="text-muted-foreground mt-3 text-sm leading-relaxed">
          In pratica, ogni pagamento con carta o bancomat deve essere
          tracciabile e abbinabile allo scontrino elettronico emesso per quella
          transazione. Le modalità tecniche specifiche (es. integrazione
          automatica POS-RT) sono in attesa di circolare attuativa
          dell&apos;Agenzia delle Entrate.
        </p>

        {/* ─── Chi è obbligato ─── */}
        <h2 className="mt-10 text-xl font-semibold">Chi è obbligato</h2>
        <p className="text-muted-foreground mt-3 text-sm leading-relaxed">
          L&apos;obbligo riguarda tutti i soggetti che:
        </p>
        <ul className="text-muted-foreground mt-2 list-disc space-y-1 pl-5 text-sm leading-relaxed">
          <li>
            Sono tenuti alla memorizzazione e trasmissione telematica dei
            corrispettivi (art. 2 D.Lgs. 127/2015).
          </li>
          <li>
            Accettano pagamenti con carte di debito, credito o tramite
            applicazioni di pagamento digitale.
          </li>
        </ul>
        <p className="text-muted-foreground mt-3 text-sm leading-relaxed">
          Sono inclusi negozi al dettaglio, ristoranti, bar, ambulanti con POS,
          professionisti e in generale chiunque emetta scontrini elettronici.
        </p>

        {/* ─── ScontrinoZero e la conformità ─── */}
        <h2 className="mt-10 text-xl font-semibold">
          ScontrinoZero e la conformità
        </h2>
        <p className="text-muted-foreground mt-3 text-sm leading-relaxed">
          ScontrinoZero usa la procedura{" "}
          <strong>Documento Commerciale Online</strong> dell&apos;Agenzia delle
          Entrate, che equivale a un registratore telematico virtuale. Non è
          richiesto nessun hardware aggiuntivo.
        </p>
        <p className="text-muted-foreground mt-3 text-sm leading-relaxed">
          Quando selezioni <strong>Carta/Elettronico</strong> come metodo di
          pagamento al momento dell&apos;emissione, ScontrinoZero trasmette
          all&apos;AdE il tipo di pagamento corretto (codice{" "}
          <code className="bg-muted rounded px-1 font-mono text-xs">PE</code>).
          Il collegamento con il tuo POS fisico non è richiesto né necessario:
          l&apos;esercente seleziona manualmente il metodo di pagamento
          nell&apos;app.
        </p>
        <div className="mt-4 rounded-md border border-blue-200 bg-blue-50 px-4 py-3 text-sm dark:border-blue-800 dark:bg-blue-950">
          <strong>Nota:</strong> l&apos;integrazione automatica tra POS fisico e
          ScontrinoZero (senza intervento manuale) è una funzione pianificata
          per una release futura. Verifica la{" "}
          <Link
            href="/help/normativa-pos-2026"
            className="text-primary hover:underline"
          >
            guida normativa POS 2026
          </Link>{" "}
          per aggiornamenti.
        </div>

        {/* ─── Scadenze ─── */}
        <h2 className="mt-10 text-xl font-semibold">Scadenze principali</h2>
        <div className="text-muted-foreground mt-3 overflow-x-auto text-sm">
          <table className="w-full border-collapse">
            <thead>
              <tr className="border-b">
                <th className="py-2 pr-6 text-left text-xs font-semibold tracking-wide uppercase">
                  Data
                </th>
                <th className="py-2 text-left text-xs font-semibold tracking-wide uppercase">
                  Cosa cambia
                </th>
              </tr>
            </thead>
            <tbody>
              <tr className="border-b">
                <td className="py-2 pr-6 font-medium">1° gen. 2026</td>
                <td className="py-2">
                  Obbligo di collegamento POS-RT in vigore (D.Lgs. 153/2024).
                </td>
              </tr>
              <tr className="border-b">
                <td className="py-2 pr-6 font-medium">2026 (da definire)</td>
                <td className="py-2">
                  Avvio accertamenti e regime sanzionatorio (in attesa di
                  circolare attuativa AdE).
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <p className="text-muted-foreground mt-3 text-sm leading-relaxed">
          Le modalità operative e le specifiche tecniche per il collegamento
          fisico POS-RT sono in attesa di circolare attuativa dell&apos;Agenzia
          delle Entrate. Chi usa ScontrinoZero non deve attendere istruzioni
          aggiuntive: la trasmissione telematica è già attiva.
        </p>

        {/* ─── Sanzioni ─── */}
        <h2 className="mt-10 text-xl font-semibold">Sanzioni</h2>
        <p className="text-muted-foreground mt-3 text-sm leading-relaxed">
          Le sanzioni per mancata certificazione dei corrispettivi rimangono
          quelle già previste dal D.Lgs. 127/2015: da{" "}
          <strong>€500 a €2.000 per ogni violazione</strong>, con possibile
          sospensione della licenza in caso di recidiva. Emettendo scontrini
          elettronici con ScontrinoZero sei già coperto.
        </p>

        {/* ─── Articoli correlati ─── */}
        <h2 className="mt-10 text-xl font-semibold">Articoli correlati</h2>
        <ul className="mt-3 space-y-1 text-sm">
          <li>
            <Link
              href="/help/normativa-pos-2026"
              className="text-primary hover:underline"
            >
              Nuova normativa POS 2026: cosa cambia per gli esercenti
            </Link>
          </li>
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
