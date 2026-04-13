import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Badge } from "@/components/ui/badge";

export const metadata: Metadata = {
  title:
    "Credenziali Fisconline: dove trovarle e come verificarle | ScontrinoZero Help",
  description:
    "Guida completa a Fisconline: cos'è, come ottenere il PIN di accesso, come verificare le credenziali e cosa fare se il PIN è scaduto.",
};

export default function CredenzialiPage() {
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
            Credenziali Fisconline: dove trovarle e come verificarle
          </h1>
          <Badge variant="secondary">Fiscalizzazione</Badge>
        </div>
        <p className="text-muted-foreground mt-3 text-sm leading-relaxed">
          Per trasmettere scontrini elettronici all&apos;Agenzia delle Entrate
          serve un account <strong>Fisconline</strong>. Questa guida spiega
          cos&apos;è, come ottenerlo e come verificare che le credenziali
          funzionino.
        </p>
        <p className="text-muted-foreground mt-1 text-sm">
          <strong>Ultimo aggiornamento:</strong> aprile 2026
        </p>

        {/* ─── Cos'è Fisconline ─── */}
        <h2 className="mt-10 text-xl font-semibold">Cos&apos;è Fisconline?</h2>
        <p className="text-muted-foreground mt-3 text-sm leading-relaxed">
          Fisconline è il sistema di autenticazione dell&apos;Agenzia delle
          Entrate per i contribuenti italiani. Permette di accedere ai servizi
          fiscali online — tra cui il portale{" "}
          <strong>Fatture e Corrispettivi</strong>, dove vengono trasmessi i
          documenti commerciali elettronici (scontrini).
        </p>
        <p className="text-muted-foreground mt-3 text-sm leading-relaxed">
          Le credenziali Fisconline sono composte da:
        </p>
        <ul className="text-muted-foreground mt-2 list-disc space-y-1 pl-5 text-sm leading-relaxed">
          <li>
            <strong>Codice fiscale</strong> — il tuo codice fiscale personale
            (16 caratteri).
          </li>
          <li>
            <strong>PIN</strong> — un codice di 8 cifre assegnato dall&apos;AdE
            al momento dell&apos;attivazione.
          </li>
        </ul>
        {/* ─── Come ottenere le credenziali ─── */}
        <h2 className="mt-10 text-xl font-semibold">
          Come ottenere le credenziali Fisconline
        </h2>
        <p className="text-muted-foreground mt-3 text-sm leading-relaxed">
          Hai più opzioni:
        </p>

        <h3 className="mt-6 text-base font-semibold">
          Opzione A — Online (immediata)
        </h3>
        <ol className="text-muted-foreground mt-2 list-decimal space-y-1 pl-5 text-sm leading-relaxed">
          <li>
            Vai su{" "}
            <strong>www.agenziaentrate.gov.it → Accedi ai servizi</strong>.
          </li>
          <li>
            Clicca su <strong>Fisconline → Registrazione</strong>.
          </li>
          <li>
            Inserisci il codice fiscale e i tuoi dati anagrafici (data e comune
            di nascita).
          </li>
          <li>
            Ricevi un <strong>PIN provvisorio</strong> (prime 4 cifre) via email
            immediata e le ultime 4 cifre via posta fisica entro 15 giorni.
          </li>
          <li>
            Al primo accesso, il sistema ti chiede di impostare un{" "}
            <strong>PIN definitivo</strong> di 8 cifre (tu scegli).
          </li>
        </ol>

        <h3 className="mt-6 text-base font-semibold">
          Opzione B — Ufficio dell&apos;Agenzia delle Entrate (immediata)
        </h3>
        <p className="text-muted-foreground mt-2 text-sm leading-relaxed">
          Presentandoti fisicamente a uno sportello AdE con un documento
          d&apos;identità, ricevi le credenziali complete (tutte e 8 le cifre
          del PIN) in giornata.
        </p>

        <h3 className="mt-6 text-base font-semibold">
          Opzione C — CAF o Patronato
        </h3>
        <p className="text-muted-foreground mt-2 text-sm leading-relaxed">
          Molti CAF e Patronati offrono assistenza gratuita per
          l&apos;attivazione Fisconline. Porta un documento d&apos;identità e il
          codice fiscale.
        </p>

        {/* ─── PIN provvisorio vs definitivo ─── */}
        <h2 className="mt-10 text-xl font-semibold">
          PIN provvisorio vs PIN definitivo
        </h2>
        <div className="mt-3 space-y-3">
          <div className="bg-muted/50 rounded-md p-4 text-sm">
            <p className="font-medium">PIN provvisorio</p>
            <p className="text-muted-foreground mt-1 leading-relaxed">
              Formato dalle prime 4 cifre ricevute via email + le ultime 4
              ricevute per posta. Può essere usato per il primo accesso, ma{" "}
              <strong>non funziona con ScontrinoZero</strong> — devi prima
              cambiarlo in PIN definitivo.
            </p>
          </div>
          <div className="bg-muted/50 rounded-md p-4 text-sm">
            <p className="font-medium">PIN definitivo</p>
            <p className="text-muted-foreground mt-1 leading-relaxed">
              Scelto da te al primo accesso al portale AdE. È il codice da
              inserire in ScontrinoZero. Ha una validità massima di{" "}
              <strong>3 anni</strong>.
            </p>
          </div>
        </div>

        {/* ─── Come verificare le credenziali ─── */}
        <h2 className="mt-10 text-xl font-semibold">
          Come verificare che le credenziali funzionino
        </h2>
        <p className="text-muted-foreground mt-3 text-sm leading-relaxed">
          Prima di inserirle in ScontrinoZero, verifica le credenziali
          direttamente sul portale AdE:
        </p>
        <ol className="text-muted-foreground mt-3 list-decimal space-y-1 pl-5 text-sm leading-relaxed">
          <li>
            Vai su{" "}
            <strong>
              iampe.agenziaentrate.gov.it/authSAMLservlet/Shibboleth.sso/Login
            </strong>
            {"."}
          </li>
          <li>
            Seleziona <strong>Fisconline</strong> come metodo di accesso.
          </li>
          <li>
            Inserisci codice fiscale e PIN. Se accedi correttamente, le
            credenziali sono valide.
          </li>
          <li>
            Torna su ScontrinoZero e inseriscile nelle impostazioni — il
            collegamento dovrebbe riuscire.
          </li>
        </ol>

        {/* ─── PIN scaduto ─── */}
        <h2 className="mt-10 text-xl font-semibold">
          Cosa fare se il PIN è scaduto
        </h2>
        <p className="text-muted-foreground mt-3 text-sm leading-relaxed">
          Il PIN Fisconline scade ogni 3 anni. Se è scaduto:
        </p>
        <ol className="text-muted-foreground mt-3 list-decimal space-y-1 pl-5 text-sm leading-relaxed">
          <li>
            Vai sul portale AdE e seleziona{" "}
            <strong>Fisconline → Cambia il PIN</strong>.
          </li>
          <li>
            Inserisci il vecchio PIN (anche scaduto, il cambio è ancora
            consentito per un breve periodo dopo la scadenza).
          </li>
          <li>Scegli un nuovo PIN di 8 cifre e confermalo.</li>
          <li>
            {"Aggiorna il PIN nelle impostazioni di ScontrinoZero ("}
            <strong>
              Impostazioni → Configurazione attività → Credenziali AdE
            </strong>
            {")."}
          </li>
        </ol>
        <p className="text-muted-foreground mt-3 text-sm leading-relaxed">
          Se non riesci ad accedere nemmeno per il cambio, contatta l&apos;AdE
          al <strong>800 90 96 96</strong> (numero verde gratuito, lun–ven 9–17)
          oppure recati a uno sportello.
        </p>

        {/* ─── Domande frequenti ─── */}
        <h2 className="mt-10 text-xl font-semibold">Domande frequenti</h2>
        <div className="mt-3 space-y-4">
          <div>
            <p className="text-sm font-medium">
              Posso usare le credenziali di un delegato o del commercialista?
            </p>
            <p className="text-muted-foreground mt-1 text-sm leading-relaxed">
              No. Le credenziali devono essere del{" "}
              <strong>titolare dell&apos;esercizio commerciale</strong> (il
              soggetto che emette il documento commerciale). Le deleghe
              Fisconline non sono supportate da ScontrinoZero.
            </p>
          </div>
          <div>
            <p className="text-sm font-medium">
              Ho una società — quale codice fiscale uso?
            </p>
            <p className="text-muted-foreground mt-1 text-sm leading-relaxed">
              {"Il "}
              <strong>
                codice fiscale personale del legale rappresentante
              </strong>
              {
                ", non la partita IVA della società. Il portale Fatture e Corrispettivi associa le credenziali alla persona fisica responsabile."
              }
            </p>
          </div>
          <div>
            <p className="text-sm font-medium">
              Dove vengono conservate le mie credenziali?
            </p>
            <p className="text-muted-foreground mt-1 text-sm leading-relaxed">
              Vengono cifrate con AES-256 prima di essere salvate e non sono mai
              visibili in chiaro, nemmeno al team di ScontrinoZero. Non
              transitano mai in log o email.
            </p>
          </div>
        </div>

        {/* ─── Link correlati ─── */}
        <h2 className="mt-10 text-xl font-semibold">Articoli correlati</h2>
        <ul className="mt-3 space-y-1 text-sm">
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
