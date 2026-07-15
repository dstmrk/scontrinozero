import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import {
  JsonLd,
  faqPageJsonLd,
  helpArticleBreadcrumb,
  helpArticleBreadcrumbItems,
  type FaqItem,
} from "@/components/json-ld";
import { Breadcrumbs } from "@/components/marketing/breadcrumbs";
import { helpArticleMetadata } from "@/lib/help/metadata";
import { HelpArticleJsonLd } from "@/components/help/article-json-ld";
import { RelatedHelpArticles } from "@/components/help/related-articles";

export const metadata = helpArticleMetadata("collegare-ade-con-cie");

/**
 * Mirror in testo piano della FAQ visibile a video: alimenta lo structured data
 * FAQPage (rich result Google). Tenere allineato al contenuto renderizzato sotto.
 */
const faqItems: readonly FaqItem[] = [
  {
    question: "Serve la carta CIE fisica o il lettore per collegare l'AdE?",
    answer:
      "No. Il collegamento con CIE usa l'app CIE ID: bastano l'email e la password con cui ti sei registrato sull'app e uno smartphone su cui approvare la notifica push. Non serve appoggiare la carta al telefono né un lettore di smart card.",
  },
  {
    question: "Posso usare la CIE al posto delle credenziali Fisconline?",
    answer:
      "Sì. ScontrinoZero supporta due metodi per collegarsi al portale Fatture e Corrispettivi: le credenziali Fisconline (codice fiscale, password e PIN) oppure la CIE tramite l'app CIE ID (email e password + notifica push). Puoi scegliere quello che preferisci in fase di collegamento e cambiarlo in seguito da Impostazioni → Credenziali AdE.",
  },
  {
    question: "Perché mi arriva una notifica push quando verifico la CIE?",
    answer:
      "L'accesso con CIE prevede un secondo fattore: dopo aver inserito email e password dell'app CIE ID, l'Agenzia delle Entrate chiede di confermare l'accesso approvando una notifica sull'app CIE ID. Hai circa un minuto per approvarla; senza conferma il collegamento non si completa.",
  },
];

