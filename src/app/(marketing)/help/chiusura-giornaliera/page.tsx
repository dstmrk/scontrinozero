import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Badge } from "@/components/ui/badge";

export const metadata: Metadata = {
  title:
    "Chiusura giornaliera: è obbligatoria? | ScontrinoZero Help",
  description:
    "Con ScontrinoZero non devi fare nessuna chiusura giornaliera. Scopri perché il Documento Commerciale Online funziona diversamente dal registratore telematico fisico.",
};

export default function ChiusuraGiornalieraPage() {
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
        <p className="text-muted-foreground mt-1 text-sm">
          <strong>Ultimo aggiornamento:</strong> aprile 2026
        </p>

        {/* ─── Cos'è la chiusura giornaliera ─── */}
        <h2 className="mt-10 text-xl font-semibold">
          Cos&apos;è la chiusura giornaliera (e perché non ti riguarda)
        </h2>
        <p className="text-muted-foreground mt-3 text-sm leading-relaxed">
          I registratori telematici fisici (RT) archiviano gli scontrini in
          memoria locale durante la giornata. A fine servizio l&apos;esercente
          deve eseguire una{" "}
          <strong>chiusura di cassa</strong> — un comando che stampa il
          totale del giorno e invia i dati all&apos;AdE in un unico blocco
          (il cosiddetto &quot;corrispettivo giornaliero&quot;).
        </p>
        <p className="text-muted-foreground mt-3 text-sm leading-relaxed">
          ScontrinoZero usa la procedura{" "}
          <strong>Documento Commerciale Online</strong>, che funziona in modo
          completamente diverso: ogni scontrino viene trasmesso{" "}
          <strong>individualmente e in tempo reale</strong> al portale Fatture
          e Corrispettivi. Non c&apos;è nulla da raggruppare a fine giornata
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
          Se vuoi un riepilogo dei corrispettivi del giorno, puoi consultare
          lo <strong>Storico</strong> e filtrare per data odierna: vedrai
          l&apos;elenco di tutti gli scontrini emessi con importi e metodi di
          pagamento.
        </p>

        {/* ─── Confronto RT fisico ─── */}
        <h2 className="mt-10 text-xl font-semibold">
          Riepilogo: RT fisico vs. Documento Commerciale Online
        </h2>
        <div className="mt-3 overflow-x-auto">
          <table className="text-muted-foreground w-full text-sm">
            <thead>
              <tr className="border-border border-b text-left">
                <th className="pb-2 font-semibold text-foreground">
                  Aspetto
                </th>
                <th className="pb-2 font-semibold text-foreground">
                  RT fisico
                </th>
                <th className="pb-2 font-semibold text-foreground">
                  ScontrinoZero (DCO)
                </th>
              </tr>
            </thead>
            <tbody className="divide-border divide-y">
              <tr>
                <td className="py-2 font-medium text-foreground">
                  Trasmissione
                </td>
                <td className="py-2">Batch a fine giornata</td>
                <td className="py-2">In tempo reale per ogni scontrino</td>
              </tr>
              <tr>
                <td className="py-2 font-medium text-foreground">
                  Chiusura giornaliera
                </td>
                <td className="py-2">Obbligatoria</td>
                <td className="py-2 font-semibold text-green-600">
                  Non necessaria
                </td>
              </tr>
              <tr>
                <td className="py-2 font-medium text-foreground">
                  Rischio di dimenticarsi
                </td>
                <td className="py-2">Sì (sanzione)</td>
                <td className="py-2">No</td>
              </tr>
              <tr>
                <td className="py-2 font-medium text-foreground">
                  Hardware richiesto
                </td>
                <td className="py-2">RT certificato (€200-800)</td>
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
          Con gli RT fisici, dimenticare la chiusura giornaliera può
          comportare sanzioni amministrative (omessa trasmissione dei
          corrispettivi). Con ScontrinoZero questo rischio{" "}
          <strong>non esiste</strong>: ogni scontrino emesso è già stato
          trasmesso, indipendentemente da qualsiasi azione manuale.
        </p>

        {/* ─── FAQ ─── */}
        <h2 className="mt-10 text-xl font-semibold">Domande frequenti</h2>
        <div className="mt-3 space-y-4">
          <div>
            <p className="text-sm font-medium">
              Se perdo la connessione durante la giornata, i dati vengono
              persi?
            </p>
            <p className="text-muted-foreground mt-1 text-sm leading-relaxed">
              No. ScontrinoZero non permette di emettere uno scontrino senza
              connessione internet (la trasmissione all&apos;AdE avviene in
              tempo reale). Se la connessione cade, l&apos;app ti avvisa e
              attendi il ripristino prima di procedere.
            </p>
          </div>
          <div>
            <p className="text-sm font-medium">
              Ho un POS fisico collegato a un RT: devo comunque fare la
              chiusura sull&apos;RT?
            </p>
            <p className="text-muted-foreground mt-1 text-sm leading-relaxed">
              Sì, se usi un RT fisico <em>in parallelo</em> a ScontrinoZero,
              le obbligazioni dell&apos;RT rimangono invariate. ScontrinoZero
              non sostituisce un RT già in uso: lo affianca o lo sostituisce
              completamente a seconda del tuo setup.
            </p>
          </div>
          <div>
            <p className="text-sm font-medium">
              Devo tenere un registro cartaceo dei corrispettivi?
            </p>
            <p className="text-muted-foreground mt-1 text-sm leading-relaxed">
              No. I corrispettivi sono già registrati nel cassetto fiscale
              dell&apos;AdE e nello Storico di ScontrinoZero. Puoi esportare
              un CSV in qualsiasi momento per i tuoi archivi o per il
              commercialista.
            </p>
          </div>
        </div>

        {/* ─── Articoli correlati ─── */}
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
              href="/help/cassetto-fiscale"
              className="text-primary hover:underline"
            >
              Dove verificare i corrispettivi nel cassetto fiscale
            </Link>
          </li>
          <li>
            <Link
              href="/help/storico-ed-esportazione"
              className="text-primary hover:underline"
            >
              Storico scontrini: filtri, ricerca ed esportazione
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
