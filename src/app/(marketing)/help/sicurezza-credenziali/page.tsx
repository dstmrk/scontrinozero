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
import { AppScreenshot } from "@/components/marketing/app-screenshot";

export const metadata = helpArticleMetadata("sicurezza-credenziali");

export default function SicurezzaCredenzialiPage() {
  return (
    <section className="px-4 py-16">
      <JsonLd
        data={helpArticleBreadcrumb(
          "sicurezza-credenziali",
          "Sicurezza e privacy delle credenziali",
        )}
      />
      <HelpArticleJsonLd slug="sicurezza-credenziali" />
      <article className="mx-auto max-w-3xl">
        <Breadcrumbs
          items={helpArticleBreadcrumbItems(
            "sicurezza-credenziali",
            "Sicurezza e privacy delle credenziali",
          )}
        />

        {/* ─── Intestazione ─── */}
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-3xl font-extrabold tracking-tight">
            Sicurezza e privacy: come proteggiamo le tue credenziali
          </h1>
          <Badge variant="secondary">Fiscalizzazione</Badge>
        </div>
        <p className="text-muted-foreground mt-3 text-sm leading-relaxed">
          Sappiamo che chiederti le credenziali AdE — Fisconline o CIE — è una
          richiesta importante. Questa pagina spiega nel dettaglio come vengono
          archiviate, chi può accedervi e come puoi revocare il consenso in
          qualsiasi momento.
        </p>
        <HelpArticleUpdatedAt slug="sicurezza-credenziali" />
        <figure className="mt-6">
          <AppScreenshot
            src="/screenshots/impostazioni-attivita.png"
            alt="Schermata Impostazioni con la sezione delle credenziali AdE"
            width={900}
            height={1860}
            sizes="(min-width: 768px) 240px, 65vw"
            className="mx-auto max-w-[240px]"
          />
          <figcaption className="text-muted-foreground mt-2 text-center text-xs">
            Le credenziali AdE si gestiscono dalle Impostazioni.
          </figcaption>
        </figure>

        {/* ─── Perché servono ─── */}
        <h2 className="mt-10 text-xl font-semibold">
          Perché ScontrinoZero ha bisogno delle tue credenziali AdE
        </h2>
        <p className="text-muted-foreground mt-3 text-sm leading-relaxed">
          L&apos;Agenzia delle Entrate non offre un&apos;API pubblica per la
          trasmissione dei corrispettivi. Il portale Fatture e Corrispettivi è
          un&apos;interfaccia web accessibile esclusivamente con le credenziali
          del titolare dell&apos;attività.
        </p>
        <p className="text-muted-foreground mt-3 text-sm leading-relaxed">
          Per trasmettere i tuoi scontrini in modo automatico, ScontrinoZero
          replica le chiamate HTTP che il browser effettua quando usi il portale
          AdE manualmente. Questo richiede di conservare le credenziali in modo
          sicuro per poterle usare al momento dell&apos;invio.
        </p>
        <p className="text-muted-foreground mt-3 text-sm leading-relaxed">
          Le credenziali restano cifrate e vengono usate solo per le operazioni
          richieste da te: emettere, annullare o rendere uno scontrino,
          verificare il collegamento e consultare i tuoi documenti sul portale,
          dall&apos;app oppure dal gestionale a cui hai dato una tua chiave API.
          Non vengono condivise con terzi e nessun processo automatico le usa
          per altro.
        </p>

        {/* ─── Come sono cifrate ─── */}
        <h2 className="mt-10 text-xl font-semibold">
          Cifratura AES-256-GCM: cosa significa in pratica
        </h2>
        <p className="text-muted-foreground mt-3 text-sm leading-relaxed">
          Le tue credenziali AdE — Fisconline (codice fiscale, password e PIN)
          oppure l&apos;email e la password dell&apos;app CIE ID se ti colleghi
          con la CIE — vengono cifrate con <strong>AES-256-GCM</strong> prima di
          essere salvate nel database. Questo è lo stesso standard usato dalle
          banche e dai servizi di pagamento più sicuri al mondo.
        </p>
        <ul className="text-muted-foreground mt-3 list-disc space-y-2 pl-5 text-sm leading-relaxed">
          <li>
            <strong>AES-256</strong>: chiave di cifratura a 256 bit (32 byte).
            Con la potenza di calcolo attuale, un attacco a forza bruta
            richiederebbe miliardi di anni.
          </li>
          <li>
            <strong>GCM (Galois/Counter Mode)</strong>: modalità autenticata che
            garantisce sia la riservatezza dei dati sia la loro integrità.
            Qualsiasi modifica non autorizzata al dato cifrato viene rilevata e
            rifiutata.
          </li>
          <li>
            <strong>IV casuale per ogni cifratura</strong>: ogni volta che le
            credenziali vengono cifrate, viene generato un vettore di
            inizializzazione (IV) unico. Lo stesso PIN cifrato due volte produce
            due testi cifrati completamente diversi.
          </li>
        </ul>

        {/* ─── Cifratura at-rest ─── */}
        <h2 className="mt-10 text-xl font-semibold">
          Cifratura at-rest: il team non può leggere le tue credenziali
        </h2>
        <p className="text-muted-foreground mt-3 text-sm leading-relaxed">
          Le credenziali non sono mai visibili in chiaro nel database, nemmeno
          agli amministratori di ScontrinoZero. Ecco perché:
        </p>
        <ul className="text-muted-foreground mt-3 list-disc space-y-2 pl-5 text-sm leading-relaxed">
          <li>
            Nel database è salvato solo il <strong>testo cifrato</strong>: una
            stringa binaria incomprensibile senza la chiave di decifratura.
          </li>
          <li>
            La <strong>chiave di decifratura</strong> è un&apos;env var del
            server, non salvata nel database. Anche accedendo al database, senza
            la chiave i dati sono inutilizzabili.
          </li>
          <li>
            {"Le credenziali vengono decifrate "}
            <strong>solo in memoria RAM</strong> al momento esatto in cui serve
            fare la chiamata al portale AdE, e immediatamente scartate.
          </li>
          <li>
            {"I log applicativi sono configurati per "}
            <strong>non registrare</strong> mai il valore delle credenziali.
            Anche in caso di bug o eccezione, il PIN non finisce nei log.
          </li>
        </ul>

        {/* ─── Dove sono salvate ─── */}
        <h2 className="mt-10 text-xl font-semibold">
          Dove sono fisicamente archiviate
        </h2>
        <p className="text-muted-foreground mt-3 text-sm leading-relaxed">
          {"I dati cifrati sono salvati nel database PostgreSQL su "}
          <strong>Supabase Cloud</strong> (datacenter in Europa, certificazioni
          ISO 27001, SOC 2 Type II). Il server applicativo gira su una VPS in un
          datacenter europeo.
        </p>
        <p className="text-muted-foreground mt-3 text-sm leading-relaxed">
          ScontrinoZero è un progetto open source (licenza O&apos;Saasy). Puoi
          verificare personalmente il codice che gestisce le credenziali nel
          repository GitHub.
        </p>

        {/* ─── Chi può accedervi ─── */}
        <h2 className="mt-10 text-xl font-semibold">
          Chi può accedere alle tue credenziali
        </h2>
        <ul className="text-muted-foreground mt-3 list-disc space-y-2 pl-5 text-sm leading-relaxed">
          <li>
            <strong>Tu</strong> — puoi aggiornare le credenziali in qualsiasi
            momento da <strong>Impostazioni → Credenziali AdE</strong>.
          </li>
          <li>
            <strong>Il server applicativo</strong> — usa le credenziali
            decifrate solo al momento delle operazioni con l&apos;Agenzia
            richieste da te, dall&apos;app o tramite una tua chiave API.
          </li>
          <li>
            <strong>Nessun altro</strong> — il team ScontrinoZero, i database
            administrator, e qualsiasi altro sistema non hanno accesso al testo
            in chiaro delle credenziali.
          </li>
        </ul>

        {/* ─── Cosa succede se cambi password o PIN ─── */}
        <h2 className="mt-10 text-xl font-semibold">
          Cosa succede se cambi password o PIN Fisconline
        </h2>
        <p className="text-muted-foreground mt-3 text-sm leading-relaxed">
          Se cambi la password sul portale dell&apos;Agenzia delle Entrate (lo
          chiede ogni 90 giorni) o ottieni un nuovo PIN, le credenziali salvate
          su ScontrinoZero diventano non valide: il sistema ti mostrerà un
          errore di connessione AdE la prossima volta che emetti uno scontrino.
        </p>
        <p className="text-muted-foreground mt-3 text-sm leading-relaxed">
          Per aggiornare le credenziali:
        </p>
        <ol className="text-muted-foreground mt-2 list-decimal space-y-1 pl-5 text-sm leading-relaxed">
          <li>
            Vai su <strong>Impostazioni → Credenziali AdE</strong>.
          </li>
          <li>
            Tocca l&apos;icona a forma di matita accanto al titolo della card
            (Modifica credenziali AdE).
          </li>
          <li>
            Reinserisci codice fiscale, password e PIN, con la password o il PIN
            nuovi (il modulo si apre vuoto e li chiede tutti e tre), salva e poi
            verifica di nuovo la connessione.
          </li>
        </ol>
        <p className="text-muted-foreground mt-3 text-sm leading-relaxed">
          Gli scontrini emessi prima dell&apos;aggiornamento e rifiutati
          dall&apos;AdE per credenziali scadute vanno{" "}
          <strong>riemessi manualmente</strong> dopo aver salvato le nuove
          credenziali: al momento non è prevista una ritrasmissione automatica.
        </p>

        {/* ─── Come revocare ─── */}
        <h2 className="mt-10 text-xl font-semibold">
          Come revocare l&apos;accesso e cancellare le credenziali
        </h2>
        <p className="text-muted-foreground mt-3 text-sm leading-relaxed">
          Per modificare le credenziali AdE salvate vai su{" "}
          <strong>Impostazioni → Credenziali AdE</strong> e tocca l&apos;icona a
          forma di matita (Modifica credenziali AdE): i nuovi valori
          sostituiscono quelli precedenti, che vengono cifrati di nuovo e
          sovrascritti nel database.
        </p>
        <p className="text-muted-foreground mt-3 text-sm leading-relaxed">
          Per <strong>revocare completamente</strong> l&apos;accesso e
          cancellare i dati cifrati, puoi eliminare l&apos;account ScontrinoZero
          da{" "}
          <strong>
            Impostazioni → Altre impostazioni → Zona pericolosa → Elimina
            account
          </strong>
          : la cancellazione è <strong>immediata</strong> e include credenziali
          AdE, anagrafica, scontrini e catalogo (cascade delete sul profilo). Il
          diritto alla cancellazione è garantito dal GDPR art. 17.
        </p>
        <p className="text-muted-foreground mt-3 text-sm leading-relaxed">
          Oggi non esiste un pulsante dedicato per rimuovere solo le credenziali
          AdE lasciando attivo l&apos;account: le due strade disponibili sono
          sovrascriverle toccando l&apos;icona a forma di matita (Modifica
          credenziali AdE) oppure eliminare l&apos;account.
        </p>

        {/* ─── FAQ ─── */}
        <h2 className="mt-10 text-xl font-semibold">Domande frequenti</h2>
        <div className="mt-3 space-y-4">
          <div>
            <p className="text-sm font-medium">
              ScontrinoZero può usare le mie credenziali per accedere ad altre
              sezioni del portale AdE?
            </p>
            <p className="text-muted-foreground mt-1 text-sm leading-relaxed">
              No. Il codice accede solo alle funzioni del Documento Commerciale
              Online (emissione, annullo, reso e ricerca dei tuoi documenti
              commerciali), ai dati anagrafici della tua partita IVA e, se la
              password Fisconline è scaduta, al cambio password che avvii tu
              dall&apos;app. Non vengono effettuate operazioni su fatture,
              dichiarazioni o altri servizi AdE.
            </p>
          </div>
          <div>
            <p className="text-sm font-medium">
              Cosa succede se ScontrinoZero subisce un data breach?
            </p>
            <p className="text-muted-foreground mt-1 text-sm leading-relaxed">
              In caso di accesso non autorizzato al database, un attaccante
              otterrebbe solo il testo cifrato, inutilizzabile senza la chiave
              di decifratura (che non è nel database). Come misura aggiuntiva,
              ti consigliamo di cambiare la password Fisconline se ricevi
              notifiche di sicurezza da parte nostra.
            </p>
          </div>
          <div>
            <p className="text-sm font-medium">
              Posso usare ScontrinoZero in modalità self-hosted per tenere le
              credenziali sul mio server?
            </p>
            <p className="text-muted-foreground mt-1 text-sm leading-relaxed">
              Sì. ScontrinoZero è open source e self-hostable: installa
              l&apos;applicazione sul tuo server e le credenziali non usciranno
              mai dalla tua infrastruttura.
            </p>
          </div>
        </div>

        <RelatedHelpArticles slug="sicurezza-credenziali" />

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