export default function CollegareAdeConCie() {
  return (
    <section className="px-4 py-16">
      <JsonLd
        data={helpArticleBreadcrumb(
          "collegare-ade-con-cie",
          "Collegare l'AdE con CIE",
        )}
      />
      <HelpArticleJsonLd slug="collegare-ade-con-cie" />
      <JsonLd data={faqPageJsonLd(faqItems)} />
      <article className="mx-auto max-w-3xl">
        <Breadcrumbs
          items={helpArticleBreadcrumbItems(
            "collegare-ade-con-cie",
            "Collegare l'AdE con CIE",
          )}
        />

        {/* ─── Intestazione ─── */}
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-3xl font-extrabold tracking-tight">
            Collegare ScontrinoZero all&apos;Agenzia delle Entrate con la CIE
          </h1>
          <Badge variant="secondary">Fiscalizzazione</Badge>
        </div>
        <p className="text-muted-foreground mt-3 text-sm leading-relaxed">
          Con la CIE colleghi ScontrinoZero al portale{" "}
          <strong>Fatture e Corrispettivi</strong> usando l&apos;app{" "}
          <strong>CIE ID</strong>: inserisci l&apos;email e la password
          dell&apos;app e approvi una notifica push sul telefono. È
          l&apos;alternativa alle{" "}
          <Link
            href="/help/credenziali-fisconline"
            className="text-primary hover:underline"
          >
            credenziali Fisconline
          </Link>{" "}
          per chi accede all&apos;AdE con la Carta d&apos;Identità Elettronica.
        </p>
        <p className="text-muted-foreground mt-1 text-sm">
          <strong>Ultimo aggiornamento:</strong> luglio 2026
        </p>

        {/* ─── Fisconline o CIE ─── */}
        <div className="bg-muted/50 mt-6 rounded-md p-4 text-sm">
          <p className="font-medium">Fisconline oppure CIE: scegli tu</p>
          <p className="text-muted-foreground mt-1 leading-relaxed">
            ScontrinoZero supporta due metodi di collegamento all&apos;Agenzia
            delle Entrate. Se hai già le <strong>credenziali Fisconline</strong>{" "}
            (codice fiscale, password e PIN) segui la{" "}
            <Link
              href="/help/come-collegare-ade"
              className="text-primary hover:underline"
            >
              guida al collegamento con Fisconline
            </Link>
            . Se invece accedi all&apos;AdE con la <strong>CIE</strong>, questa
            guida fa per te. Il metodo SPID non è ancora disponibile
            nell&apos;app.
          </p>
        </div>

        {/* ─── Prerequisiti ─── */}
        <h2 className="mt-10 text-xl font-semibold">
          Prima di iniziare: cosa ti serve
        </h2>
        <ul className="text-muted-foreground mt-3 list-disc space-y-1 pl-5 text-sm leading-relaxed">
          <li>
            L&apos;app <strong>CIE ID</strong> installata e attivata sul tuo
            smartphone, con la tua{" "}
            <strong>Carta d&apos;Identità Elettronica</strong> già associata.
          </li>
          <li>
            L&apos;<strong>email</strong> e la <strong>password</strong> con cui
            ti sei registrato sull&apos;app CIE ID.
          </li>
          <li>
            Account ScontrinoZero con onboarding completato (P.IVA e dati
            attività inseriti).
          </li>
          <li>
            Essere il <strong>titolare dell&apos;attività</strong> (o il legale
            rappresentante, in caso di società): l&apos;identità CIE
            dev&apos;essere quella personale abilitata a operare sul portale.
          </li>
        </ul>

        {/* ─── Passaggi ─── */}
        <h2 className="mt-10 text-xl font-semibold">
          Passaggio 1 — Apri la sezione Credenziali AdE
        </h2>
        <p className="text-muted-foreground mt-3 text-sm leading-relaxed">
          Dalla dashboard vai su <strong>Impostazioni → Credenziali AdE</strong>{" "}
          (su mobile: tocca l&apos;icona ☰ in alto a sinistra). Nel modulo di
          collegamento trovi il selettore del metodo: seleziona{" "}
          <strong>CIE</strong> al posto di Fisconline.
        </p>

        <h2 className="mt-10 text-xl font-semibold">
          Passaggio 2 — Inserisci le credenziali dell&apos;app CIE ID
        </h2>
        <p className="text-muted-foreground mt-3 text-sm leading-relaxed">
          Con il metodo CIE selezionato compili due campi:
        </p>
        <ul className="text-muted-foreground mt-3 list-disc space-y-1 pl-5 text-sm leading-relaxed">
          <li>
            <strong>Email dell&apos;app CIE ID</strong> — l&apos;indirizzo con
            cui hai registrato l&apos;app CIE ID.
          </li>
          <li>
            <strong>Password CIE ID</strong> — la password dell&apos;app CIE ID
            (non il PIN della carta).
          </li>
        </ul>
        <p className="text-muted-foreground mt-3 text-sm leading-relaxed">
          Le credenziali vengono cifrate con tecnologia a livello bancario
          (AES-256-GCM) prima di essere salvate e non sono mai visibili in
          chiaro, nemmeno al team di ScontrinoZero. Come per Fisconline, restano
          protette: vedi{" "}
          <Link
            href="/help/sicurezza-credenziali"
            className="text-primary hover:underline"
          >
            come proteggiamo le tue credenziali
          </Link>
          .
        </p>

        <h2 className="mt-10 text-xl font-semibold">
          Passaggio 3 — Approva la notifica push e verifica la connessione
        </h2>
        <p className="text-muted-foreground mt-3 text-sm leading-relaxed">
          Premi <strong>Verifica connessione</strong>: ScontrinoZero avvia un
          accesso di prova al portale AdE. In pochi secondi ricevi una{" "}
          <strong>notifica push sull&apos;app CIE ID</strong> sul telefono:
          approvala entro circa un minuto. A conferma avvenuta il collegamento è
          completo e ScontrinoZero scarica automaticamente Partita IVA e codice
          fiscale dell&apos;attività dall&apos;anagrafica AdE.
        </p>
        <div className="bg-muted/50 mt-4 rounded-md p-4 text-sm">
          <p className="font-medium">Se la notifica non arriva</p>
          <p className="text-muted-foreground mt-1 leading-relaxed">
            Controlla che l&apos;app CIE ID sia aggiornata e che le notifiche
            siano abilitate nelle impostazioni del telefono. Se scade il tempo
            di approvazione, riavvia la verifica da{" "}
            <strong>Impostazioni → Credenziali AdE</strong>: la sessione CIE è
            interattiva, quindi ogni tanto potrà chiederti di ricollegarti
            approvando una nuova notifica.
          </p>
        </div>

        {/* ─── Differenza con Fisconline ─── */}
        <h2 className="mt-10 text-xl font-semibold">
          In cosa cambia rispetto a Fisconline
        </h2>
        <p className="text-muted-foreground mt-3 text-sm leading-relaxed">
          Con Fisconline le credenziali (codice fiscale, password e PIN)
          consentono un accesso automatico e la password va rinnovata ogni 90
          giorni. Con CIE il secondo fattore è la <strong>notifica push</strong>{" "}
          approvata da te: più sicuro, ma la sessione è interattiva e
          ScontrinoZero potrà chiederti di riapprovare l&apos;accesso di tanto
          in tanto. Per l&apos;emissione degli scontrini il funzionamento è
          identico: una volta collegato, non cambia nulla nel modo in cui emetti
          i documenti commerciali.
        </p>

        {/* ─── FAQ ─── */}
        <h2 className="mt-10 text-xl font-semibold">Domande frequenti</h2>
        <div className="mt-4 space-y-6">
          {faqItems.map((item) => (
            <div key={item.question}>
              <h3 className="text-base font-semibold">{item.question}</h3>
              <p className="text-muted-foreground mt-2 text-sm leading-relaxed">
                {item.answer}
              </p>
            </div>
          ))}
        </div>

        <RelatedHelpArticles slug="collegare-ade-con-cie" />

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
