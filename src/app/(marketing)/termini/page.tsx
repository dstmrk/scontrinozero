import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";

export const metadata: Metadata = {
  title: "Termini e Condizioni",
  description:
    "Termini e condizioni del servizio ScontrinoZero per accesso, utilizzo, responsabilità, piani, sospensione e recesso.",
};

export default function TerminiPage() {
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
          Termini e Condizioni del Servizio
        </h1>
        <p className="text-muted-foreground mt-2 text-sm">
          Ultimo aggiornamento: febbraio 2026
        </p>

        <div className="mt-10 space-y-8 text-sm leading-relaxed">
          <section>
            <h2 className="text-lg font-semibold">1. Oggetto del servizio</h2>
            <p className="text-muted-foreground mt-2">
              ScontrinoZero è una piattaforma software che consente di gestire
              flussi operativi connessi all&apos;emissione del documento
              commerciale e alla trasmissione dei corrispettivi tramite i canali
              messi a disposizione dall&apos;Agenzia delle Entrate.
            </p>
            <p className="text-muted-foreground mt-2">
              Il servizio viene erogato in modalità cloud (SaaS) e, dove
              previsto, anche in modalità self-hosted secondo i termini di
              licenza applicabili.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold">
              2. Ambito di applicazione e accettazione
            </h2>
            <p className="text-muted-foreground mt-2">
              I presenti Termini disciplinano l&apos;accesso e l&apos;utilizzo
              del servizio da parte di utenti professionali e/o consumatori, ove
              applicabile. L&apos;utilizzo della piattaforma comporta
              l&apos;accettazione dei Termini.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold">3. Requisiti di accesso</h2>
            <ul className="text-muted-foreground mt-2 list-inside list-disc space-y-1">
              <li>Maggiore età e capacità di agire.</li>
              <li>
                Possesso dei requisiti fiscali e amministrativi richiesti dalla
                normativa italiana per l&apos;attività svolta.
              </li>
              <li>
                Disponibilità di credenziali e strumenti richiesti
                dall&apos;Agenzia delle Entrate per le operazioni telematiche.
              </li>
              <li>
                Disponibilità di connessione internet e dispositivi idonei.
              </li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-semibold">4. Account e credenziali</h2>
            <p className="text-muted-foreground mt-2">
              L&apos;utente è responsabile della correttezza dei dati forniti in
              fase di registrazione e della custodia delle credenziali di
              accesso. È vietato condividere l&apos;account in modo improprio o
              consentire accessi non autorizzati.
            </p>
            <p className="text-muted-foreground mt-2">
              L&apos;utente si impegna a comunicare tempestivamente eventuali
              utilizzi non autorizzati o violazioni di sicurezza.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold">
              5. Obblighi e responsabilità dell&apos;utente
            </h2>
            <ul className="text-muted-foreground mt-2 list-inside list-disc space-y-1">
              <li>
                Inserire dati veritieri, completi e aggiornati, inclusi quelli
                fiscali.
              </li>
              <li>
                Verificare la correttezza delle operazioni prima della
                conferma/invio.
              </li>
              <li>
                Utilizzare il servizio nel rispetto della normativa applicabile.
              </li>
              <li>
                Conservare evidenze e documentazione secondo gli obblighi di
                legge.
              </li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-semibold">
              6. Limitazioni del servizio
            </h2>
            <p className="text-muted-foreground mt-2">
              Il servizio dipende anche da sistemi terzi (es. piattaforme AdE,
              infrastrutture cloud, provider tecnici). Non possiamo garantire
              assenza di interruzioni o indisponibilità imputabili a soggetti
              terzi, manutenzioni, eventi di forza maggiore o cause fuori dal
              nostro ragionevole controllo.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold">
              7. Esclusioni e limitazioni di responsabilità
            </h2>
            <p className="text-muted-foreground mt-2">
              Nei limiti consentiti dalla legge, ScontrinoZero non risponde per
              danni indiretti, perdita di profitto, fermo attività o sanzioni
              derivanti da dati errati inseriti dall&apos;utente, uso non
              conforme o indisponibilità di servizi terzi.
            </p>
            <p className="text-muted-foreground mt-2">
              Resta in capo all&apos;utente la responsabilità di verificare
              esiti e correttezza fiscale delle operazioni effettuate.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold">
              8. Piani, corrispettivi e fatturazione
            </h2>
            <p className="text-muted-foreground mt-2">
              Eventuali piani a pagamento, funzionalità incluse, limiti,
              corrispettivi e modalità di fatturazione sono descritti nelle
              pagine commerciali o nelle condizioni d&apos;offerta applicabili
              al momento della sottoscrizione.
            </p>
            <p className="text-muted-foreground mt-2">
              In caso di periodo beta/promozionale, potranno applicarsi
              condizioni economiche specifiche, comunicate prima
              dell&apos;attivazione.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold">
              9. Sospensione e cessazione del servizio
            </h2>
            <p className="text-muted-foreground mt-2">
              Possiamo sospendere o limitare l&apos;accesso in presenza di
              violazioni dei Termini, attività illecite, rischi per la sicurezza
              o mancato pagamento, con preavviso ove possibile.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold">
              10. Recesso e cancellazione account
            </h2>
            <p className="text-muted-foreground mt-2">
              L&apos;utente può richiedere la chiusura del proprio account in
              qualsiasi momento. La cessazione del servizio non esonera
              dall&apos;adempimento di obblighi fiscali e di conservazione
              documentale eventualmente già maturati.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold">
              11. Proprietà intellettuale
            </h2>
            <p className="text-muted-foreground mt-2">
              Marchi, contenuti, interfacce, codice e componenti della
              piattaforma sono protetti dalla normativa in materia di proprietà
              intellettuale. Restano salvi i diritti previsti dalle eventuali
              licenze open source applicate a parti del progetto.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold">
              12. Protezione dei dati personali
            </h2>
            <p className="text-muted-foreground mt-2">
              Il trattamento dei dati personali avviene secondo quanto descritto
              nella{" "}
              <Link href="/privacy" className="text-primary underline">
                Privacy Policy
              </Link>
              . Per i cookie e strumenti analoghi, consulta la{" "}
              <Link href="/cookie-policy" className="text-primary underline">
                Cookie Policy
              </Link>
              .
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold">13. Modifiche ai Termini</h2>
            <p className="text-muted-foreground mt-2">
              Ci riserviamo il diritto di modificare i presenti Termini per
              ragioni normative, tecniche o commerciali. Le versioni aggiornate
              saranno pubblicate su questa pagina con indicazione della data di
              aggiornamento.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold">
              14. Legge applicabile e foro competente
            </h2>
            <p className="text-muted-foreground mt-2">
              I presenti Termini sono regolati dalla legge italiana. Per gli
              utenti consumatori è competente il foro del luogo di residenza o
              domicilio del consumatore, ove previsto dalla legge.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold">15. Contatti</h2>
            <p className="text-muted-foreground mt-2">
              Per informazioni sui presenti Termini puoi scrivere a{" "}
              <a
                href="mailto:info@scontrinozero.it"
                className="text-primary underline"
              >
                info@scontrinozero.it
              </a>
              {"."}
            </p>
          </section>
        </div>
      </article>
    </section>
  );
}
