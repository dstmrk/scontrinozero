import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";

export const metadata: Metadata = {
  title: "Termini di Servizio",
  description: "Termini e condizioni di utilizzo del servizio ScontrinoZero.",
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
          Termini di Servizio
        </h1>
        <p className="text-muted-foreground mt-2 text-sm">
          Ultimo aggiornamento: febbraio 2026
        </p>

        <div className="mt-10 space-y-8 text-sm leading-relaxed">
          <section>
            <h2 className="text-lg font-semibold">
              1. Descrizione del servizio
            </h2>
            <p className="text-muted-foreground mt-2">
              ScontrinoZero è un registratore di cassa virtuale (SaaS) che
              consente a esercenti e micro-attività di emettere scontrini
              elettronici e trasmettere i corrispettivi all&apos;Agenzia delle
              Entrate senza registratore telematico fisico, sfruttando la
              procedura &quot;Documento Commerciale Online&quot; messa a
              disposizione dall&apos;AdE.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold">
              2. Requisiti per l&apos;utilizzo
            </h2>
            <ul className="text-muted-foreground mt-2 list-inside list-disc space-y-1">
              <li>Essere titolari di una partita IVA attiva in Italia.</li>
              <li>
                Disporre di credenziali Fisconline valide, rilasciate
                dall&apos;Agenzia delle Entrate.
              </li>
              <li>
                Avere un dispositivo con connessione internet e un browser
                moderno.
              </li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-semibold">
              3. Responsabilità dell&apos;utente
            </h2>
            <p className="text-muted-foreground mt-2">
              L&apos;utente è responsabile di:
            </p>
            <ul className="text-muted-foreground mt-2 list-inside list-disc space-y-1">
              <li>
                La correttezza dei dati fiscali inseriti (importi, aliquote IVA,
                dati dell&apos;attività).
              </li>
              <li>
                La custodia delle proprie credenziali di accesso al servizio.
              </li>
              <li>
                La custodia delle proprie credenziali Fisconline fornite al
                servizio.
              </li>
              <li>
                La conformità dell&apos;utilizzo del servizio alla normativa
                fiscale italiana vigente.
              </li>
              <li>La veridicità dei dati forniti in fase di registrazione.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-semibold">
              4. Limitazioni di responsabilità
            </h2>
            <p className="text-muted-foreground mt-2">
              ScontrinoZero opera come intermediario tecnico per la trasmissione
              dei corrispettivi. Il titolare del servizio non è responsabile
              per:
            </p>
            <ul className="text-muted-foreground mt-2 list-inside list-disc space-y-1">
              <li>
                Indisponibilità, malfunzionamenti o modifiche del portale
                dell&apos;Agenzia delle Entrate.
              </li>
              <li>
                Errori derivanti da dati fiscali errati inseriti
                dall&apos;utente.
              </li>
              <li>
                Conseguenze fiscali o legali derivanti dall&apos;utilizzo
                improprio del servizio.
              </li>
              <li>
                Interruzioni del servizio dovute a manutenzione programmata o
                cause di forza maggiore.
              </li>
            </ul>
            <p className="text-muted-foreground mt-2">
              Il servizio viene fornito &quot;così com&apos;è&quot; (as is).
              L&apos;utente è invitato a verificare sempre l&apos;esito della
              trasmissione sul portale dell&apos;Agenzia delle Entrate.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold">
              5. Proprietà intellettuale e licenza
            </h2>
            <p className="text-muted-foreground mt-2">
              ScontrinoZero è un software open source distribuito con licenza
              O&apos;Saasy. Questa licenza permette a chiunque di scaricare,
              installare e utilizzare il software sul proprio server
              gratuitamente. È vietato utilizzare il codice sorgente per offrire
              un servizio SaaS concorrente. Per i dettagli completi della
              licenza, consultare il file LICENSE nel{" "}
              <a
                href="https://github.com/dstmrk/scontrinozero"
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary underline"
              >
                repository GitHub
              </a>
              .
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold">6. Periodo beta</h2>
            <p className="text-muted-foreground mt-2">
              Durante il periodo di beta, l&apos;accesso al servizio è gratuito
              per tutti gli utenti iscritti. Durante questa fase:
            </p>
            <ul className="text-muted-foreground mt-2 list-inside list-disc space-y-1">
              <li>
                Il servizio è fornito senza garanzia di uptime o continuità.
              </li>
              <li>Le funzionalità possono cambiare senza preavviso.</li>
              <li>Non è previsto supporto tecnico dedicato.</li>
              <li>
                Al termine della beta, sarà possibile scegliere un piano a
                pagamento o continuare con il piano gratuito.
              </li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-semibold">7. Modifica dei termini</h2>
            <p className="text-muted-foreground mt-2">
              Il titolare si riserva il diritto di modificare i presenti termini
              in qualsiasi momento. Le modifiche saranno comunicate tramite
              email o tramite avviso nel servizio. L&apos;utilizzo continuativo
              del servizio dopo la notifica delle modifiche costituisce
              accettazione dei nuovi termini.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold">
              8. Legge applicabile e foro competente
            </h2>
            <p className="text-muted-foreground mt-2">
              I presenti termini sono regolati dalla legge italiana. Per
              qualsiasi controversia derivante dall&apos;utilizzo del servizio
              sarà competente il Foro del luogo di residenza o domicilio del
              consumatore, ai sensi dell&apos;art. 33 del Codice del Consumo
              (D.Lgs. 206/2005).
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold">9. Contatti</h2>
            <p className="text-muted-foreground mt-2">
              Per qualsiasi domanda relativa ai presenti termini di servizio,
              scrivi a{" "}
              <a
                href="mailto:info@scontrinozero.it"
                className="text-primary underline"
              >
                info@scontrinozero.it
              </a>
              .
            </p>
          </section>
        </div>
      </article>
    </section>
  );
}
