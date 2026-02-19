import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";

export const metadata: Metadata = {
  title: "Privacy Policy",
  description:
    "Informativa sulla privacy di ScontrinoZero: dati trattati, finalità, basi giuridiche, tempi di conservazione e diritti dell'interessato.",
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
              Il titolare del trattamento è il gestore del servizio
              ScontrinoZero, contattabile all&apos;indirizzo email{" "}
              <a
                href="mailto:privacy@scontrinozero.it"
                className="text-primary underline"
              >
                privacy@scontrinozero.it
              </a>
              {"."}
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold">
              2. Categorie di dati personali trattati
            </h2>
            <p className="text-muted-foreground mt-2">Possiamo trattare:</p>
            <ul className="text-muted-foreground mt-2 list-inside list-disc space-y-1">
              <li>
                <strong>Dati anagrafici e di contatto</strong> (es. nome,
                cognome, email, telefono) forniti in fase di registrazione o
                contatto.
              </li>
              <li>
                <strong>Dati dell&apos;attività</strong> (es. ragione sociale,
                P.IVA, codice fiscale, indirizzo, dati fiscali necessari
                all&apos;erogazione del servizio).
              </li>
              <li>
                <strong>Dati operativi del servizio</strong> (es. dati necessari
                all&apos;emissione del documento commerciale e alla trasmissione
                dei corrispettivi).
              </li>
              <li>
                <strong>Credenziali Fisconline/AdE</strong>, trattate con misure
                di sicurezza rafforzate e utilizzate esclusivamente per
                l&apos;esecuzione delle operazioni richieste dall&apos;utente.
              </li>
              <li>
                <strong>Dati tecnici</strong> (log applicativi, indirizzo IP,
                dati dispositivo/browser) per sicurezza, prevenzione abusi e
                continuità del servizio.
              </li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-semibold">
              3. Finalità e base giuridica
            </h2>
            <ul className="text-muted-foreground mt-2 list-inside list-disc space-y-1">
              <li>
                <strong>Esecuzione del contratto</strong>: creazione e gestione
                account, erogazione funzionalità, assistenza utente.
              </li>
              <li>
                <strong>Adempimento di obblighi di legge</strong>: obblighi
                fiscali, contabili, amministrativi e richieste delle autorità
                competenti.
              </li>
              <li>
                <strong>Legittimo interesse</strong>: sicurezza piattaforma,
                prevenzione frodi, manutenzione, monitoraggio prestazioni,
                miglioramento del servizio.
              </li>
              <li>
                <strong>Consenso</strong>, ove richiesto: comunicazioni non
                strettamente necessarie al contratto (es. aggiornamenti
                facoltativi).
              </li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-semibold">
              4. Natura del conferimento dei dati
            </h2>
            <p className="text-muted-foreground mt-2">
              Il conferimento dei dati contrassegnati come obbligatori è
              necessario per registrarsi ed utilizzare ScontrinoZero. In assenza
              di tali dati, potremmo non essere in grado di attivare o mantenere
              il servizio.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold">
              5. Modalità del trattamento e misure di sicurezza
            </h2>
            <p className="text-muted-foreground mt-2">
              Il trattamento avviene con strumenti elettronici e organizzativi
              adeguati a proteggere i dati da accessi non autorizzati,
              divulgazione, modifica o distruzione. Applichiamo principi di
              minimizzazione, limitazione della finalità e conservazione.
            </p>
            <p className="text-muted-foreground mt-2">
              Le credenziali sensibili (incluse quelle necessarie ai servizi
              fiscali) sono protette con tecniche di cifratura e procedure di
              accesso controllato.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold">
              6. Destinatari dei dati e responsabili esterni
            </h2>
            <p className="text-muted-foreground mt-2">
              I dati possono essere trattati da fornitori che supportano
              l&apos;erogazione del servizio (es. infrastruttura cloud,
              database, invio email, monitoraggio tecnico, pagamenti), nominati
              ove necessario responsabili del trattamento ai sensi
              dell&apos;art. 28 GDPR.
            </p>
            <p className="text-muted-foreground mt-2">
              I dati non vengono diffusi. Potranno essere comunicati ad autorità
              competenti quando previsto dalla legge.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold">7. Trasferimenti extra-UE</h2>
            <p className="text-muted-foreground mt-2">
              Ove alcuni fornitori comportino trasferimenti verso Paesi terzi,
              tali trasferimenti avvengono nel rispetto del GDPR, adottando le
              garanzie previste (es. decisioni di adeguatezza o clausole
              contrattuali standard).
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold">
              8. Periodo di conservazione
            </h2>
            <ul className="text-muted-foreground mt-2 list-inside list-disc space-y-1">
              <li>
                Dati account e operativi: per la durata del rapporto
                contrattuale e, successivamente, per i termini di legge.
              </li>
              <li>
                Dati legati ad obblighi fiscali/amministrativi: per il periodo
                previsto dalla normativa applicabile.
              </li>
              <li>
                Dati raccolti su consenso: fino a revoca del consenso, salvo
                obblighi di ulteriore conservazione.
              </li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-semibold">
              9. Diritti dell&apos;interessato
            </h2>
            <p className="text-muted-foreground mt-2">
              Ai sensi degli artt. 15-22 GDPR, puoi esercitare i diritti di
              accesso, rettifica, cancellazione, limitazione, opposizione e
              portabilità dei dati, nonché revocare eventuali consensi prestati.
            </p>
            <p className="text-muted-foreground mt-2">
              Hai inoltre diritto di proporre reclamo al Garante per la
              protezione dei dati personali.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold">
              10. Cookie e strumenti analoghi
            </h2>
            <p className="text-muted-foreground mt-2">
              Per i dettagli sul trattamento dei dati tramite cookie e
              tecnologie simili, consulta la nostra{" "}
              <Link href="/cookie-policy" className="text-primary underline">
                Cookie Policy
              </Link>
              .
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold">
              11. Aggiornamenti dell&apos;informativa
            </h2>
            <p className="text-muted-foreground mt-2">
              Ci riserviamo di aggiornare periodicamente questa informativa.
              Eventuali modifiche sostanziali saranno pubblicate su questa
              pagina con indicazione della data di aggiornamento.
            </p>
          </section>
        </div>
      </article>
    </section>
  );
}
