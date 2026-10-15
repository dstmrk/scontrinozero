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
import { HelpArticleUpdatedAt } from "@/components/help/article-updated-at";
import { RelatedHelpArticles } from "@/components/help/related-articles";

export const metadata = helpArticleMetadata("registrare-pos-portale-ade");

export default function RegistrarePosPortaleAdePage() {
  return (
    <section className="px-4 py-16">
      <JsonLd
        data={helpArticleBreadcrumb(
          "registrare-pos-portale-ade",
          "Registrare un POS nel portale Fatture e Corrispettivi",
        )}
      />
      <HelpArticleJsonLd slug="registrare-pos-portale-ade" />
      <article className="mx-auto max-w-3xl">
        <Breadcrumbs
          items={helpArticleBreadcrumbItems(
            "registrare-pos-portale-ade",
            "Registrare un POS nel portale Fatture e Corrispettivi",
          )}
        />

        {/* ─── Intestazione ─── */}
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-3xl font-extrabold tracking-tight">
            Come registrare un POS nel portale Fatture e Corrispettivi
          </h1>
          <Badge variant="secondary">POS / Normativa</Badge>
        </div>
        <p className="text-muted-foreground mt-3 text-sm leading-relaxed">
          Dal 1° gennaio 2026 ogni POS con cui incassi corrispettivi certificati
          — terminale fisico, SoftPOS sul telefono o pagamento online — va
          collegato allo strumento con cui emetti il documento commerciale. Non
          si registra il POS da zero: il portale{" "}
          <em>Fatture e Corrispettivi</em> mostra già i POS a tuo nome,
          comunicati dagli operatori finanziari, e tu indichi quali usi. Se
          emetti con ScontrinoZero lo fai dentro la procedura{" "}
          <strong>Documento Commerciale Online</strong>, con la funzione{" "}
          <strong>Associazione strumenti di pagamento elettronico</strong>. È
          una comunicazione una tantum, da ripetere solo se cambi o aggiungi un
          POS.
        </p>
        <HelpArticleUpdatedAt slug="registrare-pos-portale-ade" />

        {/* ─── Due percorsi: RT o documento commerciale online ─── */}
        <div className="bg-muted/50 mt-6 rounded-md p-4 text-sm">
          <p className="font-medium">
            Registratore telematico o documento commerciale online: due percorsi
          </p>
          <p className="text-muted-foreground mt-1 leading-relaxed">
            Chi usa un <strong>registratore telematico</strong> registra il
            collegamento dalla funzione <em>Gestione collegamenti</em> del
            portale, abbinando la matricola dell&apos;RT ai POS e
            all&apos;indirizzo del punto vendita; quell&apos;operazione la può
            fare anche un intermediario delegato. Chi emette con la procedura
            web <strong>Documento Commerciale Online</strong> — come chi usa
            ScontrinoZero — lo fa dentro la procedura stessa, e solo di persona:
            l&apos;Agenzia non ne consente la delega. Questa guida segue il
            secondo percorso. Per il quadro normativo vedi{" "}
            <Link
              href="/guide/pos-rt-obbligo-2026"
              className="text-primary hover:underline"
            >
              POS-RT: obbligo 2026 e cosa fare
            </Link>
            .
          </p>
        </div>

        {/* ─── Prerequisiti ─── */}
        <h2 className="mt-10 text-xl font-semibold">
          Prima di iniziare: cosa ti serve
        </h2>
        <ul className="text-muted-foreground mt-3 list-disc space-y-2 pl-5 text-sm leading-relaxed">
          <li>
            <strong>Credenziali per accedere al portale AdE</strong>: vanno bene
            SPID (l&apos;identità digitale unica nazionale), CIE (Carta
            d&apos;Identità Elettronica), CNS (Carta Nazionale dei Servizi)
            oppure Fisconline (le credenziali dell&apos;Agenzia per chi ha
            partita IVA) — vedi{" "}
            <Link
              href="/help/credenziali-fisconline"
              className="text-primary hover:underline"
            >
              Credenziali Fisconline
            </Link>
            .
          </li>
          <li>
            <strong>Terminal ID</strong> di ogni POS fisico: lo trovi nel
            contratto di convenzionamento, nei rapporti mensili o nell&apos;area
            web dell&apos;operatore; per i lettori da smartphone di solito
            nell&apos;app. I POS online (pagamenti su internet) non ne hanno
            uno.
          </li>
          <li>
            Solo se un POS non compare già in elenco:{" "}
            <strong>codice fiscale e denominazione dell&apos;Acquirer</strong>,
            cioè l&apos;operatore con cui hai firmato il contratto di
            convenzionamento (non sempre è la tua banca), e il{" "}
            <strong>numero del contratto</strong>.
          </li>
        </ul>

        {/* ─── Passaggio 1 ─── */}
        <h2 className="mt-10 text-xl font-semibold">
          Passaggio 1 — Entra in Fatture e Corrispettivi
        </h2>
        <p className="text-muted-foreground mt-3 text-sm leading-relaxed">
          Accedi all&apos;area riservata del sito dell&apos;Agenzia delle
          Entrate (SPID, CIE, CNS o Fisconline), cerca il servizio{" "}
          <em>Fatturazione elettronica</em> e clicca{" "}
          <strong>Vai al servizio</strong>, poi <strong>Accedi</strong> nel
          riquadro <em>Fatture e corrispettivi</em>. Se operi per conto di una
          società o di un altro soggetto, scegli l&apos;utenza di lavoro della
          tua attività.
        </p>

        {/* ─── Passaggio 2 ─── */}
        <h2 className="mt-10 text-xl font-semibold">
          Passaggio 2 — Apri Documento Commerciale Online
        </h2>
        <p className="text-muted-foreground mt-3 text-sm leading-relaxed">
          Nella home del portale, nel riquadro <em>Corrispettivi</em>, clicca{" "}
          <strong>Documento Commerciale on line</strong>: è la procedura web
          dell&apos;Agenzia con cui si emettono i documenti commerciali, la
          stessa che ScontrinoZero usa per te.
        </p>

        {/* ─── Passaggio 3 ─── */}
        <h2 className="mt-10 text-xl font-semibold">
          Passaggio 3 — Apri l&apos;associazione dei POS
        </h2>
        <p className="text-muted-foreground mt-3 text-sm leading-relaxed">
          Nel riquadro <em>Funzionalità di supporto</em> clicca{" "}
          <strong>Associazione strumenti di pagamento elettronico</strong>. La
          pagina ha tre pulsanti: <strong>Cerca</strong> mostra i collegamenti
          già registrati, <strong>Inserisci collegamento</strong> ne crea uno
          nuovo, <strong>POS non collegati</strong> elenca i POS a tuo nome che
          non risultano ancora collegati.
        </p>

        {/* ─── Passaggio 4 ─── */}
        <h2 className="mt-10 text-xl font-semibold">
          Passaggio 4 — Collega i tuoi POS
        </h2>
        <p className="text-muted-foreground mt-3 text-sm leading-relaxed">
          Clicca <strong>Inserisci collegamento</strong>, seleziona dalla lista
          i POS che usi e premi <strong>Collega</strong>. La lista è costruita
          sui dati che gli operatori finanziari comunicano all&apos;Agenzia ogni
          mese, entro la fine del mese successivo: un POS attivato da poco può
          non comparire ancora.
        </p>
        <p className="text-muted-foreground mt-3 text-sm leading-relaxed">
          Se un POS che usi non c&apos;è, aggiungilo a mano con{" "}
          <strong>Aggiungi nuovo POS</strong>:
        </p>
        <ul className="text-muted-foreground mt-3 list-disc space-y-2 pl-5 text-sm leading-relaxed">
          <li>
            cerca l&apos;<strong>Acquirer</strong> per nome con{" "}
            <strong>Cerca</strong>; se non c&apos;è, inseriscilo con{" "}
            <strong>Aggiungi nuovo Acquirer</strong>, indicando se è italiano o
            estero e il suo codice fiscale;
          </li>
          <li>
            indica il <strong>tipo di POS</strong> (fisico oppure online), il{" "}
            <strong>terminal ID</strong> e il{" "}
            <strong>numero del contratto di convenzionamento</strong>, poi
            salva.
          </li>
        </ul>
        <p className="text-muted-foreground mt-3 text-sm leading-relaxed">
          Un POS fisico convenzionato con due operatori diversi — per esempio
          uno per il bancomat e uno per le carte di credito — va collegato due
          volte, una per contratto.
        </p>

        {/* ─── Passaggio 5 ─── */}
        <h2 className="mt-10 text-xl font-semibold">
          Passaggio 5 — Controlla e pulisci l&apos;elenco
        </h2>
        <p className="text-muted-foreground mt-3 text-sm leading-relaxed">
          Con <strong>Cerca</strong> rivedi i collegamenti registrati. Se in
          elenco compare un POS che non è tuo, che hai restituito o che usi solo
          per vendite esonerate dal documento commerciale (per esempio tabacchi
          o carburante), segnalalo da <strong>POS non collegati</strong>. La
          segnalazione è irreversibile: da quel momento quel POS non va usato,
          nemmeno di rado, per incassi certificati con documento commerciale.
        </p>

        {/* ─── Problemi frequenti ─── */}
        <h2 className="mt-10 text-xl font-semibold">
          Problemi frequenti: cosa controllare
        </h2>
        <div className="mt-3 space-y-4">
          <div>
            <p className="text-sm font-medium">Il POS non compare in elenco</p>
            <p className="text-muted-foreground mt-1 text-sm leading-relaxed">
              L&apos;elenco si basa sulle comunicazioni mensili degli operatori
              finanziari, quindi un POS attivato di recente arriva in ritardo:
              non aspettare, aggiungilo a mano con{" "}
              <strong>Aggiungi nuovo POS</strong>. Controlla anche
              l&apos;Acquirer: è il soggetto del contratto di convenzionamento,
              che non sempre coincide con la banca da cui hai il terminale, e
              dopo una fusione può aver cambiato codice fiscale e denominazione.
            </p>
          </div>
          <div>
            <p className="text-sm font-medium">Non trovo il terminal ID</p>
            <p className="text-muted-foreground mt-1 text-sm leading-relaxed">
              È nella documentazione del contratto, nei rapporti periodici o
              nell&apos;area web che l&apos;operatore finanziario mette a
              disposizione. Se non lo trovi, chiedilo all&apos;assistenza
              dell&apos;operatore.
            </p>
          </div>
          <div>
            <p className="text-sm font-medium">
              Il portale dà errore generico o pagina bianca
            </p>
            <p className="text-muted-foreground mt-1 text-sm leading-relaxed">
              Il portale AdE può essere in manutenzione o sovraccarico. Prova a
              riaccedere dopo 15-30 minuti, o in serata. Se il problema
              persiste, prova un browser diverso e aggiornato, oppure contatta
              l&apos;assistenza dell&apos;Agenzia al numero verde{" "}
              <strong>800 90 96 96</strong> (gratuito da telefono fisso,
              lunedì-venerdì 9-17).
            </p>
          </div>
        </div>

        {/* ─── Cosa succede dopo il collegamento ─── */}
        <h2 className="mt-10 text-xl font-semibold">
          Cosa succede dopo il collegamento
        </h2>
        <p className="text-muted-foreground mt-3 text-sm leading-relaxed">
          Gli operatori finanziari comunicano già all&apos;Agenzia, ogni mese, i
          dati delle transazioni elettroniche dei tuoi POS: non è il
          collegamento ad avviare quel flusso. Il collegamento dice
          all&apos;Agenzia quali POS incassano i corrispettivi che certifichi,
          così può confrontare i pagamenti elettronici con gli scontrini
          indicati come elettronici. Per questo il metodo di pagamento che
          scegli in ScontrinoZero conta: un incasso con carta registrato come
          contanti diventa uno scostamento. Il collegamento va aggiornato solo
          se cambia qualcosa — un POS nuovo, uno dismesso, uno spostato in un
          altro punto vendita.
        </p>

        {/* ─── FAQ ─── */}
        <h2 className="mt-10 text-xl font-semibold">Domande frequenti</h2>
        <div className="mt-3 space-y-4">
          <div>
            <p className="text-sm font-medium">
              Devo collegare anche i POS mobili tipo SumUp o myPOS?
            </p>
            <p className="text-muted-foreground mt-1 text-sm leading-relaxed">
              Sì. Va collegato ogni strumento con cui incassi elettronicamente
              corrispettivi certificati, compresi i SoftPOS installati sul
              telefono e i lettori da smartphone. I pagamenti online (POS
              virtuali) si collegano indicando solo l&apos;Acquirer, senza
              terminal ID.
            </p>
          </div>
          <div>
            <p className="text-sm font-medium">
              Ho più POS: li collego uno per uno?
            </p>
            <p className="text-muted-foreground mt-1 text-sm leading-relaxed">
              No: con <strong>Inserisci collegamento</strong> puoi selezionare
              più POS dall&apos;elenco nella stessa operazione. Ognuno resta un
              collegamento distinto, identificato dal suo terminal ID e
              dall&apos;operatore.
            </p>
          </div>
          <div>
            <p className="text-sm font-medium">
              Entro quando va fatto, e cosa rischio se non lo faccio?
            </p>
            <p className="text-muted-foreground mt-1 text-sm leading-relaxed">
              Per i POS in uso a gennaio 2026 il termine era il 20 aprile 2026.
              Per un POS attivato dopo, il collegamento si registra fra il 6 e
              l&apos;ultimo giorno lavorativo del secondo mese successivo
              all&apos;attivazione: un POS attivato a marzo si collega fra il 6
              e il 31 maggio. Il mancato collegamento è punito da 1.000 a 4.000
              €; i dettagli sono in{" "}
              <Link
                href="/help/normativa-pos-2026"
                className="text-primary hover:underline"
              >
                Nuova normativa POS 2026
              </Link>
              .
            </p>
          </div>
          <div>
            <p className="text-sm font-medium">
              Devo collegare il POS anche se uso ScontrinoZero?
            </p>
            <p className="text-muted-foreground mt-1 text-sm leading-relaxed">
              Sì. ScontrinoZero emette e trasmette il documento commerciale con
              il metodo di pagamento, ma il collegamento del POS è una
              comunicazione che l&apos;Agenzia chiede all&apos;esercente, e per
              la procedura web non è delegabile: né a noi né al commercialista.
              ScontrinoZero in sé non va registrato da nessuna parte: non è un
              POS.
            </p>
          </div>
          <div>
            <p className="text-sm font-medium">
              Quanto tempo richiede la procedura?
            </p>
            <p className="text-muted-foreground mt-1 text-sm leading-relaxed">
              Se il POS è già in elenco, pochi minuti: lo selezioni e premi{" "}
              <strong>Collega</strong>. Se va aggiunto a mano, il tempo di
              ritrovare terminal ID e numero di contratto.
            </p>
          </div>
        </div>

        <RelatedHelpArticles slug="registrare-pos-portale-ade" />

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
