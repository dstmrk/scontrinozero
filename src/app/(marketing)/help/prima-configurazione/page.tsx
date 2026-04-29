import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { JsonLd, helpArticleBreadcrumb } from "@/components/json-ld";
import { RelatedHelpArticles } from "@/components/help/related-articles";

export const metadata: Metadata = {
  title: "Prima configurazione passo-passo | ScontrinoZero Help",
  description:
    "Guida all'onboarding di ScontrinoZero: crea l'account, inserisci i dati dell'attività e collega le credenziali Fisconline per iniziare a emettere scontrini elettronici.",
};

export default function PrimaConfigurazioneePage() {
  return (
    <section className="px-4 py-16">
      <JsonLd
        data={helpArticleBreadcrumb(
          "prima-configurazione",
          "Prima configurazione",
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
            Prima configurazione passo-passo
          </h1>
          <Badge variant="secondary">Partenza rapida</Badge>
        </div>
        <p className="text-muted-foreground mt-3 text-sm leading-relaxed">
          Questa guida ti accompagna dall&apos;iscrizione al primo accesso in
          dashboard. L&apos;intero processo richiede circa 10 minuti se hai già
          le credenziali Fisconline a portata di mano.
        </p>
        <p className="text-muted-foreground mt-1 text-sm">
          <strong>Ultimo aggiornamento:</strong> aprile 2026
        </p>

        {/* ─── Cosa ti serve ─── */}
        <h2 className="mt-10 text-xl font-semibold">
          Cosa ti serve prima di iniziare
        </h2>
        <ul className="text-muted-foreground mt-3 list-disc space-y-1 pl-5 text-sm leading-relaxed">
          <li>
            <strong>Credenziali Fisconline</strong>
            {" (codice fiscale + password + PIN). Non le hai ancora? "}
            <Link
              href="/help/credenziali-fisconline"
              className="text-primary hover:underline"
            >
              Scopri come ottenerle
            </Link>
            {"."}
          </li>
          <li>
            Un dispositivo connesso a internet (smartphone, tablet o computer).
          </li>
        </ul>
        <p className="text-muted-foreground mt-3 text-sm leading-relaxed">
          {
            "Non serve inserire manualmente Partita IVA né codice fiscale dell'attività: ScontrinoZero li recupera automaticamente dall'Agenzia delle Entrate quando verifica le tue credenziali Fisconline."
          }
        </p>

        {/* ─── Prima del wizard ─── */}
        <h2 className="mt-10 text-xl font-semibold">
          Prima del wizard — crea l&apos;account
        </h2>
        <p className="text-muted-foreground mt-3 text-sm leading-relaxed">
          {"Vai su "}
          <Link href="/register" className="text-primary hover:underline">
            scontrinozero.it/register
          </Link>
          {
            " e inserisci email e password. Hai 30 giorni di prova gratuita senza inserire alcuna carta di credito. Dopo la registrazione conferma l'indirizzo email cliccando il link che ricevi nella casella di posta: al primo login si aprirà automaticamente il wizard di onboarding."
          }
        </p>

        {/* ─── Step 1 ─── */}
        <h2 className="mt-10 text-xl font-semibold">
          Passo 1 — Dati dell&apos;attività
        </h2>
        <p className="text-muted-foreground mt-3 text-sm leading-relaxed">
          Il primo step del wizard ti chiede pochi dati essenziali:
        </p>
        <ul className="text-muted-foreground mt-2 list-disc space-y-2 pl-5 text-sm leading-relaxed">
          <li>
            <strong>Nome attività</strong> (opzionale) — se sei una ditta
            individuale puoi lasciarlo vuoto e usare nome e cognome.
          </li>
          <li>
            <strong>Nome e cognome</strong> — obbligatori, identificano la
            persona titolare.
          </li>
          <li>
            <strong>Aliquota IVA prevalente</strong>
            {
              " (opzionale) — scegli una fra 4%, 5%, 10%, 22% oppure una natura N1–N6; verrà preselezionata in Cassa per velocizzare l'emissione degli scontrini. Se sei in regime forfettario, seleziona "
            }
            <code className="bg-muted rounded px-1 font-mono text-xs">N2</code>
            {" ("}
            <Link
              href="/help/regime-forfettario"
              className="text-primary hover:underline"
            >
              perché?
            </Link>
            {")."}
          </li>
          <li>
            <strong>Indirizzo sede operativa</strong> — indirizzo, numero
            civico, CAP (5 cifre), città e provincia. L&apos;indirizzo è
            obbligatorio e apparirà nell&apos;intestazione degli scontrini.
          </li>
        </ul>
        <p className="text-muted-foreground mt-3 text-sm leading-relaxed">
          {"Puoi modificare questi dati in qualsiasi momento da "}
          <strong>Impostazioni → Attività</strong>
          {"."}
        </p>

        {/* ─── Step 2 ─── */}
        <h2 className="mt-10 text-xl font-semibold">
          Passo 2 — Credenziali Fisconline
        </h2>
        <p className="text-muted-foreground mt-3 text-sm leading-relaxed">
          Questo è il passaggio più importante: senza le credenziali AdE non è
          possibile trasmettere scontrini. Inserisci:
        </p>
        <ul className="text-muted-foreground mt-2 list-disc space-y-1 pl-5 text-sm leading-relaxed">
          <li>
            <strong>Codice fiscale</strong> — 16 caratteri, quello associato al
            tuo account Fisconline (persona fisica o rappresentante legale).
          </li>
          <li>
            <strong>Password Fisconline</strong> — quella che usi per accedere
            al portale dell&apos;Agenzia delle Entrate.
          </li>
          <li>
            <strong>PIN Fisconline</strong>
            {" — "}
            <strong>10 cifre numeriche</strong>
            {
              ": le prime 4 le ricevi online al momento della registrazione, le ultime 6 tramite lettera cartacea. Se hai solo le prime 4, aspetta la lettera prima di continuare. "
            }
            <Link
              href="/help/credenziali-fisconline"
              className="text-primary hover:underline"
            >
              Dettagli sul PIN →
            </Link>
          </li>
        </ul>
        <p className="text-muted-foreground mt-3 text-sm leading-relaxed">
          {
            "Le credenziali vengono cifrate con AES-256-GCM sul nostro server e non sono mai visibili in chiaro, nemmeno al nostro team. "
          }
          <Link
            href="/help/sicurezza-credenziali"
            className="text-primary hover:underline"
          >
            Come proteggiamo le tue credenziali →
          </Link>
        </p>

        {/* ─── Step 3 ─── */}
        <h2 className="mt-10 text-xl font-semibold">
          Passo 3 — Verifica connessione all&apos;AdE
        </h2>
        <p className="text-muted-foreground mt-3 text-sm leading-relaxed">
          {
            'Nell\'ultimo step clicca il bottone "Verifica connessione": ScontrinoZero effettua un login di test sul portale Fisconline e, se tutto funziona, scarica automaticamente Partita IVA e codice fiscale dell\'attività dall\'anagrafica AdE. Se preferisci posticipare, puoi cliccare "Salta per ora" e completare la verifica più tardi da '
          }
          <strong>Impostazioni → Credenziali AdE</strong>
          {"."}
        </p>
        <p className="text-muted-foreground mt-3 text-sm leading-relaxed">
          Se la verifica fallisce compare un messaggio con la causa (tipicamente
          PIN errato, password scaduta o codice fiscale non corrispondente).
          Puoi tornare indietro e correggere le credenziali con il bottone
          &quot;Modifica credenziali&quot;.
        </p>

        {/* ─── Hai finito ─── */}
        <h2 className="mt-10 text-xl font-semibold">
          Configurazione completata
        </h2>
        <p className="text-muted-foreground mt-3 text-sm leading-relaxed">
          Dopo il wizard atterri direttamente nella dashboard. Ti consigliamo di
          emettere subito uno scontrino di prova con un importo basso (per
          esempio €1,00) per verificare end-to-end che tutto funzioni — è un
          vero documento commerciale trasmesso all&apos;AdE, ma puoi annullarlo
          immediatamente se necessario.
        </p>
        <p className="text-muted-foreground mt-3 text-sm leading-relaxed">
          Dal menu principale puoi:
        </p>
        <ul className="text-muted-foreground mt-2 list-disc space-y-1 pl-5 text-sm leading-relaxed">
          <li>
            Gestire i prodotti del <strong>Catalogo</strong> rapido (prima voce
            del menu).
          </li>
          <li>
            Aprire la <strong>Cassa</strong>
            {" per emettere scontrini. "}
            <Link
              href="/help/primo-scontrino"
              className="text-primary hover:underline"
            >
              Guida al primo scontrino →
            </Link>
          </li>
          <li>
            Consultare lo <strong>Storico</strong> per vedere tutti gli
            scontrini emessi.
          </li>
          <li>
            {
              "Installare ScontrinoZero come app sul tuo smartphone per un accesso più rapido. "
            }
            <Link
              href="/help/installare-app"
              className="text-primary hover:underline"
            >
              Come installare l&apos;app →
            </Link>
          </li>
        </ul>

        {/* ─── Domande frequenti ─── */}
        <h2 className="mt-10 text-xl font-semibold">Domande frequenti</h2>
        <div className="mt-3 space-y-4">
          <div>
            <p className="text-sm font-medium">
              Ho chiuso il wizard prima di finire — come lo riapro?
            </p>
            <p className="text-muted-foreground mt-1 text-sm leading-relaxed">
              {
                "Finché non hai salvato i dati attività e le credenziali, le pagine della dashboard ti reindirizzano automaticamente al wizard, che riparte dal punto in cui ti eri fermato. Non serve ricominciare da capo."
              }
            </p>
          </div>
          <div>
            <p className="text-sm font-medium">
              Posso cambiare aliquota IVA prevalente più tardi?
            </p>
            <p className="text-muted-foreground mt-1 text-sm leading-relaxed">
              {"Sì, in qualsiasi momento da "}
              <strong>Impostazioni → Attività</strong>
              {
                ". La modifica vale solo per i prossimi scontrini; quelli già emessi restano validi con l'aliquota indicata al momento dell'emissione."
              }
            </p>
          </div>
          <div>
            <p className="text-sm font-medium">
              Le mie credenziali Fisconline non vengono accettate — cosa faccio?
            </p>
            <p className="text-muted-foreground mt-1 text-sm leading-relaxed">
              {"Verifica prima di tutto che funzionino sul portale AdE ("}
              <strong>ivaservizi.agenziaentrate.gov.it</strong>
              {
                "). Gli errori più comuni sono PIN incompleto (servono tutte e 10 le cifre), password scaduta o codice fiscale non corrispondente all'account Fisconline. "
              }
              <Link
                href="/help/errori-ade"
                className="text-primary hover:underline"
              >
                Consulta la guida agli errori AdE →
              </Link>
            </p>
          </div>
          <div>
            <p className="text-sm font-medium">
              Posso usare ScontrinoZero per più attività con P.IVA diverse?
            </p>
            <p className="text-muted-foreground mt-1 text-sm leading-relaxed">
              Ogni account ScontrinoZero è associato a una singola P.IVA. Per
              gestire attività diverse devi creare account separati con email
              diverse.
            </p>
          </div>
        </div>

        <RelatedHelpArticles slug="prima-configurazione" />

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
