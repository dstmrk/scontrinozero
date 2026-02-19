import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";

export const metadata: Metadata = {
  title: "Cookie Policy",
  description:
    "Informazioni su cookie tecnici, preferenze e strumenti analoghi utilizzati da ScontrinoZero.",
};

export default function CookiePolicyPage() {
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
          Ultimo aggiornamento: febbraio 2026
        </p>

        <div className="mt-10 space-y-8 text-sm leading-relaxed">
          <section>
            <h2 className="text-lg font-semibold">1. Cosa sono i cookie</h2>
            <p className="text-muted-foreground mt-2">
              I cookie sono piccoli file di testo che i siti web salvano sul
              dispositivo dell&apos;utente per consentire il funzionamento del
              sito, ricordare preferenze e, in alcuni casi, raccogliere
              informazioni statistiche.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold">
              2. Tipologie di cookie utilizzate
            </h2>
            <p className="text-muted-foreground mt-2">
              Attualmente ScontrinoZero utilizza principalmente cookie e
              strumenti tecnici necessari al funzionamento della piattaforma.
            </p>
            <ul className="text-muted-foreground mt-2 list-inside list-disc space-y-1">
              <li>
                <strong>Cookie tecnici strettamente necessari</strong>: servono
                per autenticazione, sicurezza sessione e corretto funzionamento
                delle funzionalità riservate.
              </li>
              <li>
                <strong>Cookie di preferenza</strong> (se presenti): permettono
                di ricordare impostazioni dell&apos;utente (es. lingua, opzioni
                di visualizzazione).
              </li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-semibold">
              3. Cookie di profilazione e marketing
            </h2>
            <p className="text-muted-foreground mt-2">
              Alla data dell&apos;ultimo aggiornamento, non utilizziamo cookie
              di profilazione pubblicitaria o cookie marketing di terze parti
              per campagne personalizzate.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold">4. Analytics</h2>
            <p className="text-muted-foreground mt-2">
              Possiamo utilizzare strumenti di analisi in forma aggregata per
              monitorare performance e utilizzo del servizio. Qualora venissero
              introdotti strumenti che richiedono consenso (es. analytics non
              anonimizzati con cookie), questa policy e i meccanismi di consenso
              verranno aggiornati di conseguenza.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold">
              5. Gestione delle preferenze cookie
            </h2>
            <p className="text-muted-foreground mt-2">
              Puoi gestire o disabilitare i cookie tramite le impostazioni del
              tuo browser. La disattivazione dei cookie tecnici potrebbe
              compromettere il funzionamento di alcune funzionalità.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold">6. Base giuridica</h2>
            <p className="text-muted-foreground mt-2">
              I cookie tecnici sono trattati sulla base del legittimo interesse
              del titolare a garantire sicurezza ed erogazione del servizio.
              Eventuali cookie non tecnici saranno trattati sulla base del
              consenso, ove richiesto.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold">
              7. Titolare del trattamento e contatti
            </h2>
            <p className="text-muted-foreground mt-2">
              Per richieste relative all&apos;uso dei cookie e dei dati
              personali puoi contattarci a{" "}
              <a
                href="mailto:privacy@scontrinozero.it"
                className="text-primary underline"
              >
                privacy@scontrinozero.it
              </a>
              .
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold">
              8. Aggiornamenti della Cookie Policy
            </h2>
            <p className="text-muted-foreground mt-2">
              Questa Cookie Policy può essere aggiornata nel tempo per
              riflettere cambiamenti tecnici, normativi o funzionali del
              servizio. L&apos;ultima versione è sempre disponibile su questa
              pagina.
            </p>
            <p className="text-muted-foreground mt-2">
              Per maggiori informazioni sul trattamento dei dati personali,
              consulta anche la{" "}
              <Link href="/privacy" className="text-primary underline">
                Privacy Policy
              </Link>
              .
            </p>
          </section>
        </div>
      </article>
    </section>
  );
}
