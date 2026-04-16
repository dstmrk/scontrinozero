import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Badge } from "@/components/ui/badge";

export const metadata: Metadata = {
  title: "Prima configurazione passo-passo | ScontrinoZero Help",
  description:
    "Guida completa all'onboarding di ScontrinoZero: inserisci i dati della tua attività, configura il regime fiscale, collega le credenziali AdE e fai il primo scontrino di prova.",
};

export default function PrimaConfigurazioneePage() {
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
            Prima configurazione passo-passo
          </h1>
          <Badge variant="secondary">Partenza rapida</Badge>
        </div>
        <p className="text-muted-foreground mt-3 text-sm leading-relaxed">
          Questa guida ti accompagna dall&apos;iscrizione al primo scontrino
          trasmesso all&apos;Agenzia delle Entrate. L&apos;intero processo
          richiede circa 10-15 minuti se hai già le credenziali Fisconline a
          portata di mano.
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
            <strong>Partita IVA</strong> attiva e numero REA (se sei in forma
            d&apos;impresa).
          </li>
          <li>
            <strong>Credenziali Fisconline</strong>
            {" (codice fiscale + PIN/password). Non le hai ancora? "}
            <Link
              href="/help/credenziali-fisconline"
              className="text-primary hover:underline"
            >
              Scopri come ottenerle
            </Link>
            .
          </li>
          <li>
            <strong>Regime fiscale</strong> della tua attività (es. forfettario,
            ordinario, semplificato).
          </li>
          <li>
            Un dispositivo connesso a internet (smartphone, tablet o computer).
          </li>
        </ul>

        {/* ─── Step 1 ─── */}
        <h2 className="mt-10 text-xl font-semibold">
          Passo 1 — Crea l&apos;account
        </h2>
        <p className="text-muted-foreground mt-3 text-sm leading-relaxed">
          {"Vai su "}
          <Link href="/register" className="text-primary hover:underline">
            scontrinozero.it/register
          </Link>
          {
            " e inserisci email e password. Avrai 30 giorni di prova gratuita senza inserire la carta di credito. Conferma l'indirizzo email cliccando il link che ricevi nella casella di posta."
          }
        </p>

        {/* ─── Step 2 ─── */}
        <h2 className="mt-10 text-xl font-semibold">
          Passo 2 — Dati della tua attività
        </h2>
        <p className="text-muted-foreground mt-3 text-sm leading-relaxed">
          Dopo il primo accesso, il wizard di onboarding ti chiede:
        </p>
        <ul className="text-muted-foreground mt-2 list-disc space-y-2 pl-5 text-sm leading-relaxed">
          <li>
            <strong>Ragione sociale o nome/cognome</strong> — apparirà
            nell&apos;intestazione di ogni scontrino.
          </li>
          <li>
            <strong>Partita IVA</strong> — obbligatoria, usata per identificarti
            sul portale AdE.
          </li>
          <li>
            <strong>Codice fiscale</strong> — per le persone fisiche coincide
            con il CF personale; per le società è il CF della persona giuridica.
          </li>
          <li>
            <strong>Indirizzo sede legale</strong> — comune, provincia, CAP e
            indirizzo completo.
          </li>
          <li>
            <strong>Codice Ateco</strong> — trovi il tuo codice nella visura
            camerale o nella lettera di attribuzione P.IVA dell&apos;Agenzia
            delle Entrate.
          </li>
        </ul>
        <p className="text-muted-foreground mt-3 text-sm leading-relaxed">
          {"Questi dati possono essere modificati in seguito dalla sezione "}
          <strong>Impostazioni → Attività</strong>.
        </p>

        {/* ─── Step 3 ─── */}
        <h2 className="mt-10 text-xl font-semibold">
          Passo 3 — Regime fiscale e IVA
        </h2>
        <p className="text-muted-foreground mt-3 text-sm leading-relaxed">
          Seleziona il regime fiscale della tua attività:
        </p>
        <ul className="text-muted-foreground mt-2 list-disc space-y-2 pl-5 text-sm leading-relaxed">
          <li>
            <strong>Regime forfettario</strong> — nessuna IVA in fattura; sullo
            scontrino comparirà automaticamente la dicitura legale obbligatoria
            &quot;Operazione effettuata ai sensi dell&apos;art. 1, commi 54-89,
            L. 190/2014 — RF19&quot;.
          </li>
          <li>
            <strong>Regime ordinario / semplificato</strong> — puoi applicare
            una o più aliquote IVA (4%, 5%, 10%, 22%) a seconda dei prodotti
            venduti.
          </li>
        </ul>
        <p className="text-muted-foreground mt-3 text-sm leading-relaxed">
          In caso di dubbio, consulta il tuo commercialista. Puoi modificare
          {"il regime in qualsiasi momento da "}
          <strong>Impostazioni → Attività</strong>.
        </p>

        {/* ─── Step 4 ─── */}
        <h2 className="mt-10 text-xl font-semibold">
          Passo 4 — Collega le credenziali Fisconline
        </h2>
        <p className="text-muted-foreground mt-3 text-sm leading-relaxed">
          Questo è il passaggio più importante: senza le credenziali AdE non è
          possibile trasmettere scontrini. Nel wizard, inserisci:
        </p>
        <ul className="text-muted-foreground mt-2 list-disc space-y-1 pl-5 text-sm leading-relaxed">
          <li>
            <strong>Codice fiscale Fisconline</strong> — il tuo codice fiscale
            personale (o aziendale).
          </li>
          <li>
            <strong>PIN Fisconline</strong> — il PIN di 8 cifre scelto al
            completamento della registrazione sul portale dell&apos;AdE.
          </li>
        </ul>
        <p className="text-muted-foreground mt-3 text-sm leading-relaxed">
          {
            "ScontrinoZero esegue immediatamente un test di accesso per verificare che le credenziali funzionino. Se il test ha successo, vedi una spunta verde. Le credenziali vengono cifrate con AES-256-GCM e non sono mai visibili in chiaro, nemmeno al nostro team. "
          }
          <Link
            href="/help/sicurezza-credenziali"
            className="text-primary hover:underline"
          >
            Come proteggiamo le tue credenziali →
          </Link>
        </p>

        {/* ─── Step 5 ─── */}
        <h2 className="mt-10 text-xl font-semibold">
          Passo 5 — Scontrino di prova
        </h2>
        <p className="text-muted-foreground mt-3 text-sm leading-relaxed">
          Al termine del wizard ti viene proposto uno scontrino di prova da
          €0.01. Ti consigliamo di emetterlo: è un vero scontrino elettronico
          trasmesso all&apos;AdE e verifica che tutto funzioni correttamente
          prima di iniziare a lavorare sul serio.
        </p>
        <p className="text-muted-foreground mt-3 text-sm leading-relaxed">
          {"Se preferisci saltarlo, puoi emetterlo manualmente dalla "}
          <strong>Cassa</strong> in qualsiasi momento.
        </p>

        {/* ─── Hai finito ─── */}
        <h2 className="mt-10 text-xl font-semibold">
          Configurazione completata
        </h2>
        <p className="text-muted-foreground mt-3 text-sm leading-relaxed">
          Dopo il wizard atterri direttamente nella dashboard. Da questo momento
          puoi:
        </p>
        <ul className="text-muted-foreground mt-2 list-disc space-y-1 pl-5 text-sm leading-relaxed">
          <li>
            Aprire la <strong>Cassa</strong> per emettere scontrini.
          </li>
          <li>
            {"Aggiungere prodotti al catalogo rapido ("}
            <strong>Impostazioni → Catalogo</strong>).
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
                "Finché l'onboarding non è completato, compare un banner nella dashboard con il link per riprendere dal punto in cui ti sei fermato. In alternativa, vai su "
              }
              <strong>Impostazioni → Attività</strong> e inserisci manualmente i
              dati mancanti.
            </p>
          </div>
          <div>
            <p className="text-sm font-medium">
              Ho sbagliato il regime fiscale — posso cambiarlo?
            </p>
            <p className="text-muted-foreground mt-1 text-sm leading-relaxed">
              {"Sì, in qualsiasi momento da "}
              <strong>Impostazioni → Attività</strong>. Il cambio di regime non
              modifica gli scontrini già emessi, che restano validi con il
              regime in vigore al momento dell&apos;emissione.
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
                "). Gli errori più comuni sono PIN scaduto, PIN temporaneo non ancora personalizzato, o codice fiscale non corrispondente all'account Fisconline. "
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

        {/* ─── Articoli correlati ─── */}
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
              href="/help/come-collegare-ade"
              className="text-primary hover:underline"
            >
              Come collegare ScontrinoZero all&apos;Agenzia delle Entrate
            </Link>
          </li>
          <li>
            <Link
              href="/help/regime-forfettario"
              className="text-primary hover:underline"
            >
              Regime forfettario: configurazione IVA corretta
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
          <li>
            <Link
              href="/help/installare-app"
              className="text-primary hover:underline"
            >
              Come installare ScontrinoZero come app sul tuo dispositivo
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
