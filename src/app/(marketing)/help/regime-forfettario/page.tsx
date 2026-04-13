import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Badge } from "@/components/ui/badge";

export const metadata: Metadata = {
  title: "Regime forfettario: configurazione IVA corretta | ScontrinoZero Help",
  description:
    "Come configurare ScontrinoZero per il regime forfettario: aliquota IVA corretta, dicitura sullo scontrino e impostazioni fiscali per chi non applica IVA.",
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
          correttamente per evitare errori nei documenti trasmessi
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
            ". Sullo scontrino o documento commerciale deve invece comparire la dicitura di esonero."
          }
        </p>
        <p className="text-muted-foreground mt-3 text-sm leading-relaxed">
          L&apos;errore più comune è impostare l&apos;aliquota IVA al 22% (o
          altra aliquota ordinaria) anziché usare il codice di esonero — lo
          scontrino risulterebbe fiscalmente scorretto.
        </p>

        {/* ─── Configurazione in ScontrinoZero ─── */}
        <h2 className="mt-10 text-xl font-semibold">
          Come configurare il regime forfettario in ScontrinoZero
        </h2>
        <ol className="text-muted-foreground mt-3 list-decimal space-y-2 pl-5 text-sm leading-relaxed">
          <li>
            Vai su{" "}
            <strong>
              Impostazioni → Configurazione attività → Regime fiscale
            </strong>
            {"."}
          </li>
          <li>
            Seleziona <strong>Regime forfettario</strong> dall&apos;elenco a
            tendina. ScontrinoZero imposta automaticamente:
            <ul className="mt-1 list-disc space-y-1 pl-5">
              <li>
                Aliquota IVA predefinita:{" "}
                <strong>RF19 — Regime forfettario (non soggetto IVA)</strong>
              </li>
              <li>
                Dicitura aggiuntiva sullo scontrino:{" "}
                <em>
                  &quot;Operazione effettuata da contribuente in regime
                  forfettario ai sensi dell&apos;art. 1 cc. 54-89 L. 190/2014 —
                  non soggetta a IVA&quot;
                </em>
              </li>
            </ul>
          </li>
          <li>
            Salva le impostazioni. Da questo momento tutti gli scontrini emessi
            useranno la natura IVA RF19.
          </li>
        </ol>
        <p className="text-muted-foreground mt-3 text-sm leading-relaxed">
          Se hai già aggiunto prodotti al catalogo rapido prima di configurare
          il regime, controlla che le aliquote IVA dei singoli prodotti siano
          anch&apos;esse impostate su <strong>RF19</strong> (puoi farlo in{" "}
          <strong>Catalogo → modifica prodotto</strong>).
        </p>

        {/* ─── Come appare lo scontrino ─── */}
        <h2 className="mt-10 text-xl font-semibold">
          Come appare lo scontrino
        </h2>
        <p className="text-muted-foreground mt-3 text-sm leading-relaxed">
          Il documento commerciale trasmesso all&apos;AdE per un forfettario
          mostra:
        </p>
        <ul className="text-muted-foreground mt-2 list-disc space-y-1 pl-5 text-sm leading-relaxed">
          <li>
            <strong>Importo totale</strong> senza IVA separata — il prezzo è
            &quot;tutto incluso&quot; senza scorporo.
          </li>
          <li>
            <strong>Natura RF19</strong> nel campo aliquota/natura IVA.
          </li>
          <li>
            <strong>Dicitura legale</strong> di esonero (aggiunta
            automaticamente da ScontrinoZero).
          </li>
        </ul>
        <p className="text-muted-foreground mt-3 text-sm leading-relaxed">
          Il cliente vede un documento corretto e conforme. Non deve comparire
          nessuna cifra come &quot;IVA: €0,00&quot; — semplicemente non c&apos;è
          la voce IVA.
        </p>

        {/* ─── Cosa cambia dal 2024 ─── */}
        <h2 className="mt-10 text-xl font-semibold">
          Soglia ricavi 2024–2025: chi rientra ancora nel forfettario?
        </h2>
        <p className="text-muted-foreground mt-3 text-sm leading-relaxed">
          Dal 2024 la soglia di ricavi per accedere al regime forfettario è{" "}
          <strong>€ 85.000 annui</strong> (modificata dalla Legge di Bilancio
          2023). Superata questa soglia nel corso dell&apos;anno, esci dal
          regime dall&apos;anno successivo. ScontrinoZero non verifica
          automaticamente il superamento della soglia — consulta il tuo
          commercialista se sei vicino al limite.
        </p>

        {/* ─── Domande frequenti ─── */}
        <h2 className="mt-10 text-xl font-semibold">Domande frequenti</h2>
        <div className="mt-3 space-y-4">
          <div>
            <p className="text-sm font-medium">
              Ho selezionato &quot;Regime forfettario&quot; ma lo scontrino
              mostra ancora IVA al 22% — perché?
            </p>
            <p className="text-muted-foreground mt-1 text-sm leading-relaxed">
              Probabilmente hai aggiunto prodotti al catalogo prima di
              configurare il regime, e quei prodotti hanno ancora
              l&apos;aliquota ordinaria. Vai in <strong>Catalogo</strong> e
              aggiorna l&apos;aliquota di ciascun prodotto su{" "}
              <strong>RF19</strong>. Le righe manuali (importo libero) usano
              sempre l&apos;aliquota predefinita dell&apos;attività.
            </p>
          </div>
          <div>
            <p className="text-sm font-medium">
              Posso vendere ad aliquote diverse (es. alcune voci a IVA 10%)?
            </p>
            <p className="text-muted-foreground mt-1 text-sm leading-relaxed">
              In regime forfettario no — sei completamente esonerato
              dall&apos;IVA su tutte le operazioni. Non è possibile applicare
              aliquote diverse su singole vendite rimanendo nel forfettario. Se
              devi applicare IVA, devi prima uscire dal regime forfettario
              (contatta il tuo commercialista).
            </p>
          </div>
          <div>
            <p className="text-sm font-medium">
              Ho sbagliato regime — ho emesso scontrini con IVA quando ero
              forfettario. Cosa faccio?
            </p>
            <p className="text-muted-foreground mt-1 text-sm leading-relaxed">
              Questo è un errore fiscale che richiede la consulenza di un
              commercialista. ScontrinoZero non può correggere retroattivamente
              i documenti già trasmessi all&apos;AdE. Puoi contattare il
              supporto per ricevere un elenco degli scontrini emessi nel
              periodo.
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
