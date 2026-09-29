import { Ellipsis, EllipsisVertical, MonitorDown, Share } from "lucide-react";
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

export const metadata = helpArticleMetadata("installare-app");

// Icona inline accanto al nome del pulsante: chi legge cerca un disegno sullo
// schermo, non una parola. Il nome resta sempre scritto, l'icona è decorativa.
const ICON_CLASS = "mx-1 inline h-4 w-4 align-text-bottom";

export default function InstallareAppPage() {
  return (
    <section className="px-4 py-16">
      <JsonLd
        data={helpArticleBreadcrumb("installare-app", "Installare l'app")}
      />
      <HelpArticleJsonLd slug="installare-app" />
      <article className="mx-auto max-w-3xl">
        <Breadcrumbs
          items={helpArticleBreadcrumbItems(
            "installare-app",
            "Installare l'app",
          )}
        />

        {/* ─── Intestazione ─── */}
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-3xl font-extrabold tracking-tight">
            Come mettere ScontrinoZero sulla schermata Home del telefono
          </h1>
          <Badge variant="secondary">Partenza rapida</Badge>
        </div>
        <p className="text-muted-foreground mt-3 text-sm leading-relaxed">
          Puoi mettere ScontrinoZero sulla schermata Home di iPhone o Android in
          meno di un minuto, gratis e senza passare dall&apos;App Store o da
          Google Play. Da quel momento lo apri con un tocco, a tutto schermo,
          come qualsiasi altra app. Su iPhone: entra nel tuo account da Safari,
          tocca <strong>Condividi</strong> e scegli{" "}
          <strong>&laquo;Aggiungi alla schermata Home&raquo;</strong>. Su
          Android: entra da Chrome, tocca i tre puntini in alto a destra e
          scegli <strong>&laquo;Installa app&raquo;</strong>. Scontrini,
          prodotti e impostazioni restano nel tuo account: l&apos;icona è solo
          una scorciatoia, e puoi toglierla quando vuoi senza perdere nulla.
        </p>
        <HelpArticleUpdatedAt slug="installare-app" />

        <div className="bg-muted text-muted-foreground mt-6 rounded-lg p-4 text-sm leading-relaxed">
          <strong>Prima di iniziare.</strong>
          {
            " Apri scontrinozero.it dal telefono ed entra nel tuo account. Fai i passaggi qui sotto quando vedi la cassa: così l'icona sulla Home apre direttamente ScontrinoZero."
          }
        </div>

        {/* ─── iPhone con Safari ─── */}
        {/* Tre versioni di iOS, tre posizioni dei pulsanti: fino a iOS 18
            Condividi sta nella barra; iOS 26 lo sposta nel menu ⋯ e aggiunge
            l'interruttore «Apri come app web»; iOS 27 sposta la voce sotto
            «Altro». I passaggi dicono dove cercare se il pulsante non è a
            vista, invece di chiedere all'utente quale iOS ha. */}
        <h2 className="mt-10 text-xl font-semibold">Su iPhone con Safari</h2>
        <p className="text-muted-foreground mt-3 text-sm leading-relaxed">
          Vale anche per iPad. Negli ultimi aggiornamenti dell&apos;iPhone Apple
          ha spostato un paio di pulsanti: a ogni passaggio trovi dove cercarli.
        </p>
        <ol className="text-muted-foreground mt-3 list-decimal space-y-3 pl-5 text-sm leading-relaxed">
          <li>
            Apri <strong>Safari</strong>, vai su{" "}
            <strong>scontrinozero.it</strong> ed entra nel tuo account.
          </li>
          <li>
            Tocca <strong>Condividi</strong>
            <Share className={ICON_CLASS} aria-hidden="true" />
            (il quadrato con la freccia verso l&apos;alto). Non lo vedi? Tocca
            prima i tre puntini
            <Ellipsis className={ICON_CLASS} aria-hidden="true" />
            accanto all&apos;indirizzo del sito: Condividi è nel menu che si
            apre.
          </li>
          <li>
            Scorri l&apos;elenco e tocca{" "}
            <strong>&laquo;Aggiungi alla schermata Home&raquo;</strong>. Se non
            c&apos;è, tocca <strong>&laquo;Altro&raquo;</strong> e cercala lì.
          </li>
          <li>
            Se vedi l&apos;interruttore{" "}
            <strong>&laquo;Apri come app web&raquo;</strong>, lascialo acceso.
            Poi tocca <strong>&laquo;Aggiungi&raquo;</strong> in alto a destra.
          </li>
          <li>
            Sulla schermata Home compare l&apos;icona di ScontrinoZero: toccala
            e sei in cassa.
          </li>
        </ol>

        {/* ─── iPhone con Chrome ─── */}
        <h2 className="mt-10 text-xl font-semibold">Su iPhone con Chrome</h2>
        <p className="text-muted-foreground mt-3 text-sm leading-relaxed">
          Se usi Chrome non serve passare a Safari: anche Chrome sa mettere
          ScontrinoZero sulla schermata Home.
        </p>
        <ol className="text-muted-foreground mt-3 list-decimal space-y-3 pl-5 text-sm leading-relaxed">
          <li>
            Apri <strong>Chrome</strong>, vai su{" "}
            <strong>scontrinozero.it</strong> ed entra nel tuo account.
          </li>
          <li>
            Tocca <strong>Condividi</strong>
            <Share className={ICON_CLASS} aria-hidden="true" />a destra della
            barra dell&apos;indirizzo.
          </li>
          <li>
            Scorri l&apos;elenco e tocca{" "}
            <strong>&laquo;Aggiungi a schermata Home&raquo;</strong>.
          </li>
          <li>
            Tocca <strong>&laquo;Aggiungi&raquo;</strong>.
          </li>
        </ol>
        <p className="text-muted-foreground mt-3 text-sm leading-relaxed">
          Se la voce non compare, l&apos;iPhone ha una versione troppo vecchia:
          serve iOS 16.4 o successivo, uscito a marzo 2023. Aggiornalo da{" "}
          <strong>Impostazioni › Generali › Aggiornamento software</strong>,
          oppure usa Safari.
        </p>

        {/* ─── Android ─── */}
        <h2 className="mt-10 text-xl font-semibold">Su Android</h2>
        <p className="text-muted-foreground mt-3 text-sm leading-relaxed">
          Usa <strong>Chrome</strong>, il browser già presente su quasi tutti i
          telefoni Android.
        </p>
        <ol className="text-muted-foreground mt-3 list-decimal space-y-3 pl-5 text-sm leading-relaxed">
          <li>
            Apri <strong>Chrome</strong>, vai su{" "}
            <strong>scontrinozero.it</strong> ed entra nel tuo account.
          </li>
          <li>
            Se in fondo allo schermo compare il riquadro{" "}
            <strong>&laquo;Installa ScontrinoZero&raquo;</strong>, tocca{" "}
            <strong>&laquo;Installa&raquo;</strong>: hai finito.
          </li>
          <li>
            Se il riquadro non c&apos;è, tocca i tre puntini
            <EllipsisVertical className={ICON_CLASS} aria-hidden="true" />
            in alto a destra e scegli{" "}
            <strong>&laquo;Installa app&raquo;</strong> oppure{" "}
            <strong>&laquo;Aggiungi a schermata Home&raquo;</strong>: il nome
            cambia da una versione di Chrome all&apos;altra.
          </li>
          <li>
            Conferma con <strong>&laquo;Installa&raquo;</strong>.
          </li>
          <li>
            L&apos;icona compare sulla schermata Home e nell&apos;elenco delle
            app.
          </li>
        </ol>

        {/* ─── Computer ─── */}
        <h2 className="mt-10 text-xl font-semibold">Sul computer</h2>
        <p className="text-muted-foreground mt-3 text-sm leading-relaxed">
          Con <strong>Chrome</strong> o <strong>Edge</strong> puoi aprire
          ScontrinoZero in una finestra tutta sua, senza schede né barra
          dell&apos;indirizzo. Prima entra nel tuo account, poi:
        </p>
        <ul className="text-muted-foreground mt-3 list-disc space-y-2 pl-5 text-sm leading-relaxed">
          <li>
            <strong>Chrome</strong>: clicca l&apos;icona dello schermo con la
            freccia
            <MonitorDown className={ICON_CLASS} aria-hidden="true" />a destra
            della barra dell&apos;indirizzo e conferma con{" "}
            <strong>&laquo;Installa&raquo;</strong>.
          </li>
          <li>
            <strong>Edge</strong>: apri il menu{" "}
            <strong>⋯ › App › Installa questo sito come app</strong> e conferma
            con <strong>&laquo;Installa&raquo;</strong>.
          </li>
        </ul>
        <p className="text-muted-foreground mt-3 text-sm leading-relaxed">
          Trovi ScontrinoZero sul desktop e nel menu Start (Windows) o nel
          Launchpad (Mac).
        </p>

        {/* ─── FAQ ─── */}
        <h2 className="mt-10 text-xl font-semibold">Domande frequenti</h2>
        <div className="mt-3 space-y-4">
          <div>
            <p className="text-sm font-medium">
              Devo scaricare ScontrinoZero dall&apos;App Store o da Google Play?
            </p>
            <p className="text-muted-foreground mt-1 text-sm leading-relaxed">
              No, non serve. ScontrinoZero si usa dal browser, e l&apos;icona
              sulla schermata Home lo apre come un&apos;app: non c&apos;è niente
              da scaricare e niente da pagare in più.
            </p>
          </div>
          <div>
            <p className="text-sm font-medium">
              Su iPhone non trovo &laquo;Aggiungi alla schermata Home&raquo;:
              dove la cerco?
            </p>
            <p className="text-muted-foreground mt-1 text-sm leading-relaxed">
              {
                "In fondo all'elenco che si apre toccando Condividi; sulle versioni più recenti dell'iPhone è dentro «Altro». Se hai aperto ScontrinoZero da un link dentro un'altra app, come WhatsApp o Instagram, di solito la voce manca: apri il sito direttamente in Safari o Chrome e riprova."
              }
            </p>
          </div>
          <div>
            <p className="text-sm font-medium">Si aggiorna da sola?</p>
            <p className="text-muted-foreground mt-1 text-sm leading-relaxed">
              Sì, ogni volta che la apri usi l&apos;ultima versione. Se dopo un
              aggiornamento vedi qualcosa di strano, chiudila del tutto
              (trascinala via dall&apos;elenco delle app aperte) e riaprila.
            </p>
          </div>
          <div>
            <p className="text-sm font-medium">
              Se tolgo l&apos;icona perdo gli scontrini?
            </p>
            <p className="text-muted-foreground mt-1 text-sm leading-relaxed">
              No. Scontrini, prodotti e impostazioni sono salvati nel tuo
              account, non nel telefono. Togliere l&apos;icona elimina solo la
              scorciatoia: puoi rimetterla quando vuoi e ritrovi tutto.
            </p>
          </div>
          <div>
            <p className="text-sm font-medium">Posso usarla su più telefoni?</p>
            <p className="text-muted-foreground mt-1 text-sm leading-relaxed">
              Sì, con lo stesso account su tutti i telefoni, tablet e computer
              che vuoi. Gli scontrini emessi da uno compaiono nello Storico
              degli altri appena apri o ricarichi quella schermata.
            </p>
          </div>
          <div>
            <p className="text-sm font-medium">Funziona senza internet?</p>
            <p className="text-muted-foreground mt-1 text-sm leading-relaxed">
              {
                "Per emettere uno scontrino serve internet: lo scontrino parte verso l'Agenzia delle Entrate nel momento in cui lo emetti. Senza connessione l'emissione non va a buon fine e vedi un messaggio di errore: riprova quando torni online."
              }
            </p>
          </div>
        </div>

        <RelatedHelpArticles slug="installare-app" />

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
