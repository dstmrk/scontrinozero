import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Badge } from "@/components/ui/badge";

export const metadata: Metadata = {
  title: "Regime forfettario: configurazione IVA corretta | ScontrinoZero Help",
  description:
    "Come configurare ScontrinoZero per il regime forfettario: natura IVA N2 per operazioni non soggette, impostazioni in onboarding e nel catalogo prodotti.",
};

export default function RegimeForfettarioPage() {
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
            Regime forfettario: configurazione IVA corretta
          </h1>
          <Badge variant="secondary">Configurazione attività</Badge>
        </div>
        <p className="text-muted-foreground mt-3 text-sm leading-relaxed">
          I contribuenti in regime forfettario non applicano l&apos;IVA sulle
          vendite. Questa guida spiega come configurare ScontrinoZero
          correttamente per evitare errori nei documenti commerciali trasmessi
          all&apos;Agenzia delle Entrate.
        </p>
        <p className="text-muted-foreground mt-1 text-sm">
          <strong>Ultimo aggiornamento:</strong> aprile 2026
        </p>

        {/* ─── Cos'è il regime forfettario ─── */}
        <h2 className="mt-10 text-xl font-semibold">
          Regime forfettario e IVA: il punto chiave
        </h2>
        <p className="text-muted-foreground mt-3 text-sm leading-relaxed">
          {
            "Chi aderisce al regime forfettario (art. 1, commi 54\u201389, legge 190/2014) \u00e8 esonerato dall\u2019applicazione dell\u2019IVA: "
          }
          <strong>
            non addebita IVA al cliente e non la detrae sugli acquisti
          </strong>
          {
            ". Sul documento commerciale trasmesso all\u2019AdE le righe di vendita vanno quindi certificate con una "
          }
          <strong>natura IVA</strong>
          {
            ", non con un\u2019aliquota percentuale. In ScontrinoZero il codice da usare \u00e8 "
          }
          <strong>N2 (operazioni non soggette)</strong>
          {"."}
        </p>
        <p className="text-muted-foreground mt-3 text-sm leading-relaxed">
          L&apos;errore più comune è impostare l&apos;aliquota IVA al 22% (o
          altra aliquota ordinaria) anziché usare una natura N2: lo scontrino
          risulterebbe fiscalmente scorretto e l&apos;esoneratore si troverebbe
          ad aver certificato operazioni come imponibili.
        </p>
        <p className="text-muted-foreground mt-3 text-sm leading-relaxed">
          <strong>Nota per la fatturazione elettronica B2B:</strong> nel
          tracciato della fattura elettronica il codice granulare richiesto per
          i forfettari è <strong>N2.2</strong> (in vigore dal 1° luglio 2022);
          separatamente, il blocco RegimeFiscale del cedente si valorizza con{" "}
          <strong>RF19</strong>. Questi due codici riguardano però la fattura
          elettronica, non il documento commerciale gestito da ScontrinoZero.
        </p>

        {/* ─── Configurazione in ScontrinoZero ─── */}
        <h2 className="mt-10 text-xl font-semibold">
          Come configurare il regime forfettario in ScontrinoZero
        </h2>
        <p className="text-muted-foreground mt-3 text-sm leading-relaxed">
          ScontrinoZero non ha un selettore &quot;Regime forfettario&quot;
          dedicato: la configurazione avviene impostando l&apos;aliquota IVA
          predefinita della tua attività e, se usi il catalogo rapido, quella
          dei singoli prodotti.
        </p>
        <h3 className="mt-6 text-base font-semibold">
          1. Durante l&apos;onboarding (prima configurazione)
        </h3>
        <ol className="text-muted-foreground mt-3 list-decimal space-y-2 pl-5 text-sm leading-relaxed">
          <li>
            Nello <strong>Step 1 — Attività</strong> del wizard, alla voce{" "}
            <strong>Aliquota IVA prevalente</strong> seleziona{" "}
            <strong>&quot;0% – Non soggette&quot; (codice N2)</strong>.
          </li>
          <li>
            Completa gli altri step (credenziali AdE, riepilogo) e termina
            l&apos;onboarding.
          </li>
        </ol>
        <h3 className="mt-6 text-base font-semibold">
          2. Prodotti del catalogo rapido
        </h3>
        <p className="text-muted-foreground mt-3 text-sm leading-relaxed">
          Per ogni prodotto che aggiungi da <strong>Catalogo → Nuovo</strong>{" "}
          (oppure modificando un prodotto esistente), nel campo{" "}
          <strong>Aliquota IVA</strong> seleziona anche qui{" "}
          <strong>&quot;0% – Non soggette&quot; (N2)</strong>. Le righe manuali
          (importo libero) usano automaticamente l&apos;aliquota predefinita
          impostata in onboarding.
        </p>
        <p className="text-muted-foreground mt-3 text-sm leading-relaxed">
          <strong>Attenzione:</strong> al momento l&apos;aliquota IVA prevalente
          non è modificabile dalla pagina <em>Impostazioni</em> dopo
          l&apos;onboarding. Se hai sbagliato la selezione iniziale contatta il
          supporto scrivendo a{" "}
          <a
            href="mailto:info@scontrinozero.it"
            className="text-primary hover:underline"
          >
            info@scontrinozero.it
          </a>
          {"."}
        </p>

        {/* ─── Come appare lo scontrino ─── */}
        <h2 className="mt-10 text-xl font-semibold">
          Come appare lo scontrino
        </h2>
        <p className="text-muted-foreground mt-3 text-sm leading-relaxed">
          Il documento commerciale trasmesso all&apos;AdE per un forfettario
          configurato con N2 mostra:
        </p>
        <ul className="text-muted-foreground mt-2 list-disc space-y-1 pl-5 text-sm leading-relaxed">
          <li>
            <strong>Importo totale</strong> senza IVA separata: il prezzo è
            &quot;tutto incluso&quot; e non c&apos;è scorporo.
          </li>
          <li>
            <strong>Natura N2</strong> nel campo aliquota/natura IVA delle
            righe.
          </li>
          <li>
            <strong>Nessuna voce &quot;IVA: € 0,00&quot;</strong>: semplicemente
            l&apos;IVA non è esposta.
          </li>
        </ul>
        <p className="text-muted-foreground mt-3 text-sm leading-relaxed">
          ScontrinoZero <strong>non inserisce automaticamente</strong> una
          dicitura di esonero (&quot;Operazione effettuata da contribuente in
          regime forfettario…&quot;) sul documento commerciale: la normativa sul
          DCO non la richiede, ma se ti è utile per la tua comunicazione al
          cliente puoi stamparla/scriverla a parte. La dicitura{" "}
          <em>
            &quot;Operazione in franchigia da IVA ai sensi dell&apos;art. 1 co.
            54-89 L. 190/2014&quot;
          </em>{" "}
          resta invece obbligatoria sulle fatture emesse (non sugli scontrini).
        </p>

        {/* ─── Soglie di ricavo ─── */}
        <h2 className="mt-10 text-xl font-semibold">
          Soglie di ricavo: 85.000 € e 100.000 €
        </h2>
        <p className="text-muted-foreground mt-3 text-sm leading-relaxed">
          La soglia base per accedere e rimanere nel regime forfettario è{" "}
          <strong>€ 85.000 annui</strong> di incassi (principio di cassa),
          innalzata dai precedenti € 65.000 dalla{" "}
          <strong>Legge di Bilancio 2023</strong> (L. 197/2022), con decorrenza{" "}
          <strong>dal 2023</strong>. Due scenari possibili in caso di
          superamento nel corso dell&apos;anno:
        </p>
        <ul className="text-muted-foreground mt-2 list-disc space-y-1 pl-5 text-sm leading-relaxed">
          <li>
            <strong>Tra 85.000 e 100.000 €:</strong> mantieni il regime
            forfettario per l&apos;anno in corso ed esci dal{" "}
            <strong>1° gennaio dell&apos;anno successivo</strong>.
          </li>
          <li>
            <strong>Oltre 100.000 €:</strong> uscita <strong>immediata</strong>{" "}
            dal regime, con applicazione dell&apos;IVA{" "}
            <strong>retroattiva</strong> a partire dall&apos;operazione che ha
            determinato il superamento (art. 1 comma 71, L. 190/2014, come
            novellato dalla L. 197/2022).
          </li>
        </ul>
        <p className="text-muted-foreground mt-3 text-sm leading-relaxed">
          ScontrinoZero non verifica automaticamente il superamento delle
          soglie. Se sei vicino al limite consulta il tuo commercialista per
          valutare tempestivamente il passaggio al regime ordinario.
        </p>

        {/* ─── Domande frequenti ─── */}
        <h2 className="mt-10 text-xl font-semibold">Domande frequenti</h2>
        <div className="mt-3 space-y-4">
          <div>
            <p className="text-sm font-medium">
              Ho selezionato &quot;0% – Non soggette&quot; ma uno scontrino
              mostra ancora IVA al 22% — perché?
            </p>
            <p className="text-muted-foreground mt-1 text-sm leading-relaxed">
              Probabilmente hai aggiunto prodotti al catalogo prima di
              configurare l&apos;aliquota prevalente, e quei prodotti hanno
              ancora l&apos;aliquota ordinaria. Vai in <strong>Catalogo</strong>{" "}
              e aggiorna l&apos;aliquota di ciascun prodotto su{" "}
              <strong>N2</strong>. Le righe manuali (importo libero) usano
              sempre l&apos;aliquota predefinita dell&apos;attività.
            </p>
          </div>
          <div>
            <p className="text-sm font-medium">
              Posso vendere ad aliquote diverse (es. alcune voci a IVA 10%)?
            </p>
            <p className="text-muted-foreground mt-1 text-sm leading-relaxed">
              In regime forfettario no: sei completamente esonerato
              dall&apos;IVA su tutte le operazioni e devi certificarle come non
              soggette. Se devi applicare IVA su una vendita, devi prima uscire
              dal regime forfettario (contatta il tuo commercialista).
            </p>
          </div>
          <div>
            <p className="text-sm font-medium">
              Ho emesso per errore uno scontrino con IVA al 22% quando ero
              forfettario. Cosa faccio?
            </p>
            <p className="text-muted-foreground mt-1 text-sm leading-relaxed">
              Il documento commerciale emesso va{" "}
              <Link
                href="/help/annullare-scontrino"
                className="text-primary hover:underline"
              >
                annullato
              </Link>{" "}
              e ri-emesso con la natura IVA corretta. ScontrinoZero non può
              modificare retroattivamente i documenti già trasmessi
              all&apos;AdE: l&apos;unica strada è il void seguito da una nuova
              emissione. Per errori estesi nel tempo, rivolgiti al tuo
              commercialista.
            </p>
          </div>
          <div>
            <p className="text-sm font-medium">
              Devo emettere scontrini anche come forfettario?
            </p>
            <p className="text-muted-foreground mt-1 text-sm leading-relaxed">
              Sì, se svolgi attività al dettaglio o servizi a privati. I
              forfettari sono obbligati alla trasmissione telematica dei
              corrispettivi esattamente come i soggetti IVA ordinari. Il regime
              forfettario riguarda il trattamento dell&apos;IVA, non
              l&apos;obbligo di certificazione fiscale.
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
              href="/help/annullare-scontrino"
              className="text-primary hover:underline"
            >
              Annullare uno scontrino: quando si può e come fare
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
            {
              "Le informazioni fiscali in questa guida hanno scopo orientativo. Per casi specifici, consulta sempre un commercialista. Hai trovato un errore? "
            }
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
