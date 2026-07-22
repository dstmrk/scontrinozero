import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import {
  JsonLd,
  faqPageJsonLd,
  helpArticleBreadcrumb,
  helpArticleBreadcrumbItems,
  type FaqItem,
} from "@/components/json-ld";
import { Breadcrumbs } from "@/components/marketing/breadcrumbs";
import { helpArticleMetadata } from "@/lib/help/metadata";
import { HelpArticleJsonLd } from "@/components/help/article-json-ld";
import { RelatedHelpArticles } from "@/components/help/related-articles";

export const metadata = helpArticleMetadata("regime-forfettario");

/**
 * Mirror in testo piano della FAQ visibile a video: alimenta lo structured data
 * FAQPage (rich result Google). Tenere allineato al contenuto renderizzato sotto.
 */
const faqItems: readonly FaqItem[] = [
  {
    question: "Qual è il codice IVA del regime forfettario?",
    answer:
      "Sullo scontrino (documento commerciale) si usa la natura N2 — operazioni non soggette. In fattura elettronica il codice granulare è N2.2 e il regime fiscale del cedente si valorizza con RF19. ScontrinoZero gestisce il documento commerciale, quindi la natura corretta da impostare è N2.",
  },
  {
    question: "Qual è la dicitura di esenzione IVA per il forfettario?",
    answer:
      "Sullo scontrino non è obbligatoria alcuna dicitura: è sufficiente la natura N2. Sulle fatture emesse, invece, va riportata «Operazione in franchigia da IVA ai sensi dell'art. 1 co. 54-89 L. 190/2014».",
  },
  {
    question:
      "Ho selezionato «0% – Non soggette» ma uno scontrino mostra ancora IVA al 22% — perché?",
    answer:
      "Probabilmente hai aggiunto prodotti al catalogo prima di configurare l'aliquota prevalente, e quei prodotti hanno ancora l'aliquota ordinaria. Vai in Catalogo e aggiorna l'aliquota di ciascun prodotto su N2. Le righe manuali (importo libero) usano sempre l'aliquota predefinita dell'attività.",
  },
  {
    question: "Posso vendere ad aliquote diverse (es. alcune voci a IVA 10%)?",
    answer:
      "In regime forfettario no: sei completamente esonerato dall'IVA su tutte le operazioni e devi certificarle come non soggette. Se devi applicare IVA su una vendita, devi prima uscire dal regime forfettario (contatta il tuo commercialista).",
  },
  {
    question:
      "Ho emesso per errore uno scontrino con IVA al 22% quando ero forfettario. Cosa faccio?",
    answer:
      "Il documento commerciale emesso va annullato e ri-emesso con la natura IVA corretta. ScontrinoZero non può modificare retroattivamente i documenti già trasmessi all'AdE: l'unica strada è il void seguito da una nuova emissione. Per errori estesi nel tempo, rivolgiti al tuo commercialista.",
  },
  {
    question: "Devo emettere scontrini anche come forfettario?",
    answer:
      "Sì, se svolgi attività al dettaglio o servizi a privati. I forfettari sono obbligati alla trasmissione telematica dei corrispettivi esattamente come i soggetti IVA ordinari. Il regime forfettario riguarda il trattamento dell'IVA, non l'obbligo di certificazione fiscale.",
  },
];

