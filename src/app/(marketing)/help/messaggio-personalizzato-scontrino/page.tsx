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

export const metadata = helpArticleMetadata(
  "messaggio-personalizzato-scontrino",
);

/**
 * Mirror in testo piano della FAQ visibile a video: alimenta lo structured data
 * FAQPage (rich result Google). Tenere allineato al contenuto renderizzato sotto.
 */
const faqItems: readonly FaqItem[] = [
  {
    question: "Il messaggio viene trasmesso all'Agenzia delle Entrate?",
    answer:
      "No. Il messaggio è un testo di cortesia che ScontrinoZero stampa sulla copia consegnata al cliente: non fa parte dei dati trasmessi all'Agenzia delle Entrate, non modifica i totali, l'IVA o il numero del documento commerciale, e non ha alcun effetto fiscale.",
  },
  {
    question: "Posso mettere il logo della mia attività?",
    answer:
      "No, la personalizzazione disponibile è solo testuale: fino a 64 caratteri su 2 righe. Il logo e la personalizzazione grafica dell'intestazione non sono disponibili. Se ti servono, scrivici a info@scontrinozero.it: le richieste degli esercenti guidano le priorità di sviluppo.",
  },
  {
    question: "Il messaggio compare anche sulla ricevuta di annullamento?",
    answer:
      "No. La ricevuta di annullamento riporta solo i dati dell'annullo e il riferimento allo scontrino annullato: un ringraziamento su quel documento sarebbe fuori luogo, quindi non viene stampato.",
  },
  {
    question: "Posso scrivere due righe diverse?",
    answer:
      "Sì. Vai a capo con Invio: puoi usare al massimo 2 righe, per un totale di 64 caratteri. L'anteprima nelle impostazioni mostra come verranno spezzate le righe sulla carta.",
  },
  {
    question: "Se passo da Pro a Starter perdo il messaggio?",
    answer:
      "Il testo resta salvato ma smette di essere stampato: gli scontrini tornano senza messaggio finché il piano non dà di nuovo accesso alle funzioni Pro. Riattivando Pro ricompare com'era, senza doverlo riscrivere.",
  },
];

