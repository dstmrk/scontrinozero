import { Badge } from "@/components/ui/badge";
import {
  JsonLd,
  helpArticleBreadcrumb,
  helpArticleBreadcrumbItems,
} from "@/components/json-ld";
import { Breadcrumbs } from "@/components/marketing/breadcrumbs";
import { helpArticleMetadata } from "@/lib/help/metadata";
import { HelpArticleJsonLd } from "@/components/help/article-json-ld";
import { RT_COSTS } from "@/lib/marketing/rt-costs";
import { HelpArticleUpdatedAt } from "@/components/help/article-updated-at";
import { RelatedHelpArticles } from "@/components/help/related-articles";
import { PLAN_PRICES } from "@/lib/plan-prices";

const { starter } = PLAN_PRICES;

export const metadata = helpArticleMetadata("normativa-pos-2026");

export default function NormativaPos2026Page() {
  return (
    <section className="px-4 py-16">
      <JsonLd
        data={helpArticleBreadcrumb(
          "normativa-pos-2026",
          "Collegamento POS-cassa 2026",
        )}
      />
      <HelpArticleJsonLd slug="normativa-pos-2026" />
      <article className="mx-auto max-w-3xl">
        <Breadcrumbs
          items={helpArticleBreadcrumbItems(
            "normativa-pos-2026",
            "Collegamento POS-cassa 2026",
          )}
        />

        {/* ─── Intestazione ─── */}
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-3xl font-extrabold tracking-tight">
            Collegamento POS-cassa 2026: cosa cambia per chi usa ScontrinoZero
          </h1>
          <Badge variant="secondary">POS e normativa</Badge>
        </div>
        <p className="text-muted-foreground mt-3 text-sm leading-relaxed">
          Dal 2026 chi accetta pagamenti elettronici deve registrare il proprio
          POS nel portale dell&apos;Agenzia delle Entrate, abbinandolo al
          sistema con cui memorizza e trasmette i corrispettivi — registratore
          telematico fisico (RT) o procedura web{" "}
          <strong>Documento Commerciale Online</strong> (DCO). L&apos;obbligo si
          applica <strong>anche a chi usa ScontrinoZero</strong>: questa guida
          ti spiega cosa devi fare e quali sono le scadenze.
        </p>
        <HelpArticleUpdatedAt slug="normativa-pos-2026" />

        <div className="mt-6 rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm dark:border-amber-800 dark:bg-amber-950">
          <strong>In breve:</strong> se usi ScontrinoZero e accetti pagamenti
          con POS, devi registrare il POS nel portale Fatture e Corrispettivi
          dell&apos;AdE. Per i POS già attivi al 1° gennaio 2026 o attivati nel
          corso di gennaio, il termine della prima comunicazione è il{" "}
          <strong>20 aprile 2026</strong>. Non servono firmware né hardware
          aggiuntivi: l&apos;abbinamento è una procedura web, da fare
          personalmente nell&apos;area riservata dell&apos;AdE.
        </div>

        {/* ─── La normativa in sintesi ─── */}
        <h2 className="mt-10 text-xl font-semibold">La normativa in sintesi</h2>
        <p className="text-muted-foreground mt-3 text-sm leading-relaxed">
          La fonte è la{" "}
          <strong>
            Legge 207/2024 (Legge di Bilancio 2025), art. 1, commi 74-77
          </strong>
          , attuata dal{" "}
          <strong>
            Provvedimento del Direttore dell&apos;Agenzia delle Entrate n.
            424470 del 31 ottobre 2025
          </strong>
          {
            ". Dal 1° gennaio 2026 ogni dispositivo (hardware o software) usato per accettare pagamenti elettronici deve essere costantemente collegato al sistema con cui i corrispettivi vengono memorizzati e trasmessi all'AdE."
          }
        </p>
        <p className="text-muted-foreground mt-3 text-sm leading-relaxed">
          L&apos;abbinamento si effettua nell&apos;area riservata del portale{" "}
          <strong>Fatture e Corrispettivi</strong>, registrando
          l&apos;identificativo del POS e associandolo a quello del proprio
          sistema di cassa (RT o DCO).
        </p>

        {/* ─── Scadenze ─── */}
        <h2 className="mt-10 text-xl font-semibold">Scadenze operative</h2>
        <ul className="text-muted-foreground mt-3 list-disc space-y-2 pl-5 text-sm leading-relaxed">
          <li>
            <strong>1° gennaio 2026</strong> — entrata in vigore della norma.
          </li>
          <li>
            <strong>5 marzo 2026</strong> — apertura del servizio web AdE per
            registrare l&apos;abbinamento POS-cassa.
          </li>
          <li>
            <strong>20 aprile 2026</strong> — termine per la prima comunicazione
            obbligatoria. Per i POS già attivi al 1° gennaio 2026 o attivati nel
            corso di gennaio, la regola è 45 giorni dalla disponibilità del
            servizio online (5 marzo 2026).
          </li>
          <li>
            <strong>POS attivati da febbraio 2026 in poi</strong> —
            comunicazione a partire dal sesto giorno del secondo mese successivo
            all&apos;attivazione del POS, ed entro l&apos;ultimo giorno
            lavorativo dello stesso mese. I POS già attivi al 1° gennaio 2026 o
            attivati nel corso di gennaio seguono invece la scadenza del 20
            aprile 2026.
          </li>
        </ul>

        {/* ─── Chi è obbligato ─── */}
        <h2 className="mt-10 text-xl font-semibold">
          Chi è obbligato al collegamento
        </h2>
        <p className="text-muted-foreground mt-3 text-sm leading-relaxed">
          L&apos;obbligo riguarda{" "}
          <strong>
            tutti i soggetti tenuti alla memorizzazione elettronica e
            trasmissione telematica dei corrispettivi
          </strong>{" "}
          che accettano pagamenti elettronici, indipendentemente dallo strumento
          usato per registrare gli incassi:
        </p>
        <ul className="text-muted-foreground mt-2 list-disc space-y-1 pl-5 text-sm leading-relaxed">
          <li>Esercenti con registratore telematico (RT) fisico.</li>
          <li>
            Esercenti che usano la procedura web Documento Commerciale Online —
            incluso chi usa ScontrinoZero.
          </li>
        </ul>
        <p className="text-muted-foreground mt-3 text-sm leading-relaxed">
          <strong>Esenzione</strong> — è prevista solo per chi dedica un POS{" "}
          <em>esclusivamente</em> a operazioni esonerate dall&apos;obbligo di
          scontrino (es. tabacchi e generi di monopolio, carburanti, ricariche
          telefoniche). Quel POS non va collegato; nella procedura puoi
          segnalarlo con la funzione <em>POS non collegati</em>, così non
          compare più fra quelli da collegare. La segnalazione è irreversibile:
          da lì in poi quel POS non va usato, nemmeno di rado, per incassi
          certificati con documento commerciale.
        </p>

        {/* ─── Cosa fare con ScontrinoZero ─── */}
        <h2 className="mt-10 text-xl font-semibold">
          Cosa devi fare se usi ScontrinoZero
        </h2>
        <p className="text-muted-foreground mt-3 text-sm leading-relaxed">
          La procedura DCO usata da ScontrinoZero è soggetta all&apos;obbligo
          come gli RT fisici, e anche qui il collegamento si fa tutto via web:
        </p>
        <ul className="text-muted-foreground mt-2 list-disc space-y-2 pl-5 text-sm leading-relaxed">
          <li>
            <strong>Nessun firmware o hardware da aggiornare.</strong> Il
            collegamento è logico per tutti, RT compresi: una comunicazione via
            web, non un cavo fra POS e cassa.
          </li>
          <li>
            <strong>L&apos;abbinamento si fa nel portale AdE.</strong> Accedi a
            Fatture e Corrispettivi (SPID, CIE, CNS o Fisconline), apri{" "}
            <em>Documento Commerciale on line</em> e, nel riquadro{" "}
            <em>Funzionalità di supporto</em>, scegli{" "}
            <em>Associazione strumenti di pagamento elettronico</em> e premi{" "}
            <em>Inserisci collegamento</em>: l&apos;elenco mostra già i POS a
            tuo nome comunicati dagli operatori finanziari, li selezioni e premi{" "}
            <em>Collega</em>.
          </li>
          <li>
            <strong>L&apos;operazione va fatta personalmente.</strong> Per chi
            usa DCO l&apos;AdE non consente di delegare l&apos;abbinamento a un
            intermediario.
          </li>
        </ul>
        <p className="text-muted-foreground mt-3 text-sm leading-relaxed">
          Per la prima comunicazione il termine è il{" "}
          <strong>20 aprile 2026</strong> per i POS già attivi al 1° gennaio
          2026 o attivati nel corso di gennaio. ScontrinoZero non gestisce
          questa registrazione al posto tuo perché l&apos;AdE richiede che
          l&apos;esercente la faccia direttamente.
        </p>

        {/* ─── Sanzioni ─── */}
        <h2 className="mt-10 text-xl font-semibold">Sanzioni</h2>
        <ul className="text-muted-foreground mt-3 list-disc space-y-2 pl-5 text-sm leading-relaxed">
          <li>
            <strong>
              Omessa, tardiva o errata trasmissione di corrispettivi e dati dei
              pagamenti, senza effetti sull&apos;imposta
            </strong>{" "}
            — 100 € per trasmissione, fino a 1.000 € a trimestre (D.Lgs.
            471/1997, art. 11, comma 2-quinquies).
          </li>
          <li>
            <strong>Omessa installazione o mancato collegamento</strong> — da
            1.000 € a 4.000 €, con possibile sospensione della licenza o
            autorizzazione da 15 giorni a 2 mesi (D.Lgs. 471/1997, art. 11,
            comma 5, e art. 12, comma 3).
          </li>
        </ul>
        <p className="text-muted-foreground mt-3 text-sm leading-relaxed">
          Dal 12 agosto 2026 vale una <strong>tolleranza del 5%</strong> (D.Lgs.
          7 agosto 2026 n. 148, art. 33): la sanzione da 100 € non si applica se
          lo scarto fra le operazioni con pagamento elettronico registrate e i
          pagamenti elettronici accettati non supera il 5% del loro numero. La
          tolleranza non copre il mancato collegamento del POS, che resta punito
          da 1.000 a 4.000 €. Per una violazione già commessa valuta con il
          commercialista il ravvedimento operoso.
        </p>

        {/* ─── Differenze RT vs DCO ─── */}
        <h2 className="mt-10 text-xl font-semibold">
          RT fisico vs. Documento Commerciale Online: confronto
        </h2>
        <p className="text-muted-foreground mt-3 text-sm leading-relaxed">
          Sull&apos;obbligo POS-cassa 2026 i due strumenti sono{" "}
          <strong>parificati</strong>: la differenza sta nel modo di registrare
          l&apos;abbinamento e nei costi di gestione complessivi.
        </p>
        <div className="mt-3 overflow-x-auto">
          <table className="text-muted-foreground w-full text-sm">
            <thead>
              <tr className="border-border border-b text-left">
                <th className="text-foreground pb-2 font-semibold">Aspetto</th>
                <th className="text-foreground pb-2 font-semibold">
                  RT fisico
                </th>
                <th className="text-foreground pb-2 font-semibold">
                  ScontrinoZero (DCO)
                </th>
              </tr>
            </thead>
            <tbody className="divide-border divide-y">
              <tr>
                <td className="text-foreground py-2 font-medium">Hardware</td>
                <td className="py-2">
                  RT certificato (€{RT_COSTS.purchase.min}-
                  {RT_COSTS.purchase.max})
                </td>
                <td className="py-2">Smartphone o PC</td>
              </tr>
              <tr>
                <td className="text-foreground py-2 font-medium">
                  Modalità di abbinamento POS (2026)
                </td>
                <td className="py-2">
                  Servizio web «Gestione collegamenti», anche tramite
                  intermediario delegato
                </td>
                <td className="py-2">
                  Funzione nella procedura DCO, solo l&apos;esercente
                </td>
              </tr>
              <tr>
                <td className="text-foreground py-2 font-medium">
                  Chiusura giornaliera
                </td>
                <td className="py-2">Obbligatoria</td>
                <td className="py-2 font-semibold text-green-600">
                  Non necessaria
                </td>
              </tr>
              <tr>
                <td className="text-foreground py-2 font-medium">
                  Manutenzione
                </td>
                <td className="py-2">Tecnico specializzato</td>
                <td className="py-2">Aggiornamenti automatici</td>
              </tr>
              <tr>
                <td className="text-foreground py-2 font-medium">
                  Costo annuo
                </td>
                <td className="py-2">
                  Verificazione ogni {RT_COSTS.periodicVerification.everyYears}{" "}
                  anni (€{RT_COSTS.periodicVerification.min}-
                  {RT_COSTS.periodicVerification.max}); assistenza facoltativa a
                  parte
                </td>
                <td className="py-2">Da {starter.yearly}/anno</td>
              </tr>
            </tbody>
          </table>
        </div>

        {/* ─── FAQ ─── */}
        <h2 className="mt-10 text-xl font-semibold">Domande frequenti</h2>
        <div className="mt-3 space-y-4">
          <div>
            <p className="text-sm font-medium">
              Uso SumUp o un POS bancario: sono obbligato al collegamento anche
              se uso ScontrinoZero?
            </p>
            <p className="text-muted-foreground mt-1 text-sm leading-relaxed">
              Sì. L&apos;obbligo si applica a chiunque accetti pagamenti
              elettronici e sia tenuto alla trasmissione telematica dei
              corrispettivi, indipendentemente dal sistema di cassa. La
              registrazione del POS avviene nel portale AdE Fatture e
              Corrispettivi, dentro la procedura Documento Commerciale Online.
              L&apos;unica esenzione è per POS dedicati esclusivamente a
              operazioni esonerate dall&apos;obbligo di scontrino, che non vanno
              collegati.
            </p>
          </div>
          <div>
            <p className="text-sm font-medium">
              Sono un ambulante: mi riguarda?
            </p>
            <p className="text-muted-foreground mt-1 text-sm leading-relaxed">
              Dipende da cosa vendi, non dal regime fiscale. Alcune operazioni,
              anche svolte in forma ambulante, sono esonerate dall&apos;obbligo
              di memorizzazione e trasmissione dei corrispettivi (DM 10 maggio
              2019, emanato in base all&apos;art. 2 D.Lgs. 127/2015): se il POS
              incassa solo quelle, non va collegato. Se invece emetti documenti
              commerciali, anche da ambulante, il POS con cui li incassi va
              collegato. Verifica con il tuo commercialista quale obbligo si
              applica alla tua attività.
            </p>
          </div>
          <div>
            <p className="text-sm font-medium">
              Cosa succede se non comunico il POS entro il 20 aprile 2026?
            </p>
            <p className="text-muted-foreground mt-1 text-sm leading-relaxed">
              Il mancato collegamento è punito da 1.000 € a 4.000 €, con
              possibile sospensione della licenza (D.Lgs. 471/1997, art. 11,
              comma 5): la tolleranza del 5% introdotta dal D.Lgs. 148/2026
              riguarda le trasmissioni, non questa violazione. Se sei fuori
              termine, registra il collegamento subito e valuta con il tuo
              commercialista il ravvedimento operoso.
            </p>
          </div>
          <div>
            <p className="text-sm font-medium">
              Ho un RT fisico e sto valutando il passaggio a ScontrinoZero: ha
              senso oggi?
            </p>
            <p className="text-muted-foreground mt-1 text-sm leading-relaxed">
              Il vantaggio principale di ScontrinoZero non è l&apos;esenzione
              dall&apos;obbligo POS-cassa (entrambi soggetti), ma l&apos;assenza
              di hardware da comprare, installare e verificare ogni due anni, e
              costi fissi molto più bassi. Se hai un RT da rinnovare o un
              contratto di manutenzione costoso, il passaggio può essere
              interessante. Puoi provare la prova gratuita di 30 giorni senza
              inserire la carta di credito.
            </p>
          </div>
        </div>

        <RelatedHelpArticles slug="normativa-pos-2026" />

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
