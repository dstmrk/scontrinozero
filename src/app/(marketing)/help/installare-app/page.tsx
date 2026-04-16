import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Badge } from "@/components/ui/badge";

export const metadata: Metadata = {
  title:
    "Come installare ScontrinoZero come app sul tuo dispositivo | ScontrinoZero Help",
  description:
    "Installa ScontrinoZero come app PWA su iPhone, Android e desktop: istruzioni passo-passo per iOS (Safari), Android (Chrome) e computer. Accesso diretto dalla schermata home.",
};

export default function InstallareAppPage() {
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
            Come installare ScontrinoZero come app sul tuo dispositivo
          </h1>
          <Badge variant="secondary">Partenza rapida</Badge>
        </div>
        <p className="text-muted-foreground mt-3 text-sm leading-relaxed">
          ScontrinoZero è una <strong>Progressive Web App (PWA)</strong>: può
          essere installata direttamente dal browser sulla schermata home dello
          smartphone o sul desktop del computer, senza passare dall&apos;App
          Store o dal Google Play. L&apos;esperienza è identica a quella di
          un&apos;app nativa.
        </p>
        <p className="text-muted-foreground mt-1 text-sm">
          <strong>Ultimo aggiornamento:</strong> aprile 2026
        </p>

        {/* ─── Vantaggi ─── */}
        <h2 className="mt-10 text-xl font-semibold">
          Perché installare l&apos;app
        </h2>
        <ul className="text-muted-foreground mt-3 list-disc space-y-2 pl-5 text-sm leading-relaxed">
          <li>
            <strong>Accesso immediato</strong> — apri la cassa con un tap dalla
            schermata home, senza dover aprire il browser e digitare l&apos;URL.
          </li>
          <li>
            <strong>Schermo intero</strong> — l&apos;app si apre senza barra
            degli indirizzi del browser, con più spazio per i tuoi scontrini.
          </li>
          <li>
            <strong>Shell offline</strong> — la struttura dell&apos;app viene
            messa in cache: si apre istantaneamente anche con connessione lenta,
            e puoi navigare tra le schermate già caricate anche offline.
          </li>
          <li>
            <strong>Aggiornamenti automatici</strong> — come un sito web,
            ScontrinoZero si aggiorna in background senza che tu debba fare
            nulla.
          </li>
          <li>
            <strong>Nessuna app store</strong> — installazione in 3 tap, nessun
            account Apple ID o Google necessario.
          </li>
        </ul>

        {/* ─── iOS ─── */}
        <h2 className="mt-10 text-xl font-semibold">
          Installazione su iPhone e iPad (iOS / iPadOS)
        </h2>
        <p className="text-muted-foreground mt-3 text-sm leading-relaxed">
          Su iPhone e iPad devi usare <strong>Safari</strong>. Altri browser
          (Chrome, Firefox, Edge) su iOS non supportano l&apos;installazione PWA
          per limitazioni di Apple.
        </p>
        <ol className="text-muted-foreground mt-3 list-decimal space-y-3 pl-5 text-sm leading-relaxed">
          <li>
            Apri <strong>Safari</strong> e vai su{" "}
            <strong>scontrinozero.it</strong>. Effettua il login se non lo hai
            già fatto.
          </li>
          <li>
            Tocca il pulsante <strong>Condividi</strong> (il quadrato con la
            freccia verso l&apos;alto) nella barra in basso di Safari.
          </li>
          <li>
            Scorri il menu verso il basso e tocca{" "}
            <strong>&quot;Aggiungi a schermata Home&quot;</strong>.
          </li>
          <li>
            Modifica il nome se vuoi (di default è &quot;ScontrinoZero&quot;),
            poi tocca <strong>Aggiungi</strong> in alto a destra.
          </li>
          <li>
            L&apos;icona di ScontrinoZero appare sulla schermata home. Toccarla
            apre l&apos;app a schermo intero.
          </li>
        </ol>
        <p className="text-muted-foreground mt-3 text-sm leading-relaxed">
          <strong>Nota iOS 16.4+:</strong> Apple ha aggiunto il supporto
          completo alle PWA a partire da iOS 16.4. Se hai una versione
          precedente, l&apos;app funziona ma alcune funzionalità avanzate (come
          le notifiche push future) potrebbero non essere disponibili.
        </p>

        {/* ─── Android ─── */}
        <h2 className="mt-10 text-xl font-semibold">
          Installazione su Android
        </h2>
        <p className="text-muted-foreground mt-3 text-sm leading-relaxed">
          Su Android puoi usare <strong>Chrome</strong> (consigliato) o altri
          browser compatibili come Edge o Samsung Internet.
        </p>
        <ol className="text-muted-foreground mt-3 list-decimal space-y-3 pl-5 text-sm leading-relaxed">
          <li>
            Apri <strong>Chrome</strong> e vai su{" "}
            <strong>scontrinozero.it</strong>. Effettua il login.
          </li>
          <li>
            Chrome mostra automaticamente un banner in basso con la scritta{" "}
            <strong>
              &quot;Aggiungi ScontrinoZero alla schermata home&quot;
            </strong>
            . Toccalo.
          </li>
          <li>
            Se il banner non compare, tocca il menu <strong>⋮</strong> (tre
            puntini) in alto a destra e seleziona{" "}
            <strong>&quot;Aggiungi a schermata Home&quot;</strong> o{" "}
            <strong>&quot;Installa app&quot;</strong>.
          </li>
          <li>
            Conferma toccando <strong>Installa</strong> nella finestra di
            dialogo.
          </li>
          <li>
            L&apos;icona appare sulla schermata home e nel cassetto delle app.
          </li>
        </ol>

        {/* ─── Desktop ─── */}
        <h2 className="mt-10 text-xl font-semibold">
          Installazione su computer (Windows, Mac, Linux)
        </h2>
        <p className="text-muted-foreground mt-3 text-sm leading-relaxed">
          Puoi installare ScontrinoZero come app desktop su{" "}
          <strong>Chrome</strong> o <strong>Edge</strong>.
        </p>

        <h3 className="mt-6 text-base font-semibold">Chrome</h3>
        <ol className="text-muted-foreground mt-2 list-decimal space-y-2 pl-5 text-sm leading-relaxed">
          <li>
            Apri <strong>scontrinozero.it</strong> in Chrome ed effettua il
            login.
          </li>
          <li>
            Clicca sull&apos;icona di installazione (computer con freccia) nella
            barra degli indirizzi, oppure vai nel menu{" "}
            <strong>⋮ → Salva e condividi → Installa pagina come app</strong>.
          </li>
          <li>
            Clicca <strong>Installa</strong> nella finestra di dialogo.
          </li>
          <li>
            ScontrinoZero si apre in una finestra dedicata senza barra del
            browser. Un collegamento viene aggiunto al desktop e al menu Start
            (Windows) o al Launchpad (Mac).
          </li>
        </ol>

        <h3 className="mt-6 text-base font-semibold">Microsoft Edge</h3>
        <ol className="text-muted-foreground mt-2 list-decimal space-y-2 pl-5 text-sm leading-relaxed">
          <li>
            Apri <strong>scontrinozero.it</strong> in Edge ed effettua il login.
          </li>
          <li>
            Clicca su <strong>⋯ → App → Installa questo sito come app</strong>.
          </li>
          <li>
            Conferma il nome e clicca <strong>Installa</strong>.
          </li>
        </ol>

        {/* ─── FAQ ─── */}
        <h2 className="mt-10 text-xl font-semibold">Domande frequenti</h2>
        <div className="mt-3 space-y-4">
          <div>
            <p className="text-sm font-medium">
              L&apos;app non si aggiorna dopo una nuova versione — cosa faccio?
            </p>
            <p className="text-muted-foreground mt-1 text-sm leading-relaxed">
              Gli aggiornamenti vengono applicati automaticamente in background.
              Se noti che l&apos;app è datata, chiudila completamente (scorri
              via dal task switcher su iOS/Android, o chiudi la finestra su
              desktop) e riaprila. La nuova versione viene caricata al riavvio.
            </p>
          </div>
          <div>
            <p className="text-sm font-medium">
              Se disinstallo l&apos;app perdo i dati?
            </p>
            <p className="text-muted-foreground mt-1 text-sm leading-relaxed">
              No. Tutti i dati (scontrini, impostazioni, credenziali) sono
              salvati sul cloud e collegati al tuo account. Disinstallare
              l&apos;app rimuove solo il collegamento sulla schermata home; i
              dati restano intatti. Puoi reinstallarla in qualsiasi momento.
            </p>
          </div>
          <div>
            <p className="text-sm font-medium">
              Posso usare ScontrinoZero su più dispositivi contemporaneamente?
            </p>
            <p className="text-muted-foreground mt-1 text-sm leading-relaxed">
              Sì. Puoi installare l&apos;app su quanti dispositivi vuoi con lo
              stesso account. Gli scontrini emessi da qualsiasi dispositivo
              compaiono in tempo reale nello Storico su tutti gli altri.
            </p>
          </div>
          <div>
            <p className="text-sm font-medium">
              L&apos;icona &quot;Aggiungi a schermata Home&quot; non compare su
              Safari — perché?
            </p>
            <p className="text-muted-foreground mt-1 text-sm leading-relaxed">
              Verifica di essere su <strong>Safari</strong> (non Chrome o
              Firefox) e che il sito sia caricato completamente (attendi la fine
              del caricamento). Se l&apos;opzione non è visibile nello sheet di
              condivisione, scorri l&apos;elenco delle azioni verso sinistra o
              verso il basso: su alcuni dispositivi l&apos;opzione è nascosta in
              fondo all&apos;elenco.
            </p>
          </div>
          <div>
            <p className="text-sm font-medium">
              Funziona anche senza connessione internet?
            </p>
            <p className="text-muted-foreground mt-1 text-sm leading-relaxed">
              La shell dell&apos;app e le schermate già visitate vengono messe
              in cache e sono disponibili offline. Tuttavia,{" "}
              <strong>
                l&apos;emissione di scontrini richiede connessione internet
              </strong>
              : la trasmissione all&apos;AdE avviene in tempo reale. Se perdi la
              connessione durante l&apos;emissione, lo scontrino viene accodato
              e trasmesso automaticamente al ripristino della connettività.
            </p>
          </div>
        </div>

        {/* ─── Articoli correlati ─── */}
        <h2 className="mt-10 text-xl font-semibold">Articoli correlati</h2>
        <ul className="mt-3 space-y-1 text-sm">
          <li>
            <Link
              href="/help/prima-configurazione"
              className="text-primary hover:underline"
            >
              Prima configurazione passo-passo
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
