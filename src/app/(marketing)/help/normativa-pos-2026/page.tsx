import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Badge } from "@/components/ui/badge";

export const metadata: Metadata = {
  title:
    "Collegamento POS-cassa 2026: cosa cambia per chi usa ScontrinoZero | ScontrinoZero Help",
  description:
    "Obbligo di abbinamento POS al sistema di cassa dal 2026 (Legge 207/2024): scadenze, sanzioni e cosa devi fare se usi ScontrinoZero (procedura Documento Commerciale Online).",
};

export default function NormativaPos2026Page() {
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
        <p className="text-muted-foreground mt-1 text-sm">
          <strong>Ultimo aggiornamento:</strong> aprile 2026
        </p>

        <div className="mt-6 rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm dark:border-amber-800 dark:bg-amber-950">
          <strong>In breve:</strong> se usi ScontrinoZero e accetti pagamenti
          con POS, devi registrare il POS nel portale Fatture e Corrispettivi
          dell&apos;AdE. Per i POS già attivi al 1° gennaio 2026 il termine
          della prima comunicazione è il <strong>20 aprile 2026</strong>. Non
          servono firmware né hardware aggiuntivi: l&apos;abbinamento è una
          procedura web, da fare personalmente nell&apos;area riservata
          dell&apos;AdE.
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
            obbligatoria. Per i POS già in uso al 1° gennaio 2026, la regola è
            45 giorni dalla disponibilità del servizio online (5 marzo 2026).
          </li>
          <li>
            <strong>POS attivati dopo il 1° gennaio 2026</strong> —
            comunicazione a partire dal sesto giorno del secondo mese successivo
            all&apos;attivazione del POS, ed entro l&apos;ultimo giorno
            lavorativo dello stesso mese.
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
          scontrino (es. ricariche telefoniche, marche da bollo, multe).
          L&apos;uso esclusivo va dichiarato nel portale AdE: senza la
          dichiarazione il POS resta soggetto all&apos;obbligo di collegamento.
        </p>

        {/* ─── Cosa fare con ScontrinoZero ─── */}
        <h2 className="mt-10 text-xl font-semibold">
          Cosa devi fare se usi ScontrinoZero
        </h2>
        <p className="text-muted-foreground mt-3 text-sm leading-relaxed">
          La procedura DCO usata da ScontrinoZero è soggetta all&apos;obbligo
          come gli RT fisici, ma il collegamento è significativamente più
          semplice perché si fa tutto via web:
        </p>
        <ul className="text-muted-foreground mt-2 list-disc space-y-2 pl-5 text-sm leading-relaxed">
          <li>
            <strong>Nessun firmware o hardware da aggiornare.</strong> Non devi
            attendere release del produttore di un RT, né far intervenire un
            tecnico per certificarlo.
          </li>
          <li>
            <strong>L&apos;abbinamento si fa nel portale AdE.</strong> Accedi a
            Fatture e Corrispettivi con le tue credenziali Fisconline (le stesse
            che già usi con ScontrinoZero), individui il POS nell&apos;elenco
            dei terminali associati alla tua P.IVA e lo abbini al tuo sistema
            DCO.
          </li>
          <li>
            <strong>L&apos;operazione va fatta personalmente.</strong> Per chi
            usa DCO l&apos;AdE non consente di delegare l&apos;abbinamento a un
            intermediario.
          </li>
        </ul>
        <p className="text-muted-foreground mt-3 text-sm leading-relaxed">
          Per la prima comunicazione il termine è il{" "}
          <strong>20 aprile 2026</strong> per i POS già in uso al 1° gennaio
          2026. ScontrinoZero non gestisce questa registrazione al posto tuo
          perché l&apos;AdE richiede che l&apos;esercente la faccia
          direttamente.
        </p>

        {/* ─── Sanzioni ─── */}
        <h2 className="mt-10 text-xl font-semibold">Sanzioni</h2>
        <ul className="text-muted-foreground mt-3 list-disc space-y-2 pl-5 text-sm leading-relaxed">
          <li>
            <strong>Omessa o incompleta trasmissione dei corrispettivi</strong>{" "}
            — 100 € per ogni operazione (D.Lgs. 471/1997, art. 11, comma
            2-quinquies).
          </li>
          <li>
            <strong>Omessa installazione o mancato collegamento</strong> — da
            1.000 € a 4.000 €, con possibile sospensione della licenza o
            autorizzazione da 15 giorni a 2 mesi (D.Lgs. 471/1997, art. 11,
            comma 5).
          </li>
        </ul>
        <p className="text-muted-foreground mt-3 text-sm leading-relaxed">
          È in discussione un emendamento per introdurre una{" "}
          <strong>franchigia del 5%</strong>: sotto questa soglia di operazioni
          non collegate non scatterebbe la sanzione. Verifica gli aggiornamenti
          sul sito dell&apos;Agenzia delle Entrate o con il tuo commercialista,
          perché la disciplina può evolvere nei mesi successivi alla prima
          scadenza.
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
                <td className="py-2">RT certificato (€200-800+)</td>
                <td className="py-2">Smartphone o PC</td>
              </tr>
              <tr>
                <td className="text-foreground py-2 font-medium">
                  Modalità di abbinamento POS (2026)
                </td>
                <td className="py-2">
                  Firmware RT certificato + intervento tecnico
                </td>
                <td className="py-2 font-semibold text-green-600">
                  Registrazione nel portale AdE (no hardware)
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
                <td className="py-2">€150-400+ (canone + manutenzione)</td>
                <td className="py-2">Da €29,99/anno</td>
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
              Corrispettivi. L&apos;unica esenzione è per POS dedicati
              esclusivamente a operazioni esonerate dall&apos;obbligo di
              scontrino, da dichiarare nel portale stesso.
            </p>
          </div>
          <div>
            <p className="text-sm font-medium">
              Sono un ambulante: mi riguarda?
            </p>
            <p className="text-muted-foreground mt-1 text-sm leading-relaxed">
              Dipende dal tuo regime. Alcune categorie di venditori ambulanti
              rientrano in esoneri specifici previsti dal D.Lgs. 127/2015 e dai
              provvedimenti AdE. Se sei esonerato dall&apos;obbligo di
              scontrino, lo sei anche dal collegamento POS-cassa. Verifica con
              il tuo commercialista quale obbligo si applica alla tua attività.
            </p>
          </div>
          <div>
            <p className="text-sm font-medium">
              Cosa succede se non comunico il POS entro il 20 aprile 2026?
            </p>
            <p className="text-muted-foreground mt-1 text-sm leading-relaxed">
              Si applicano le sanzioni del D.Lgs. 471/1997, art. 11: da 1.000 €
              a 4.000 € con possibile sospensione della licenza per omessa
              installazione o mancato collegamento; 100 € per operazione per
              omessa trasmissione dei corrispettivi. Verifica con il tuo
              commercialista il quadro sanzionatorio aggiornato e
              l&apos;eventuale franchigia del 5% in discussione.
            </p>
          </div>
          <div>
            <p className="text-sm font-medium">
              Ho un RT fisico e sto valutando il passaggio a ScontrinoZero: ha
              senso oggi?
            </p>
            <p className="text-muted-foreground mt-1 text-sm leading-relaxed">
              Il vantaggio principale di ScontrinoZero non è l&apos;esenzione
              dall&apos;obbligo POS-cassa (entrambi soggetti), ma il fatto che
              non ci sono firmware né hardware da aggiornare e i costi fissi
              sono molto più bassi. Se hai un RT da rinnovare o un contratto di
              manutenzione costoso, il passaggio può essere interessante. Puoi
              provare la prova gratuita di 30 giorni senza inserire la carta di
              credito.
            </p>
          </div>
        </div>

        {/* ─── Articoli correlati ─── */}
        <h2 className="mt-10 text-xl font-semibold">Articoli correlati</h2>
        <ul className="mt-3 space-y-1 text-sm">
          <li>
            <Link
              href="/help/prima-configurazione"
              className="text-primary hover:underline"
            >
              Prima configurazione passo-passo (onboarding completo)
            </Link>
          </li>
          <li>
            <Link
              href="/help/chiusura-giornaliera"
              className="text-primary hover:underline"
            >
              Chiusura giornaliera: è obbligatoria?
            </Link>
          </li>
          <li>
            <Link
              href="/help/regime-forfettario"
              className="text-primary hover:underline"
            >
              Regime forfettario: configurazione IVA corretta
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
