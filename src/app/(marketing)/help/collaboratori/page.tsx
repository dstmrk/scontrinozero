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
import { HelpArticleUpdatedAt } from "@/components/help/article-updated-at";
import { RelatedHelpArticles } from "@/components/help/related-articles";
import { TRIAL_COLLABORATOR_LIMIT, TRIAL_DAYS } from "@/lib/plans-shared";

export const metadata = helpArticleMetadata("collaboratori");

const linkClass = "text-primary hover:underline";

/**
 * Mirror in testo piano della FAQ visibile a video: alimenta lo structured data
 * FAQPage. Tenere allineato al contenuto renderizzato sotto — skill
 * `marketing-content`.
 */
const faqItems: readonly FaqItem[] = [
  {
    question: "Il nome del collaboratore compare sullo scontrino?",
    answer:
      "No. Sullo scontrino, sul PDF e sulla ricevuta digitale compaiono i dati dell'attività, come sempre. Chi ha emesso ciascun documento lo vedi tu, nello Storico, nell'export CSV e in Analytics.",
  },
  {
    question: "Quanti collaboratori posso avere?",
    answer: `Con il piano Team sono illimitati. Nella prova gratuita di ${TRIAL_DAYS} giorni puoi averne ${TRIAL_COLLABORATOR_LIMIT}, inviti in sospeso compresi. Starter e Pro non includono i collaboratori.`,
  },
  {
    question:
      "Il collaboratore vede le mie credenziali dell'Agenzia delle Entrate?",
    answer:
      "No. Non vede codice fiscale, password e PIN, e non può cambiarli: emette con la sessione dell'attività, che ScontrinoZero apre con le tue credenziali. Nelle sue impostazioni trova solo il suo account e le preferenze del dispositivo.",
  },
  {
    question:
      "Posso invitare una persona che usa già ScontrinoZero per un'altra attività?",
    answer:
      "No: un account appartiene a una sola attività. Se la persona ha già un account ScontrinoZero, l'invito a quella email viene rifiutato; può farsi invitare con un'altra email.",
  },
];