export default function RegimeForfettarioPage() {
  return (
    <section className="px-4 py-16">
      <JsonLd
        data={helpArticleBreadcrumb("regime-forfettario", "Regime forfettario")}
      />
      <HelpArticleJsonLd slug="regime-forfettario" />
      <JsonLd data={faqPageJsonLd(faqItems)} />
      <article className="mx-auto max-w-3xl">
        <Breadcrumbs
          items={helpArticleBreadcrumbItems(
            "regime-forfettario",
            "Regime forfettario",
          )}
        />

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
          <strong>Ultimo aggiornamento:</strong> luglio 2026
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
        {/* ─── Codice e natura IVA: N2 vs N2.2 ─── */}
        <h2 className="mt-10 text-xl font-semibold">
          Quale codice IVA usa il forfettario: N2 o N2.2?
        </h2>
        <p className="text-muted-foreground mt-3 text-sm leading-relaxed">
          La risposta dipende dal tipo di documento che emetti. I due codici
          appartengono alla stessa famiglia (operazioni non soggette a IVA) ma
          si usano in contesti diversi:
        </p>
        <ul className="text-muted-foreground mt-2 list-disc space-y-1 pl-5 text-sm leading-relaxed">
          <li>
            <strong>Scontrino (documento commerciale):</strong> natura{" "}
            <strong>N2</strong> — operazioni non soggette. È il codice che
            imposti in ScontrinoZero.
          </li>
          <li>
            <strong>Fattura elettronica B2B:</strong> codice granulare{" "}
            <strong>N2.2</strong> (in vigore dal 1° luglio 2022), riferito
            all&apos;art. 1 commi 54-89 della L. 190/2014.
          </li>
          <li>
            <strong>Regime fiscale del cedente</strong> (solo in fattura): si
            valorizza con <strong>RF19</strong>.
          </li>
        </ul>
        <p className="text-muted-foreground mt-3 text-sm leading-relaxed">
          In pratica: ScontrinoZero gestisce il{" "}
          <strong>documento commerciale</strong>, quindi la natura corretta da
          impostare è sempre <strong>N2</strong>. I codici N2.2 e RF19 entrano
          in gioco solo quando emetti una <strong>fattura elettronica</strong>{" "}
          via Sistema di Interscambio, non sullo scontrino.
        </p>
        <p className="text-muted-foreground mt-3 text-sm leading-relaxed">
          Per capire tutti i codici natura IVA (N1-N7) e perché il forfettario
          usa N2.2 in fattura ma N2 sullo scontrino, leggi la guida{" "}
          <Link
            href="/guide/codici-natura-iva"
            className="text-primary hover:underline"
          >
            Codici natura IVA: cosa sono e quando si usano
          </Link>
          {". Per gli obblighi normativi del forfettario (quando lo scontrino "}
          {"è dovuto, esoneri, lotteria) c'è la guida "}
          <Link
            href="/guide/scontrino-regime-forfettario"
            className="text-primary hover:underline"
          >
            Scontrino in regime forfettario
          </Link>
          {"."}
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
          {"Puoi modificare l'aliquota IVA prevalente in qualsiasi momento da "}
          <strong>Impostazioni → Attività → Modifica</strong>
          {
            ": utile se cambi regime fiscale (es. esci dal forfettario superando €85.000/€100.000) o se hai sbagliato la selezione iniziale. Per problemi scrivi a "
          }
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
        {/* ─── Dicitura di esenzione ─── */}
        <h2 className="mt-10 text-xl font-semibold">
          Dicitura di esenzione IVA del forfettario
        </h2>
        <p className="text-muted-foreground mt-3 text-sm leading-relaxed">
          Sullo <strong>scontrino</strong> (documento commerciale){" "}
          <strong>non è obbligatoria alcuna dicitura</strong> di esenzione: è
          sufficiente la natura <strong>N2</strong>. ScontrinoZero non inserisce
          automaticamente una formula di esonero (&quot;Operazione effettuata da
          contribuente in regime forfettario…&quot;) sul DCO, perché la
          normativa non la richiede; se ti è utile per la comunicazione al
          cliente puoi aggiungerla a parte.
        </p>
        <p className="text-muted-foreground mt-3 text-sm leading-relaxed">
          Sulle <strong>fatture</strong> emesse, invece, resta obbligatoria la
          dicitura{" "}
          <em>
            &quot;Operazione in franchigia da IVA ai sensi dell&apos;art. 1 co.
            54-89 L. 190/2014&quot;
          </em>{" "}
          — ma riguarda la fattura elettronica, non lo scontrino. Se ti serve il
          testo completo pronto da incollare (con clausola ritenuta
          d&apos;acconto e controllo bollo), usa il{" "}
          <Link
            href="/strumenti/dicitura-regime-forfettario"
            className="text-primary hover:underline"
          >
            generatore di dicitura per il regime forfettario
          </Link>
          {"."}
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
              Qual è il codice IVA del regime forfettario?
            </p>
            <p className="text-muted-foreground mt-1 text-sm leading-relaxed">
              Sullo scontrino (documento commerciale) si usa la natura{" "}
              <strong>N2</strong> — operazioni non soggette. In fattura
              elettronica il codice granulare è <strong>N2.2</strong> e il
              regime fiscale del cedente si valorizza con <strong>RF19</strong>.
              ScontrinoZero gestisce il documento commerciale, quindi la natura
              corretta da impostare è <strong>N2</strong>.
            </p>
          </div>
          <div>
            <p className="text-sm font-medium">
              Qual è la dicitura di esenzione IVA per il forfettario?
            </p>
            <p className="text-muted-foreground mt-1 text-sm leading-relaxed">
              Sullo scontrino non è obbligatoria alcuna dicitura: è sufficiente
              la natura N2. Sulle fatture emesse, invece, va riportata{" "}
              <em>
                &quot;Operazione in franchigia da IVA ai sensi dell&apos;art. 1
                co. 54-89 L. 190/2014&quot;
              </em>
              {"."}
            </p>
          </div>
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
        <RelatedHelpArticles slug="regime-forfettario" />

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
