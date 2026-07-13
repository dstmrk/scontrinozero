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

export const metadata = helpArticleMetadata("numero-documento-azzeramento");

export default function NumeroDocumentoAzzeramentoPage() {
  return (
    <section className="px-4 py-16">
      <JsonLd
        data={helpArticleBreadcrumb(
          "numero-documento-azzeramento",
          "Numero documento e azzeramento sullo scontrino",
        )}
      />
      <HelpArticleJsonLd slug="numero-documento-azzeramento" />
      <article className="mx-auto max-w-3xl">
        <Breadcrumbs
          items={helpArticleBreadcrumbItems(
            "numero-documento-azzeramento",
            "Numero documento e azzeramento sullo scontrino",
          )}
        />

        {/* ─── Intestazione ─── */}
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-3xl font-extrabold tracking-tight">
            Numero documento e azzeramento sullo scontrino: cosa significano
          </h1>
          <Badge variant="secondary">Scontrini</Badge>
        </div>
        <p className="text-muted-foreground mt-3 text-sm leading-relaxed">
          Sullo scontrino di un registratore telematico il numero documento ha
          un formato come <strong>0051-0023</strong>: la prima parte è il{" "}
          <strong>numero di azzeramento</strong> (conta le chiusure giornaliere
          fatte dalla cassa), la seconda è il <strong>progressivo</strong> del
          documento, che riparte da 1 a ogni chiusura. Sul documento commerciale
          online il numero è invece un codice unico assegnato dall&apos;Agenzia
          delle Entrate, e l&apos;azzeramento non esiste.
        </p>
        <p className="text-muted-foreground mt-1 text-sm">
          <strong>Ultimo aggiornamento:</strong> luglio 2026
        </p>
        <figure className="mt-6">
          <AppScreenshot
            src="/screenshots/documento-commerciale.png"
            alt="Documento commerciale con l'identificativo AdE e i dati dello scontrino"
            width={661}
            height={1188}
            sizes="(min-width: 768px) 320px, 80vw"
            className="mx-auto max-w-[320px] rounded-xl"
          />
          <figcaption className="text-muted-foreground mt-2 text-center text-xs">
            Sul documento compaiono l&apos;identificativo AdE e i dati dello
            scontrino.
          </figcaption>
        </figure>

        {/* ─── Dove si trova ─── */}
        <h2 className="mt-10 text-xl font-semibold">
          Dove si trova il numero sullo scontrino
        </h2>
        <p className="text-muted-foreground mt-3 text-sm leading-relaxed">
          Il numero è stampato nella parte bassa dello scontrino, di solito
          preceduto dalla dicitura <strong>&quot;DOCUMENTO N.&quot;</strong>,
          vicino a data e ora di emissione. Su uno scontrino emesso da
          registratore telematico vedrai due blocchi di cifre separati da un
          trattino (es. <em>0051-0023</em>) e, poco sotto, la matricola
          dell&apos;apparecchio (es. <em>99MEY012345</em>). Su un documento
          commerciale online — quello emesso dal portale Fatture e Corrispettivi
          o da un&apos;app come ScontrinoZero — trovi invece un codice unico del
          tipo <em>DCW2026/123456</em>, assegnato dall&apos;Agenzia delle
          Entrate al momento della trasmissione.
        </p>

        {/* ─── Cosa significa il numero di azzeramento ─── */}
        <h2 className="mt-10 text-xl font-semibold">
          Cosa significa il numero di azzeramento
        </h2>
        <p className="text-muted-foreground mt-3 text-sm leading-relaxed">
          Il numero di azzeramento è il contatore delle{" "}
          <strong>chiusure giornaliere</strong> effettuate dal registratore
          telematico dalla sua messa in servizio. Si chiama così perché la
          chiusura di fine giornata <em>azzera</em> il progressivo dei
          documenti: il primo scontrino del giorno dopo riparte da 0001. Nel
          nostro esempio, <em>0051-0023</em> significa &quot;23° documento
          emesso nella 51ª giornata di lavoro della cassa&quot;. La coppia
          azzeramento + progressivo, insieme alla matricola
          dell&apos;apparecchio, identifica quindi in modo univoco ogni singolo
          scontrino emesso da quel registratore.
        </p>

        {/* ─── A cosa serve ─── */}
        <h2 className="mt-10 text-xl font-semibold">
          A cosa serve il numero documento
        </h2>
        <ul className="text-muted-foreground mt-3 list-disc space-y-2 pl-5 text-sm leading-relaxed">
          <li>
            <strong>Resi e annulli.</strong> Per annullare uno scontrino o
            emettere un documento di reso bisogna identificare il documento
            originale: numero, data e — su un RT — matricola
            dell&apos;apparecchio. Vedi{" "}
            <Link
              href="/help/annullare-scontrino"
              className="text-primary hover:underline"
            >
              Annullare uno scontrino: quando si può e come fare
            </Link>
            .
          </li>
          <li>
            <strong>Garanzia e cambio merce.</strong> Il numero permette al
            negoziante di risalire alla vendita esatta anche a distanza di mesi.
          </li>
          <li>
            <strong>Controlli e contabilità.</strong> Il numero è il riferimento
            con cui il documento compare nel cassetto fiscale e nei registri dei
            corrispettivi: se un cliente o il commercialista ti chiede
            &quot;quale scontrino?&quot;, la risposta è quel numero.
          </li>
          <li>
            <strong>Lotteria degli scontrini.</strong> In caso di vincita, il
            biglietto virtuale fa riferimento allo specifico documento
            commerciale trasmesso.
          </li>
        </ul>

        {/* ─── Come funziona col DCO ─── */}
        <h2 className="mt-10 text-xl font-semibold">
          Come funziona con il documento commerciale online
        </h2>
        <p className="text-muted-foreground mt-3 text-sm leading-relaxed">
          Chi emette scontrini con il documento commerciale online non ha un
          registratore telematico, quindi{" "}
          <strong>
            non ha né chiusura giornaliera né numero di azzeramento
          </strong>
          : ogni documento viene trasmesso all&apos;AdE nel momento stesso
          dell&apos;emissione e non c&apos;è alcun contatore da azzerare a fine
          giornata (per il dettaglio vedi{" "}
          <Link
            href="/help/chiusura-giornaliera"
            className="text-primary hover:underline"
          >
            Chiusura giornaliera: è obbligatoria?
          </Link>
          ). Il numero documento è il progressivo assegnato direttamente
          dall&apos;Agenzia delle Entrate alla trasmissione (formato tipo{" "}
          <em>DCW2026/123456</em>) e in ScontrinoZero lo trovi sul PDF dello
          scontrino, nella pagina pubblica raggiungibile dal QR code e nello{" "}
          <Link
            href="/help/storico-ed-esportazione"
            className="text-primary hover:underline"
          >
            Storico
          </Link>
          . Per un reso o un annullo non devi trascrivere nulla: apri lo
          scontrino dallo Storico e procedi da lì.
        </p>

        {/* ─── FAQ ─── */}
        <h2 className="mt-10 text-xl font-semibold">Domande frequenti</h2>
        <div className="mt-3 space-y-4">
          <div>
            <p className="text-sm font-medium">
              Il numero dello scontrino ricomincia da 1 ogni giorno?
            </p>
            <p className="text-muted-foreground mt-1 text-sm leading-relaxed">
              Su un registratore telematico sì: la chiusura giornaliera azzera
              il progressivo, ed è per questo che serve anche il numero di
              azzeramento per identificare il documento. Sul documento
              commerciale online no: il numero assegnato dall&apos;AdE è unico e
              non si ripete.
            </p>
          </div>
          <div>
            <p className="text-sm font-medium">
              Dove trovo il numero di azzeramento sul documento commerciale
              online?
            </p>
            <p className="text-muted-foreground mt-1 text-sm leading-relaxed">
              Non c&apos;è, ed è normale: l&apos;azzeramento è un concetto del
              registratore telematico. Se un modulo o un gestionale te lo chiede
              per uno scontrino emesso come documento commerciale online, indica
              il numero documento completo assegnato dall&apos;AdE.
            </p>
          </div>
          <div>
            <p className="text-sm font-medium">
              Mi serve il numero dello scontrino per fare un reso a un cliente?
            </p>
            <p className="text-muted-foreground mt-1 text-sm leading-relaxed">
              È il modo più rapido per identificare la vendita originale. In
              ScontrinoZero però non devi cercarlo a mano: trovi lo scontrino
              nello Storico (per data, importo o numero) e da lì avvii
              l&apos;annullo del documento.
            </p>
          </div>
          <div>
            <p className="text-sm font-medium">
              Numero documento e matricola del registratore sono la stessa cosa?
            </p>
            <p className="text-muted-foreground mt-1 text-sm leading-relaxed">
              No. La matricola (es. <em>99MEY012345</em>) identifica
              l&apos;apparecchio e resta uguale su tutti gli scontrini di quella
              cassa; il numero documento identifica la singola operazione e
              cambia a ogni scontrino.
            </p>
          </div>
        </div>

        <RelatedHelpArticles slug="numero-documento-azzeramento" />

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
