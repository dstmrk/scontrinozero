import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { JsonLd, helpArticleBreadcrumb } from "@/components/json-ld";

export const metadata: Metadata = {
  title:
    "Come collegare ScontrinoZero all'Agenzia delle Entrate | ScontrinoZero Help",
  description:
    "Guida passo-passo per collegare ScontrinoZero al portale Fatture e Corrispettivi dell'Agenzia delle Entrate tramite credenziali Fisconline.",
};

export default function ComeCollegareAde() {
  return (
    <section className="px-4 py-16">
      <JsonLd
        data={helpArticleBreadcrumb(
          "come-collegare-ade",
          "Collegare l'Agenzia delle Entrate",
        )}
      />
      <article className="mx-auto max-w-3xl">
        <Link
          href="/help"
          className="text-muted-foreground hover:text-foreground mb-8 inline-flex items-center gap-1 text-sm transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
          Help Center
        </Link>

        {/* ─── Intestazione ─── */}
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-3xl font-extrabold tracking-tight">
            Come collegare ScontrinoZero all&apos;Agenzia delle Entrate
          </h1>
          <Badge variant="secondary">Fiscalizzazione</Badge>
        </div>
        <p className="text-muted-foreground mt-3 text-sm leading-relaxed">
          Prima di emettere scontrini elettronici devi collegare ScontrinoZero
          al portale <strong>Fatture e Corrispettivi</strong> dell&apos;Agenzia
          delle Entrate. Il processo richiede le credenziali Fisconline del
          titolare dell&apos;attività e si completa in circa 5 minuti.
        </p>
        <p className="text-muted-foreground mt-1 text-sm">
          <strong>Ultimo aggiornamento:</strong> aprile 2026
        </p>

        {/* ─── Chi può usare Fisconline ─── */}
        <div className="bg-muted/50 mt-6 rounded-md p-4 text-sm">
          <p className="font-medium">Un promemoria importante</p>
          <p className="text-muted-foreground mt-1 leading-relaxed">
            {
              "Dal 1° marzo 2021 (DL 76/2020) le credenziali Fisconline vengono rilasciate solo a "
            }
            <strong>titolari di partita IVA attiva</strong>
            {
              " o a soggetti già autorizzati a operare per conto di società, enti o professionisti. I cittadini senza P.IVA usano SPID/CIE/CNS per accedere al portale AdE, ma ScontrinoZero richiede specificamente Fisconline per la trasmissione automatica degli scontrini."
            }
          </p>
        </div>

        {/* ─── Prerequisiti ─── */}
        <h2 className="mt-10 text-xl font-semibold">
          Prima di iniziare: cosa ti serve
        </h2>
        <ul className="text-muted-foreground mt-3 list-disc space-y-1 pl-5 text-sm leading-relaxed">
          <li>
            <strong>Credenziali Fisconline</strong> attive (codice fiscale,
            password e PIN). Non le hai ancora?{" "}
            <Link
              href="/help/credenziali-fisconline"
              className="text-primary hover:underline"
            >
              Leggi prima questa guida
            </Link>
            .
          </li>
          <li>
            Account ScontrinoZero con onboarding completato (P.IVA e dati
            attività inseriti).
          </li>
          <li>
            Essere il <strong>titolare dell&apos;attività</strong> (o il legale
            rappresentante, in caso di società): le credenziali devono essere
            personali, non quelle di un commercialista o di un delegato.
          </li>
        </ul>

        {/* ─── Passaggi ─── */}
        <h2 className="mt-10 text-xl font-semibold">
          Passaggio 1 — Apri la sezione Credenziali AdE
        </h2>
        <p className="text-muted-foreground mt-3 text-sm leading-relaxed">
          Dalla dashboard di ScontrinoZero vai su{" "}
          <strong>Impostazioni → Credenziali AdE</strong>. Trovi il link nella
          barra laterale sinistra (su mobile: tocca l&apos;icona ☰ in alto a
          sinistra) e la sezione è una card dedicata in fondo alla pagina
          Impostazioni.
        </p>

        <h2 className="mt-10 text-xl font-semibold">
          Passaggio 2 — Inserisci le credenziali Fisconline
        </h2>
        <p className="text-muted-foreground mt-3 text-sm leading-relaxed">
          Nel modulo <strong>Modifica credenziali Fisconline</strong> trovi tre
          campi:
        </p>
        <ul className="text-muted-foreground mt-3 list-disc space-y-1 pl-5 text-sm leading-relaxed">
          <li>
            <strong>Codice fiscale</strong> — il tuo codice fiscale personale
            (16 caratteri). Anche per una società si usa il CF del legale
            rappresentante, non la partita IVA.
          </li>
          <li>
            <strong>Password Fisconline</strong> — la password che hai scelto al
            primo accesso al portale AdE. Scade ogni 90 giorni, quindi se non
            accedi da un po&apos; potrebbe essere da rinnovare.
          </li>
          <li>
            <strong>PIN Fisconline</strong> — il codice di{" "}
            <strong>10 cifre</strong>
            {
              " assegnato dall'Agenzia (prime 4 cifre ricevute via portale/email + ultime 6 via posta). Il PIN è fisso: non scade e non si cambia."
            }
          </li>
        </ul>
        <p className="text-muted-foreground mt-3 text-sm leading-relaxed">
          Le credenziali vengono cifrate con AES-256-GCM prima di essere salvate
          e non sono mai visibili in chiaro, nemmeno al team di ScontrinoZero.
        </p>

        <h2 className="mt-10 text-xl font-semibold">
          Passaggio 3 — Verifica la connessione
        </h2>
        <p className="text-muted-foreground mt-3 text-sm leading-relaxed">
          Clicca su <strong>Verifica connessione</strong>. ScontrinoZero esegue
          un login di prova al portale AdE usando le credenziali appena salvate
          e mostra uno di questi esiti:
        </p>
        <ul className="text-muted-foreground mt-3 list-disc space-y-2 pl-5 text-sm leading-relaxed">
          <li>
            <strong>Connessione verificata</strong> — le credenziali sono
            corrette. Puoi iniziare a emettere scontrini.
          </li>
          <li>
            {"«"}
            <strong>
              Verifica fallita. Controlla le credenziali Fisconline
            </strong>
            {
              "» — il login al portale AdE non è riuscito. Il messaggio è unico e non distingue la causa: le possibilità più comuni sono elencate nella sezione successiva."
            }
          </li>
        </ul>

        {/* ─── Cosa controllare se la verifica fallisce ─── */}
        <h2 className="mt-10 text-xl font-semibold">
          Se la verifica fallisce: cosa controllare
        </h2>
        <div className="mt-3 space-y-4">
          <div>
            <p className="text-sm font-medium">
              La password Fisconline è scaduta
            </p>
            <p className="text-muted-foreground mt-1 text-sm leading-relaxed">
              {
                "È la causa più frequente: la password Fisconline scade ogni 90 giorni. Accedi al portale AdE con codice fiscale, vecchia password e PIN: il sistema ti chiederà di sceglierne una nuova. Poi torna su ScontrinoZero e aggiornala in "
              }
              <strong>Impostazioni → Credenziali AdE</strong>
              {"."}
            </p>
          </div>
          <div>
            <p className="text-sm font-medium">
              Il PIN non è completo (hai solo le prime 4 cifre)
            </p>
            <p className="text-muted-foreground mt-1 text-sm leading-relaxed">
              Il PIN Fisconline è di 10 cifre: le prime 4 arrivano subito via
              portale o email, le ultime 6 per posta ordinaria entro 15 giorni
              dalla richiesta. Finché non hai ricevuto la parte postale il PIN è
              incompleto e il login fallisce. Se la lettera non arriva, puoi
              chiederne la ristampa dall&apos;area riservata AdE (con SPID, CIE
              o CNS) oppure presso un qualsiasi ufficio territoriale AdE.
            </p>
          </div>
          <div>
            <p className="text-sm font-medium">
              {"«"}Accesso non autorizzato{"» / «"}Utente non abilitato{"»"}
            </p>
            <p className="text-muted-foreground mt-1 text-sm leading-relaxed">
              {"Verifica che il codice fiscale inserito sia quello del "}
              <strong>titolare dell&apos;esercizio</strong>
              {
                " (o del legale rappresentante), non quello del commercialista. ScontrinoZero usa le credenziali per operare sul portale "
              }
              <em>Fatture e Corrispettivi</em>
              {
                " e richiede che l'utente sia abilitato a operare in quella sezione per conto dell'attività."
              }
            </p>
          </div>
          <div>
            <p className="text-sm font-medium">Attività non registrata</p>
            <p className="text-muted-foreground mt-1 text-sm leading-relaxed">
              Se la tua P.IVA è stata aperta di recente, potrebbero servire
              alcuni giorni lavorativi prima che risulti abilitata sul portale
              Fatture e Corrispettivi. Se il problema persiste dopo qualche
              giorno, contatta l&apos;Agenzia delle Entrate per verificare
              l&apos;abilitazione.
            </p>
          </div>
          <div>
            <p className="text-sm font-medium">
              Servizio AdE temporaneamente non disponibile
            </p>
            <p className="text-muted-foreground mt-1 text-sm leading-relaxed">
              Il portale dell&apos;Agenzia può essere in manutenzione o
              sovraccarico. Riprova tra qualche minuto prima di assumere che ci
              sia un problema con le tue credenziali.
            </p>
          </div>
          <div>
            <p className="text-sm font-medium">
              Il collegamento funzionava e ora non va più
            </p>
            <p className="text-muted-foreground mt-1 text-sm leading-relaxed">
              Nella quasi totalità dei casi è la{" "}
              <strong>password scaduta</strong>
              {
                " (il rinnovo trimestrale obbligatorio ogni 90 giorni). Aggiorna la nuova password nelle impostazioni di ScontrinoZero: codice fiscale e PIN restano invariati."
              }
            </p>
          </div>
        </div>

        {/* ─── Supporto ─── */}
        <h2 className="mt-10 text-xl font-semibold">
          Se non riesci comunque ad accedere
        </h2>
        <p className="text-muted-foreground mt-3 text-sm leading-relaxed">
          {
            "Per problemi con le credenziali AdE puoi contattare il numero verde "
          }
          <strong>800 90 96 96</strong>
          {
            " (gratuito da telefono fisso, lun–ven 9–17) oppure recarti a un ufficio territoriale dell'Agenzia delle Entrate. Per problemi con ScontrinoZero scrivici a "
          }
          <a
            href="mailto:info@scontrinozero.it"
            className="text-primary hover:underline"
          >
            info@scontrinozero.it
          </a>
          {"."}
        </p>

        {/* ─── Link correlati ─── */}
        <h2 className="mt-10 text-xl font-semibold">Articoli correlati</h2>
        <ul className="mt-3 space-y-1 text-sm">
          <li>
            <Link
              href="/help/credenziali-fisconline"
              className="text-primary hover:underline"
            >
              Credenziali Fisconline: dove trovarle e come verificarle
            </Link>
          </li>
          <li>
            <Link
              href="/help/primo-scontrino"
              className="text-primary hover:underline"
            >
              Come emettere il primo scontrino elettronico
            </Link>
          </li>
        </ul>

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
