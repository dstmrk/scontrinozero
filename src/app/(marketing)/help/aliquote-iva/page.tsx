import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Badge } from "@/components/ui/badge";

export const metadata: Metadata = {
  title:
    "Come gestire aliquote IVA, reparti e metodi di pagamento | ScontrinoZero Help",
  description:
    "Guida alla configurazione delle aliquote IVA (4%, 10%, 22%, esente), dei reparti e dei metodi di pagamento in ScontrinoZero.",
};

export default function AliquoteIvaPage() {
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
            Come gestire aliquote IVA, reparti e metodi di pagamento
          </h1>
          <Badge variant="secondary">Configurazione attività</Badge>
        </div>
        <p className="text-muted-foreground mt-3 text-sm leading-relaxed">
          ScontrinoZero supporta tutte le aliquote IVA italiane e permette di
          configurare reparti merceologici e metodi di pagamento. Questa guida
          spiega come impostarli correttamente in base alla tua attività.
        </p>
        <p className="text-muted-foreground mt-1 text-sm">
          <strong>Ultimo aggiornamento:</strong> aprile 2026
        </p>

        {/* ─── Aliquote IVA in Italia ─── */}
        <h2 className="mt-10 text-xl font-semibold">
          Le aliquote IVA in Italia
        </h2>
        <p className="text-muted-foreground mt-3 text-sm leading-relaxed">
          Il sistema IVA italiano prevede quattro aliquote principali:
        </p>
        <div className="mt-3 overflow-x-auto">
          <table className="text-muted-foreground w-full text-sm">
            <thead>
              <tr className="border-border border-b text-left">
                <th className="pb-2 font-semibold text-foreground">
                  Aliquota
                </th>
                <th className="pb-2 font-semibold text-foreground">
                  Esempi di applicazione
                </th>
              </tr>
            </thead>
            <tbody className="divide-border divide-y">
              <tr>
                <td className="py-2 font-medium text-foreground">4%</td>
                <td className="py-2">
                  Alimenti di prima necessità, libri, giornali, farmaci
                </td>
              </tr>
              <tr>
                <td className="py-2 font-medium text-foreground">10%</td>
                <td className="py-2">
                  Alimenti, bevande, somministrazione al tavolo, spettacoli
                </td>
              </tr>
              <tr>
                <td className="py-2 font-medium text-foreground">22%</td>
                <td className="py-2">
                  Prodotti generici, abbigliamento, elettronica, servizi
                </td>
              </tr>
              <tr>
                <td className="py-2 font-medium text-foreground">Esente</td>
                <td className="py-2">
                  Operazioni esenti ex art. 10 DPR 633/72 (servizi finanziari,
                  sanitari, formativi, ecc.)
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <p className="text-muted-foreground mt-3 text-sm leading-relaxed">
          Se sei in <strong>regime forfettario</strong>, tutte le vendite sono
          fuori campo IVA. Consulta la guida dedicata per la configurazione
          corretta.
        </p>

        {/* ─── Configurare le aliquote ─── */}
        <h2 className="mt-10 text-xl font-semibold">
          Come configurare le aliquote in ScontrinoZero
        </h2>
        <p className="text-muted-foreground mt-3 text-sm leading-relaxed">
          Le aliquote IVA sono pre-caricate nel sistema. Non devi attivarle
          separatamente: compaiono come opzione ogni volta che aggiungi una
          riga allo scontrino o crei un prodotto nel catalogo.
        </p>
        <p className="text-muted-foreground mt-3 text-sm leading-relaxed">
          Al momento dell&apos;emissione, per ogni riga dello scontrino
          seleziona l&apos;aliquota corretta dal menu a tendina. ScontrinoZero
          calcola automaticamente:
        </p>
        <ul className="text-muted-foreground mt-2 list-disc space-y-1 pl-5 text-sm leading-relaxed">
          <li>
            L&apos;importo IVA per ciascuna aliquota (prezzi IVA inclusa).
          </li>
          <li>Il totale del documento con riepilogo per aliquota.</li>
          <li>
            La struttura corretta per la trasmissione al portale AdE (codici
            natura IVA conformi al tracciato DCO).
          </li>
        </ul>

        {/* ─── Reparti merceologici ─── */}
        <h2 className="mt-10 text-xl font-semibold">Reparti merceologici</h2>
        <p className="text-muted-foreground mt-3 text-sm leading-relaxed">
          Puoi organizzare i prodotti in <strong>reparti</strong> (es.
          &quot;Alimentari&quot;, &quot;Bevande&quot;, &quot;Abbigliamento&quot;)
          ai quali associare un&apos;aliquota IVA predefinita. In questo modo,
          quando aggiungi una riga allo scontrino e selezioni il reparto,
          l&apos;aliquota viene impostata automaticamente.
        </p>
        <h3 className="mt-5 text-base font-semibold">
          Come creare un reparto
        </h3>
        <ol className="text-muted-foreground mt-2 list-decimal space-y-2 pl-5 text-sm leading-relaxed">
          <li>
            Vai in{" "}
            <strong>Dashboard &gt; Impostazioni &gt; Reparti</strong>.
          </li>
          <li>
            Clicca su <strong>Aggiungi reparto</strong>.
          </li>
          <li>Inserisci nome e aliquota IVA predefinita.</li>
          <li>
            Salva. Il reparto sarà disponibile durante l&apos;emissione e
            nella creazione di prodotti nel catalogo.
          </li>
        </ol>

        {/* ─── Metodi di pagamento ─── */}
        <h2 className="mt-10 text-xl font-semibold">Metodi di pagamento</h2>
        <p className="text-muted-foreground mt-3 text-sm leading-relaxed">
          ScontrinoZero supporta tutti i metodi di pagamento previsti dal
          tracciato DCO dell&apos;AdE:
        </p>
        <ul className="text-muted-foreground mt-2 list-disc space-y-1 pl-5 text-sm leading-relaxed">
          <li>
            <strong>Contante</strong>
          </li>
          <li>
            <strong>Carta</strong> (credito, debito, prepagata)
          </li>
          <li>
            <strong>Assegno</strong>
          </li>
          <li>
            <strong>Ticket / Buono pasto</strong>
          </li>
          <li>
            <strong>Altro</strong> (per metodi non standard: valore, omaggio,
            ecc.)
          </li>
        </ul>
        <p className="text-muted-foreground mt-3 text-sm leading-relaxed">
          Al momento dell&apos;emissione, seleziona il metodo usato dal
          cliente. I dati vengono trasmessi all&apos;AdE come parte del
          documento commerciale.
        </p>

        {/* ─── Pagamento misto ─── */}
        <h2 className="mt-10 text-xl font-semibold">
          Pagamento misto (contante + carta)
        </h2>
        <p className="text-muted-foreground mt-3 text-sm leading-relaxed">
          Se il cliente paga una parte in contante e una parte con carta, puoi
          registrare entrambi i metodi sullo stesso scontrino:
        </p>
        <ol className="text-muted-foreground mt-2 list-decimal space-y-2 pl-5 text-sm leading-relaxed">
          <li>
            Aggiungi le righe dello scontrino normalmente.
          </li>
          <li>
            Nella schermata di pagamento, seleziona{" "}
            <strong>Pagamento misto</strong>.
          </li>
          <li>
            Inserisci l&apos;importo pagato in contante: ScontrinoZero
            calcola automaticamente la quota residua da addebitare su carta.
          </li>
          <li>
            Conferma ed emetti. Il documento trasmesso all&apos;AdE riporta
            la ripartizione corretta tra i due metodi.
          </li>
        </ol>

        {/* ─── Errori frequenti ─── */}
        <h2 className="mt-10 text-xl font-semibold">Errori frequenti</h2>
        <div className="mt-3 space-y-4">
          <div>
            <p className="text-sm font-medium">
              Ho selezionato l&apos;aliquota sbagliata su uno scontrino già
              emesso
            </p>
            <p className="text-muted-foreground mt-1 text-sm leading-relaxed">
              Non è possibile modificare uno scontrino già trasmesso. Devi
              annullarlo ed emettere un nuovo scontrino con l&apos;aliquota
              corretta. Consulta la guida{" "}
              <Link
                href="/help/annullare-scontrino"
                className="text-primary hover:underline"
              >
                Annullare uno scontrino
              </Link>{" "}
              per i dettagli.
            </p>
          </div>
          <div>
            <p className="text-sm font-medium">
              Sono in regime forfettario ma vedo le opzioni IVA
            </p>
            <p className="text-muted-foreground mt-1 text-sm leading-relaxed">
              Verifica la configurazione del regime fiscale in{" "}
              <strong>Impostazioni &gt; Attività</strong>. Se hai selezionato
              &quot;Regime forfettario&quot;, le righe dello scontrino vengono
              automaticamente impostate come fuori campo IVA (codice natura
              N2.2) e le opzioni IVA vengono nascoste.
            </p>
          </div>
          <div>
            <p className="text-sm font-medium">
              Non trovo l&apos;aliquota del 5% o altre aliquote ridotte
            </p>
            <p className="text-muted-foreground mt-1 text-sm leading-relaxed">
              Le aliquote del 5% e altre aliquote temporanee o speciali sono
              gestite tramite il campo <strong>Altro</strong> con indicazione
              manuale. Contattaci se hai necessità specifiche non coperte dalle
              aliquote standard.
            </p>
          </div>
        </div>

        {/* ─── Articoli correlati ─── */}
        <h2 className="mt-10 text-xl font-semibold">Articoli correlati</h2>
        <ul className="mt-3 space-y-1 text-sm">
          <li>
            <Link
              href="/help/regime-forfettario"
              className="text-primary hover:underline"
            >
              Regime forfettario: configurazione IVA corretta
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
              href="/help/annullare-scontrino"
              className="text-primary hover:underline"
            >
              Annullare uno scontrino: quando si può e come fare
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