export default function MessaggioPersonalizzatoScontrinoPage() {
  return (
    <section className="px-4 py-16">
      <JsonLd
        data={helpArticleBreadcrumb(
          "messaggio-personalizzato-scontrino",
          "Messaggio personalizzato",
        )}
      />
      <HelpArticleJsonLd slug="messaggio-personalizzato-scontrino" />
      <JsonLd data={faqPageJsonLd(faqItems)} />
      <article className="mx-auto max-w-3xl">
        <Breadcrumbs
          items={helpArticleBreadcrumbItems(
            "messaggio-personalizzato-scontrino",
            "Messaggio personalizzato",
          )}
        />

        {/* ─── Intestazione ─── */}
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-3xl font-extrabold tracking-tight">
            Messaggio personalizzato in fondo allo scontrino
          </h1>
          <Badge variant="secondary">Configurazione</Badge>
        </div>
        <p className="text-muted-foreground mt-3 text-sm leading-relaxed">
          Puoi far stampare un tuo messaggio in fondo agli scontrini — al posto
          del classico <em>&laquo;Arrivederci e grazie!&raquo;</em> — dalla card{" "}
          <strong>Personalizza lo scontrino</strong> in{" "}
          <strong>Impostazioni</strong>. Il limite è di{" "}
          <strong>64 caratteri su 2 righe</strong>, il messaggio compare su
          stampa termica, PDF e ricevuta digitale, ed è incluso nel piano{" "}
          <strong>Pro</strong> e nei 30 giorni di prova gratuita.
        </p>
        <HelpArticleUpdatedAt slug="messaggio-personalizzato-scontrino" />

        {/* ─── Come impostarlo ─── */}
        <h2 className="mt-10 text-xl font-semibold">
          Come impostare il messaggio
        </h2>
        <p className="text-muted-foreground mt-3 text-sm leading-relaxed">
          Bastano quattro passaggi, e il messaggio vale da subito per ogni
          scontrino successivo, da qualsiasi dispositivo tu emetta.
        </p>
        <ol className="text-muted-foreground mt-3 list-decimal space-y-2 pl-5 text-sm leading-relaxed">
          <li>
            Apri la dashboard e vai su <strong>Impostazioni</strong> dalla barra
            di navigazione.
          </li>
          <li>
            Scorri fino alla card <strong>Personalizza lo scontrino</strong>.
          </li>
          <li>
            Scrivi il tuo messaggio nel campo{" "}
            <strong>Messaggio in fondo allo scontrino</strong>. Sotto al campo
            l&apos;<strong>anteprima</strong> mostra come uscirà davvero dalla
            stampante.
          </li>
          <li>
            Clicca <strong>Salva</strong>. Per togliere il messaggio, svuota il
            campo e salva di nuovo.
          </li>
        </ol>

        {/* ─── Quanto testo ─── */}
        <h2 className="mt-10 text-xl font-semibold">
          Quanto testo puoi scrivere
        </h2>
        <p className="text-muted-foreground mt-3 text-sm leading-relaxed">
          Il massimo è <strong>64 caratteri</strong> distribuiti su un massimo
          di <strong>2 righe</strong> (vai a capo con Invio). Il limite non è
          arbitrario: 64 caratteri sono esattamente due righe piene di una
          stampante termica da <strong>58 mm</strong>, che stampa{" "}
          <strong>32 caratteri per riga</strong> ed è la più stretta fra le
          superfici su cui il messaggio finisce. Ciò che entra lì entra anche
          sul PDF e sulla ricevuta digitale.
        </p>
        <ul className="text-muted-foreground mt-3 list-disc space-y-2 pl-5 text-sm leading-relaxed">
          <li>
            <strong>Il contatore</strong> accanto al campo mostra i caratteri
            usati sui 64 disponibili e diventa rosso quando li superi.
          </li>
          <li>
            <strong>Le righe troppo lunghe vanno a capo da sole</strong>:
            l&apos;anteprima le spezza esattamente come farà la stampante, così
            non scopri il taglio sulla carta.
          </li>
          <li>
            <strong>Le accentate maiuscole vengono traslitterate</strong> —{" "}
            <em>È</em> diventa <em>E&apos;</em> — perché il set di caratteri
            delle stampanti termiche non le contiene. Anche questo lo vedi in
            anteprima prima di salvare.
          </li>
        </ul>

        {/* ─── Dove compare ─── */}
        <h2 className="mt-10 text-xl font-semibold">Dove compare</h2>
        <p className="text-muted-foreground mt-3 text-sm leading-relaxed">
          Il messaggio si stampa in coda al documento, dopo data, numero
          documento ed eventuale codice lotteria, su tutte e tre le copie che
          ScontrinoZero produce:
        </p>
        <ul className="text-muted-foreground mt-3 list-disc space-y-2 pl-5 text-sm leading-relaxed">
          <li>
            lo <strong>scontrino stampato</strong> sulla termica Bluetooth, sia
            dalla cassa sia dalla ristampa dallo storico;
          </li>
          <li>
            il <strong>PDF</strong> dello scontrino, quello che scarichi o invii
            al cliente;
          </li>
          <li>
            la <strong>ricevuta digitale</strong> che il cliente apre dal link o
            dal QR code.
          </li>
        </ul>
        <p className="text-muted-foreground mt-3 text-sm leading-relaxed">
          Non compare invece sulla <strong>ricevuta di annullamento</strong>, e
          non viene trasmesso all&apos;Agenzia delle Entrate: è un testo di
          cortesia sulla copia del cliente, non un dato fiscale. Totali, IVA e
          numero del documento commerciale restano identici.
        </p>

        {/* ─── Cosa non scriverci ─── */}
        <h2 className="mt-10 text-xl font-semibold">Cosa non scriverci</h2>
        <p className="text-muted-foreground mt-3 text-sm leading-relaxed">
          Tieni fuori i <strong>dati personali</strong> e le{" "}
          <strong>informazioni fiscali</strong>: la ricevuta digitale è
          raggiungibile da chiunque abbia il link, e un dato scritto lì è
          visibile quanto il resto dello scontrino.
        </p>
        <ul className="text-muted-foreground mt-3 list-disc space-y-2 pl-5 text-sm leading-relaxed">
          <li>
            <strong>Niente dati di clienti</strong> (nomi, numeri di telefono,
            indirizzi): il messaggio è uguale per tutti gli scontrini, quindi un
            dato personale finirebbe anche sulla copia di un altro cliente.
          </li>
          <li>
            <strong>Niente importi, sconti o diciture fiscali</strong>: le
            informazioni con valore fiscale sul documento commerciale sono
            quelle generate dall&apos;app, e un testo libero che sembra dato
            fiscale confonde e basta.
          </li>
          <li>
            <strong>Ricorda che è modificabile in ogni momento</strong>:
            ristampando un vecchio scontrino verrà stampato il messaggio{" "}
            <em>attuale</em>, non quello in vigore il giorno dell&apos;
            emissione. Vale la stessa logica dell&apos;intestazione, spiegata in{" "}
            <Link
              href="/help/intestazione-scontrino"
              className="text-primary hover:underline"
            >
              Personalizzare intestazione e dati dello scontrino
            </Link>
            {"."}
          </li>
        </ul>
        <p className="text-muted-foreground mt-3 text-sm leading-relaxed">
          Idee che funzionano bene nei 64 caratteri: un saluto (&laquo;Grazie e
          arrivederci!&raquo;), gli orari o il giorno di chiusura, il tuo
          profilo social, l&apos;indirizzo del sito.
        </p>

        {/* ─── Piano ─── */}
        <h2 className="mt-10 text-xl font-semibold">Quale piano serve</h2>
        <p className="text-muted-foreground mt-3 text-sm leading-relaxed">
          Il messaggio personalizzato è incluso nel piano <strong>Pro</strong> e
          nei <strong>30 giorni di prova gratuita</strong>, durante i quali puoi
          provarlo senza carta di credito. Sul piano Starter la card resta
          visibile ma il campo è sostituito dall&apos;invito a passare a Pro. Il
          confronto completo è in{" "}
          <Link
            href="/help/piani-e-prezzi"
            className="text-primary hover:underline"
          >
            Piani disponibili
          </Link>
          {"."}
        </p>
        <p className="text-muted-foreground mt-3 text-sm leading-relaxed">
          Se cambi piano il testo non viene cancellato: smette semplicemente di
          essere stampato, e torna sugli scontrini appena il piano dà di nuovo
          accesso alle funzioni Pro.
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

        <RelatedHelpArticles slug="messaggio-personalizzato-scontrino" />

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
