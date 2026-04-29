import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { JsonLd, helpArticleBreadcrumb } from "@/components/json-ld";

export const metadata: Metadata = {
  title:
    "Come gestire aliquote IVA, catalogo e metodi di pagamento | ScontrinoZero Help",
  description:
    "Guida alla configurazione delle aliquote IVA (4%, 5%, 10%, 22% e nature speciali), del catalogo prodotti e dei metodi di pagamento in ScontrinoZero.",
};

export default function AliquoteIvaPage() {
  return (
    <section className="px-4 py-16">
      <JsonLd
        data={helpArticleBreadcrumb(
          "aliquote-iva",
          "Aliquote IVA, catalogo e pagamenti",
        )}
      />
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
            Come gestire aliquote IVA, catalogo e metodi di pagamento
          </h1>
          <Badge variant="secondary">Configurazione attività</Badge>
        </div>
        <p className="text-muted-foreground mt-3 text-sm leading-relaxed">
          ScontrinoZero supporta tutte le aliquote IVA italiane (4%, 5%, 10%,
          22%) e i sei codici natura per le operazioni speciali. Questa guida
          spiega come usarli in cassa, come pre-impostare prezzo e aliquota
          tramite il catalogo prodotti, e quali metodi di pagamento sono
          disponibili oggi.
        </p>
        <p className="text-muted-foreground mt-1 text-sm">
          <strong>Ultimo aggiornamento:</strong> aprile 2026
        </p>

        {/* ─── Aliquote IVA in Italia ─── */}
        <h2 className="mt-10 text-xl font-semibold">
          Le aliquote IVA in Italia
        </h2>
        <p className="text-muted-foreground mt-3 text-sm leading-relaxed">
          Il sistema IVA italiano prevede quattro aliquote (DPR 633/72, Tabella
          A parti II, II-bis e III) più una serie di operazioni esenti, non
          soggette o non imponibili:
        </p>
        <div className="mt-3 overflow-x-auto">
          <table className="text-muted-foreground w-full text-sm">
            <thead>
              <tr className="border-border border-b text-left">
                <th className="text-foreground pb-2 font-semibold">Aliquota</th>
                <th className="text-foreground pb-2 font-semibold">
                  Esempi di applicazione
                </th>
              </tr>
            </thead>
            <tbody className="divide-border divide-y">
              <tr>
                <td className="text-foreground py-2 font-medium">4%</td>
                <td className="py-2">
                  Alimenti di prima necessità, libri, giornali, farmaci (DPR
                  633/72, Tab. A parte II)
                </td>
              </tr>
              <tr>
                <td className="text-foreground py-2 font-medium">5%</td>
                <td className="py-2">
                  Prodotti igienico-sanitari femminili, alcuni alimenti
                  specifici (basilico, rosmarino, salvia, tartufi), prestazioni
                  di cooperative sociali (DPR 633/72, Tab. A parte II-bis)
                </td>
              </tr>
              <tr>
                <td className="text-foreground py-2 font-medium">10%</td>
                <td className="py-2">
                  Alimenti, bevande, somministrazione al tavolo, spettacoli (DPR
                  633/72, Tab. A parte III)
                </td>
              </tr>
              <tr>
                <td className="text-foreground py-2 font-medium">22%</td>
                <td className="py-2">
                  Aliquota ordinaria: prodotti generici, abbigliamento,
                  elettronica, servizi non agevolati
                </td>
              </tr>
              <tr>
                <td className="text-foreground py-2 font-medium">Esente</td>
                <td className="py-2">
                  Operazioni esenti ex art. 10 DPR 633/72 (servizi finanziari,
                  sanitari, formativi, ecc.) — codice natura N4
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <p className="text-muted-foreground mt-3 text-sm leading-relaxed">
          Se sei in <strong>regime forfettario</strong>, tutte le vendite sono
          fuori campo IVA (codice natura N2). Consulta la{" "}
          <Link
            href="/help/regime-forfettario"
            className="text-primary hover:underline"
          >
            guida dedicata
          </Link>
          {" per la configurazione corretta."}
        </p>

        {/* ─── Configurare le aliquote ─── */}
        <h2 className="mt-10 text-xl font-semibold">
          Come configurare le aliquote in ScontrinoZero
        </h2>
        <p className="text-muted-foreground mt-3 text-sm leading-relaxed">
          Le aliquote IVA e i codici natura sono pre-caricati nel sistema. Non
          devi attivarli separatamente: compaiono come opzione del selettore
          aliquota ogni volta che aggiungi una riga allo scontrino o crei un
          prodotto nel catalogo.
        </p>
        <p className="text-muted-foreground mt-3 text-sm leading-relaxed">
          Al momento dell&apos;emissione, per ogni riga dello scontrino
          seleziona l&apos;aliquota corretta dal menu a tendina. I prezzi
          inseriti sono sempre <strong>IVA inclusa</strong>: ScontrinoZero
          scorpora automaticamente l&apos;imposta e calcola:
        </p>
        <ul className="text-muted-foreground mt-2 list-disc space-y-1 pl-5 text-sm leading-relaxed">
          <li>L&apos;imponibile e l&apos;importo IVA per ciascuna aliquota.</li>
          <li>Il totale del documento con riepilogo per aliquota.</li>
          <li>
            La struttura corretta per la trasmissione al portale AdE (codici
            natura conformi al tracciato del documento commerciale).
          </li>
        </ul>
        <h3 className="mt-5 text-base font-semibold">
          Codici natura per operazioni speciali
        </h3>
        <p className="text-muted-foreground mt-2 text-sm leading-relaxed">
          Oltre alle quattro aliquote, il selettore include sei codici natura
          IVA che il tracciato AdE prevede per le operazioni a 0%:
        </p>
        <ul className="text-muted-foreground mt-2 list-disc space-y-1 pl-5 text-sm leading-relaxed">
          <li>
            <strong>N1</strong> — Escluse art. 15 (rimborsi, anticipazioni in
            nome e per conto)
          </li>
          <li>
            <strong>N2</strong> — Non soggette (regime forfettario, operazioni
            fuori campo IVA)
          </li>
          <li>
            <strong>N3</strong> — Non imponibili (esportazioni, cessioni
            intracomunitarie)
          </li>
          <li>
            <strong>N4</strong> — Esenti ex art. 10 DPR 633/72
          </li>
          <li>
            <strong>N5</strong> — Regime del margine (beni usati, oggetti
            d&apos;arte)
          </li>
          <li>
            <strong>N6</strong> — Inversione contabile (reverse charge)
          </li>
        </ul>

        {/* ─── Catalogo prodotti ─── */}
        <h2 className="mt-10 text-xl font-semibold">Catalogo prodotti</h2>
        <p className="text-muted-foreground mt-3 text-sm leading-relaxed">
          Per evitare di reinserire ogni volta prezzo e aliquota dei prodotti
          che vendi più spesso, ScontrinoZero include un{" "}
          <strong>catalogo</strong> in cui salvare i tuoi articoli con prezzo e
          aliquota IVA predefiniti. Quando emetti uno scontrino basta toccare il
          prodotto nel catalogo: la riga viene aggiunta con prezzo e aliquota
          già impostati.
        </p>
        <h3 className="mt-5 text-base font-semibold">
          Come aggiungere un prodotto al catalogo
        </h3>
        <ol className="text-muted-foreground mt-2 list-decimal space-y-2 pl-5 text-sm leading-relaxed">
          <li>
            Apri <strong>Catalogo</strong> dalla barra di navigazione in basso
            (è la home della dashboard).
          </li>
          <li>
            Tocca <strong>Modifica</strong>, poi <strong>Aggiungi</strong>.
          </li>
          <li>
            Inserisci descrizione, prezzo (IVA inclusa) e aliquota IVA
            predefinita. Il prezzo è opzionale: se lo lasci vuoto, in cassa
            digiti l&apos;importo al volo.
          </li>
          <li>
            Salva. Da quel momento il prodotto compare in cassa e basta toccarlo
            per aggiungerlo allo scontrino.
          </li>
        </ol>
        <p className="text-muted-foreground mt-3 text-sm leading-relaxed">
          Sul piano <strong>Starter</strong> puoi salvare fino a 5 prodotti; sul
          piano <strong>Pro</strong> il catalogo è illimitato.
        </p>

        {/* ─── Metodi di pagamento ─── */}
        <h2 className="mt-10 text-xl font-semibold">Metodi di pagamento</h2>
        <p className="text-muted-foreground mt-3 text-sm leading-relaxed">
          In cassa il selettore propone oggi due metodi:
        </p>
        <ul className="text-muted-foreground mt-2 list-disc space-y-1 pl-5 text-sm leading-relaxed">
          <li>
            <strong>Contanti</strong>
          </li>
          <li>
            <strong>Carta</strong> (credito, debito, prepagata)
          </li>
        </ul>
        <p className="text-muted-foreground mt-3 text-sm leading-relaxed">
          Al momento dell&apos;emissione, seleziona il metodo usato dal cliente:
          il dato viene trasmesso all&apos;AdE come parte del documento
          commerciale. Il campo opzionale{" "}
          <strong>codice lotteria scontrini</strong> compare solo quando scegli
          pagamento con carta (la lotteria istantanea richiede il pagamento
          elettronico).
        </p>
        <p className="text-muted-foreground mt-3 text-sm leading-relaxed">
          Sono <em>in arrivo</em> ulteriori metodi previsti dal tracciato AdE
          (ticket / buono pasto, importi non riscossi su fattura o servizio
          futuro) e il <strong>pagamento misto</strong> con ripartizione tra
          contanti e carta sullo stesso scontrino. Verranno aggiunti al
          selettore non appena disponibili.
        </p>

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
              Verifica che la P.IVA inserita in onboarding sia stata
              riconosciuta come forfettaria: in <em>Impostazioni → Attività</em>{" "}
              il campo IVA prevalente deve essere impostato di conseguenza.
              Quando il regime è forfettario, le righe dello scontrino vanno
              emesse con il codice natura <strong>N2</strong> (operazioni non
              soggette). Per il dettaglio del flusso e delle differenze fra N2
              sul documento commerciale e N2.2 sulla fattura elettronica vedi la
              guida{" "}
              <Link
                href="/help/regime-forfettario"
                className="text-primary hover:underline"
              >
                Regime forfettario
              </Link>
              {"."}
            </p>
          </div>
          <div>
            <p className="text-sm font-medium">
              Non trovo l&apos;aliquota del 5%
            </p>
            <p className="text-muted-foreground mt-1 text-sm leading-relaxed">
              L&apos;aliquota del <strong>5%</strong> è disponibile come opzione
              standard nel selettore aliquota: si applica ai prodotti igienico-
              sanitari femminili, ad alcuni alimenti specifici (basilico,
              rosmarino, salvia, tartufi) e alle prestazioni di cooperative
              sociali (DPR 633/72, Tab. A parte II-bis). Per operazioni a 0% che
              non rientrano in queste aliquote (esportazioni, esenti, regime
              margine, reverse charge) usa il codice natura corretto fra N1-N6.
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
