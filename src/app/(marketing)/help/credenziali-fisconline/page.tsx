import { Badge } from "@/components/ui/badge";
import {
  JsonLd,
  helpArticleBreadcrumb,
  helpArticleBreadcrumbItems,
} from "@/components/json-ld";
import { Breadcrumbs } from "@/components/marketing/breadcrumbs";
import { helpArticleMetadata } from "@/lib/help/metadata";
import { HelpArticleJsonLd } from "@/components/help/article-json-ld";
import { HelpArticleUpdatedAt } from "@/components/help/article-updated-at";
import { RelatedHelpArticles } from "@/components/help/related-articles";
import { AppScreenshot } from "@/components/marketing/app-screenshot";

export const metadata = helpArticleMetadata("credenziali-fisconline");

export default function CredenzialiPage() {
  return (
    <section className="px-4 py-16">
      <JsonLd
        data={helpArticleBreadcrumb(
          "credenziali-fisconline",
          "Credenziali Fisconline",
        )}
      />
      <HelpArticleJsonLd slug="credenziali-fisconline" />
      <article className="mx-auto max-w-3xl">
        <Breadcrumbs
          items={helpArticleBreadcrumbItems(
            "credenziali-fisconline",
            "Credenziali Fisconline",
          )}
        />

        {/* ─── Intestazione ─── */}
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-3xl font-extrabold tracking-tight">
            Credenziali Fisconline: dove trovarle e come verificarle
          </h1>
          <Badge variant="secondary">Fiscalizzazione</Badge>
        </div>
        <p className="text-muted-foreground mt-3 text-sm leading-relaxed">
          Per collegare ScontrinoZero all&apos;Agenzia delle Entrate puoi usare
          le credenziali <strong>Fisconline</strong> del titolare
          dell&apos;attività oppure, in alternativa, la CIE. Questa guida spiega
          cosa sono le credenziali Fisconline, chi può ottenerle e come
          verificare che funzionino.
        </p>
        <HelpArticleUpdatedAt slug="credenziali-fisconline" />
        <figure className="mt-6">
          <AppScreenshot
            src="/screenshots/impostazioni-attivita.png"
            alt="Schermata Impostazioni con lo stato delle credenziali AdE"
            width={900}
            height={1860}
            sizes="(min-width: 768px) 240px, 65vw"
            className="mx-auto max-w-[240px]"
          />
          <figcaption className="text-muted-foreground mt-2 text-center text-xs">
            In Impostazioni inserisci le credenziali Fisconline e ne controlli
            lo stato.
          </figcaption>
        </figure>

        {/* ─── Cos'è Fisconline ─── */}
        <h2 className="mt-10 text-xl font-semibold">Cos&apos;è Fisconline?</h2>
        <p className="text-muted-foreground mt-3 text-sm leading-relaxed">
          Fisconline è il sistema di credenziali storico dell&apos;Agenzia delle
          Entrate che permette di accedere ai servizi telematici, incluso il
          portale <strong>Fatture e Corrispettivi</strong> dove vengono
          trasmessi i documenti commerciali elettronici (scontrini).
        </p>
        <p className="text-muted-foreground mt-3 text-sm leading-relaxed">
          {
            "Dal 1° marzo 2021 (DL 76/2020 — “decreto Semplificazioni”) l'Agenzia non rilascia più credenziali Fisconline ai privati cittadini: questi accedono al portale AdE con "
          }
          <strong>SPID, CIE o CNS</strong>
          {
            ". Fisconline resta disponibile per imprese e professionisti titolari di partita IVA e per chi è autorizzato a operare per conto di società o enti — ed è uno dei due canali con cui ScontrinoZero si collega all'Agenzia: l'altro è la CIE."
          }
        </p>
        <p className="text-muted-foreground mt-3 text-sm leading-relaxed">
          Le credenziali Fisconline sono composte da{" "}
          <strong>tre elementi</strong>:
        </p>
        <ul className="text-muted-foreground mt-2 list-disc space-y-1 pl-5 text-sm leading-relaxed">
          <li>
            <strong>Codice fiscale</strong> — il codice fiscale personale (16
            caratteri) di chi accede: il titolare, il legale rappresentante o la
            persona incaricata di operare per la società.
          </li>
          <li>
            <strong>Password</strong> — scelta dall&apos;utente al primo
            accesso, scade ogni <strong>90 giorni</strong> e va rinnovata.
          </li>
          <li>
            <strong>PIN</strong> — codice di <strong>10 cifre</strong> assegnato
            dall&apos;Agenzia delle Entrate. Non scade e non può essere scelto.
          </li>
        </ul>
        <p className="text-muted-foreground mt-3 text-sm leading-relaxed">
          In ScontrinoZero vanno inseriti <strong>tutti e tre</strong> i valori
          {" in "}
          <strong>Impostazioni → Credenziali AdE</strong>
          {"."}
        </p>

        {/* ─── Come ottenere le credenziali ─── */}
        <h2 className="mt-10 text-xl font-semibold">
          Come ottenere le credenziali Fisconline
        </h2>
        <p className="text-muted-foreground mt-3 text-sm leading-relaxed">
          Le credenziali possono essere richieste solo se hai una{" "}
          <strong>partita IVA attiva</strong> o se sei già autorizzato a operare
          per conto di una società/ente/professionista. Hai due strade:
        </p>

        <h3 className="mt-6 text-base font-semibold">
          Opzione A — Online (dal sito AdE)
        </h3>
        <ol className="text-muted-foreground mt-2 list-decimal space-y-1 pl-5 text-sm leading-relaxed">
          <li>
            {"Vai su "}
            <strong>agenziaentrate.gov.it</strong>
            {", apri l'area riservata, scegli la scheda "}
            <strong>Credenziali</strong>
            {" e poi "}
            <strong>Non sei ancora registrato?</strong>
            {" → Registrazione a Fisconline → Richiesta del PIN."}
          </li>
          <li>
            {
              "Compila il modulo con i dati richiesti, fra cui alcuni dati dell'ultima dichiarazione dei redditi."
            }
          </li>
          <li>{"Il sistema mostra subito le prime 4 cifre del PIN."}</li>
          <li>
            {
              "Le restanti 6 cifre del PIN e la password per il primo accesso arrivano per posta al tuo domicilio fiscale entro "
            }
            <strong>15 giorni</strong>
            {"."}
          </li>
          <li>
            {
              "Al primo accesso al portale telematico ti verrà chiesto di scegliere una "
            }
            <strong>password personale</strong>
            {" (sostituendo quella di primo accesso)."}
          </li>
        </ol>

        <h3 className="mt-6 text-base font-semibold">
          Opzione B — Ufficio dell&apos;Agenzia delle Entrate
        </h3>
        <p className="text-muted-foreground mt-2 text-sm leading-relaxed">
          Presentandoti di persona a un ufficio territoriale dell&apos;AdE con
          un documento d&apos;identità, ricevi subito la prima parte del PIN e
          la password iniziale. La seconda parte del PIN la prelevi poi dal sito
          dell&apos;Agenzia: area riservata → scheda Credenziali →{" "}
          <em>Non sei ancora registrato?</em> → Registrazione a Fisconline →{" "}
          <em>Per coloro che hanno richiesto il PIN a un Ufficio</em>.
        </p>
        <p className="text-muted-foreground mt-2 text-sm leading-relaxed">
          Per una società le credenziali Fisconline sono personali: le usa il
          legale rappresentante oppure una persona che lui nomina{" "}
          <strong>gestore incaricato</strong> dall&apos;area riservata AdE
          (Profilo utente → Incarichi). Chi è incaricato accede con codice
          fiscale, password e PIN propri e poi opera per conto della società.
        </p>

        {/* ─── Password + PIN ─── */}
        <h2 className="mt-10 text-xl font-semibold">
          Password e PIN: come funzionano
        </h2>
        <div className="mt-3 space-y-3">
          <div className="bg-muted/50 rounded-md p-4 text-sm">
            <p className="font-medium">PIN (10 cifre)</p>
            <p className="text-muted-foreground mt-1 leading-relaxed">
              {
                "Assegnato dall'Agenzia: con la richiesta online le prime 4 cifre compaiono subito a video e le ultime 6 arrivano per posta entro 15 giorni; allo sportello ricevi subito la prima parte e prelevi la seconda dal sito dell'Agenzia. Il PIN è fisso, "
              }
              <strong>non scade</strong>
              {
                " e non si cambia. Finché non hai anche la seconda parte il PIN è incompleto e non funziona con ScontrinoZero."
              }
            </p>
          </div>
          <div className="bg-muted/50 rounded-md p-4 text-sm">
            <p className="font-medium">Password</p>
            <p className="text-muted-foreground mt-1 leading-relaxed">
              {"Scelta da te al primo accesso. Scade ogni "}
              <strong>90 giorni</strong>
              {
                " per motivi di sicurezza: quando scade, il portale AdE ti chiede di rinnovarla al successivo login. Dopo il rinnovo ricordati di aggiornarla anche in ScontrinoZero, altrimenti la trasmissione degli scontrini fallirà."
              }
            </p>
          </div>
        </div>

        {/* ─── Come verificare le credenziali ─── */}
        <h2 className="mt-10 text-xl font-semibold">
          Come verificare che le credenziali funzionino
        </h2>
        <p className="text-muted-foreground mt-3 text-sm leading-relaxed">
          Prima di inserirle in ScontrinoZero puoi provarle direttamente sul
          portale AdE:
        </p>
        <ol className="text-muted-foreground mt-3 list-decimal space-y-1 pl-5 text-sm leading-relaxed">
          <li>
            {"Vai su "}
            <strong>agenziaentrate.gov.it</strong>
            {" e seleziona "}
            <strong>Area riservata → Accedi</strong>
            {"."}
          </li>
          <li>
            Scegli <strong>Fisconline</strong> come metodo di accesso.
          </li>
          <li>
            Inserisci codice fiscale, password e PIN. Se accedi correttamente,
            le credenziali sono valide.
          </li>
          <li>
            Torna su ScontrinoZero, apri{" "}
            <strong>Impostazioni → Credenziali AdE</strong> e inseriscile: il
            collegamento dovrebbe riuscire al primo tentativo.
          </li>
        </ol>

        {/* ─── Password scaduta ─── */}
        <h2 className="mt-10 text-xl font-semibold">
          Cosa fare se la password è scaduta
        </h2>
        <p className="text-muted-foreground mt-3 text-sm leading-relaxed">
          La password Fisconline scade ogni 90 giorni. Se è scaduta:
        </p>
        <ol className="text-muted-foreground mt-3 list-decimal space-y-1 pl-5 text-sm leading-relaxed">
          <li>
            {
              "Accedi al portale AdE con codice fiscale, vecchia password e PIN: il sistema ti chiede automaticamente di impostarne una nuova."
            }
          </li>
          <li>
            Scegli una password conforme ai requisiti dell&apos;Agenzia
            (lunghezza minima, lettere e numeri) e confermala.
          </li>
          <li>
            {"Aggiorna la nuova password in ScontrinoZero ("}
            <strong>Impostazioni → Credenziali AdE</strong>
            {"): il codice fiscale e il PIN restano invariati."}
          </li>
        </ol>
        <p className="text-muted-foreground mt-3 text-sm leading-relaxed">
          {"Se non riesci ad accedere nemmeno per cambiarla, usa la procedura "}
          <strong>Ripristina password</strong>
          {" sul portale AdE o contatta il numero verde "}
          <strong>800 90 96 96</strong>
          {" (gratuito da telefono fisso, lun–ven 9–17)."}
        </p>
        <p className="text-muted-foreground mt-3 text-sm leading-relaxed">
          {
            "Con i collaboratori la password scaduta ferma anche loro: ScontrinoZero ti avvisa per email, e loro vedono un messaggio che chiede di avvisarti. "
          }
          <a
            href="/help/collaboratori#password"
            className="text-primary hover:underline"
          >
            Cosa succede con un team
          </a>
        </p>

        {/* ─── Domande frequenti ─── */}
        <h2 className="mt-10 text-xl font-semibold">Domande frequenti</h2>
        <div className="mt-3 space-y-4">
          <div>
            <p className="text-sm font-medium">
              Posso usare le credenziali del mio commercialista o di un
              delegato?
            </p>
            <p className="text-muted-foreground mt-1 text-sm leading-relaxed">
              Solo se sono credenziali personali di chi può operare per
              l&apos;attività: il titolare, il legale rappresentante o una
              persona nominata gestore o operatore incaricato della società.
              Credenziali di altri, usate al posto tuo, non sono previste da
              ScontrinoZero.
            </p>
          </div>
          <div>
            <p className="text-sm font-medium">
              Ho una società — quale codice fiscale uso?
            </p>
            <p className="text-muted-foreground mt-1 text-sm leading-relaxed">
              {"Il "}
              <strong>
                codice fiscale personale di chi accede per la società
              </strong>
              {
                ": il legale rappresentante oppure la persona che lui ha nominato gestore o operatore incaricato. Mai la partita IVA della società: le credenziali Fisconline sono sempre associate a una persona fisica."
              }
            </p>
          </div>
          <div>
            <p className="text-sm font-medium">
              Dove vengono conservate le mie credenziali?
            </p>
            <p className="text-muted-foreground mt-1 text-sm leading-relaxed">
              {
                "Vengono cifrate con tecnologia a livello bancario (AES-256-GCM) prima di essere salvate nel database e vengono decifrate solo nel momento esatto in cui serve comunicare con l'Agenzia delle Entrate. Non sono mai visibili in chiaro, nemmeno al team di ScontrinoZero, e non transitano mai in log o email."
              }
            </p>
          </div>
        </div>
        <RelatedHelpArticles slug="credenziali-fisconline" />

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