export default function CollaboratoriPage() {
  return (
    <section className="px-4 py-16">
      <JsonLd data={helpArticleBreadcrumb("collaboratori", "Collaboratori")} />
      <HelpArticleJsonLd slug="collaboratori" />
      <JsonLd data={faqPageJsonLd(faqItems)} />
      <article className="mx-auto max-w-3xl">
        <Breadcrumbs
          items={helpArticleBreadcrumbItems("collaboratori", "Collaboratori")}
        />

        {/* ─── Intestazione ─── */}
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-3xl font-extrabold tracking-tight">
            Collaboratori: più persone alla cassa con il piano Team
          </h1>
          <Badge variant="secondary">Piano Team</Badge>
        </div>
        <p className="text-muted-foreground mt-3 text-sm leading-relaxed">
          {`Con il piano Team chi lavora con te emette scontrini per la tua attività con un accesso suo, senza conoscere la tua password. Lo inviti per email da Impostazioni → Collaboratori: accetta l'invito, crea il suo accesso ed entra in ScontrinoZero dal browser o dall'app. Vede la cassa e solo gli scontrini che ha emesso; credenziali AdE, abbonamento e Analytics restano a te. Su Team i collaboratori sono illimitati, nella prova gratuita al massimo ${TRIAL_COLLABORATOR_LIMIT}. Servono credenziali Fisconline verificate, tue o del gestore incaricato, perché con CIE o SPID ogni nuova sessione con l'Agenzia delle Entrate chiede il titolare.`}
        </p>
        <HelpArticleUpdatedAt slug="collaboratori" />

        {/* ─── Invitare ─── */}
        <h2 id="invitare" className="mt-10 scroll-mt-20 text-xl font-semibold">
          Come invitare un collaboratore
        </h2>
        <ol className="text-muted-foreground mt-3 list-decimal space-y-2 pl-5 text-sm leading-relaxed">
          <li>
            Vai in Impostazioni e apri la card Collaboratori, subito sotto le
            credenziali AdE.
          </li>
          <li>
            La prima volta accetta le Condizioni per i collaboratori: dicono
            cosa può fare chi inviti, cosa resta a tuo carico e come trattiamo i
            suoi dati per tuo conto.
          </li>
          <li>
            Scrivi l&apos;email del collaboratore e tocca Invita. Gli arriva un
            link valido 7 giorni.
          </li>
          <li>
            Il collaboratore apre il link, scrive nome e password e accetta
            Termini, Condizioni per i collaboratori e Privacy. Da lì entra con
            quella email, dal browser o dall&apos;app.
          </li>
        </ol>
        <ul className="text-muted-foreground mt-3 list-disc space-y-2 pl-5 text-sm leading-relaxed">
          <li>
            Puoi avere fino a 10 inviti validi insieme e mandarne 20 al giorno,
            reinvii compresi.
          </li>
          <li>
            Dalla stessa card un invito si reinvia; uno ancora valido si revoca,
            uno scaduto si elimina.
          </li>
          <li>
            {`Nella prova gratuita i collaboratori sono al massimo ${TRIAL_COLLABORATOR_LIMIT}, inviti in sospeso compresi.`}
          </li>
        </ul>
        <p className="text-muted-foreground mt-3 text-sm leading-relaxed">
          {"Il testo completo: "}
          <Link href="/condizioni-collaboratori" className={linkClass}>
            Condizioni per i collaboratori
          </Link>
        </p>

        {/* ─── Cosa può fare ─── */}
        <h2
          id="cosa-puo-fare"
          className="mt-10 scroll-mt-20 text-xl font-semibold"
        >
          Cosa può fare un collaboratore
        </h2>
        <ul className="text-muted-foreground mt-3 list-disc space-y-2 pl-5 text-sm leading-relaxed">
          <li>
            Emettere scontrini dalla cassa, stamparli e condividerli con il
            cliente.
          </li>
          <li>
            Vedere nello Storico solo gli scontrini che ha emesso, e annullare
            solo quelli.
          </li>
          <li>
            Fare il reso di qualunque vendita dell&apos;attività, cercandola con
            il numero stampato sullo scontrino e la data. Il reso risulta fatto
            da lui.
          </li>
          <li>Consultare il catalogo prodotti, senza modificarlo.</li>
          <li>
            Gestire il suo profilo, la password, la stampante e il tema, ed
            eliminare il suo account.
          </li>
        </ul>
        <p className="text-muted-foreground mt-3 text-sm leading-relaxed">
          Restano solo a te le credenziali AdE, i dati dell&apos;attività,
          l&apos;abbonamento, Analytics, l&apos;export CSV, la ricerca dei
          documenti sull&apos;archivio dell&apos;Agenzia, le chiavi API e la
          gestione dei collaboratori. Il nome del collaboratore non compare
          sullo scontrino.
        </p>

        {/* ─── Chi ha emesso ─── */}
        <h2
          id="chi-ha-emesso"
          className="mt-10 scroll-mt-20 text-xl font-semibold"
        >
          Come vedi chi ha emesso cosa
        </h2>
        <ul className="text-muted-foreground mt-3 list-disc space-y-2 pl-5 text-sm leading-relaxed">
          <li>
            Nello Storico, sotto il numero di ogni scontrino che non hai emesso
            tu, compare il nome del collaboratore, oppure «Developer API». Il
            filtro Emesso da mostra i documenti di una persona sola.
          </li>
          <li>
            L&apos;export CSV ha la colonna emesso_da, e lo stesso filtro dello
            Storico.
          </li>
          <li>
            In Analytics la tabella «Per chi ha emesso» dà scontrini e ricavi di
            ciascuno nel periodo. Un reso pesa su chi lo ha emesso.
          </li>
          <li>
            Nella card Collaboratori vedi l&apos;ultimo accesso di ognuno.
          </li>
        </ul>
        <p className="text-muted-foreground mt-3 text-sm leading-relaxed">
          {"I filtri e le colonne nel dettaglio: "}
          <Link href="/help/storico-ed-esportazione" className={linkClass}>
            Storico ed esportazione
          </Link>
        </p>

        {/* ─── Fisconline ─── */}
        <h2
          id="fisconline"
          className="mt-10 scroll-mt-20 text-xl font-semibold"
        >
          Perché con i collaboratori serve Fisconline
        </h2>
        <p className="text-muted-foreground mt-3 text-sm leading-relaxed">
          Con CIE o SPID ogni nuova sessione con l&apos;Agenzia delle Entrate
          chiede il titolare, con la conferma sul telefono o il login SPID: con
          più persone alla cassa durante la giornata non si regge. Con
          Fisconline ScontrinoZero rinnova la sessione da solo. Per questo,
          prima del primo invito, servono credenziali Fisconline verificate, tue
          o del gestore incaricato se l&apos;attività è una società. Finché hai
          collaboratori o inviti in sospeso, il passaggio da Fisconline a CIE o
          SPID resta bloccato.
        </p>
        <p className="text-muted-foreground mt-3 text-sm leading-relaxed">
          {"Se non le hai ancora: "}
          <Link href="/help/credenziali-fisconline" className={linkClass}>
            come ottenere le credenziali Fisconline
          </Link>
        </p>

        {/* ─── Credenziali rifiutate ─── */}
        <h2 id="password" className="mt-10 scroll-mt-20 text-xl font-semibold">
          Se l&apos;Agenzia rifiuta le credenziali
        </h2>
        <p className="text-muted-foreground mt-3 text-sm leading-relaxed">
          La password Fisconline scade ogni 90 giorni. Quando scade, o quando
          l&apos;Agenzia rifiuta le credenziali salvate, per esempio dopo un
          cambio di password fatto sul portale, ScontrinoZero smette di tentare
          l&apos;accesso, così l&apos;utenza non si blocca per i tentativi
          ripetuti. Fino a quando non le aggiorni, né tu né i collaboratori
          potete emettere, annullare o fare resi.
        </p>
        <p className="text-muted-foreground mt-3 text-sm leading-relaxed">
          Il collaboratore vede un messaggio che gli chiede di avvisarti, e tu
          ricevi un&apos;email con il motivo e il link alle impostazioni. Con la
          password scaduta, Verifica connessione nella card Credenziali AdE ti
          propone di cambiarla, e l&apos;app la aggiorna anche sul portale.
        </p>

        {/* ─── Cambio piano ─── */}
        <h2
          id="cambio-piano"
          className="mt-10 scroll-mt-20 text-xl font-semibold"
        >
          Se cambi piano o la prova scade
        </h2>
        <ul className="text-muted-foreground mt-3 list-disc space-y-2 pl-5 text-sm leading-relaxed">
          <li>
            Se passi da Team a Pro o Starter, o l&apos;abbonamento Team finisce,
            i collaboratori restano nella card ma non possono più emettere,
            annullare o fare resi. Ricevono un&apos;email, e i loro scontrini
            restano consultabili e scaricabili in PDF.
          </li>
          <li>
            Se la prova gratuita scade senza un abbonamento succede lo stesso,
            senza email: lo trovano scritto nell&apos;app al primo accesso.
          </li>
          <li>
            Quando torni a Team riprendono da dove erano: account e documenti
            non si perdono.
          </li>
        </ul>

        {/* ─── Rimuovere ─── */}
        <h2 id="rimuovere" className="mt-10 scroll-mt-20 text-xl font-semibold">
          Rimuovere un collaboratore
        </h2>
        <p className="text-muted-foreground mt-3 text-sm leading-relaxed">
          Dalla card Collaboratori tocchi Rimuovi accanto al nome:
          l&apos;accesso finisce subito e l&apos;account del collaboratore viene
          eliminato, con un&apos;email che lo avvisa. I documenti che ha emesso
          restano all&apos;attività, attribuiti al suo nome con
          l&apos;indicazione «(rimosso)». Anche il collaboratore può eliminare
          il suo account dalle sue impostazioni.
        </p>
        <p className="text-muted-foreground mt-3 text-sm leading-relaxed">
          Sullo stesso telefono o tablet, quando un collaboratore esce,
          ScontrinoZero cancella dal dispositivo i dati della sua sessione: chi
          entra dopo non vede i suoi scontrini.
        </p>

        {/* ─── FAQ (mirror di faqItems: tenere allineati) ─── */}
        <h2 className="mt-10 text-xl font-semibold">Domande frequenti</h2>
        <div className="mt-3 space-y-4">
          {faqItems.map((faq) => (
            <div key={faq.question}>
              <p className="text-sm font-medium">{faq.question}</p>
              <p className="text-muted-foreground mt-1 text-sm leading-relaxed">
                {faq.answer}
              </p>
            </div>
          ))}
        </div>

        <RelatedHelpArticles slug="collaboratori" />

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
