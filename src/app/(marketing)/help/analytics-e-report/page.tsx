import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import {
  JsonLd,
  helpArticleBreadcrumb,
  helpArticleBreadcrumbItems,
} from "@/components/json-ld";
import { Breadcrumbs } from "@/components/marketing/breadcrumbs";
import { helpArticleMetadata } from "@/lib/help/metadata";
import { HelpArticleJsonLd } from "@/components/help/article-json-ld";
import { RelatedHelpArticles } from "@/components/help/related-articles";
import { AppScreenshot } from "@/components/marketing/app-screenshot";

export const metadata = helpArticleMetadata("analytics-e-report");

export default function AnalyticsEReportPage() {
  return (
    <section className="px-4 py-16">
      <JsonLd
        data={helpArticleBreadcrumb("analytics-e-report", "Analytics e report")}
      />
      <HelpArticleJsonLd slug="analytics-e-report" />
      <article className="mx-auto max-w-3xl">
        <Breadcrumbs
          items={helpArticleBreadcrumbItems(
            "analytics-e-report",
            "Analytics e report",
          )}
        />

        {/* ─── Intestazione ─── */}
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-3xl font-extrabold tracking-tight">
            Analytics e report: leggere ricavi, scontrini e prodotti
          </h1>
          <Badge variant="secondary">Analytics e report</Badge>
        </div>
        <p className="text-muted-foreground mt-3 text-sm leading-relaxed">
          La sezione <strong>Analytics</strong> riassume l&apos;andamento della
          tua attività: quanto hai incassato, quanti scontrini hai emesso e cosa
          vendi di più. I quattro indicatori principali (KPI) sono disponibili
          su tutti i piani; i grafici avanzati e il selettore di periodo sono
          sul piano <strong>Pro</strong>.
        </p>
        <p className="text-muted-foreground mt-1 text-sm">
          <strong>Ultimo aggiornamento:</strong> luglio 2026
        </p>

        {/* ─── Come accedere ─── */}
        <h2 className="mt-10 text-xl font-semibold">
          Come accedere ad Analytics
        </h2>
        <ol className="text-muted-foreground mt-3 list-decimal space-y-2 pl-5 text-sm leading-relaxed">
          <li>
            Dalla dashboard, tocca <strong>Analytics</strong> nella barra di
            navigazione (in alto su desktop, in basso su mobile).
          </li>
          <li>
            In cima vedrai i quattro <strong>KPI</strong>, poi i grafici con
            l&apos;andamento dei ricavi e le ripartizioni.
          </li>
          <li>
            I dati si aggiornano da soli man mano che emetti e annulli
            scontrini: non c&apos;è nessun calcolo manuale da fare.
          </li>
        </ol>
        <p className="text-muted-foreground mt-3 text-sm leading-relaxed">
          Analytics considera solo gli scontrini che hanno completato la
          trasmissione all&apos;AdE: i ricavi contano gli scontrini emessi, gli
          annullati vengono conteggiati a parte e non gonfiano l&apos;incassato.
        </p>
        <figure className="mt-6">
          <AppScreenshot
            src="/screenshots/analytics-panoramica.png"
            alt="Pannello Analytics di ScontrinoZero con i quattro KPI (ricavi, scontrini emessi, scontrino medio, scontrini annullati), il selettore di periodo e il grafico dei ricavi giornalieri"
            width={900}
            height={1860}
            sizes="(min-width: 768px) 240px, 65vw"
            className="mx-auto max-w-[240px]"
          />
          <figcaption className="text-muted-foreground mt-2 text-center text-xs">
            I quattro KPI e il grafico dei ricavi giornalieri, con il selettore
            di periodo (piano Pro).
          </figcaption>
        </figure>

        {/* ─── I KPI ─── */}
        <h2 className="mt-10 text-xl font-semibold">
          Gli indicatori (KPI) in cima alla pagina
        </h2>
        <p className="text-muted-foreground mt-3 text-sm leading-relaxed">
          Le quattro card in alto sintetizzano il periodo selezionato:
        </p>
        <div className="mt-3 space-y-3">
          <div>
            <p className="text-sm font-medium">Ricavi</p>
            <p className="text-muted-foreground mt-1 text-sm leading-relaxed">
              Il totale incassato con gli scontrini emessi nel periodo. Gli
              scontrini annullati non vengono conteggiati.
            </p>
          </div>
          <div>
            <p className="text-sm font-medium">Scontrini emessi</p>
            <p className="text-muted-foreground mt-1 text-sm leading-relaxed">
              Il numero di scontrini emessi con successo nel periodo.
            </p>
          </div>
          <div>
            <p className="text-sm font-medium">Scontrino medio</p>
            <p className="text-muted-foreground mt-1 text-sm leading-relaxed">
              L&apos;importo medio per scontrino, cioè i ricavi divisi per il
              numero di scontrini emessi. Utile per capire il valore tipico di
              una vendita.
            </p>
          </div>
          <div>
            <p className="text-sm font-medium">Scontrini annullati</p>
            <p className="text-muted-foreground mt-1 text-sm leading-relaxed">
              Quanti scontrini hai annullato nel periodo. Sono contati a parte:
              non entrano nei ricavi né nel conteggio degli emessi.
            </p>
          </div>
        </div>
        <p className="text-muted-foreground mt-3 text-sm leading-relaxed">
          Quando nel periodo non ci sono scontrini emessi, i KPI mostrano un
          trattino (—) al posto degli importi.
        </p>

        {/* ─── Selettore di periodo ─── */}
        <h2 className="mt-10 text-xl font-semibold">
          Il selettore di periodo{" "}
          <Badge className="ml-1" variant="secondary">
            Piano Pro
          </Badge>
        </h2>
        <p className="text-muted-foreground mt-3 text-sm leading-relaxed">
          Sul piano <strong>Pro</strong>, in alto a destra puoi scegliere
          l&apos;intervallo su cui calcolare KPI e grafici:
        </p>
        <ul className="text-muted-foreground mt-2 list-disc space-y-1 pl-5 text-sm leading-relaxed">
          <li>
            <strong>Ultimi 7 giorni</strong>
          </li>
          <li>
            <strong>Ultimi 30 giorni</strong>
          </li>
          <li>
            <strong>Ultimi 90 giorni</strong>
          </li>
          <li>
            <strong>Da inizio anno</strong>
          </li>
        </ul>
        <p className="text-muted-foreground mt-3 text-sm leading-relaxed">
          Il periodo selezionato resta nell&apos;indirizzo della pagina, quindi
          puoi salvare o condividere il link a un intervallo specifico. Sul
          piano <strong>Starter</strong> il selettore non compare: i KPI
          mostrano sempre gli <strong>ultimi 30 giorni</strong>.
        </p>

        {/* ─── I grafici ─── */}
        <h2 className="mt-10 text-xl font-semibold">
          I grafici avanzati{" "}
          <Badge className="ml-1" variant="secondary">
            Piano Pro
          </Badge>
        </h2>
        <p className="text-muted-foreground mt-3 text-sm leading-relaxed">
          Sotto ai KPI, il piano <strong>Pro</strong> mostra tre grafici, tutti
          allineati al periodo scelto nel selettore:
        </p>
        <div className="mt-3 space-y-3">
          <div>
            <p className="text-sm font-medium">Ricavi giornalieri</p>
            <p className="text-muted-foreground mt-1 text-sm leading-relaxed">
              L&apos;andamento giorno per giorno dei ricavi nel periodo. Tocca
              un punto per vedere la data e l&apos;importo incassato in quella
              giornata.
            </p>
          </div>
          <div>
            <p className="text-sm font-medium">Metodi di pagamento</p>
            <p className="text-muted-foreground mt-1 text-sm leading-relaxed">
              La ripartizione dei ricavi tra pagamenti{" "}
              <strong>Elettronico</strong> e <strong>Contanti</strong>: ti dice
              quanto incassi con ciascun metodo.
            </p>
          </div>
          <div>
            <p className="text-sm font-medium">
              Prodotti e servizi più venduti
            </p>
            <p className="text-muted-foreground mt-1 text-sm leading-relaxed">
              I prodotti e i servizi che generano più ricavi nel periodo, in
              ordine. Tocca una barra per vedere il nome esteso e
              l&apos;importo.
            </p>
          </div>
        </div>
        <figure className="mt-6">
          <AppScreenshot
            src="/screenshots/analytics-grafici.png"
            alt="Grafici avanzati di Analytics in ScontrinoZero: ripartizione dei ricavi per metodo di pagamento (elettronico e contanti) e prodotti e servizi più venduti"
            width={900}
            height={2051}
            sizes="(min-width: 768px) 240px, 65vw"
            className="mx-auto max-w-[240px]"
          />
          <figcaption className="text-muted-foreground mt-2 text-center text-xs">
            I grafici di metodi di pagamento e prodotti più venduti (piano Pro).
          </figcaption>
        </figure>

        {/* ─── Cosa vedi con lo Starter ─── */}
        <h2 className="mt-10 text-xl font-semibold">
          Cosa vedi con il piano Starter
        </h2>
        <p className="text-muted-foreground mt-3 text-sm leading-relaxed">
          Sul piano <strong>Starter</strong> Analytics mostra i quattro KPI
          calcolati sugli <strong>ultimi 30 giorni</strong>. Il selettore di
          periodo e i tre grafici sono riservati al piano <strong>Pro</strong>:
          al loro posto trovi un riquadro che invita a passare a Pro per
          sbloccarli. L&apos;upgrade è immediato dalla sezione{" "}
          <strong>Impostazioni → Piano e Abbonamento</strong> nella dashboard —
          vedi{" "}
          <Link
            href="/help/piani-e-prezzi"
            className="text-primary hover:underline"
          >
            Piani disponibili
          </Link>
          {"."}
        </p>
        <p className="text-muted-foreground mt-3 text-sm leading-relaxed">
          Durante la <strong>prova gratuita di 30 giorni</strong> vedi già
          Analytics nella versione completa, selettore e grafici inclusi: è un
          assaggio della versione Pro prima di scegliere il piano.
        </p>

        {/* ─── Export CSV ─── */}
        <h2 className="mt-10 text-xl font-semibold">
          Esportare i dati per il commercialista{" "}
          <Badge className="ml-1" variant="secondary">
            Piano Pro
          </Badge>
        </h2>
        <p className="text-muted-foreground mt-3 text-sm leading-relaxed">
          Analytics serve a leggere l&apos;andamento a colpo d&apos;occhio; per
          consegnare i numeri al commercialista usa l&apos;esportazione{" "}
          <strong>CSV</strong> dello storico scontrini, anch&apos;essa sul piano{" "}
          <strong>Pro</strong>. Trovi la procedura in{" "}
          <Link
            href="/help/storico-ed-esportazione"
            className="text-primary hover:underline"
          >
            Storico scontrini: filtri, ricerca ed esportazione
          </Link>
          {". "}
          Per verificare che i corrispettivi siano arrivati all&apos;Agenzia
          delle Entrate consulta invece il{" "}
          <Link
            href="/help/cassetto-fiscale"
            className="text-primary hover:underline"
          >
            cassetto fiscale
          </Link>
          {"."}
        </p>

        {/* ─── Casi d'uso comuni ─── */}
        <h2 className="mt-10 text-xl font-semibold">Casi d&apos;uso comuni</h2>
        <div className="mt-3 space-y-4">
          <div>
            <p className="text-sm font-medium">
              Capire quanto ho incassato questo mese
            </p>
            <p className="text-muted-foreground mt-1 text-sm leading-relaxed">
              Guarda il KPI <strong>Ricavi</strong>: sul piano Starter riflette
              gli ultimi 30 giorni, sul Pro puoi impostare il periodo esatto dal
              selettore.
            </p>
          </div>
          <div>
            <p className="text-sm font-medium">
              Sapere se incasso più in contanti o in elettronico
            </p>
            <p className="text-muted-foreground mt-1 text-sm leading-relaxed">
              Sul piano Pro apri il grafico <strong>Metodi di pagamento</strong>
              : confronta le due barre per vedere la quota di ciascun metodo.
            </p>
          </div>
          <div>
            <p className="text-sm font-medium">Scoprire cosa vendo di più</p>
            <p className="text-muted-foreground mt-1 text-sm leading-relaxed">
              Sul piano Pro il grafico{" "}
              <strong>Prodotti e servizi più venduti</strong> ordina le voci per
              ricavo generato nel periodo, così individui subito i tuoi best
              seller.
            </p>
          </div>
        </div>

        <RelatedHelpArticles slug="analytics-e-report" />

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
