import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { CONTACT_EMAIL } from "@/lib/contact";

export const metadata: Metadata = {
  title: "Condizioni per i collaboratori — v01",
  description:
    "Condizioni della funzione Collaboratori di ScontrinoZero: cosa fa chi viene invitato, responsabilità del titolare, controllo a distanza e trattamento dei dati per conto del titolare. Versione v01.",
};

const sectionClass = "text-muted-foreground mt-2";
const listClass = "text-muted-foreground mt-2 list-inside list-disc space-y-1";

export default function CondizioniCollaboratoriV01Page() {
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
          Condizioni per i collaboratori
        </h1>
        <p className="text-muted-foreground mt-2 text-sm">
          Versione v01 — ottobre 2026
        </p>

        <div className="mt-10 space-y-8 text-sm leading-relaxed">
          <section>
            <h2 className="text-lg font-semibold">1. Oggetto</h2>
            <p className={sectionClass}>
              Queste Condizioni regolano la funzione Collaboratori: chi ha un
              account ScontrinoZero per la propria attività (il{" "}
              <strong>Titolare</strong>) può invitare altre persone (i{" "}
              <strong>Collaboratori</strong>) a emettere documenti commerciali
              per conto dell&apos;attività, ciascuna con un accesso personale.
            </p>
            <p className={sectionClass}>
              Integrano i{" "}
              <Link href="/termini" className="text-primary underline">
                Termini e Condizioni del Servizio
              </Link>
              , che restano validi per il Titolare e per i Collaboratori. Le
              accetta il Titolare prima del primo invito e ciascun Collaboratore
              quando crea il proprio accesso. Per ciò che riguarda i
              Collaboratori, in caso di contrasto prevalgono queste Condizioni.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold">
              2. Cosa può fare un Collaboratore
            </h2>
            <ul className={listClass}>
              <li>emettere documenti commerciali per l&apos;attività;</li>
              <li>annullare i documenti che ha emesso;</li>
              <li>
                registrare resi sulle vendite dell&apos;attività, cercandole con
                il numero e la data stampati sullo scontrino;
              </li>
              <li>consultare i documenti che ha emesso e il catalogo.</li>
            </ul>
            <p className={sectionClass}>
              Non vede né modifica le credenziali di accesso all&apos;Agenzia
              delle Entrate, i dati dell&apos;attività, l&apos;abbonamento, le
              chiavi API e gli altri Collaboratori. Ogni documento resta
              attribuito alla persona che lo ha emesso, annullato o reso; il
              nome del Collaboratore non compare sul documento consegnato al
              cliente.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold">
              3. Credenziali dell&apos;Agenzia delle Entrate
            </h2>
            <p className={sectionClass}>
              Le operazioni dei Collaboratori sono trasmesse con le credenziali
              Fisconline configurate dal Titolare, proprie o del gestore
              incaricato. Come previsto dall&apos;art. 5 dei Termini, ogni
              trasmissione effettuata con quelle credenziali si considera
              compiuta dal Titolare.
            </p>
            <p className={sectionClass}>
              Finché l&apos;attività ha Collaboratori o inviti in sospeso
              l&apos;accesso all&apos;Agenzia delle Entrate avviene con
              Fisconline: con CIE e SPID ogni nuova sessione richiede
              un&apos;azione del Titolare. Quando la password Fisconline scade,
              nessun Collaboratore può emettere finché il Titolare non la
              aggiorna.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold">
              4. Obblighi e responsabilità del Titolare
            </h2>
            <p className={sectionClass}>Il Titolare:</p>
            <ul className={listClass}>
              <li>
                invita solo persone che operano per la sua attività e che ha
                autorizzato a emettere documenti commerciali per suo conto;
              </li>
              <li>
                verifica, sotto la propria responsabilità e se necessario con il
                proprio consulente, che l&apos;emissione da parte dei
                Collaboratori con le proprie credenziali sia conforme alla
                normativa fiscale applicabile alla sua attività. ScontrinoZero
                non fornisce consulenza fiscale (art. 6 dei Termini);
              </li>
              <li>
                rimuove l&apos;accesso di chi smette di operare per
                l&apos;attività;
              </li>
              <li>
                risponde verso ScontrinoZero e verso i terzi dell&apos;operato
                dei Collaboratori come del proprio, compresi i documenti emessi,
                annullati o resi;
              </li>
              <li>
                rispetta gli obblighi indicati agli articoli 6 e 7 verso i
                Collaboratori.
              </li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-semibold">
              5. Obblighi del Collaboratore
            </h2>
            <p className={sectionClass}>Il Collaboratore:</p>
            <ul className={listClass}>
              <li>
                usa l&apos;accesso solo per l&apos;attività che lo ha invitato e
                secondo le istruzioni del Titolare;
              </li>
              <li>
                non condivide le proprie credenziali di accesso (art. 4 dei
                Termini);
              </li>
              <li>
                segnala al Titolare e a ScontrinoZero eventuali accessi non
                autorizzati.
              </li>
            </ul>
            <p className={sectionClass}>
              L&apos;accesso del Collaboratore dipende dall&apos;attività: se il
              Titolare lo rimuove o cancella il proprio account, l&apos;account
              del Collaboratore viene cancellato; se il piano dell&apos;attività
              smette di includere i Collaboratori, il Collaboratore può solo
              consultare i propri documenti finché il Titolare non ripristina un
              piano che li include.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold">
              6. Controllo a distanza dei lavoratori
            </h2>
            <p className={sectionClass}>
              La funzione permette al Titolare di sapere quali documenti ha
              emesso, annullato o reso ciascun Collaboratore e quando ha avuto
              accesso l&apos;ultima volta. Se i Collaboratori sono lavoratori
              dell&apos;attività, il Titolare è il solo responsabile del
              rispetto dell&apos;art. 4 della Legge 20 maggio 1970, n. 300
              (Statuto dei lavoratori). In particolare:
            </p>
            <ul className={listClass}>
              <li>
                valuta, se necessario con il proprio consulente del lavoro, se
                per la sua organizzazione servano l&apos;accordo sindacale o
                l&apos;autorizzazione dell&apos;Ispettorato previsti dal comma
                1;
              </li>
              <li>
                informa i Collaboratori, prima dell&apos;invito, delle
                informazioni che la funzione registra e di come può usarle, come
                richiesto dal comma 3;
              </li>
              <li>
                usa queste informazioni solo per le finalità consentite dalla
                legge.
              </li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-semibold">
              7. Trattamento dei dati dei Collaboratori (art. 28 GDPR)
            </h2>
            <p className={sectionClass}>
              Per i dati personali dei Collaboratori trattati nell&apos;uso
              della funzione (nome, email, documenti emessi, annullati o resi,
              data dell&apos;ultimo accesso) il Titolare è titolare del
              trattamento e ScontrinoZero, nella persona del gestore indicato
              nella{" "}
              <Link href="/privacy" className="text-primary underline">
                Privacy Policy
              </Link>
              , è responsabile del trattamento ai sensi dell&apos;art. 28 del
              Regolamento UE 2016/679 (GDPR). Accettando queste Condizioni il
              Titolare nomina ScontrinoZero responsabile del trattamento alle
              condizioni che seguono.
            </p>
            <p className={sectionClass}>ScontrinoZero:</p>
            <ul className={listClass}>
              <li>
                tratta i dati solo per erogare il servizio, su istruzione
                documentata del Titolare: le istruzioni sono le funzioni del
                servizio usate dal Titolare e queste Condizioni;
              </li>
              <li>
                garantisce che le persone autorizzate a trattare i dati siano
                tenute alla riservatezza;
              </li>
              <li>
                adotta le misure di sicurezza descritte nella Privacy Policy, ai
                sensi dell&apos;art. 32 GDPR;
              </li>
              <li>
                si avvale dei sub-responsabili elencati nella Privacy Policy,
                vincolati agli stessi obblighi: il Titolare ne autorizza
                l&apos;impiego in via generale e viene informato dei
                cambiamenti, contro i quali può opporsi;
              </li>
              <li>
                assiste il Titolare nel dare seguito alle richieste dei
                Collaboratori che esercitano i propri diritti e negli obblighi
                degli articoli da 32 a 36 GDPR;
              </li>
              <li>
                comunica al Titolare senza ingiustificato ritardo le violazioni
                dei dati personali di cui viene a conoscenza;
              </li>
              <li>
                alla cancellazione dell&apos;account di un Collaboratore o del
                Titolare cancella i dati secondo la Privacy Policy, salvo gli
                obblighi di conservazione previsti dalla legge;
              </li>
              <li>
                mette a disposizione del Titolare le informazioni necessarie a
                dimostrare il rispetto di questo articolo e consente verifiche
                ragionevoli, con preavviso.
              </li>
            </ul>
            <p className={sectionClass}>
              Restano trattamenti di ScontrinoZero, come titolare autonomo,
              quelli necessari a gestire l&apos;account del Collaboratore e la
              sicurezza del servizio (autenticazione, prevenzione degli abusi,
              log tecnici), descritti nella Privacy Policy. Il Titolare fornisce
              ai Collaboratori l&apos;informativa prevista dall&apos;art. 13
              GDPR per i trattamenti di cui è titolare.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold">
              8. Documenti dopo la rimozione
            </h2>
            <p className={sectionClass}>
              Alla rimozione di un Collaboratore ScontrinoZero cancella il suo
              account e la sua email. I documenti commerciali che ha emesso
              appartengono all&apos;attività: restano nello storico del
              Titolare, attribuiti al nome con cui il Collaboratore si era
              registrato.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold">9. Modifiche</h2>
            <p className={sectionClass}>
              Il testo di questa versione (v01) resta disponibile
              all&apos;indirizzo{" "}
              <Link
                href="/condizioni-collaboratori/v01"
                className="text-primary underline"
              >
                /condizioni-collaboratori/v01
              </Link>
              . Una nuova versione ha un indirizzo proprio e il Titolare la
              accetta prima di inviare altri inviti.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold">10. Contatti</h2>
            <p className={sectionClass}>
              Per domande su queste Condizioni scrivi a{" "}
              <a
                href={`mailto:${CONTACT_EMAIL}`}
                className="text-primary underline"
              >
                {CONTACT_EMAIL}
              </a>
              {"."}
            </p>
          </section>
        </div>
      </article>
    </section>
  );
}
