import { Badge } from "@/components/ui/badge";
import { RT_COSTS, formatRtCostRange } from "@/lib/marketing/rt-costs";
import {
  JsonLd,
  helpArticleBreadcrumb,
  helpArticleBreadcrumbItems,
} from "@/components/json-ld";
import { Breadcrumbs } from "@/components/marketing/breadcrumbs";
import { helpArticleMetadata } from "@/lib/help/metadata";
import { HelpArticleJsonLd } from "@/components/help/article-json-ld";
import { HelpArticleUpdatedAt } from "@/components/help/article-updated-at";
import { RelatedHelpArticles } from "@/components/help/related-articles";

export const metadata = helpArticleMetadata("chiusura-giornaliera");

export default function ChiusuraGiornalieraPage() {
  return (
    <section className="px-4 py-16">
      <JsonLd
        data={helpArticleBreadcrumb(
          "chiusura-giornaliera",
          "Chiusura giornaliera",
        )}
      />
      <HelpArticleJsonLd slug="chiusura-giornaliera" />
      <article className="mx-auto max-w-3xl">
        <Breadcrumbs
          items={helpArticleBreadcrumbItems(
            "chiusura-giornaliera",
            "Chiusura giornaliera",
          )}
        />

        {/* ─── Intestazione ─── */}
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-3xl font-extrabold tracking-tight">
            Chiusura giornaliera: è obbligatoria?
          </h1>
          <Badge variant="secondary">Gestione scontrini</Badge>
        </div>
        <p className="text-muted-foreground mt-3 text-sm leading-relaxed">
          No. Con ScontrinoZero{" "}
          <strong>non devi fare nessuna chiusura giornaliera</strong>. I
          corrispettivi vengono trasmessi all&apos;Agenzia delle Entrate in
          tempo reale, scontrino per scontrino. Nessun gesto manuale a fine
          giornata, nessun rischio di dimenticarsi.
        </p>
        <HelpArticleUpdatedAt slug="chiusura-giornaliera" />

        {/* ─── Cos'è la chiusura giornaliera ─── */}
        <h2 className="mt-10 text-xl font-semibold">
          Cos&apos;è la chiusura giornaliera (e perché non ti riguarda)
        </h2>
        <p className="text-muted-foreground mt-3 text-sm leading-relaxed">
          I registratori telematici fisici (RT) archiviano gli scontrini in
          memoria locale durante la giornata. A fine servizio l&apos;esercente
          deve eseguire una <strong>chiusura di cassa</strong> — un comando che
          stampa il totale del giorno e invia i dati all&apos;AdE in un unico
          blocco (il cosiddetto &quot;corrispettivo giornaliero&quot;).
        </p>
        <p className="text-muted-foreground mt-3 text-sm leading-relaxed">
          ScontrinoZero usa la procedura{" "}
          <strong>Documento Commerciale Online</strong>, che funziona in modo
          completamente diverso: ogni scontrino viene trasmesso{" "}
          <strong>individualmente e in tempo reale</strong> al portale Fatture e
          Corrispettivi. Non c&apos;è nulla da raggruppare a fine giornata
          perché i dati sono già arrivati all&apos;AdE nel momento in cui hai
          premuto &quot;Emetti&quot;.
        </p>

        {/* ─── Cosa fare a fine giornata ─── */}
        <h2 className="mt-10 text-xl font-semibold">
          Cosa devo fare a fine giornata?
        </h2>
        <p className="text-muted-foreground mt-3 text-sm leading-relaxed">
          <strong>Niente di speciale.</strong> Non esiste un pulsante di
          chiusura né una procedura obbligatoria. Puoi semplicemente chiudere
          l&apos;app.
        </p>
        <p className="text-muted-foreground mt-3 text-sm leading-relaxed">
          Se vuoi un riepilogo dei corrispettivi del giorno, apri lo{" "}
          <strong>Storico</strong> e filtra per la data di oggi: vedrai
          l&apos;elenco degli scontrini emessi con numero, importo e stato. Il
          metodo di pagamento non compare nell&apos;elenco: lo trovi sulla
          ricevuta del singolo scontrino (<strong>Invia ricevuta</strong> o{" "}
          <strong>Stampa</strong> dal suo dettaglio).
        </p>

        {/* ─── Confronto RT fisico ─── */}
        <h2 className="mt-10 text-xl font-semibold">
          Riepilogo: RT fisico vs. Documento Commerciale Online
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
                <td className="text-foreground py-2 font-medium">
                  Trasmissione
                </td>
                <td className="py-2">Batch a fine giornata</td>
                <td className="py-2">In tempo reale per ogni scontrino</td>
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
                  Rischio di dimenticarsi
                </td>
                <td className="py-2">Sì (sanzione)</td>
                <td className="py-2">No</td>
              </tr>
              <tr>
                <td className="text-foreground py-2 font-medium">
                  Hardware richiesto
                </td>
                <td className="py-2">
                  RT certificato ({formatRtCostRange(RT_COSTS.purchase)})
                </td>
                <td className="py-2">Smartphone o PC</td>
              </tr>
            </tbody>
          </table>
        </div>

        {/* ─── Sanzioni ─── */}
        <h2 className="mt-10 text-xl font-semibold">
          Rischio sanzioni per mancata chiusura
        </h2>
        <p className="text-muted-foreground mt-3 text-sm leading-relaxed">
          Con gli RT fisici, dimenticare la chiusura giornaliera può comportare
          sanzioni amministrative (omessa trasmissione dei corrispettivi). Con
          ScontrinoZero questo rischio <strong>non esiste</strong>: ogni
          scontrino emesso è già stato trasmesso, indipendentemente da qualsiasi
          azione manuale.
        </p>

        {/* ─── FAQ ─── */}
        <h2 className="mt-10 text-xl font-semibold">Domande frequenti</h2>
        <div className="mt-3 space-y-4">
          <div>
            <p className="text-sm font-medium">
              Se perdo la connessione durante la giornata, i dati vengono persi?
            </p>
            <p className="text-muted-foreground mt-1 text-sm leading-relaxed">
              No, perché senza connessione non vengono creati scontrini. La
              trasmissione all&apos;AdE è sincrona: se al momento
              dell&apos;emissione la rete non è disponibile l&apos;operazione
              fallisce con un errore e nessun documento viene memorizzato. Se
              provi a usare l&apos;app mentre sei offline, l&apos;applicazione
              mostra la pagina <strong>Sei offline</strong>. Attendi il
              ripristino della connessione e premi di nuovo{" "}
              <strong>Emetti scontrino</strong>.
            </p>
          </div>
          <div>
            <p className="text-sm font-medium">
              Ho un POS fisico collegato a un RT: devo comunque fare la chiusura
              sull&apos;RT?
            </p>
            <p className="text-muted-foreground mt-1 text-sm leading-relaxed">
              Sì, se usi un RT fisico <em>in parallelo</em> a ScontrinoZero, gli
              obblighi dell&apos;RT restano invariati, chiusura giornaliera
              compresa. ScontrinoZero può affiancare l&apos;RT oppure
              sostituirlo del tutto, a seconda di come organizzi la cassa.
            </p>
          </div>
          <div>
            <p className="text-sm font-medium">
              Devo tenere un registro cartaceo dei corrispettivi?
            </p>
            <p className="text-muted-foreground mt-1 text-sm leading-relaxed">
              No. I corrispettivi sono già registrati sul portale Fatture e
              Corrispettivi dell&apos;AdE e nello Storico di ScontrinoZero. Per
              dare i dati al commercialista puoi filtrare lo Storico per il mese
              di riferimento oppure scaricare l&apos;archivio completo dei tuoi
              dati (profilo, scontrini, catalogo) dalle{" "}
              <strong>
                Impostazioni → Altre impostazioni → Portabilità dati
              </strong>{" "}
              — la funzione prevista dall&apos;art. 20 GDPR produce un file JSON
              strutturato.
            </p>
          </div>
        </div>

        <RelatedHelpArticles slug="chiusura-giornaliera" />

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
