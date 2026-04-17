import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Badge } from "@/components/ui/badge";

export const metadata: Metadata = {
  title:
    "Nuova normativa POS 2026: cosa cambia per gli esercenti | ScontrinoZero Help",
  description:
    "Tutto quello che devi sapere sugli obblighi di collegamento POS-RT del 2026: chi è coinvolto, le scadenze e come ScontrinoZero ti aiuta a essere in regola.",
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
            Nuova normativa POS 2026: cosa cambia per gli esercenti
          </h1>
          <Badge variant="secondary">POS e normativa</Badge>
        </div>
        <p className="text-muted-foreground mt-3 text-sm leading-relaxed">
          Dal 2026 gli esercenti con registratore telematico devono integrare il
          POS con il sistema di cassa. Questa guida spiega in modo chiaro chi è
          obbligato, cosa cambia concretamente e perché chi usa ScontrinoZero è
          già in una posizione vantaggiosa.
        </p>
        <p className="text-muted-foreground mt-1 text-sm">
          <strong>Ultimo aggiornamento:</strong> aprile 2026
        </p>

        {/* ─── La normativa in sintesi ─── */}
        <h2 className="mt-10 text-xl font-semibold">La normativa in sintesi</h2>
        <p className="text-muted-foreground mt-3 text-sm leading-relaxed">
          Il collegamento obbligatorio tra POS e registratore telematico (RT) è
          previsto dalla{" "}
          <strong>Legge di Bilancio 2023 (art. 1, co. 385)</strong>, con
          attuazione progressiva. L&apos;obiettivo è che i pagamenti elettronici
          siano automaticamente abbinati agli scontrini fiscali, riducendo
          l&apos;evasione sul fronte degli incassi.
        </p>
        <p className="text-muted-foreground mt-3 text-sm leading-relaxed">
          In pratica: quando un cliente paga con carta, il POS deve
          &quot;parlare&quot; con il registratore telematico e i dati devono
          confluire in un&apos;unica trasmissione all&apos;AdE.
        </p>

        {/* ─── Chi è obbligato ─── */}
        <h2 className="mt-10 text-xl font-semibold">
          Chi è obbligato al collegamento POS-RT
        </h2>
        <p className="text-muted-foreground mt-3 text-sm leading-relaxed">
          L&apos;obbligo riguarda gli esercenti che usano un{" "}
          <strong>registratore telematico fisico</strong> (RT) e accettano
          pagamenti con POS. In particolare:
        </p>
        <ul className="text-muted-foreground mt-2 list-disc space-y-1 pl-5 text-sm leading-relaxed">
          <li>
            Commercianti al dettaglio, ristoratori, artigiani con RT già
            installato.
          </li>
          <li>
            Esercenti che hanno accettato almeno un pagamento elettronico
            nell&apos;anno precedente.
          </li>
        </ul>
        <p className="text-muted-foreground mt-3 text-sm leading-relaxed">
          <strong>Non sono obbligati</strong> (o hanno regole diverse):
        </p>
        <ul className="text-muted-foreground mt-2 list-disc space-y-1 pl-5 text-sm leading-relaxed">
          <li>
            Chi usa la procedura <strong>Documento Commerciale Online</strong>{" "}
            (come ScontrinoZero) — vedi sotto.
          </li>
          <li>
            Soggetti in regime di esonero dall&apos;obbligo di scontrino (es.
            alcune categorie di venditori ambulanti).
          </li>
          <li>Professionisti che emettono esclusivamente fattura.</li>
        </ul>

        {/* ─── Scadenze ─── */}
        <h2 className="mt-10 text-xl font-semibold">Scadenze operative</h2>
        <p className="text-muted-foreground mt-3 text-sm leading-relaxed">
          Le scadenze per il collegamento tecnico POS-RT sono state oggetto di
          proroghe successive. Al momento:
        </p>
        <ul className="text-muted-foreground mt-2 list-disc space-y-2 pl-5 text-sm leading-relaxed">
          <li>
            <strong>2024–2025:</strong> fase sperimentale e adeguamento dei
            produttori di RT e POS.
          </li>
          <li>
            <strong>2026:</strong> obbligo operativo per i soggetti con RT. I
            fornitori di POS (Nexi, SumUp, Stripe Terminal, ecc.) stanno
            rilasciando aggiornamenti firmware per la compatibilità.
          </li>
        </ul>
        <p className="text-muted-foreground mt-3 text-sm leading-relaxed">
          Ti consigliamo di verificare con il tuo fornitore RT e POS lo stato
          dell&apos;adeguamento, poiché le scadenze esatte possono variare in
          base all&apos;hardware in uso.
        </p>

        {/* ─── ScontrinoZero e la normativa ─── */}
        <h2 className="mt-10 text-xl font-semibold">
          ScontrinoZero è già conforme?
        </h2>
        <p className="text-muted-foreground mt-3 text-sm leading-relaxed">
          <strong>Sì, e la situazione è ancora più semplice.</strong>{" "}
          ScontrinoZero usa la procedura{" "}
          <strong>Documento Commerciale Online</strong>, che trasmette ogni
          scontrino all&apos;AdE in tempo reale, scontrino per scontrino. Questa
          procedura{" "}
          <strong>non rientra nell&apos;obbligo di collegamento POS-RT</strong>{" "}
          previsto dalla Legge di Bilancio 2023, che si applica solo ai
          registratori telematici fisici.
        </p>
        <p className="text-muted-foreground mt-3 text-sm leading-relaxed">
          In altre parole: se usi ScontrinoZero come unico sistema di cassa,{" "}
          <strong>non devi fare nulla</strong> per essere conforme alla nuova
          normativa POS-RT.
        </p>

        {/* ─── Cosa fare se hai un RT ─── */}
        <h2 className="mt-10 text-xl font-semibold">
          Ho già un RT fisico: devo passare a ScontrinoZero?
        </h2>
        <p className="text-muted-foreground mt-3 text-sm leading-relaxed">
          Non necessariamente. Hai due opzioni:
        </p>
        <ol className="text-muted-foreground mt-2 list-decimal space-y-2 pl-5 text-sm leading-relaxed">
          <li>
            <strong>Aggiornare l&apos;RT esistente</strong> con il firmware
            compatibile POS-RT fornito dal produttore (Epson, Custom, Ditron,
            ecc.) e collegarlo al POS certificato. Costo: dipende dal contratto
            con il fornitore.
          </li>
          <li>
            <strong>Passare a ScontrinoZero</strong> come alternativa
            completamente software. Nessun hardware da aggiornare, nessun
            collegamento POS-RT richiesto, costi fissi molto inferiori. Il POS
            rimane indipendente e tu registri comunque ogni incasso in
            ScontrinoZero.
          </li>
        </ol>
        <p className="text-muted-foreground mt-3 text-sm leading-relaxed">
          La scelta dipende dalla tua attività, dal volume di transazioni e
          dalla necessità di funzionamento offline. Se vuoi valutare la
          transizione, il <strong>trial gratuito di 30 giorni</strong> di
          ScontrinoZero ti permette di testare senza impegno.
        </p>

        {/* ─── Differenza RT vs DCO ─── */}
        <h2 className="mt-10 text-xl font-semibold">
          RT fisico vs. Documento Commerciale Online: differenze chiave
        </h2>
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
                  Obbligo POS-RT 2026
                </td>
                <td className="py-2">Sì</td>
                <td className="py-2 font-semibold text-green-600">No</td>
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
              Uso SumUp o Square come POS: sono obbligato al collegamento?
            </p>
            <p className="text-muted-foreground mt-1 text-sm leading-relaxed">
              Solo se hai anche un RT fisico. Se usi ScontrinoZero al posto
              dell&apos;RT, non c&apos;è nessun obbligo di collegamento POS-RT.
              Il POS rimane indipendente.
            </p>
          </div>
          <div>
            <p className="text-sm font-medium">
              Sono un ambulante: mi riguarda questa normativa?
            </p>
            <p className="text-muted-foreground mt-1 text-sm leading-relaxed">
              Dipende dal tuo regime. Molti ambulanti rientrano in esoneri
              specifici. Ti consigliamo di verificare con il tuo commercialista
              quale obbligo si applica alla tua attività specifica.
            </p>
          </div>
          <div>
            <p className="text-sm font-medium">
              Esiste una sanzione per chi non adegua l&apos;RT entro il 2026?
            </p>
            <p className="text-muted-foreground mt-1 text-sm leading-relaxed">
              Le sanzioni per omessa o tardiva trasmissione dei corrispettivi
              sono previste dall&apos;art. 2 comma 6 del D.Lgs. 127/2015. I
              dettagli applicativi al collegamento POS-RT saranno chiariti
              dall&apos;AdE con appositi provvedimenti. Mantieniti aggiornato
              tramite il sito dell&apos;Agenzia delle Entrate o il tuo
              consulente fiscale.
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
