import Link from "next/link";
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
import { PLAN_PRICES } from "@/lib/plan-prices";

const { starter, pro, team } = PLAN_PRICES;

export const metadata = helpArticleMetadata("cambio-piano");

export default function CambioPianoPage() {
  return (
    <section className="px-4 py-16">
      <JsonLd
        data={helpArticleBreadcrumb(
          "cambio-piano",
          "Cambio piano: mensile ad annuale",
        )}
      />
      <HelpArticleJsonLd slug="cambio-piano" />
      <article className="mx-auto max-w-3xl">
        <Breadcrumbs
          items={helpArticleBreadcrumbItems(
            "cambio-piano",
            "Cambio piano: mensile ad annuale",
          )}
        />

        {/* ─── Intestazione ─── */}
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-3xl font-extrabold tracking-tight">
            Come passare da mensile ad annuale
          </h1>
          <Badge variant="secondary">Abbonamento</Badge>
        </div>
        <p className="text-muted-foreground mt-3 text-sm leading-relaxed">
          {"Passare al piano annuale ti permette di risparmiare il "}
          <strong>{`${starter.yearlyDiscountPercent}% su Starter`}</strong>
          {` (${starter.yearly}/anno invece di ${starter.twelveMonthly}) e il `}
          <strong>{`${pro.yearlyDiscountPercent}% su Pro`}</strong>
          {` (${pro.yearly}/anno invece di ${pro.twelveMonthly}) e il `}
          <strong>{`${team.yearlyDiscountPercent}% su Team`}</strong>
          {` (${team.yearly}/anno invece di ${team.twelveMonthly}). Il cambio avviene tramite il portale di fatturazione Stripe.`}
        </p>
        <HelpArticleUpdatedAt slug="cambio-piano" />
        <figure className="mt-6">
          <AppScreenshot
            src="/screenshots/impostazioni-piano.png"
            alt="Schermata Piano e Abbonamento con il selettore mensile/annuale e i piani"
            width={900}
            height={1860}
            sizes="(min-width: 768px) 240px, 65vw"
            className="mx-auto max-w-[240px]"
          />
          <figcaption className="text-muted-foreground mt-2 text-center text-xs">
            Da «Piano e Abbonamento» scegli mensile o annuale e cambia piano.
          </figcaption>
        </figure>

        {/* ─── Istruzioni ─── */}
        <h2 className="mt-10 text-xl font-semibold">Istruzioni passo-passo</h2>
        <p className="text-muted-foreground mt-3 text-sm leading-relaxed">
          Questi passaggi valgono se hai già un abbonamento attivo (Starter, Pro
          o Team mensile). Se sei ancora in periodo di prova, dalla stessa
          schermata vedrai direttamente i bottoni per scegliere il piano annuale
          o mensile, senza passare dal portale.
        </p>
        <ol className="text-muted-foreground mt-3 list-decimal space-y-3 pl-5 text-sm leading-relaxed">
          <li>
            Accedi a ScontrinoZero e vai su{" "}
            <strong>Dashboard → Impostazioni → Piano e Abbonamento</strong>.
          </li>
          <li>
            Nella sezione <strong>Gestisci abbonamento</strong> clicca il link{" "}
            <strong>Vai al portale Stripe →</strong>: vieni reindirizzato al
            portale di fatturazione Stripe.
          </li>
          <li>
            Nel portale Stripe, seleziona <strong>Aggiorna piano</strong> (o{" "}
            <em>Update plan</em>).
          </li>
          <li>
            Scegli la versione annuale del tuo piano attuale (Starter, Pro o
            Team annuale) e conferma.
          </li>
          <li>
            Stripe applica un credito proporzionale ai giorni rimanenti del
            ciclo mensile corrente: paghi solo la differenza.
          </li>
        </ol>

        {/* ─── Note importanti ─── */}
        <h2 className="mt-10 text-xl font-semibold">Note importanti</h2>
        <ul className="text-muted-foreground mt-3 list-disc space-y-2 pl-5 text-sm leading-relaxed">
          <li>
            Il cambio è immediato: il nuovo ciclo annuale parte dal giorno del
            cambio.
          </li>
          <li>
            Stripe calcola automaticamente il credito per i giorni non
            utilizzati del periodo mensile: non perdi nulla.
          </li>
          <li>
            Puoi anche passare da <strong>Starter a Pro</strong> nello stesso
            passaggio, scegliendo Pro annuale direttamente.
          </li>
          <li>
            Non è possibile tornare al mensile prima della scadenza del ciclo
            annuale; alla scadenza puoi scegliere liberamente.
          </li>
        </ul>

        {/* ─── Passare da Starter a Pro ─── */}
        <h2 className="mt-10 text-xl font-semibold">
          Passare da Starter a Pro
        </h2>
        <p className="text-muted-foreground mt-3 text-sm leading-relaxed">
          La procedura è identica: nel portale Stripe scegli{" "}
          <strong>Pro annuale</strong> (o Pro mensile) invece di Starter. Le
          funzioni del piano Pro disponibili oggi sono:
        </p>
        <ul className="text-muted-foreground mt-2 list-disc space-y-1 pl-5 text-sm leading-relaxed">
          <li>
            Catalogo rapido <strong>illimitato</strong> (Starter è limitato a 5
            prodotti)
          </li>
          <li>Supporto prioritario via email entro 24 ore</li>
          <li>
            Accesso alla <strong>Developer API</strong> per emettere scontrini
            da sistemi terzi
          </li>
        </ul>
        <p className="text-muted-foreground mt-3 text-sm leading-relaxed">
          {"Il piano Pro include inoltre l'"}
          <strong>analytics avanzata</strong> (grafici e periodi estesi),
          l&apos;<strong>export CSV</strong> dello storico scontrini, gli{" "}
          <strong>sconti sullo scontrino</strong> (di riga e a pagare), il{" "}
          <strong>pagamento misto</strong> (un incasso ripartito fra contanti ed
          elettronico sullo stesso scontrino) e il{" "}
          <strong>messaggio personalizzato</strong> stampato in fondo agli
          scontrini. Include anche la{" "}
          <strong>ricerca dei documenti commerciali su AdE</strong>: dallo
          storico trovi anche i documenti emessi fuori da ScontrinoZero, in sola
          lettura. Vedi il dettaglio in{" "}
          <Link
            href="/help/piani-e-prezzi"
            className="text-primary hover:underline"
          >
            Piani disponibili
          </Link>
          {"."}
        </p>

        {/* ─── Passare da Pro a Team ─── */}
        <h2 className="mt-10 text-xl font-semibold">Passare da Pro a Team</h2>
        <p className="text-muted-foreground mt-3 text-sm leading-relaxed">
          Anche qui nel portale Stripe scegli <strong>Team annuale</strong> (o
          Team mensile) al posto di Pro, e paghi solo la differenza per i giorni
          rimanenti. Team è Pro con i collaboratori: ognuno entra con il proprio
          account ed emette per la tua attività. Per invitarli servono le
          credenziali Fisconline, tue o del gestore incaricato: se oggi accedi
          all&apos;AdE con CIE o SPID, vedi{" "}
          <Link
            href="/help/credenziali-fisconline"
            className="text-primary hover:underline"
          >
            come ottenere le credenziali Fisconline
          </Link>
          {"."}
        </p>

        {/* ─── Lasciare Team ─── */}
        <h2 className="mt-10 text-xl font-semibold">
          Passare da Team a Pro o Starter
        </h2>
        <p className="text-muted-foreground mt-3 text-sm leading-relaxed">
          Nel portale Stripe scegli il nuovo piano. I collaboratori restano
          nella card Collaboratori ma non possono più emettere, annullare o fare
          resi: ricevono un&apos;email, e i loro scontrini restano consultabili.
          Se torni a Team riprendono da dove erano.
        </p>
        <p className="text-muted-foreground mt-3 text-sm leading-relaxed">
          {"Dettagli: "}
          <Link
            href="/help/collaboratori#cambio-piano"
            className="text-primary hover:underline"
          >
            cosa succede ai collaboratori quando cambi piano
          </Link>
        </p>

        {/* ─── Fatturazione ─── */}
        <h2 className="mt-10 text-xl font-semibold">
          Dove trovo la ricevuta del pagamento?
        </h2>
        <p className="text-muted-foreground mt-3 text-sm leading-relaxed">
          Dopo ogni pagamento Stripe invia automaticamente una ricevuta
          all&apos;email del tuo account. Puoi scaricare tutte le ricevute
          precedenti dal portale Stripe (stesso link{" "}
          <strong>Gestisci abbonamento</strong>), nella sezione{" "}
          <em>Cronologia fatturazione</em>.
        </p>

        <RelatedHelpArticles slug="cambio-piano" />

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
