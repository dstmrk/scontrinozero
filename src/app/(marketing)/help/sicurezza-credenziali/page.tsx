import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Badge } from "@/components/ui/badge";

export const metadata: Metadata = {
  title:
    "Sicurezza e privacy: come proteggiamo le tue credenziali | ScontrinoZero Help",
  description:
    "Come ScontrinoZero protegge le credenziali Fisconline: cifratura AES-256-GCM, architettura zero-knowledge, chi può accedere ai tuoi dati e come revocare l'accesso.",
};

export default function SicurezzaCredenzialiPage() {
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
            Sicurezza e privacy: come proteggiamo le tue credenziali
          </h1>
          <Badge variant="secondary">Fiscalizzazione</Badge>
        </div>
        <p className="text-muted-foreground mt-3 text-sm leading-relaxed">
          Sappiamo che chiederti le credenziali Fisconline è una richiesta
          importante. Questa pagina spiega nel dettaglio come vengono
          archiviate, chi può accedervi e come puoi revocare il consenso in
          qualsiasi momento.
        </p>
        <p className="text-muted-foreground mt-1 text-sm">
          <strong>Ultimo aggiornamento:</strong> aprile 2026
        </p>

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
          Questa pratica è esplicitamente contemplata dall&apos;Interpello AdE
          n. 956-1523/2020, che ammette i &quot;velocizzatori&quot; di processo
          nel rispetto della normativa.
        </p>

        {/* ─── Come sono cifrate ─── */}
        <h2 className="mt-10 text-xl font-semibold">
          Cifratura AES-256-GCM: cosa significa in pratica
        </h2>
        <p className="text-muted-foreground mt-3 text-sm leading-relaxed">
          Le tue credenziali (codice fiscale Fisconline e PIN) vengono cifrate
          con <strong>AES-256-GCM</strong> prima di essere salvate nel database.
          Questo è lo stesso standard usato dalle banche e dai servizi di
          pagamento più sicuri al mondo.
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

        {/* ─── Zero-knowledge ─── */}
        <h2 className="mt-10 text-xl font-semibold">
          Architettura zero-knowledge: il team non può leggere le tue
          credenziali
        </h2>
        <p className="text-muted-foreground mt-3 text-sm leading-relaxed">
          Le credenziali non sono mai visibili in chiaro, nemmeno agli
          amministratori di ScontrinoZero. Ecco perché:
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
            Le credenziali vengono decifrate{" "}
            <strong>solo in memoria RAM</strong> al momento esatto in cui serve
            fare la chiamata al portale AdE, e immediatamente scartate.
          </li>
          <li>
            I log applicativi sono configurati per{" "}
            <strong>non registrare</strong> mai il valore delle credenziali.
            Anche in caso di bug o eccezione, il PIN non finisce nei log.
          </li>
        </ul>

        {/* ─── Dove sono salvate ─── */}
        <h2 className="mt-10 text-xl font-semibold">
          Dove sono fisicamente archiviate
        </h2>
        <p className="text-muted-foreground mt-3 text-sm leading-relaxed">
          I dati cifrati sono salvati nel database PostgreSQL su{" "}
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
            <strong>Tu</strong> — puoi aggiornare o eliminare le credenziali in
            qualsiasi momento da <strong>Impostazioni → Attività</strong>.
          </li>
          <li>
            <strong>Il server applicativo</strong> — usa le credenziali
            decifrate solo al momento dell&apos;invio degli scontrini,
            operazione che avviene solo su tua esplicita richiesta.
          </li>
          <li>
            <strong>Nessun altro</strong> — il team ScontrinoZero, i database
            administrator, e qualsiasi altro sistema non hanno accesso al testo
            in chiaro delle credenziali.
          </li>
        </ul>

        {/* ─── Cosa succede se cambi il PIN ─── */}
        <h2 className="mt-10 text-xl font-semibold">
          Cosa succede se cambi il PIN Fisconline
        </h2>
        <p className="text-muted-foreground mt-3 text-sm leading-relaxed">
          Se cambi il PIN sul portale dell&apos;Agenzia delle Entrate, le
          credenziali salvate su ScontrinoZero diventano non valide: il sistema
          ti mostrerà un errore di connessione AdE la prossima volta che emetti
          uno scontrino.
        </p>
        <p className="text-muted-foreground mt-3 text-sm leading-relaxed">
          Per aggiornare le credenziali:
        </p>
        <ol className="text-muted-foreground mt-2 list-decimal space-y-1 pl-5 text-sm leading-relaxed">
          <li>
            Vai su <strong>Impostazioni → Attività → Credenziali AdE</strong>.
          </li>
          <li>
            Clicca su <strong>Modifica credenziali</strong>.
          </li>
          <li>Inserisci il nuovo PIN e salva.</li>
        </ol>
        <p className="text-muted-foreground mt-3 text-sm leading-relaxed">
          Gli scontrini rimasti in coda vengono trasmessi automaticamente appena
          le nuove credenziali sono valide.
        </p>

        {/* ─── Come revocare ─── */}
        <h2 className="mt-10 text-xl font-semibold">
          Come revocare l&apos;accesso e cancellare le credenziali
        </h2>
        <p className="text-muted-foreground mt-3 text-sm leading-relaxed">
          Puoi eliminare le credenziali AdE salvate in qualsiasi momento:
        </p>
        <ol className="text-muted-foreground mt-2 list-decimal space-y-1 pl-5 text-sm leading-relaxed">
          <li>
            Vai su <strong>Impostazioni → Attività → Credenziali AdE</strong>.
          </li>
          <li>
            Clicca su <strong>Rimuovi credenziali</strong> e conferma.
          </li>
        </ol>
        <p className="text-muted-foreground mt-3 text-sm leading-relaxed">
          Dopo la rimozione, ScontrinoZero non potrà trasmettere nuovi scontrini
          all&apos;AdE fino a quando non inserirai nuovamente le credenziali. I
          dati cifrati vengono eliminati definitivamente dal database.
        </p>
        <p className="text-muted-foreground mt-3 text-sm leading-relaxed">
          Se elimini l&apos;account ScontrinoZero, tutte le credenziali e i dati
          personali vengono eliminati entro 24 ore, come previsto dal diritto
          alla cancellazione (GDPR art. 17).
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
              No. Il codice accede esclusivamente alle sezioni necessarie per
              emettere e annullare documenti commerciali. Non vengono effettuate
              operazioni su fatture, dichiarazioni, o altri servizi AdE.
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
              ti consigliamo di cambiare il PIN Fisconline se ricevi notifiche
              di sicurezza da parte nostra.
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
              href="/help/errori-ade"
              className="text-primary hover:underline"
            >
              Errori comuni di accesso AdE e come risolverli
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
