import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";

export const metadata: Metadata = {
  title: "Privacy Policy",
  description:
    "Informativa sulla privacy di ScontrinoZero. Come raccogliamo, utilizziamo e proteggiamo i tuoi dati personali.",
};

export default function PrivacyPage() {
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
          Privacy Policy
        </h1>
        <p className="text-muted-foreground mt-2 text-sm">
          Ultimo aggiornamento: febbraio 2026
        </p>

        <div className="mt-10 space-y-8 text-sm leading-relaxed">
          <section>
            <h2 className="text-lg font-semibold">
              1. Titolare del trattamento
            </h2>
            <p className="text-muted-foreground mt-2">
              Il titolare del trattamento dei dati personali è il gestore del
              servizio ScontrinoZero, raggiungibile all&apos;indirizzo email:{" "}
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
            <h2 className="text-lg font-semibold">2. Dati raccolti</h2>
            <p className="text-muted-foreground mt-2">
              In questa fase raccogliamo esclusivamente:
            </p>
            <ul className="text-muted-foreground mt-2 list-inside list-disc space-y-1">
              <li>
                <strong>Indirizzo email</strong> — fornito volontariamente
                tramite il modulo di iscrizione alla lista d&apos;attesa.
              </li>
              <li>
                <strong>Dati di navigazione</strong> — raccolti in forma anonima
                e aggregata tramite analytics cookieless (Umami), senza
                identificazione personale.
              </li>
            </ul>
            <p className="text-muted-foreground mt-2">
              Al lancio del servizio completo, saranno raccolti anche:
            </p>
            <ul className="text-muted-foreground mt-2 list-inside list-disc space-y-1">
              <li>
                <strong>Dati di registrazione</strong> — nome, email, dati
                dell&apos;attività commerciale (ragione sociale, P.IVA, codice
                fiscale, indirizzo).
              </li>
              <li>
                <strong>Credenziali Fisconline</strong> — necessarie per la
                trasmissione dei corrispettivi all&apos;Agenzia delle Entrate.
                Queste credenziali sono cifrate at-rest e non vengono mai
                memorizzate in chiaro né trasmesse a terzi.
              </li>
              <li>
                <strong>Dati degli scontrini</strong> — importi, aliquote IVA,
                metodi di pagamento, necessari per l&apos;erogazione del
                servizio.
              </li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-semibold">3. Base giuridica</h2>
            <ul className="text-muted-foreground mt-2 list-inside list-disc space-y-1">
              <li>
                <strong>Consenso</strong> — per l&apos;iscrizione alla lista
                d&apos;attesa e l&apos;invio di comunicazioni relative al
                lancio.
              </li>
              <li>
                <strong>Esecuzione del contratto</strong> — per
                l&apos;erogazione del servizio SaaS agli utenti registrati.
              </li>
              <li>
                <strong>Legittimo interesse</strong> — per analytics anonimi e
                aggregati volti al miglioramento del servizio.
              </li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-semibold">
              4. Finalità del trattamento
            </h2>
            <ul className="text-muted-foreground mt-2 list-inside list-disc space-y-1">
              <li>
                Comunicazioni relative al lancio del servizio (solo per gli
                iscritti alla lista d&apos;attesa).
              </li>
              <li>Erogazione e gestione del servizio ScontrinoZero.</li>
              <li>
                Trasmissione dei corrispettivi all&apos;Agenzia delle Entrate
                per conto dell&apos;utente.
              </li>
              <li>Miglioramento del servizio tramite analytics anonimi.</li>
              <li>Adempimento di obblighi legali e fiscali.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-semibold">5. Conservazione dei dati</h2>
            <p className="text-muted-foreground mt-2">
              I dati della lista d&apos;attesa sono conservati fino al lancio
              del servizio o fino a richiesta di cancellazione. I dati degli
              utenti registrati sono conservati per la durata del rapporto
              contrattuale e successivamente per il periodo richiesto dagli
              obblighi fiscali e legali vigenti.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold">
              6. Diritti dell&apos;interessato
            </h2>
            <p className="text-muted-foreground mt-2">
              In conformità al GDPR (Regolamento UE 2016/679), hai diritto di:
            </p>
            <ul className="text-muted-foreground mt-2 list-inside list-disc space-y-1">
              <li>Accedere ai tuoi dati personali.</li>
              <li>Rettificare dati inesatti o incompleti.</li>
              <li>
                Richiedere la cancellazione dei tuoi dati (&quot;diritto
                all&apos;oblio&quot;).
              </li>
              <li>
                Richiedere la portabilità dei dati in formato strutturato.
              </li>
              <li>Opporti al trattamento o richiederne la limitazione.</li>
              <li>Revocare il consenso in qualsiasi momento.</li>
            </ul>
            <p className="text-muted-foreground mt-2">
              Per esercitare i tuoi diritti, scrivi a{" "}
              <a
                href="mailto:privacy@scontrinozero.it"
                className="text-primary underline"
              >
                privacy@scontrinozero.it
              </a>
              . Hai inoltre il diritto di presentare reclamo al Garante per la
              Protezione dei Dati Personali.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold">7. Terze parti</h2>
            <p className="text-muted-foreground mt-2">
              I dati possono essere trattati dai seguenti fornitori di servizi,
              esclusivamente per le finalità indicate:
            </p>
            <ul className="text-muted-foreground mt-2 list-inside list-disc space-y-1">
              <li>
                <strong>Supabase</strong> (database) — conservazione dei dati su
                server nell&apos;Unione Europea.
              </li>
              <li>
                <strong>Cloudflare</strong> (CDN e sicurezza) — protezione del
                traffico web e distribuzione dei contenuti.
              </li>
              <li>
                <strong>Stripe</strong> (pagamenti) — gestione degli abbonamenti
                e dei pagamenti (al lancio del servizio).
              </li>
              <li>
                <strong>Resend</strong> (email) — invio di email transazionali
                (al lancio del servizio).
              </li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-semibold">8. Cookie</h2>
            <p className="text-muted-foreground mt-2">
              ScontrinoZero utilizza esclusivamente cookie tecnici necessari al
              funzionamento del servizio (autenticazione). Non utilizziamo
              cookie di profilazione o di terze parti. L&apos;analisi del
              traffico avviene tramite Umami, un sistema di analytics cookieless
              che non richiede banner di consenso ai sensi del GDPR.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold">9. Credenziali Fisconline</h2>
            <p className="text-muted-foreground mt-2">
              Le credenziali Fisconline fornite dall&apos;utente sono trattate
              con particolare attenzione:
            </p>
            <ul className="text-muted-foreground mt-2 list-inside list-disc space-y-1">
              <li>
                Sono cifrate at-rest e non vengono mai memorizzate in chiaro.
              </li>
              <li>Non vengono trasmesse a terzi in alcun caso.</li>
              <li>
                Sono utilizzate esclusivamente per la trasmissione dei
                corrispettivi all&apos;Agenzia delle Entrate, su richiesta
                dell&apos;utente.
              </li>
              <li>
                La versione self-hosted garantisce che le credenziali restino
                interamente sul server dell&apos;utente.
              </li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-semibold">10. Contatti</h2>
            <p className="text-muted-foreground mt-2">
              Per qualsiasi domanda relativa al trattamento dei dati personali,
              scrivi a{" "}
              <a
                href="mailto:privacy@scontrinozero.it"
                className="text-primary underline"
              >
                privacy@scontrinozero.it
              </a>
              .
            </p>
          </section>
        </div>
      </article>
    </section>
  );
}
