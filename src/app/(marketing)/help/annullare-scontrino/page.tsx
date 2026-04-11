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

export default function AnnullareScontinoPage() {
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
          Un scontrino fiscale non si &quot;cancella&quot; — si emette un{" "}
          <strong>documento di annullamento</strong> che rettifica il documento
          originale nel cassetto fiscale dell&apos;Agenzia delle Entrate. Questa
          guida spiega come fare e in quali casi è possibile.
        </p>
        <p className="text-muted-foreground mt-1 text-sm">
          <strong>Ultimo aggiornamento:</strong> aprile 2026
        </p>

        {/* ─── Quando si può annullare ─── */}
        <h2 className="mt-10 text-xl font-semibold">
          Quando è possibile annullare
        </h2>
        <p className="text-muted-foreground mt-3 text-sm leading-relaxed">
          L&apos;annullamento è consentito per:
        </p>
        <ul className="text-muted-foreground mt-2 list-disc space-y-1 pl-5 text-sm leading-relaxed">
          <li>
            Scontrini emessi per errore (importo sbagliato, prodotto errato).
          </li>
          <li>Vendite stornate dal cliente (reso merce, recesso).</li>
          <li>
            Scontrini trasmessi all&apos;AdE con stato{" "}
            <strong>Trasmesso</strong>.
          </li>
        </ul>
        <p className="text-muted-foreground mt-3 text-sm leading-relaxed">
          <strong>Non è possibile annullare</strong> scontrini già annullati o
          scontrini in stato <em>In elaborazione</em> (attendi che la
          trasmissione si completi prima di procedere).
        </p>

        {/* ─── Limiti temporali ─── */}
        <h2 className="mt-10 text-xl font-semibold">Limiti temporali</h2>
        <p className="text-muted-foreground mt-3 text-sm leading-relaxed">
          La normativa AdE non fissa una scadenza precisa per
          l&apos;annullamento, ma vale la regola generale:{" "}
          <strong>
            il documento di annullamento deve essere emesso nel periodo
            d&apos;imposta in cui è stato emesso il documento originale
          </strong>
          {
            ", salvo casi eccezionali. In pratica: prima annulli, meglio è. Evita di lasciare annullamenti aperti per settimane o mesi."
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
            Trova lo scontrino da annullare usando i filtri per data o importo.
          </li>
          <li>
            Clicca sullo scontrino per aprire il dettaglio, poi tocca{" "}
            <strong>Annulla scontrino</strong>.
          </li>
          <li>
            Conferma l&apos;operazione nella finestra di dialogo. È
            irreversibile.
          </li>
          <li>
            ScontrinoZero invia il documento di annullamento all&apos;AdE. Lo
            stato dello scontrino originale diventa <strong>Annullato</strong>.
          </li>
        </ol>

        {/* ─── Cosa succede dopo ─── */}
        <h2 className="mt-10 text-xl font-semibold">
          Cosa succede dopo l&apos;annullamento
        </h2>
        <ul className="text-muted-foreground mt-3 list-disc space-y-2 pl-5 text-sm leading-relaxed">
          <li>
            L&apos;AdE registra il documento di annullamento nel cassetto
            fiscale e rettifica i corrispettivi di quel giorno.
          </li>
          <li>
            Lo scontrino originale non viene eliminato — rimane nello Storico
            con stato <strong>Annullato</strong>, insieme al riferimento al
            documento di annullamento.
          </li>
          <li>
            Se vuoi emettere uno scontrino corretto al posto di quello
            annullato, devi farlo separatamente dalla <strong>Cassa</strong>{" "}
            come una nuova vendita.
          </li>
        </ul>

        {/* ─── Rimborso al cliente ─── */}
        <h2 className="mt-10 text-xl font-semibold">
          Reso merce: devo fare altro?
        </h2>
        <p className="text-muted-foreground mt-3 text-sm leading-relaxed">
          L&apos;annullamento dello scontrino è sufficiente ai fini fiscali. Il
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
              Verifica che lo scontrino sia in stato <strong>Trasmesso</strong>.
              Se è ancora <em>In elaborazione</em>, attendi la conferma AdE
              prima di procedere.
            </p>
          </div>
          <div>
            <p className="text-sm font-medium">
              L&apos;annullamento è rimasto in stato &quot;In elaborazione&quot;
            </p>
            <p className="text-muted-foreground mt-1 text-sm leading-relaxed">
              Come per l&apos;emissione normale, il portale AdE può essere
              temporaneamente lento. ScontrinoZero riprova automaticamente.
              Controlla lo stato dopo qualche minuto.
            </p>
          </div>
          <div>
            <p className="text-sm font-medium">
              Ho annullato per errore — posso tornare indietro?
            </p>
            <p className="text-muted-foreground mt-1 text-sm leading-relaxed">
              No: il documento di annullamento trasmesso all&apos;AdE non può
              essere ritirato. Devi emettere un nuovo scontrino dalla Cassa con
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
