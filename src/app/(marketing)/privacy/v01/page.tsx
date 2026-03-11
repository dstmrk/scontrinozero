import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";

export const metadata: Metadata = {
  title: "Privacy Policy",
  description:
    "Informativa sul trattamento dei dati personali di ScontrinoZero: titolare, dati trattati, basi giuridiche, processori, conservazione e diritti GDPR.",
};

export default function PrivacyV01Page() {
  return (
    <section className="px-4 py-16">
      <article className="mx-auto max-w-3xl">
        <Link
          href="/"
          className="text-muted-foreground hover:text-foreground mb-8 inline-flex items-center gap-1 text-sm transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
          Torna alla home
        </Link>

        <h1 className="text-3xl font-extrabold tracking-tight">
          Informativa sul trattamento dei dati personali
        </h1>
        <p className="text-muted-foreground mt-1 text-sm">
          ai sensi del Regolamento UE 2016/679 (GDPR) e del D.Lgs. 196/2003
        </p>
        <p className="text-muted-foreground mt-2 text-sm">
          Versione: v01 — Ultimo aggiornamento: marzo 2026
        </p>
        <p className="text-muted-foreground mt-1 text-sm">
          URL permanente:{" "}
          <Link href="/privacy/v01" className="text-primary underline">
            scontrinozero.it/privacy/v01
          </Link>
        </p>

        <div className="mt-10 space-y-8 text-sm leading-relaxed">
          {/* ─── 1. TITOLARE ─── */}
          <section>
            <h2 className="text-lg font-semibold">
              1. Titolare del trattamento
            </h2>
            <p className="text-muted-foreground mt-2">
              Il titolare del trattamento è il gestore del servizio
              ScontrinoZero (denominazione legale, P.IVA e sede operativa
              saranno indicati in questa pagina prima del lancio pubblico del
              servizio).
            </p>
            <p className="text-muted-foreground mt-2">
              Per qualsiasi questione relativa al trattamento dei tuoi dati
              scrivi a{" "}
              <a
                href="mailto:privacy@scontrinozero.it"
                className="text-primary underline"
              >
                privacy@scontrinozero.it
              </a>
              {"."}
            </p>
          </section>

          {/* ─── 2. CATEGORIE DI DATI ─── */}
          <section>
            <h2 className="text-lg font-semibold">
              2. Categorie di dati personali trattati
            </h2>

            <p className="text-muted-foreground mt-2 font-medium">
              2.1 Dati di registrazione e account
            </p>
            <ul className="text-muted-foreground mt-1 list-inside list-disc space-y-1">
              <li>
                Indirizzo email (identificativo univoco dell&apos;account).
              </li>
              <li>
                Hash della password (gestito da Supabase Auth — la password in
                chiaro non viene mai conservata da ScontrinoZero).
              </li>
              <li>
                Timestamp di registrazione, versione dei T&C accettata e
                preferenze di account.
              </li>
            </ul>

            <p className="text-muted-foreground mt-3 font-medium">
              2.2 Dati dell&apos;attività professionale
            </p>
            <ul className="text-muted-foreground mt-1 list-inside list-disc space-y-1">
              <li>Ragione sociale o nome/cognome dell&apos;esercente.</li>
              <li>Partita IVA e/o codice fiscale.</li>
              <li>Indirizzo della sede operativa.</li>
              <li>
                Codice ATECO, regime IVA, matricola registratore telematico
                (RT).
              </li>
              <li>
                Dati fiscali necessari alla compilazione del documento
                commerciale (cedente/prestatore).
              </li>
            </ul>

            <p className="text-muted-foreground mt-3 font-medium">
              2.3 Credenziali di accesso ai servizi AdE
            </p>
            <p className="text-muted-foreground mt-1">
              Credenziali Fisconline e/o token SPID temporanei forniti
              volontariamente dall&apos;utente per abilitare la trasmissione
              automatizzata al portale Fatture e Corrispettivi. Queste
              credenziali sono soggette a misure di protezione rafforzate
              descritte al <strong>§5</strong>
              {"."}
            </p>

            <p className="text-muted-foreground mt-3 font-medium">
              2.4 Dati dei documenti commerciali emessi
            </p>
            <ul className="text-muted-foreground mt-1 list-inside list-disc space-y-1">
              <li>Voci del documento (descrizione, quantità, importo).</li>
              <li>Importo totale e aliquota IVA applicata.</li>
              <li>Metodo/i di pagamento utilizzati.</li>
              <li>Data, ora e numero progressivo del documento.</li>
              <li>Esito della trasmissione AdE e codici documento.</li>
            </ul>

            <p className="text-muted-foreground mt-3 font-medium">
              2.5 Dati di pagamento e fatturazione
            </p>
            <p className="text-muted-foreground mt-1">
              I pagamenti degli abbonamenti sono gestiti da{" "}
              <strong>Stripe</strong>
              {". "}ScontrinoZero non conserva dati di carte di credito,
              coordinate bancarie o altri strumenti di pagamento. Stripe
              trasmette a ScontrinoZero solo i metadati dell&apos;abbonamento
              (piano, scadenza, stato).
            </p>

            <p className="text-muted-foreground mt-3 font-medium">
              2.6 Dati tecnici e diagnostica
            </p>
            <ul className="text-muted-foreground mt-1 list-inside list-disc space-y-1">
              <li>Indirizzo IP, user agent, timestamp delle richieste HTTP.</li>
              <li>
                Stack trace e messaggi di errore (raccolti tramite Sentry per la
                diagnosi di problemi tecnici).
              </li>
              <li>Log applicativi per sicurezza e prevenzione abusi.</li>
            </ul>
          </section>

          {/* ─── 3. FINALITÀ E BASI GIURIDICHE ─── */}
          <section>
            <h2 className="text-lg font-semibold">
              3. Finalità e basi giuridiche del trattamento
            </h2>
            <ul className="text-muted-foreground mt-2 list-inside list-disc space-y-2">
              <li>
                <strong>
                  Erogazione del servizio (registrazione, autenticazione,
                  gestione account, onboarding)
                </strong>
                {" — "}base giuridica: esecuzione del contratto (art. 6(1)(b)
                GDPR).
              </li>
              <li>
                <strong>
                  Trasmissione automatizzata dei documenti commerciali al
                  portale AdE
                </strong>
                {" — "}base giuridica: esecuzione del contratto (art. 6(1)(b)
                GDPR).
              </li>
              <li>
                <strong>
                  Gestione abbonamento, fatturazione e rendicontazione
                </strong>
                {" — "}base giuridica: esecuzione del contratto e obblighi
                legali (art. 6(1)(b)(c) GDPR).
              </li>
              <li>
                <strong>
                  Email transazionali (conferma registrazione, reset password,
                  notifiche di servizio, scadenza abbonamento)
                </strong>
                {" — "}base giuridica: esecuzione del contratto (art. 6(1)(b)
                GDPR).
              </li>
              <li>
                <strong>
                  Sicurezza della piattaforma, prevenzione abusi, rate limiting
                </strong>
                {" — "}base giuridica: legittimo interesse (art. 6(1)(f) GDPR).
              </li>
              <li>
                <strong>
                  Monitoraggio errori, diagnostica e continuità del servizio
                </strong>
                {" — "}base giuridica: legittimo interesse (art. 6(1)(f) GDPR).
              </li>
              <li>
                <strong>
                  Adempimento di obblighi fiscali, contabili e risposta ad
                  autorità competenti
                </strong>
                {" — "}base giuridica: obblighi di legge (art. 6(1)(c) GDPR).
              </li>
            </ul>
            <p className="text-muted-foreground mt-2">
              ScontrinoZero{" "}
              <strong>
                non effettua profilazione a fini di marketing, non cede dati a
                terzi per scopi commerciali e non utilizza tecniche di
                tracciamento comportamentale
              </strong>
              {"."}
            </p>
          </section>

          {/* ─── 4. NATURA DEL CONFERIMENTO ─── */}
          <section>
            <h2 className="text-lg font-semibold">
              4. Natura del conferimento dei dati
            </h2>
            <p className="text-muted-foreground mt-2">
              Il conferimento dei dati di cui ai punti 2.1 e 2.2 è obbligatorio:
              senza di essi non è possibile creare un account né erogare il
              servizio.
            </p>
            <p className="text-muted-foreground mt-2">
              Il conferimento delle credenziali Fisconline/SPID (punto 2.3) è
              facoltativo: l&apos;utente può scegliere di non fornirle e operare
              in modalità assistita, accedendo manualmente al portale AdE per
              completare la trasmissione.
            </p>
          </section>

          {/* ─── 5. CREDENZIALI FISCONLINE ─── */}
          <section>
            <h2 className="text-lg font-semibold">
              5. Trattamento speciale delle credenziali Fisconline / SPID
            </h2>
            <p className="text-muted-foreground mt-2">
              In considerazione della sensibilità delle credenziali di accesso
              ai servizi fiscali, ScontrinoZero adotta misure di protezione
              rafforzate:
            </p>
            <ul className="text-muted-foreground mt-2 list-inside list-disc space-y-1">
              <li>
                Le credenziali sono cifrate a riposo con{" "}
                <strong>AES-256-GCM</strong> prima di essere archiviate nel
                database. La chiave di cifratura è separata dai dati cifrati.
              </li>
              <li>
                Sono utilizzate esclusivamente per le operazioni telematiche
                esplicitamente richieste dall&apos;utente (emissione documento,
                annullo).
              </li>
              <li>
                L&apos;accesso è limitato ai soli processi tecnici strettamente
                necessari; nessun operatore umano accede alle credenziali in
                chiaro.
              </li>
              <li>
                Non vengono mai cedute, condivise, trasmesse o comunicate a
                terzi, inclusi i fornitori infrastrutturali.
              </li>
              <li>
                L&apos;utente può revocarle e richiederne la cancellazione in
                qualsiasi momento dall&apos;area impostazioni del proprio
                account.
              </li>
              <li>
                In caso di chiusura dell&apos;account, le credenziali sono
                cancellate definitivamente entro 30 giorni.
              </li>
              <li>
                I log di utilizzo (data/ora e tipo di operazione eseguita con le
                credenziali) sono conservati per 12 mesi a fini di sicurezza.
              </li>
            </ul>
            <p className="text-muted-foreground mt-2">
              L&apos;utente è e rimane il{" "}
              <strong>
                solo titolare e responsabile delle proprie credenziali AdE
              </strong>
              {". "}ScontrinoZero agisce come mero esecutore tecnico delle
              istruzioni impartite. Qualsiasi trasmissione effettuata tramite le
              credenziali dell&apos;utente è da considerarsi compiuta
              dall&apos;utente stesso.
            </p>
          </section>

          {/* ─── 6. DESTINATARI ─── */}
          <section>
            <h2 className="text-lg font-semibold">
              6. Destinatari e responsabili del trattamento
            </h2>
            <p className="text-muted-foreground mt-2">
              I dati sono trattati da fornitori di servizi terzi nominati
              responsabili del trattamento ai sensi dell&apos;art. 28 GDPR.
              Elenco dei principali:
            </p>
            <ul className="text-muted-foreground mt-2 list-inside list-disc space-y-2">
              <li>
                <strong>Supabase Inc.</strong>
                {" ("}USA{") — "}database relazionale e autenticazione. Data
                residency EU disponibile. Privacy:{" "}
                <a
                  href="https://supabase.com/privacy"
                  className="text-primary underline"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  supabase.com/privacy
                </a>
                {"."}
              </li>
              <li>
                <strong>Stripe Inc.</strong>
                {" ("}USA/IE{") — "}gestione abbonamenti e pagamenti. Data
                residency EU disponibile. Privacy:{" "}
                <a
                  href="https://stripe.com/privacy"
                  className="text-primary underline"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  stripe.com/privacy
                </a>
                {"."}
              </li>
              <li>
                <strong>Resend Inc.</strong>
                {" ("}USA{") — "}invio email transazionali. Privacy:{" "}
                <a
                  href="https://resend.com/legal/privacy-policy"
                  className="text-primary underline"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  resend.com/legal/privacy-policy
                </a>
                {"."}
              </li>
              <li>
                <strong>Functional Software Inc. (Sentry)</strong>
                {" ("}USA{") — "}monitoraggio errori e diagnostica applicativa.
                Privacy:{" "}
                <a
                  href="https://sentry.io/privacy/"
                  className="text-primary underline"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  sentry.io/privacy
                </a>
                {"."}
              </li>
              <li>
                <strong>Cloudflare Inc.</strong>
                {" ("}USA{") — "}CDN, sicurezza della rete, tunnel di accesso.
                Data center EU. Privacy:{" "}
                <a
                  href="https://www.cloudflare.com/privacypolicy/"
                  className="text-primary underline"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  cloudflare.com/privacypolicy
                </a>
                {"."}
              </li>
            </ul>
            <p className="text-muted-foreground mt-2">
              I dati non sono diffusi né ceduti a soggetti terzi per finalità
              proprie di questi ultimi. Potranno essere comunicati ad autorità
              pubbliche competenti nei soli casi previsti dalla legge.
            </p>
          </section>

          {/* ─── 7. TRASFERIMENTI EXTRA-UE ─── */}
          <section>
            <h2 className="text-lg font-semibold">7. Trasferimenti extra-UE</h2>
            <p className="text-muted-foreground mt-2">
              Tutti i fornitori sopra indicati hanno sede negli Stati Uniti ma
              operano nel rispetto del GDPR mediante{" "}
              <strong>Clausole Contrattuali Standard (SCC)</strong> approvate
              dalla Commissione europea (decisione di esecuzione 2021/914).
              Supabase, Stripe e Cloudflare offrono la possibilità di
              configurare la residenza dei dati in regioni UE.
            </p>
          </section>

          {/* ─── 8. PERIODO DI CONSERVAZIONE ─── */}
          <section>
            <h2 className="text-lg font-semibold">
              8. Periodo di conservazione
            </h2>
            <ul className="text-muted-foreground mt-2 list-inside list-disc space-y-1">
              <li>
                <strong>Dati account e profilo:</strong> per la durata del
                rapporto contrattuale; alla chiusura dell&apos;account,
                conservati per <strong>10 anni</strong> per obblighi fiscali e
                contabili (D.P.R. 633/1972, D.P.R. 600/1973).
              </li>
              <li>
                <strong>Credenziali Fisconline/SPID:</strong> cancellate entro{" "}
                <strong>30 giorni</strong> dalla chiusura dell&apos;account o
                immediatamente su richiesta dell&apos;utente.
              </li>
              <li>
                <strong>Documenti commerciali emessi:</strong>{" "}
                <strong>10 anni</strong> (obbligo di conservazione fiscale ai
                sensi dell&apos;art. 22 D.P.R. 633/1972).
              </li>
              <li>
                <strong>Log diagnostica (Sentry):</strong>{" "}
                <strong>90 giorni</strong>
                {"."}
              </li>
              <li>
                <strong>Log invio email (Resend):</strong>{" "}
                <strong>30 giorni</strong>
                {"."}
              </li>
              <li>
                <strong>Log accessi e sicurezza:</strong>{" "}
                <strong>12 mesi</strong>
                {"."}
              </li>
              <li>
                <strong>Dati pagamento:</strong> conservati da Stripe secondo la
                normativa applicabile (tipicamente <strong>7 anni</strong> per
                obblighi fiscali).
              </li>
            </ul>
          </section>

          {/* ─── 9. DIRITTI DELL'INTERESSATO ─── */}
          <section>
            <h2 className="text-lg font-semibold">
              9. Diritti dell&apos;interessato
            </h2>
            <p className="text-muted-foreground mt-2">
              Ai sensi degli artt. 15–22 GDPR puoi esercitare i seguenti
              diritti:
            </p>
            <ul className="text-muted-foreground mt-2 list-inside list-disc space-y-1">
              <li>
                <strong>Accesso (art. 15):</strong> ottenere conferma che siano
                trattati dati che ti riguardano e riceverne copia.
              </li>
              <li>
                <strong>Rettifica (art. 16):</strong> correggere dati inesatti o
                incompleti.
              </li>
              <li>
                <strong>
                  Cancellazione / &quot;diritto all&apos;oblio&quot; (art. 17):
                </strong>{" "}
                ottenere la cancellazione dei dati ove non sussistano obblighi
                di legge che ne impongano la conservazione.
              </li>
              <li>
                <strong>Limitazione (art. 18):</strong> limitare il trattamento
                in determinate circostanze.
              </li>
              <li>
                <strong>Portabilità (art. 20):</strong> ricevere i tuoi dati in
                formato strutturato e leggibile da dispositivo automatico (vedi
                §10).
              </li>
              <li>
                <strong>Opposizione (art. 21):</strong> opporti al trattamento
                basato su legittimo interesse.
              </li>
              <li>
                <strong>Revoca del consenso (art. 7(3)):</strong> revocare in
                qualsiasi momento i consensi eventualmente prestati, senza che
                ciò pregiudichi la liceità del trattamento precedente.
              </li>
            </ul>
            <p className="text-muted-foreground mt-2">
              Hai inoltre il diritto di proporre reclamo al{" "}
              <strong>Garante per la protezione dei dati personali</strong>
              {" ("}
              <a
                href="https://www.gpdp.it"
                className="text-primary underline"
                target="_blank"
                rel="noopener noreferrer"
              >
                www.gpdp.it
              </a>
              {") "}ai sensi dell&apos;art. 77 GDPR.
            </p>
            <p className="text-muted-foreground mt-2">
              Per esercitare i tuoi diritti scrivi a{" "}
              <a
                href="mailto:privacy@scontrinozero.it"
                className="text-primary underline"
              >
                privacy@scontrinozero.it
              </a>
              {". "}Risponderemo entro 30 giorni dal ricevimento della richiesta
              (art. 12 GDPR).
            </p>
          </section>

          {/* ─── 10. PORTABILITÀ ─── */}
          <section>
            <h2 className="text-lg font-semibold">
              10. Portabilità e esportazione dati
            </h2>
            <p className="text-muted-foreground mt-2">
              In ossequio all&apos;art. 20 GDPR, ScontrinoZero mette a
              disposizione una funzionalità di{" "}
              <strong>esportazione completa dei dati</strong> accessibile da{" "}
              <Link
                href="/dashboard/impostazioni"
                className="text-primary underline"
              >
                Dashboard → Impostazioni → Esporta dati
              </Link>
              {"."}
            </p>
            <p className="text-muted-foreground mt-2">
              Il file generato in formato <strong>JSON</strong> include: dati
              del profilo, dati dell&apos;attività professionale e storico
              completo dei documenti commerciali emessi.
            </p>
          </section>

          {/* ─── 11. MINORI ─── */}
          <section>
            <h2 className="text-lg font-semibold">11. Minori</h2>
            <p className="text-muted-foreground mt-2">
              ScontrinoZero è un servizio rivolto esclusivamente a persone
              fisiche titolari di Partita IVA e a persone giuridiche (operatori
              economici). Non raccogliamo consapevolmente dati personali di
              soggetti di età inferiore ai 18 anni. Qualora venissimo a
              conoscenza di tale circostanza, provvederemo all&apos;immediata
              cancellazione dei dati.
            </p>
          </section>

          {/* ─── 12. COOKIE ─── */}
          <section>
            <h2 className="text-lg font-semibold">
              12. Cookie e strumenti analoghi
            </h2>
            <p className="text-muted-foreground mt-2">
              Per i dettagli sull&apos;utilizzo di cookie e tecnologie analoghe,
              consulta la nostra{" "}
              <Link href="/cookie-policy" className="text-primary underline">
                Cookie Policy
              </Link>
              {"."}
            </p>
          </section>

          {/* ─── 13. AGGIORNAMENTI ─── */}
          <section>
            <h2 className="text-lg font-semibold">
              13. Aggiornamenti dell&apos;informativa
            </h2>
            <p className="text-muted-foreground mt-2">
              Il testo della presente versione (v01) è conservato
              permanentemente all&apos;URL{" "}
              <Link href="/privacy/v01" className="text-primary underline">
                /privacy/v01
              </Link>
              {"."}
            </p>
            <p className="text-muted-foreground mt-2">
              In caso di modifiche sostanziali, la nuova versione sarà
              pubblicata con un nuovo permalink (es.{" "}
              <code className="bg-muted rounded px-1">/privacy/v02</code>
              {") "}e gli utenti saranno informati via email o messaggio in-app
              almeno <strong>15 giorni</strong> prima dell&apos;entrata in
              vigore.
            </p>
          </section>

          {/* ─── 14. CONTATTI ─── */}
          <section>
            <h2 className="text-lg font-semibold">14. Contatti</h2>
            <p className="text-muted-foreground mt-2">
              Per qualsiasi domanda relativa al trattamento dei tuoi dati
              personali scrivi a{" "}
              <a
                href="mailto:privacy@scontrinozero.it"
                className="text-primary underline"
              >
                privacy@scontrinozero.it
              </a>
              {"."}
            </p>
          </section>
        </div>
      </article>
    </section>
  );
}
