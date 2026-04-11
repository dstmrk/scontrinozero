import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Badge } from "@/components/ui/badge";

export const metadata: Metadata = {
  title:
    "Come collegare ScontrinoZero all'Agenzia delle Entrate | ScontrinoZero Help",
  description:
    "Guida passo-passo per collegare ScontrinoZero al portale Fatture e Corrispettivi dell'Agenzia delle Entrate tramite credenziali Fisconline.",
};

export default function ComeColegarAde() {
  return (
    <section className="px-4 py-16">
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
          delle Entrate. Questo processo richiede le tue credenziali Fisconline
          e si completa in circa 5 minuti.
        </p>
        <p className="text-muted-foreground mt-1 text-sm">
          <strong>Ultimo aggiornamento:</strong> aprile 2026
        </p>

        {/* ─── Prerequisiti ─── */}
        <h2 className="mt-10 text-xl font-semibold">
          Prima di iniziare: cosa ti serve
        </h2>
        <ul className="text-muted-foreground mt-3 list-disc space-y-1 pl-5 text-sm leading-relaxed">
          <li>
            <strong>Credenziali Fisconline</strong> attive (codice fiscale +
            PIN). Non le hai ancora?{" "}
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
            Essere il titolare dell&apos;attività o avere delega Fisconline per
            il codice fiscale dell&apos;esercente.
          </li>
        </ul>

        {/* ─── Passaggi ─── */}
        <h2 className="mt-10 text-xl font-semibold">
          Passaggio 1 — Accedi alle impostazioni attività
        </h2>
        <p className="text-muted-foreground mt-3 text-sm leading-relaxed">
          Dalla dashboard di ScontrinoZero, vai su{" "}
          <strong>Impostazioni → Configurazione attività</strong>. Trovi il menu
          nella barra laterale sinistra (su mobile: tocca l&apos;icona ☰ in
          alto a sinistra).
        </p>

        <h2 className="mt-10 text-xl font-semibold">
          Passaggio 2 — Inserisci le credenziali Fisconline
        </h2>
        <p className="text-muted-foreground mt-3 text-sm leading-relaxed">
          Nella sezione <strong>Credenziali AdE</strong> trovi due campi:
        </p>
        <ul className="text-muted-foreground mt-3 list-disc space-y-1 pl-5 text-sm leading-relaxed">
          <li>
            <strong>Codice fiscale</strong> — il tuo codice fiscale personale
            (16 caratteri), anche se sei una società.
          </li>
          <li>
            <strong>PIN Fisconline</strong> — il PIN di 8 cifre che hai ricevuto
            al momento dell&apos;attivazione Fisconline o che hai cambiato
            successivamente.
          </li>
        </ul>
        <p className="text-muted-foreground mt-3 text-sm leading-relaxed">
          Le credenziali vengono cifrate e non sono mai visibili in chiaro, né a
          te né a noi dopo il salvataggio.
        </p>

        <h2 className="mt-10 text-xl font-semibold">
          Passaggio 3 — Verifica il collegamento
        </h2>
        <p className="text-muted-foreground mt-3 text-sm leading-relaxed">
          Clicca su <strong>Verifica credenziali</strong>. ScontrinoZero esegue
          un accesso di prova al portale AdE e mostra uno di questi risultati:
        </p>
        <ul className="text-muted-foreground mt-3 list-disc space-y-2 pl-5 text-sm leading-relaxed">
          <li>
            <strong>✅ Collegamento riuscito</strong> — le credenziali sono
            corrette. Puoi emettere scontrini.
          </li>
          <li>
            <strong>❌ Credenziali non valide</strong> — codice fiscale o PIN
            errato. Controlla di non aver invertito le cifre del PIN.
          </li>
          <li>
            <strong>⚠️ PIN scaduto</strong> — il PIN Fisconline ha una validità
            massima di 3 anni. Devi rinnovarlo sul portale AdE prima di
            continuare.
          </li>
          <li>
            <strong>⚠️ Servizio AdE temporaneamente non disponibile</strong> —
            il portale dell&apos;Agenzia delle Entrate è in manutenzione.
            Riprova tra qualche minuto.
          </li>
        </ul>

        {/* ─── PIN scaduto ─── */}
        <h2 className="mt-10 text-xl font-semibold">
          Il PIN è scaduto: come rinnovarlo
        </h2>
        <p className="text-muted-foreground mt-3 text-sm leading-relaxed">
          Il PIN Fisconline scade ogni 3 anni (o prima se lo reimposti tu). Per
          rinnovarlo:
        </p>
        <ol className="text-muted-foreground mt-3 list-decimal space-y-1 pl-5 text-sm leading-relaxed">
          <li>
            Vai su{" "}
            <strong>
              iampe.agenziaentrate.gov.it → Fisconline → Cambio PIN
            </strong>
            {"."}
          </li>
          <li>
            Accedi con il vecchio PIN (anche se scaduto, il cambio è ancora
            possibile per un breve periodo).
          </li>
          <li>Scegli un nuovo PIN di 8 cifre.</li>
          <li>Torna su ScontrinoZero e aggiorna il PIN nelle impostazioni.</li>
        </ol>
        <p className="text-muted-foreground mt-3 text-sm leading-relaxed">
          Se il PIN è scaduto da troppo tempo e non riesci ad accedere, contatta
          il numero verde AdE <strong>800 90 96 96</strong> o vai a uno
          sportello CAF/Patronato per la reattivazione.
        </p>

        {/* ─── Errori comuni ─── */}
        <h2 className="mt-10 text-xl font-semibold">
          Errori frequenti e soluzioni
        </h2>
        <div className="mt-3 space-y-4">
          <div>
            <p className="text-sm font-medium">
              &quot;Accesso non autorizzato&quot; o &quot;Utente non
              abilitato&quot;
            </p>
            <p className="text-muted-foreground mt-1 text-sm leading-relaxed">
              {"Verifica che il codice fiscale inserito sia quello del "}
              <strong>titolare dell&apos;esercizio commerciale</strong>
              {
                ", non quello del commercialista o di un delegato. ScontrinoZero usa le credenziali per accedere alla sezione "
              }
              <em>Corrispettivi</em>
              {" del portale AdE."}
            </p>
          </div>
          <div>
            <p className="text-sm font-medium">
              &quot;Attività non registrata&quot;
            </p>
            <p className="text-muted-foreground mt-1 text-sm leading-relaxed">
              Se la tua P.IVA è nuova (aperta di recente), potrebbe non essere
              ancora visibile nel portale Fatture e Corrispettivi. I tempi di
              propagazione dell&apos;AdE sono di solito 24–48 ore lavorative
              dall&apos;apertura.
            </p>
          </div>
          <div>
            <p className="text-sm font-medium">
              Il collegamento funzionava e ora non va più
            </p>
            <p className="text-muted-foreground mt-1 text-sm leading-relaxed">
              Controlla che il PIN non sia scaduto e che non sia stato cambiato
              manualmente sul portale AdE. Se hai cambiato PIN, aggiorna anche
              le credenziali su ScontrinoZero nelle impostazioni.
            </p>
          </div>
        </div>

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
              href="mailto:supporto@scontrinozero.it"
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
