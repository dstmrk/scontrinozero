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
import { RelatedHelpArticles } from "@/components/help/related-articles";

export const metadata = helpArticleMetadata("presenta-un-amico");

export default function PresentaUnAmicoPage() {
  return (
    <section className="px-4 py-16">
      <JsonLd
        data={helpArticleBreadcrumb("presenta-un-amico", "Presenta un amico")}
      />
      <HelpArticleJsonLd slug="presenta-un-amico" />
      <article className="mx-auto max-w-3xl">
        <Breadcrumbs
          items={helpArticleBreadcrumbItems(
            "presenta-un-amico",
            "Presenta un amico",
          )}
        />

        {/* ─── Intestazione ─── */}
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-3xl font-extrabold tracking-tight">
            Presenta un amico: come funziona il bonus referral
          </h1>
          <Badge variant="secondary">Abbonamento</Badge>
        </div>
        <p className="text-muted-foreground mt-3 text-sm leading-relaxed">
          Con <strong>Presenta un amico</strong> ci guadagnate in due. Chiamiamo{" "}
          <strong>presentatore</strong> chi invita e <strong>presentato</strong>{" "}
          chi accetta l&apos;invito registrandosi con il codice: il presentato
          ottiene <strong>un mese di prova in più</strong> e il presentatore{" "}
          <strong>un mese in più sul proprio piano</strong>.
        </p>
        <p className="text-muted-foreground mt-1 text-sm">
          <strong>Ultimo aggiornamento:</strong> giugno 2026
        </p>

        {/* ─── Come funziona in breve ─── */}
        <h2 className="mt-10 text-xl font-semibold">Come funziona in breve</h2>
        <ul className="text-muted-foreground mt-3 list-disc space-y-2 pl-5 text-sm leading-relaxed">
          <li>
            <strong>Il presentato</strong> (chi si registra con il tuo codice)
            ottiene <strong>subito</strong> un mese di prova in più: invece di
            30 giorni, ne ha <strong>60</strong> per provare ScontrinoZero senza
            carta di credito.
          </li>
          <li>
            <strong>Il presentatore</strong> (tu, che inviti) ottiene{" "}
            <strong>un mese in più sul tuo piano</strong>. Questo bonus{" "}
            <strong>non è immediato</strong>: arriva solo quando il presentato
            attiva davvero il servizio (vedi <em>Quando arriva il bonus</em> più
            sotto).
          </li>
        </ul>

        {/* ─── Dove trovi il tuo codice ─── */}
        <h2 className="mt-10 text-xl font-semibold">
          Dove trovi il tuo codice
        </h2>
        <ol className="text-muted-foreground mt-3 list-decimal space-y-3 pl-5 text-sm leading-relaxed">
          <li>
            Accedi a ScontrinoZero e vai su{" "}
            <strong>Dashboard → Impostazioni → Piano e Abbonamento</strong>.
          </li>
          <li>
            Nella sezione <strong>Presenta un amico</strong> trovi il tuo{" "}
            <strong>codice referral</strong> personale.
          </li>
          <li>
            Tocca <strong>Condividi codice referral</strong>: l&apos;app prepara
            un link di invito (del tipo{" "}
            <code className="bg-muted rounded px-1 py-0.5 text-xs">
              /register?rcode=ILTUOCODICE
            </code>
            ) pronto da inviare via messaggio, email o social.
          </li>
        </ol>

        {/* ─── Come invitare ─── */}
        <h2 className="mt-10 text-xl font-semibold">Come invitare qualcuno</h2>
        <p className="text-muted-foreground mt-3 text-sm leading-relaxed">
          Condividi il link di invito con la persona che vuoi presentare. Quando
          la apre, la pagina di registrazione mostra il tuo codice{" "}
          <strong>già compilato</strong>: al presentato basta completare la
          registrazione normalmente. In alternativa può inserire il codice a
          mano nel campo dedicato del modulo di registrazione.
        </p>

        {/* ─── Quando arriva il bonus ─── */}
        <h2 className="mt-10 text-xl font-semibold">Quando arriva il bonus</h2>
        <p className="text-muted-foreground mt-3 text-sm leading-relaxed">
          I due bonus scattano in momenti diversi, ed è importante saperlo:
        </p>
        <ul className="text-muted-foreground mt-3 list-disc space-y-2 pl-5 text-sm leading-relaxed">
          <li>
            <strong>Presentato — subito.</strong> Il mese di prova in più viene
            applicato al momento della registrazione con il codice.
          </li>
          <li>
            <strong>Presentatore — non subito.</strong> Il tuo mese viene
            accreditato{" "}
            <strong>solo quando il presentato collega la propria P.IVA</strong>{" "}
            e completa la verifica delle credenziali con l&apos;Agenzia delle
            Entrate, diventando un utente attivo a tutti gli effetti. La
            semplice registrazione non basta.
          </li>
        </ul>
        <p className="text-muted-foreground mt-3 text-sm leading-relaxed">
          Il motivo è semplice: il bonus premia gli inviti che si trasformano in
          esercenti reali che usano ScontrinoZero, non la sola iscrizione. Se
          hai invitato qualcuno e non vedi ancora il mese, è probabile che debba
          ancora completare il collegamento con l&apos;Agenzia delle Entrate.
        </p>

        {/* ─── Dove vedo il mese in più ─── */}
        <h2 className="mt-10 text-xl font-semibold">
          Dove vedo il mese in più
        </h2>
        <p className="text-muted-foreground mt-3 text-sm leading-relaxed">
          Il mese si applica al tuo <strong>piano attuale</strong>, e lo trovi
          sempre in <strong>Impostazioni → Piano e Abbonamento</strong>:
        </p>
        <ul className="text-muted-foreground mt-3 list-disc space-y-2 pl-5 text-sm leading-relaxed">
          <li>
            Se sei ancora in <strong>periodo di prova</strong>, la prova si
            allunga di un mese.
          </li>
          <li>
            Se hai un <strong>abbonamento attivo</strong> (Starter o Pro), la{" "}
            <strong>data di rinnovo si sposta in avanti di un mese</strong>: il
            prossimo addebito slitta di conseguenza. Lo stesso spostamento è
            visibile anche nel portale di fatturazione Stripe (link{" "}
            <strong>Vai al portale Stripe →</strong>), così l&apos;app e la
            fatturazione restano allineate.
          </li>
        </ul>
        <p className="text-muted-foreground mt-3 text-sm leading-relaxed">
          Puoi presentare più persone: ogni nuovo cliente che attiva il servizio
          con il tuo codice ti fa guadagnare un altro mese. Trovi le condizioni
          aggiornate dei piani in{" "}
          <Link
            href="/help/piani-e-prezzi"
            className="text-primary hover:underline"
          >
            Piani disponibili
          </Link>
          {"."}
        </p>

        <RelatedHelpArticles slug="presenta-un-amico" />

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
