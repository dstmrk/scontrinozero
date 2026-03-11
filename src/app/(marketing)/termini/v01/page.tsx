import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";

export const metadata: Metadata = {
  title: "Termini e Condizioni — v01",
  description:
    "Termini e condizioni del servizio ScontrinoZero per accesso, utilizzo, responsabilità, piani, sospensione e recesso. Versione v01.",
};

export default function TerminiV01Page() {
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
          Versione v01 — marzo 2026
        </p>

        <div className="mt-10 space-y-8 text-sm leading-relaxed">
          <section>
            <h2 className="text-lg font-semibold">1. Oggetto del servizio</h2>
            <p className="text-muted-foreground mt-2">
              ScontrinoZero è una piattaforma software (SaaS) che automatizza la
              compilazione e la trasmissione del documento commerciale tramite
              la procedura &quot;Documento Commerciale Online&quot; resa
              disponibile dall&apos;Agenzia delle Entrate sul portale Fatture e
              Corrispettivi.
            </p>
            <p className="text-muted-foreground mt-2">
              ScontrinoZero opera come <strong>velocizzatore tecnico</strong> ai
              sensi dell&apos;Interpello AdE n. 956-1523/2020: replica via
              chiamate HTTP dirette il flusso che l&apos;utente compirebbe
              manualmente sul portale AdE, senza alcun accordo o
              convenzionamento formale con l&apos;Agenzia delle Entrate.
              L&apos;Agenzia delle Entrate può in qualsiasi momento modificare o
              interrompere le proprie procedure telematiche senza preavviso
              verso terzi.
            </p>
            <p className="text-muted-foreground mt-2">
              Il servizio è erogato in modalità cloud (SaaS) e, ove previsto
              dalla licenza, anche in modalità self-hosted.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold">
              2. Ambito di applicazione e accettazione
            </h2>
            <p className="text-muted-foreground mt-2">
              I presenti Termini regolano l&apos;accesso e l&apos;utilizzo del
              servizio. Il servizio è destinato esclusivamente a{" "}
              <strong>utenti professionali</strong> (esercenti, imprenditori,
              professionisti con Partita IVA) che lo utilizzano
              nell&apos;esercizio della propria attività commerciale o
              professionale. Non è destinato a consumatori che agiscono fuori
              dall&apos;attività professionale.
            </p>
            <p className="text-muted-foreground mt-2">
              L&apos;utilizzo della piattaforma, inclusa la registrazione,
              comporta l&apos;accettazione integrale dei presenti Termini.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold">3. Requisiti di accesso</h2>
            <ul className="text-muted-foreground mt-2 list-inside list-disc space-y-1">
              <li>Maggiore età e piena capacità di agire.</li>
              <li>
                Possesso dei requisiti fiscali e amministrativi richiesti dalla
                normativa italiana per l&apos;attività svolta.
              </li>
              <li>
                Disponibilità di credenziali valide per l&apos;accesso al
                portale Fatture e Corrispettivi dell&apos;Agenzia delle Entrate
                (Fisconline o SPID).
              </li>
              <li>Connessione internet idonea e dispositivi compatibili.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-semibold">4. Account e sicurezza</h2>
            <p className="text-muted-foreground mt-2">
              L&apos;utente è responsabile della correttezza dei dati forniti in
              fase di registrazione e della custodia delle proprie credenziali
              di accesso a ScontrinoZero. È vietato condividere l&apos;account o
              consentire accessi non autorizzati.
            </p>
            <p className="text-muted-foreground mt-2">
              L&apos;utente si impegna a comunicare tempestivamente eventuali
              accessi non autorizzati o violazioni di sicurezza scrivendo a{" "}
              <a
                href="mailto:info@scontrinozero.it"
                className="text-primary underline"
              >
                info@scontrinozero.it
              </a>
              {"."}
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold">
              5. Credenziali Fisconline / SPID
            </h2>
            <p className="text-muted-foreground mt-2">
              Per abilitare la trasmissione automatizzata, l&apos;utente
              fornisce volontariamente le proprie credenziali di accesso al
              portale AdE (Fisconline o token SPID temporaneo). Tali credenziali
              sono:
            </p>
            <ul className="text-muted-foreground mt-2 list-inside list-disc space-y-1">
              <li>
                cifrate a riposo con AES-256-GCM prima di essere archiviate;
              </li>
              <li>
                utilizzate esclusivamente per le operazioni telematiche
                richieste dall&apos;utente (emissione scontrino, annullo);
              </li>
              <li>mai cedute, vendute o condivise con terzi.</li>
            </ul>
            <p className="text-muted-foreground mt-2">
              L&apos;utente è e rimane il{" "}
              <strong>
                solo titolare e responsabile dell&apos;utilizzo delle proprie
                credenziali AdE
              </strong>
              {". "}ScontrinoZero agisce come mero esecutore tecnico delle
              istruzioni impartite dall&apos;utente. Qualsiasi trasmissione
              effettuata tramite le credenziali dell&apos;utente è da
              considerarsi compiuta dall&apos;utente stesso.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold">
              6. Obblighi dell&apos;utente
            </h2>
            <ul className="text-muted-foreground mt-2 list-inside list-disc space-y-1">
              <li>
                Inserire dati veritieri, completi e aggiornati, inclusi quelli
                fiscali e anagrafici.
              </li>
              <li>
                Verificare la correttezza di ogni operazione prima della
                conferma/invio e controllare l&apos;esito della trasmissione
                direttamente sul portale Fatture e Corrispettivi AdE.
              </li>
              <li>
                Conservare copia dei documenti commerciali emessi e tutta la
                documentazione prevista dagli obblighi di legge,
                indipendentemente da quanto archiviato da ScontrinoZero.
              </li>
              <li>
                Utilizzare il servizio nel rispetto della normativa fiscale,
                commerciale e di ogni altra legge applicabile.
              </li>
              <li>
                Non utilizzare il servizio per finalità illecite, fraudolente o
                contrarie all&apos;ordine pubblico.
              </li>
            </ul>
            <p className="text-muted-foreground mt-3">
              <strong>Nessuna consulenza fiscale:</strong> il supporto
              ScontrinoZero fornisce esclusivamente assistenza tecnica
              sull&apos;utilizzo della piattaforma. Per qualsiasi valutazione di
              natura fiscale, tributaria o normativa l&apos;utente deve
              rivolgersi a un commercialista o consulente fiscale abilitato.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold">
              7. Documenti commerciali: natura e validità fiscale
            </h2>
            <p className="text-muted-foreground mt-2">
              I documenti commerciali archiviati su ScontrinoZero costituiscono{" "}
              <strong>copie di cortesia</strong> a uso operativo
              dell&apos;utente. Il documento fiscalmente valido e la prova
              legale della trasmissione risiedono esclusivamente nel portale
              Fatture e Corrispettivi dell&apos;Agenzia delle Entrate.
            </p>
            <p className="text-muted-foreground mt-2">
              ScontrinoZero non sostituisce e non si sostituisce al portale AdE
              come archivio fiscale ufficiale. L&apos;utente è tenuto a
              verificare gli esiti di ogni trasmissione direttamente sul portale
              AdE e a conservare autonomamente la documentazione secondo gli
              obblighi di legge.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold">
              8. Limitazioni del servizio
            </h2>
            <p className="text-muted-foreground mt-2">
              Il servizio dipende da infrastrutture e sistemi terzi, tra cui:
            </p>
            <ul className="text-muted-foreground mt-2 list-inside list-disc space-y-1">
              <li>
                il portale Fatture e Corrispettivi dell&apos;Agenzia delle
                Entrate, che può diventare indisponibile, modificare le proprie
                procedure o bloccare l&apos;accesso automatizzato in qualsiasi
                momento e senza preavviso;
              </li>
              <li>
                infrastrutture cloud, reti di trasmissione dati e altri
                fornitori tecnici;
              </li>
              <li>dispositivi, connessioni e software dell&apos;utente.</li>
            </ul>
            <p className="text-muted-foreground mt-2">
              Non garantiamo continuità ininterrotta del servizio né assenza di
              errori. Ci impegniamo a ripristinare il servizio nel più breve
              tempo ragionevole in caso di interruzioni dipendenti da noi.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold">
              9. Esclusioni e limitazione di responsabilità
            </h2>
            <p className="text-muted-foreground mt-2">
              Nei limiti consentiti dalla legge applicabile, ScontrinoZero non è
              responsabile per:
            </p>
            <ul className="text-muted-foreground mt-2 list-inside list-disc space-y-1">
              <li>
                danni indiretti, perdita di profitti o mancati guadagni, fermo
                attività, perdita di dati, sanzioni fiscali o amministrative;
              </li>
              <li>
                errori, omissioni o dati inesatti inseriti dall&apos;utente;
              </li>
              <li>
                mancata o errata trasmissione imputabile a indisponibilità,
                modifica o blocco del portale AdE;
              </li>
              <li>
                malfunzionamenti di reti, linee telefoniche, infrastrutture
                elettriche o sistemi terzi fuori dal nostro controllo;
              </li>
              <li>
                accessi non autorizzati conseguenti a negligenza
                dell&apos;utente nella custodia delle credenziali;
              </li>
              <li>uso del servizio non conforme ai presenti Termini.</li>
            </ul>
            <p className="text-muted-foreground mt-2">
              In ogni caso, la responsabilità complessiva di ScontrinoZero verso
              l&apos;utente per qualsiasi causa non potrà eccedere{" "}
              <strong>
                l&apos;importo dei corrispettivi effettivamente pagati
                dall&apos;utente nei 12 mesi precedenti l&apos;evento che ha
                generato il danno
              </strong>
              {"."}
            </p>
            <p className="text-muted-foreground mt-2">
              Resta esclusivamente in capo all&apos;utente la responsabilità di
              verificare gli esiti delle operazioni, la correttezza fiscale dei
              documenti emessi e il rispetto degli obblighi di legge.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold">
              10. Trial, piani e pagamenti
            </h2>
            <p className="text-muted-foreground mt-2">
              <strong>Trial gratuito:</strong> i nuovi utenti possono utilizzare
              il servizio gratuitamente per 30 giorni senza fornire dati di
              pagamento. Al termine del periodo di prova, per continuare a
              emettere documenti è necessario attivare un piano a pagamento. In
              assenza di sottoscrizione, l&apos;account passa automaticamente in{" "}
              <em>sola lettura</em>: i dati rimangono accessibili ma non è
              possibile effettuare nuove trasmissioni.
            </p>
            <p className="text-muted-foreground mt-2">
              <strong>Anti-abuso:</strong> ciascuna Partita IVA può fruire del
              trial gratuito una sola volta. La creazione di account multipli
              con la stessa Partita IVA al solo scopo di ottenere ulteriori
              periodi di prova è vietata e può comportare la sospensione di
              tutti gli account coinvolti.
            </p>
            <p className="text-muted-foreground mt-2">
              <strong>Piani a pagamento:</strong> i corrispettivi, le
              funzionalità incluse e i limiti di ciascun piano sono descritti
              nella{" "}
              <Link href="/prezzi" className="text-primary underline">
                pagina Prezzi
              </Link>
              . I pagamenti sono gestiti da Stripe Inc., che tratta i dati di
              pagamento in modo sicuro; ScontrinoZero non archivia dati di carte
              di credito.
            </p>
            <p className="text-muted-foreground mt-2">
              <strong>Rinnovo automatico:</strong> i piani mensili e annuali si
              rinnovano automaticamente alla scadenza. L&apos;utente può disdire
              in qualsiasi momento dall&apos;area abbonamento; la disdetta ha
              effetto alla fine del periodo già pagato.
            </p>
            <p className="text-muted-foreground mt-2">
              <strong>Rimborsi:</strong> salvo diversa disposizione di legge o
              nostra comunicazione scritta, i corrispettivi già pagati non sono
              rimborsabili. In caso di cessazione del servizio da parte nostra
              prima della naturale scadenza del piano, sarà riconosciuto un
              rimborso proporzionale al periodo non fruito.
            </p>
            <p className="text-muted-foreground mt-2">
              <strong>Mancato pagamento:</strong> in caso di mancato addebito
              alla scadenza, l&apos;account viene sospeso; dopo un ulteriore
              periodo di grazia, il contratto si risolve automaticamente.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold">
              11. Sospensione e cessazione del servizio
            </h2>
            <p className="text-muted-foreground mt-2">
              Possiamo sospendere o limitare l&apos;accesso in caso di:
              violazioni dei Termini, attività illecite, rischi per la
              sicurezza, mancato pagamento o istruzioni di autorità competenti.
              Ove possibile, daremo preavviso via email prima di procedere.
            </p>
            <p className="text-muted-foreground mt-2">
              In caso di sospensione o cessazione definitiva del servizio da
              parte nostra, i dati dell&apos;utente resteranno disponibili per
              almeno <strong>30 giorni</strong>, durante i quali l&apos;utente
              potrà esportarli tramite la funzione &quot;Esporta dati&quot;
              presente nelle Impostazioni.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold">
              12. Recesso e cancellazione account
            </h2>
            <p className="text-muted-foreground mt-2">
              L&apos;utente può cancellare il proprio account in qualsiasi
              momento dalla sezione Impostazioni. Prima della cancellazione è
              consigliato esportare i propri dati tramite la funzione
              &quot;Esporta dati&quot; (GDPR art. 20).
            </p>
            <p className="text-muted-foreground mt-2">
              La cancellazione dell&apos;account comporta la rimozione dei dati
              personali secondo quanto descritto nella{" "}
              <Link href="/privacy" className="text-primary underline">
                Privacy Policy
              </Link>
              . La cancellazione non esonera dall&apos;adempimento di obblighi
              fiscali e di conservazione documentale già maturati prima della
              cessazione.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold">
              13. Proprietà intellettuale
            </h2>
            <p className="text-muted-foreground mt-2">
              Marchi, contenuti, interfacce e componenti della piattaforma sono
              protetti dalla normativa in materia di proprietà intellettuale.
              Restano salvi i diritti previsti dalle licenze open source
              applicate a parti del progetto (O&apos;Saasy License).
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold">
              14. Protezione dei dati personali
            </h2>
            <p className="text-muted-foreground mt-2">
              Il trattamento dei dati personali è descritto nella{" "}
              <Link href="/privacy" className="text-primary underline">
                Privacy Policy
              </Link>
              . Per cookie e strumenti analoghi consulta la{" "}
              <Link href="/cookie-policy" className="text-primary underline">
                Cookie Policy
              </Link>
              .
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold">15. Modifiche ai Termini</h2>
            <p className="text-muted-foreground mt-2">
              Ci riserviamo il diritto di aggiornare i presenti Termini per
              ragioni normative, tecniche o commerciali. Le modifiche
              sostanziali saranno comunicate via email con almeno 15 giorni di
              anticipo. La versione aggiornata sarà accessibile su questa
              pagina. Il proseguimento dell&apos;utilizzo del servizio dopo la
              data di entrata in vigore delle modifiche costituisce
              accettazione.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold">
              16. Legge applicabile e foro competente
            </h2>
            <p className="text-muted-foreground mt-2">
              I presenti Termini sono regolati dalla legge italiana. Per le
              controversie tra professionisti (B2B) è competente in via
              esclusiva il Foro di <strong>Torino</strong>, salvo diverso
              accordo scritto. Per gli utenti consumatori (ove applicabile) è
              competente il foro del luogo di residenza o domicilio del
              consumatore ai sensi del D.Lgs. 206/2005.
            </p>
            <p className="text-muted-foreground mt-2">
              Per la risoluzione extragiudiziale delle controversie, i
              consumatori possono accedere alla piattaforma europea ODR:{" "}
              <a
                href="https://ec.europa.eu/consumers/odr"
                className="text-primary underline"
                target="_blank"
                rel="noopener noreferrer"
              >
                ec.europa.eu/consumers/odr
              </a>
              {"."}
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold">17. Contatti</h2>
            <p className="text-muted-foreground mt-2">
              Per informazioni o reclami relativi ai presenti Termini scrivi a{" "}
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
