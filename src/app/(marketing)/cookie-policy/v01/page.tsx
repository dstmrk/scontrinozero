import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";

export const metadata: Metadata = {
  title: "Cookie Policy",
  description:
    "Cookie Policy di ScontrinoZero: utilizziamo solo cookie tecnici strettamente necessari. Nessun cookie di profilazione, nessun banner di consenso.",
};

export default function CookiePolicyV01Page() {
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
          Cookie Policy
        </h1>
        <p className="text-muted-foreground mt-2 text-sm">
          Versione: v01 — Ultimo aggiornamento: marzo 2026
        </p>
        <p className="text-muted-foreground mt-1 text-sm">
          URL permanente:{" "}
          <Link href="/cookie-policy/v01" className="text-primary underline">
            scontrinozero.it/cookie-policy/v01
          </Link>
        </p>

        <div className="mt-10 space-y-8 text-sm leading-relaxed">
          {/* ─── 1. COSA SONO I COOKIE ─── */}
          <section>
            <h2 className="text-lg font-semibold">1. Cosa sono i cookie</h2>
            <p className="text-muted-foreground mt-2">
              I cookie sono piccoli file di testo che i siti web salvano sul
              dispositivo dell&apos;utente quando viene visitata una pagina.
              Vengono ritrasmessi al sito ad ogni successiva visita e servono a
              far funzionare il servizio, a ricordare la sessione autenticata e
              ad altri scopi tecnici.
            </p>
          </section>

          {/* ─── 2. COOKIE TECNICI ─── */}
          <section>
            <h2 className="text-lg font-semibold">
              2. Cookie tecnici strettamente necessari
            </h2>
            <p className="text-muted-foreground mt-2">
              ScontrinoZero utilizza esclusivamente cookie tecnici necessari al
              funzionamento della piattaforma. Non richiedono consenso ai sensi
              del GDPR e del Provvedimento del Garante Privacy del 10 giugno
              2021.
            </p>

            <p className="text-muted-foreground mt-3 font-medium">
              2.1 Cookie di autenticazione (Supabase Auth)
            </p>
            <p className="text-muted-foreground mt-1">
              Gestiti da <strong>Supabase Auth</strong>, il sistema di
              autenticazione utilizzato da ScontrinoZero. Mantengono la sessione
              dell&apos;utente autenticato e la relativa sicurezza.
            </p>
            <ul className="text-muted-foreground mt-2 list-inside list-disc space-y-1">
              <li>
                <strong>Nome:</strong>{" "}
                <code className="bg-muted rounded px-1">
                  sb-[ref]-auth-token
                </code>{" "}
                (e varianti con suffisso{" "}
                <code className="bg-muted rounded px-1">.0</code>,{" "}
                <code className="bg-muted rounded px-1">.1</code>)
              </li>
              <li>
                <strong>Scopo:</strong> conservare il token di sessione JWT per
                mantenere l&apos;utente autenticato tra una pagina e l&apos;altra.
              </li>
              <li>
                <strong>Durata:</strong> fino alla scadenza della sessione o
                alla disconnessione esplicita.
              </li>
              <li>
                <strong>Tipo:</strong> HttpOnly, Secure — non accessibile da
                JavaScript, trasmesso solo via HTTPS.
              </li>
            </ul>
            <p className="text-muted-foreground mt-2">
              Questi cookie sono indispensabili per accedere alle funzionalità
              riservate della piattaforma. Disabilitarli impedisce il login.
            </p>

            <p className="text-muted-foreground mt-3 font-medium">
              2.2 Cookie di pagamento (Stripe)
            </p>
            <p className="text-muted-foreground mt-1">
              Durante il flusso di sottoscrizione dell&apos;abbonamento,{" "}
              <strong>Stripe</strong> — il gestore dei pagamenti — può
              impostare cookie tecnici a fini di prevenzione delle frodi e
              continuità del checkout. Questi cookie sono funzionali alla
              transazione e non vengono utilizzati per profilazione.
            </p>
            <ul className="text-muted-foreground mt-2 list-inside list-disc space-y-1">
              <li>
                <strong>Scopo:</strong> antifrode, sicurezza del checkout,
                continuità della sessione di pagamento.
              </li>
              <li>
                <strong>Durata:</strong> tipicamente di sessione o poche ore.
              </li>
              <li>
                <strong>Fornitore:</strong> Stripe Inc. — Privacy:{" "}
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
            </ul>
          </section>

          {/* ─── 3. ANALYTICS SENZA COOKIE ─── */}
          <section>
            <h2 className="text-lg font-semibold">
              3. Analytics senza cookie (Umami)
            </h2>
            <p className="text-muted-foreground mt-2">
              ScontrinoZero utilizza <strong>Umami</strong>, uno strumento di
              web analytics self-hosted e open source, per monitorare
              l&apos;utilizzo del servizio in forma aggregata.
            </p>
            <p className="text-muted-foreground mt-2">
              Umami è progettato per essere{" "}
              <strong>completamente cookieless</strong>: non imposta alcun
              cookie sul dispositivo dell&apos;utente. Per distinguere le
              sessioni utilizza un hash anonimizzato derivato
              dall&apos;indirizzo IP e dallo user-agent del browser, che viene
              scartato alla fine di ogni giornata e non consente di
              re-identificare l&apos;utente.
            </p>
            <ul className="text-muted-foreground mt-2 list-inside list-disc space-y-1">
              <li>
                <strong>Cookie impostati:</strong> nessuno.
              </li>
              <li>
                <strong>Dati personali raccolti:</strong> nessuno (solo dati
                aggregati anonimi — pagine visitate, numero sessioni, paese).
              </li>
              <li>
                <strong>Trasferimento a terzi:</strong> nessuno (istanza
                self-hosted su server di proprietà di ScontrinoZero).
              </li>
            </ul>
            <p className="text-muted-foreground mt-2">
              Questo approccio è conforme al GDPR per design e non richiede
              consenso.
            </p>
          </section>

          {/* ─── 4. NESSUN BANNER COOKIE ─── */}
          <section>
            <h2 className="text-lg font-semibold">
              4. Perché non mostriamo un banner cookie
            </h2>
            <p className="text-muted-foreground mt-2">
              ScontrinoZero{" "}
              <strong>non mostra un banner di consenso cookie</strong> perché:
            </p>
            <ul className="text-muted-foreground mt-2 list-inside list-disc space-y-1">
              <li>
                I cookie di autenticazione Supabase sono tecnici strettamente
                necessari all&apos;erogazione del servizio: il consenso non è
                richiesto ai sensi dell&apos;art. 122 D.Lgs. 196/2003 e del
                Provvedimento Garante del 10 giugno 2021.
              </li>
              <li>
                I cookie di pagamento Stripe sono funzionali al servizio
                richiesto dall&apos;utente (abbonamento) e rientrano nella
                stessa esenzione.
              </li>
              <li>
                Umami Analytics non utilizza cookie: non è soggetto alla
                disciplina sui cookie.
              </li>
              <li>
                Non utilizziamo cookie di profilazione, tracking pubblicitario
                o strumenti di terze parti a fini di marketing.
              </li>
            </ul>
          </section>

          {/* ─── 5. NESSUN COOKIE DI PROFILAZIONE ─── */}
          <section>
            <h2 className="text-lg font-semibold">
              5. Cookie di profilazione e marketing
            </h2>
            <p className="text-muted-foreground mt-2">
              ScontrinoZero{" "}
              <strong>
                non utilizza cookie di profilazione, remarketing o tracciamento
                pubblicitario
              </strong>
              . Non sono presenti pixel di Facebook, Google Ads, Tag Manager o
              strumenti analoghi. Non viene effettuato alcun tracciamento
              comportamentale a fini commerciali.
            </p>
          </section>

          {/* ─── 6. GESTIONE BROWSER ─── */}
          <section>
            <h2 className="text-lg font-semibold">
              6. Gestione tramite browser
            </h2>
            <p className="text-muted-foreground mt-2">
              Puoi visualizzare, bloccare o eliminare i cookie tramite le
              impostazioni del tuo browser. Le istruzioni variano in base al
              browser utilizzato:
            </p>
            <ul className="text-muted-foreground mt-2 list-inside list-disc space-y-1">
              <li>
                <strong>Chrome:</strong> Impostazioni → Privacy e sicurezza →
                Cookie e altri dati dei siti
              </li>
              <li>
                <strong>Firefox:</strong> Impostazioni → Privacy e sicurezza →
                Cookie e dati dei siti
              </li>
              <li>
                <strong>Safari:</strong> Preferenze → Privacy → Gestisci dati
                siti web
              </li>
              <li>
                <strong>Edge:</strong> Impostazioni → Cookie e autorizzazioni
                siti → Cookie e dati archiviati
              </li>
            </ul>
            <p className="text-muted-foreground mt-2">
              Attenzione: disabilitare i cookie tecnici di autenticazione
              impedisce il login e l&apos;accesso alle funzionalità riservate
              della piattaforma.
            </p>
          </section>

          {/* ─── 7. BASE GIURIDICA ─── */}
          <section>
            <h2 className="text-lg font-semibold">7. Base giuridica</h2>
            <p className="text-muted-foreground mt-2">
              I cookie tecnici di autenticazione (Supabase) e di pagamento
              (Stripe) sono trattati sulla base del{" "}
              <strong>legittimo interesse</strong> del titolare a garantire la
              sicurezza e l&apos;erogazione del servizio (art. 6(1)(f) GDPR),
              nonché dell&apos;<strong>esecuzione del contratto</strong> con
              l&apos;utente (art. 6(1)(b) GDPR).
            </p>
            <p className="text-muted-foreground mt-2">
              Umami Analytics non tratta dati personali: non è soggetto alle
              basi giuridiche del GDPR per il trattamento di dati personali.
            </p>
          </section>

          {/* ─── 8. TITOLARE E CONTATTI ─── */}
          <section>
            <h2 className="text-lg font-semibold">
              8. Titolare del trattamento e contatti
            </h2>
            <p className="text-muted-foreground mt-2">
              Il titolare del trattamento è il gestore del servizio
              ScontrinoZero. Per qualsiasi richiesta relativa all&apos;uso dei
              cookie e dei dati personali scrivi a{" "}
              <a
                href="mailto:privacy@scontrinozero.it"
                className="text-primary underline"
              >
                privacy@scontrinozero.it
              </a>
              {"."}
            </p>
            <p className="text-muted-foreground mt-2">
              Per il trattamento dei dati personali in generale, consulta la{" "}
              <Link href="/privacy" className="text-primary underline">
                Privacy Policy
              </Link>
              {"."}
            </p>
          </section>

          {/* ─── 9. AGGIORNAMENTI ─── */}
          <section>
            <h2 className="text-lg font-semibold">
              9. Aggiornamenti della Cookie Policy
            </h2>
            <p className="text-muted-foreground mt-2">
              Il testo della presente versione (v01) è conservato
              permanentemente all&apos;URL{" "}
              <Link
                href="/cookie-policy/v01"
                className="text-primary underline"
              >
                /cookie-policy/v01
              </Link>
              {"."}
            </p>
            <p className="text-muted-foreground mt-2">
              In caso di modifiche sostanziali — ad esempio l&apos;introduzione
              di nuovi strumenti che impostano cookie — la nuova versione sarà
              pubblicata con un nuovo permalink (es.{" "}
              <code className="bg-muted rounded px-1">/cookie-policy/v02</code>
              {") "}e gli utenti saranno informati via email o messaggio in-app
              almeno <strong>15 giorni</strong> prima dell&apos;entrata in
              vigore. La pagina{" "}
              <Link href="/cookie-policy" className="text-primary underline">
                /cookie-policy
              </Link>{" "}
              reindirizza sempre all&apos;ultima versione in vigore.
            </p>
          </section>
        </div>
      </article>
    </section>
  );
}
