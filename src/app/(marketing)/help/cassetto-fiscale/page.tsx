import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Badge } from "@/components/ui/badge";

export const metadata: Metadata = {
  title:
    "Dove verificare i corrispettivi nel cassetto fiscale | ScontrinoZero Help",
  description:
    "Scopri come accedere al cassetto fiscale dell'Agenzia delle Entrate per verificare che i tuoi scontrini siano stati trasmessi correttamente.",
};

export default function CassettoFiscalePage() {
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
            Dove verificare i corrispettivi nel cassetto fiscale
          </h1>
          <Badge variant="secondary">Fiscalizzazione</Badge>
        </div>
        <p className="text-muted-foreground mt-3 text-sm leading-relaxed">
          Dopo aver emesso uno scontrino con ScontrinoZero, i dati arrivano
          all&apos;Agenzia delle Entrate e sono consultabili nel{" "}
          <strong>cassetto fiscale</strong> del portale Fatture e Corrispettivi.
          Questa guida spiega dove cercarli e cosa fare se qualcosa non torna.
        </p>
        <p className="text-muted-foreground mt-1 text-sm">
          <strong>Ultimo aggiornamento:</strong> aprile 2026
        </p>

        {/* ─── Cos'è il cassetto fiscale ─── */}
        <h2 className="mt-10 text-xl font-semibold">
          Cos&apos;è il cassetto fiscale
        </h2>
        <p className="text-muted-foreground mt-3 text-sm leading-relaxed">
          Il cassetto fiscale è l&apos;area riservata del portale dell&apos;AdE
          dove confluiscono tutte le informazioni tributarie a te intestate:
          dichiarazioni, fatture, corrispettivi, rimborsi e molto altro. Nella
          sezione <strong>Corrispettivi</strong> trovi i documenti commerciali
          emessi tramite la procedura online — inclusi quelli inviati da
          ScontrinoZero.
        </p>

        {/* ─── Come accedere ─── */}
        <h2 className="mt-10 text-xl font-semibold">
          Come accedere al portale Fatture e Corrispettivi
        </h2>
        <ol className="text-muted-foreground mt-3 list-decimal space-y-2 pl-5 text-sm leading-relaxed">
          <li>
            Vai su <strong>ivaservizi.agenziaentrate.gov.it</strong> (portale
            Fatture e Corrispettivi).
          </li>
          <li>
            Accedi con le tue credenziali <strong>Fisconline</strong>, SPID o
            CIE — le stesse usate per collegare ScontrinoZero all&apos;AdE.
          </li>
          <li>
            Dal menu principale seleziona <strong>Corrispettivi</strong>, poi{" "}
            <strong>Documento commerciale on line</strong>.
          </li>
          <li>
            Clicca su <strong>Ricerca documento commerciale</strong>.
          </li>
        </ol>

        {/* ─── Trovare i corrispettivi ─── */}
        <h2 className="mt-10 text-xl font-semibold">
          Come trovare i tuoi scontrini
        </h2>
        <p className="text-muted-foreground mt-3 text-sm leading-relaxed">
          Nella schermata di consultazione puoi filtrare per:
        </p>
        <ul className="text-muted-foreground mt-2 list-disc space-y-1 pl-5 text-sm leading-relaxed">
          <li>
            <strong>Data di emissione</strong> — seleziona un intervallo per
            trovare i documenti di un giorno o periodo specifico.
          </li>
          <li>
            <strong>Numero documento</strong> — ogni scontrino ScontrinoZero ha
            un numero progressivo visibile nel dettaglio dello scontrino.
          </li>
          <li>
            <strong>Tipo documento</strong> — Vendita o Annullamento.
          </li>
        </ul>
        <p className="text-muted-foreground mt-3 text-sm leading-relaxed">
          Ogni documento mostra: data, numero progressivo, importo totale e
          aliquote IVA applicate.
        </p>

        {/* ─── Tempistiche ─── */}
        <h2 className="mt-10 text-xl font-semibold">
          Tempistiche di visibilità
        </h2>
        <p className="text-muted-foreground mt-3 text-sm leading-relaxed">
          I documenti trasmessi da ScontrinoZero compaiono nel cassetto fiscale
          in genere entro <strong>pochi minuti</strong>. In alcuni casi,
          soprattutto nelle ore di punta del portale AdE, possono volerci fino a{" "}
          <strong>24 ore</strong>. Se uno scontrino risulta{" "}
          <strong>Emesso</strong> in ScontrinoZero ma non compare ancora nel
          cassetto, attendi qualche ora prima di preoccuparti.
        </p>

        {/* ─── Cosa fare se non compare ─── */}
        <h2 className="mt-10 text-xl font-semibold">
          Cosa fare se uno scontrino non compare
        </h2>
        <div className="mt-3 space-y-4">
          <div>
            <p className="text-sm font-medium">
              1. Verifica lo stato in ScontrinoZero
            </p>
            <p className="text-muted-foreground mt-1 text-sm leading-relaxed">
              Vai in <strong>Storico</strong> e controlla lo stato dello
              scontrino. Se è <strong>Emesso</strong>, il documento è stato
              accettato dall&apos;AdE — attendi la visibilità nel cassetto. Se
              uno scontrino atteso non compare in Storico, la trasmissione
              potrebbe essere fallita: vedi{" "}
              <Link
                href="/help/errori-ade"
                className="text-primary hover:underline"
              >
                {"Errori comuni AdE"}
              </Link>
              {"."}
            </p>
          </div>
          <div>
            <p className="text-sm font-medium">
              2. Controlla il periodo di ricerca
            </p>
            <p className="text-muted-foreground mt-1 text-sm leading-relaxed">
              Assicurati che l&apos;intervallo di date nel portale AdE includa
              il giorno di emissione. Un filtro troppo stretto può escludere il
              documento che cerchi.
            </p>
          </div>
          <div>
            <p className="text-sm font-medium">
              3. Verifica la P.IVA collegata
            </p>
            <p className="text-muted-foreground mt-1 text-sm leading-relaxed">
              Accertati di aver effettuato l&apos;accesso al portale AdE con le
              credenziali della P.IVA configurata in ScontrinoZero. Se hai più
              codici fiscali/P.IVA, i documenti potrebbero trovarsi sotto
              un&apos;altra posizione.
            </p>
          </div>
          <div>
            <p className="text-sm font-medium">4. Contatta l&apos;assistenza</p>
            <p className="text-muted-foreground mt-1 text-sm leading-relaxed">
              Se lo scontrino è Emesso da più di 24 ore ma non compare nel
              cassetto, scrivici a{" "}
              <a
                href="mailto:info@scontrinozero.it"
                className="text-primary hover:underline"
              >
                info@scontrinozero.it
              </a>{" "}
              indicando il numero e la data del documento.
            </p>
          </div>
        </div>

        {/* ─── Corrispettivi periodici ─── */}
        <h2 className="mt-10 text-xl font-semibold">
          Riepilogo corrispettivi per periodo
        </h2>
        <p className="text-muted-foreground mt-3 text-sm leading-relaxed">
          Il portale AdE permette di consultare un prospetto riepilogativo dei
          corrispettivi per periodo (mensile, trimestrale, annuale) — utile per
          la liquidazione IVA e per i controlli del commercialista. Puoi
          accedervi dalla sezione <strong>Corrispettivi</strong> del portale
          Fatture e Corrispettivi.
        </p>
        <p className="text-muted-foreground mt-3 text-sm leading-relaxed">
          In alternativa, l&apos;esportazione dello Storico in CSV è una
          funzione <strong>in arrivo sul piano Pro</strong>: appena disponibile
          potrai scaricare tutti i dati degli scontrini direttamente
          dall&apos;app.
        </p>

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
              href="/help/errori-ade"
              className="text-primary hover:underline"
            >
              Errori comuni di accesso AdE e come risolverli
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
