import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { JsonLd, helpArticleBreadcrumb } from "@/components/json-ld";

export const metadata: Metadata = {
  title: "Errori comuni di accesso AdE e come risolverli | ScontrinoZero Help",
  description:
    "Guida alla risoluzione degli errori più frequenti nel collegamento con l'Agenzia delle Entrate: password scaduta, credenziali errate, password bloccata e portale non disponibile.",
};

export default function ErroriAdePage() {
  return (
    <section className="px-4 py-16">
      <JsonLd
        data={helpArticleBreadcrumb("errori-ade", "Errori di accesso AdE")}
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
            Errori comuni di accesso AdE e come risolverli
          </h1>
          <Badge variant="secondary">Fiscalizzazione</Badge>
        </div>
        <p className="text-muted-foreground mt-3 text-sm leading-relaxed">
          Quando ScontrinoZero non riesce a comunicare con il portale Fatture e
          Corrispettivi dell&apos;Agenzia delle Entrate, l&apos;emissione dello
          scontrino fallisce subito e il documento viene marcato come{" "}
          <strong>Errore</strong>, oppure il pulsante{" "}
          <strong>Verifica connessione</strong> in{" "}
          <strong>Impostazioni → Credenziali AdE</strong> mostra un messaggio.
          Questa guida copre i casi più frequenti con la soluzione per ciascuno.
        </p>
        <p className="text-muted-foreground mt-1 text-sm">
          <strong>Ultimo aggiornamento:</strong> aprile 2026
        </p>

        {/* ─── Errore 1 ─── */}
        <h2 className="mt-10 text-xl font-semibold">
          Password Fisconline scaduta
        </h2>
        <p className="text-muted-foreground mt-3 text-sm leading-relaxed">
          <strong>Sintomo:</strong> il pulsante{" "}
          <strong>Verifica connessione</strong> apre automaticamente una
          finestra di dialogo che ti chiede di impostare una nuova password
          Fisconline.
        </p>
        <p className="text-muted-foreground mt-3 text-sm leading-relaxed">
          <strong>Causa:</strong> la password Fisconline scade ogni 90 giorni
          per motivi di sicurezza. È il caso più frequente di blocco delle
          credenziali e ScontrinoZero lo rileva automaticamente.
        </p>
        <p className="text-muted-foreground mt-3 text-sm font-medium">
          Soluzione:
        </p>
        <ol className="text-muted-foreground mt-2 list-decimal space-y-2 pl-5 text-sm leading-relaxed">
          <li>
            Nella finestra di dialogo inserisci la vecchia password e scegline
            una nuova (8-15 caratteri tra lettere non accentate, numeri e
            caratteri speciali).
          </li>
          <li>
            ScontrinoZero comunica direttamente con il portale AdE per
            aggiornare la password e salva la nuova nelle credenziali del tuo
            account.
          </li>
          <li>
            Al termine il badge dello stato torna su <strong>Verificate</strong>
            {" e puoi emettere scontrini normalmente."}
          </li>
        </ol>

        {/* ─── Errore 2 ─── */}
        <h2 className="mt-10 text-xl font-semibold">
          Credenziali errate (codice fiscale, PIN o password)
        </h2>
        <p className="text-muted-foreground mt-3 text-sm leading-relaxed">
          <strong>Sintomo:</strong> il pulsante{" "}
          <strong>Verifica connessione</strong> mostra il messaggio{" "}
          <em>
            &quot;Verifica fallita. Controlla le credenziali Fisconline.&quot;
          </em>
        </p>
        <p className="text-muted-foreground mt-3 text-sm font-medium">
          Cosa verificare:
        </p>
        <ul className="text-muted-foreground mt-2 list-disc space-y-2 pl-5 text-sm leading-relaxed">
          <li>
            Il <strong>codice fiscale</strong> inserito deve corrispondere
            esattamente all&apos;account Fisconline. Per le ditte individuali è
            il CF del titolare; per le società è il CF della persona che
            gestisce l&apos;account Fisconline (non il CF della società).
          </li>
          <li>
            Il <strong>PIN</strong> Fisconline è composto da{" "}
            <strong>10 caratteri totali</strong>: i primi 4 vengono forniti
            online al momento della richiesta, gli ultimi 6 arrivano per posta
            entro 15 giorni insieme alla password di primo accesso. Devi
            inserire il PIN completo di 10 caratteri.
          </li>
          <li>
            La <strong>password</strong> ha lunghezza tra 8 e 15 caratteri ed è
            case-sensitive. Se l&apos;hai appena cambiata, ricordati di
            aggiornarla anche su ScontrinoZero.
          </li>
          <li>
            {"Per aggiornare le credenziali vai in "}
            <strong>Impostazioni → Credenziali AdE</strong> e usa il pulsante{" "}
            <strong>Modifica</strong>.
          </li>
        </ul>
        <p className="text-muted-foreground mt-3 text-sm leading-relaxed">
          Attenzione: dopo 8 tentativi consecutivi con password errata, la
          password viene bloccata sul portale AdE. Vedi la sezione successiva.
        </p>

        {/* ─── Errore 3 ─── */}
        <h2 className="mt-10 text-xl font-semibold">
          Password Fisconline bloccata per troppi tentativi
        </h2>
        <p className="text-muted-foreground mt-3 text-sm leading-relaxed">
          <strong>Sintomo:</strong> il portale AdE mostra un messaggio del tipo
          &quot;la password è stata bloccata poiché è stato superato il numero
          di tentativi di accesso&quot;.
        </p>
        <p className="text-muted-foreground mt-3 text-sm leading-relaxed">
          <strong>Causa:</strong> 8 tentativi consecutivi con password errata
          attivano il blocco automatico della password sui Servizi Telematici
          dell&apos;AdE.
        </p>
        <p className="text-muted-foreground mt-3 text-sm font-medium">
          Soluzione:
        </p>
        <ul className="text-muted-foreground mt-2 list-disc space-y-2 pl-5 text-sm leading-relaxed">
          <li>
            {"Esegui il "}
            <strong>ripristino password</strong>
            {" sul portale AdE: "}
            <a
              href="https://telematici.agenziaentrate.gov.it/Abilitazione/RipristinaPassword/IRipristinaPassword.jsp"
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary hover:underline"
            >
              telematici.agenziaentrate.gov.it → Ripristina Password
            </a>
            {"."}
          </li>
          <li>
            In alternativa, accedi all&apos;area riservata AdE con SPID, CIE o
            CNS e usa la funzione &quot;Prelievo credenziali&quot; in Profilo
            utente per recuperare o reimpostare le credenziali Fisconline.
          </li>
          <li>
            {"Una volta impostata la nuova password, aggiornala in "}
            <strong>Impostazioni → Credenziali AdE → Modifica</strong>
            {" su ScontrinoZero."}
          </li>
        </ul>

        {/* ─── Errore 4 ─── */}
        <h2 className="mt-10 text-xl font-semibold">
          Attività non abilitata sul portale Fatture e Corrispettivi
        </h2>
        <p className="text-muted-foreground mt-3 text-sm leading-relaxed">
          <strong>Sintomo:</strong> le credenziali Fisconline funzionano sul
          portale AdE, ma ScontrinoZero non riesce ad emettere scontrini con un
          errore di tipo &quot;soggetto non abilitato&quot; o &quot;servizio non
          disponibile per questo soggetto&quot;.
        </p>
        <p className="text-muted-foreground mt-3 text-sm leading-relaxed">
          <strong>Causa:</strong> per emettere documenti commerciali elettronici
          sul portale Fatture e Corrispettivi, l&apos;attività deve essere
          abilitata. L&apos;abilitazione avviene automaticamente per la maggior
          parte delle attività, ma può non essere ancora attiva per le P.IVA
          aperte di recente.
        </p>
        <p className="text-muted-foreground mt-3 text-sm font-medium">
          Soluzione:
        </p>
        <ol className="text-muted-foreground mt-2 list-decimal space-y-2 pl-5 text-sm leading-relaxed">
          <li>
            {"Accedi al portale "}
            <strong>
              ivaservizi.agenziaentrate.gov.it → Fatture e Corrispettivi →
              Documento Commerciale Online
            </strong>
            {"."}
          </li>
          <li>
            Se riesci ad accedere alla sezione e vedi il modulo di emissione, la
            tua attività è abilitata: il problema è probabilmente nelle
            credenziali (vedi le sezioni precedenti).
          </li>
          <li>
            Se il portale mostra &quot;servizio non disponibile per questo
            soggetto&quot;, contatta l&apos;assistenza AdE da rete fissa al
            numero <strong>800.90.96.96</strong> (lun-ven 9-17) oppure da mobile
            al <strong>06.96668907</strong>, o rivolgiti a uno sportello
            territoriale per richiedere l&apos;abilitazione.
          </li>
        </ol>

        {/* ─── Errore 5 ─── */}
        <h2 className="mt-10 text-xl font-semibold">
          Portale AdE temporaneamente non disponibile o lento
        </h2>
        <p className="text-muted-foreground mt-3 text-sm leading-relaxed">
          <strong>Sintomo:</strong> l&apos;emissione di uno scontrino fallisce
          con un errore di rete o timeout, oppure il pulsante{" "}
          <strong>Verifica connessione</strong> impiega molto tempo e poi
          fallisce.
        </p>
        <p className="text-muted-foreground mt-3 text-sm leading-relaxed">
          <strong>Causa:</strong> il portale dell&apos;Agenzia delle Entrate ha
          picchi di carico o periodi di manutenzione programmata (di solito di
          notte o nel fine settimana).
        </p>
        <p className="text-muted-foreground mt-3 text-sm font-medium">
          Come comportarsi:
        </p>
        <ul className="text-muted-foreground mt-2 list-disc space-y-2 pl-5 text-sm leading-relaxed">
          <li>
            <strong>Importante:</strong> ScontrinoZero non accoda né ritrasmette
            automaticamente gli scontrini. Quando il portale AdE non risponde,
            l&apos;emissione fallisce subito e lo scontrino non viene generato.
            Devi ritentare manualmente l&apos;emissione una volta che il portale
            torna disponibile.
          </li>
          <li>
            {"Verifica gli avvisi di manutenzione su "}
            <a
              href="https://telematici.agenziaentrate.gov.it/Main/ArchivioNotizie.do?ambiente=ALL"
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary hover:underline"
            >
              telematici.agenziaentrate.gov.it → Avvisi
            </a>
            {"."}
          </li>
          <li>
            {
              "Se il problema persiste e nessun avviso di manutenzione è attivo, contatta il supporto ScontrinoZero a "
            }
            <a
              href="mailto:info@scontrinozero.it"
              className="text-primary hover:underline"
            >
              info@scontrinozero.it
            </a>
            {"."}
          </li>
        </ul>

        {/* ─── Errore 6 ─── */}
        <h2 className="mt-10 text-xl font-semibold">
          Credenziali del commercialista o intermediario fiscale
        </h2>
        <p className="text-muted-foreground mt-3 text-sm leading-relaxed">
          <strong>Sintomo:</strong> stai usando le credenziali del tuo
          commercialista o intermediario e ricevi un errore di accesso negato.
        </p>
        <p className="text-muted-foreground mt-3 text-sm leading-relaxed">
          <strong>Causa:</strong> ScontrinoZero accede al portale Fatture e
          Corrispettivi tramite il flusso Fisconline diretto. Servono quindi le{" "}
          <strong>
            credenziali Fisconline associate al codice fiscale del titolare o
            legale rappresentante dell&apos;attività
          </strong>
          {", non quelle di un intermediario delegato. "}
          Se hai sempre operato sul portale AdE tramite SPID, CIE o CNS, non hai
          ancora un PIN Fisconline e devi richiederlo.
        </p>
        <p className="text-muted-foreground mt-3 text-sm leading-relaxed">
          <Link
            href="/help/credenziali-fisconline"
            className="text-primary hover:underline"
          >
            Come ottenere le credenziali Fisconline →
          </Link>
        </p>

        {/* ─── Quando contattare il supporto ─── */}
        <h2 className="mt-10 text-xl font-semibold">
          Quando contattare il supporto
        </h2>
        <p className="text-muted-foreground mt-3 text-sm leading-relaxed">
          {"Contatta il supporto ScontrinoZero ("}
          <a
            href="mailto:info@scontrinozero.it"
            className="text-primary hover:underline"
          >
            info@scontrinozero.it
          </a>
          {") se:"}
        </p>
        <ul className="text-muted-foreground mt-2 list-disc space-y-1 pl-5 text-sm leading-relaxed">
          <li>
            Le credenziali funzionano sul portale AdE ma il pulsante{" "}
            <strong>Verifica connessione</strong> di ScontrinoZero continua a
            fallire.
          </li>
          <li>
            Uno scontrino è andato in stato <strong>Errore</strong> dopo
            l&apos;emissione e non capisci perché.
          </li>
          <li>Ricevi messaggi di errore diversi da quelli descritti sopra.</li>
        </ul>
        <p className="text-muted-foreground mt-3 text-sm leading-relaxed">
          Includi nella mail uno screenshot del messaggio di errore e, se
          disponibile, l&apos;identificativo dello scontrino problematico: puoi
          copiarlo dall&apos;URL della pagina di dettaglio dello scontrino (la
          parte dopo <code>/r/</code>).
        </p>

        {/* ─── Articoli correlati ─── */}
        <h2 className="mt-10 text-xl font-semibold">Articoli correlati</h2>
        <ul className="mt-3 space-y-1 text-sm">
          <li>
            <Link
              href="/help/credenziali-fisconline"
              className="text-primary hover:underline"
            >
              Credenziali Fisconline: dove trovarle e come verificarle
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
          <li>
            <Link
              href="/help/sicurezza-credenziali"
              className="text-primary hover:underline"
            >
              Sicurezza e privacy: come proteggiamo le tue credenziali
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
