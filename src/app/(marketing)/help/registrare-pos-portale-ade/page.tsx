import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { JsonLd, helpArticleBreadcrumb } from "@/components/json-ld";
import { HelpArticleJsonLd } from "@/components/help/article-json-ld";
import { RelatedHelpArticles } from "@/components/help/related-articles";

export const metadata: Metadata = {
  title:
    "Come registrare un POS nel portale Fatture e Corrispettivi | ScontrinoZero Help",
  description:
    "Guida passo-passo al Censimento POS sul portale Fatture e Corrispettivi dell'Agenzia delle Entrate: prerequisiti, percorso nel portale, differenza fra POS bancario e POS-RT, errori comuni.",
};

export default function RegistrarePosPortaleAdePage() {
  return (
    <section className="px-4 py-16">
      <JsonLd
        data={helpArticleBreadcrumb(
          "registrare-pos-portale-ade",
          "Registrare un POS nel portale Fatture e Corrispettivi",
        )}
      />
      <HelpArticleJsonLd slug="registrare-pos-portale-ade" />
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
            Come registrare un POS nel portale Fatture e Corrispettivi
          </h1>
          <Badge variant="secondary">POS / Normativa</Badge>
        </div>
        <p className="text-muted-foreground mt-3 text-sm leading-relaxed">
          Dal 1° gennaio 2026 ogni POS (Point Of Sale, il terminale per
          incassare pagamenti con carta) usato in attività commerciale va
          comunicato all&apos;Agenzia delle Entrate tramite la procedura di{" "}
          <strong>Censimento POS</strong> sul portale{" "}
          <em>Fatture e Corrispettivi</em>. È una registrazione una tantum: la
          fai la prima volta che metti in funzione il terminale e poi non devi
          più rifarla, salvo cambi di terminale o di banca.
        </p>
        <p className="text-muted-foreground mt-1 text-sm">
          <strong>Ultimo aggiornamento:</strong> aprile 2026
        </p>

        {/* ─── Promemoria sulla differenza POS bancario vs POS-RT ─── */}
        <div className="bg-muted/50 mt-6 rounded-md p-4 text-sm">
          <p className="font-medium">
            POS bancario e POS-RT: stesso censimento
          </p>
          <p className="text-muted-foreground mt-1 leading-relaxed">
            Un <strong>POS bancario</strong> classico è il terminale che la tua
            banca ti dà per accettare carte: trasmette l&apos;incasso al
            circuito (Visa, Mastercard) e basta. Un <strong>POS-RT</strong>{" "}
            (Registratore Telematico) è un POS evoluto che, oltre a incassare il
            pagamento, emette anche lo scontrino fiscale e lo manda
            all&apos;AdE: integra entrambe le funzioni in un unico dispositivo.
            Per il portale la procedura di Censimento è la{" "}
            <strong>stessa</strong>: cambia solo cosa indichi nel campo
            &quot;Modello&quot; e se poi colleghi o meno il terminale a un
            sistema di emissione scontrini (come ScontrinoZero o un registratore
            telematico). Per il quadro normativo completo vedi{" "}
            <Link
              href="/guide/pos-rt-obbligo-2026"
              className="text-primary hover:underline"
            >
              POS-RT: obbligo 2026 e cosa fare
            </Link>
            .
          </p>
        </div>

        {/* ─── Prerequisiti ─── */}
        <h2 className="mt-10 text-xl font-semibold">
          Prima di iniziare: cosa ti serve
        </h2>
        <ul className="text-muted-foreground mt-3 list-disc space-y-2 pl-5 text-sm leading-relaxed">
          <li>
            <strong>Credenziali per accedere al portale AdE</strong>: vanno bene
            SPID (l&apos;identità digitale unica nazionale), CIE (Carta
            d&apos;Identità Elettronica), CNS (Carta Nazionale dei Servizi)
            oppure Fisconline (il sistema di accesso dell&apos;Agenzia per chi
            ha partita IVA attiva). Se hai già collegato ScontrinoZero
            all&apos;AdE, le credenziali Fisconline sono le stesse — vedi{" "}
            <Link
              href="/help/credenziali-fisconline"
              className="text-primary hover:underline"
            >
              Credenziali Fisconline
            </Link>
            .
          </li>
          <li>
            <strong>ID del terminale POS</strong> (il codice identificativo
            univoco scritto sul retro del terminale e/o nel contratto della
            banca, spesso chiamato &quot;Terminal ID&quot; o &quot;TID&quot;, di
            solito 6-8 cifre).
          </li>
          <li>
            <strong>Dati del contratto con la banca o l&apos;operatore</strong>{" "}
            (numero contratto, codice esercente o &quot;Merchant ID&quot; — un
            altro codice fornito dalla banca che identifica il tuo esercizio sul
            circuito di pagamento). Tutto questo è riportato sul contratto di
            noleggio o acquisto del POS.
          </li>
          <li>
            <strong>Partita IVA attiva</strong> e dati anagrafici
            dell&apos;esercizio aggiornati sul portale AdE.
          </li>
        </ul>

        {/* ─── Passaggio 1 ─── */}
        <h2 className="mt-10 text-xl font-semibold">
          Passaggio 1 — Accedi al portale Fatture e Corrispettivi
        </h2>
        <p className="text-muted-foreground mt-3 text-sm leading-relaxed">
          Vai su <strong>ivaservizi.agenziaentrate.gov.it</strong> e clicca{" "}
          <strong>Entra</strong>. Scegli il metodo di accesso (SPID, CIE, CNS o
          Fisconline) e completa l&apos;autenticazione. Una volta dentro, se
          operi a nome di una società o sei delegato da un altro soggetto, il
          portale ti chiederà di selezionare l&apos;utenza di lavoro: scegli
          quella della tua attività (P.IVA), non l&apos;utenza personale.
        </p>

        {/* ─── Passaggio 2 ─── */}
        <h2 className="mt-10 text-xl font-semibold">
          Passaggio 2 — Apri la sezione Corrispettivi
        </h2>
        <p className="text-muted-foreground mt-3 text-sm leading-relaxed">
          Dalla home del portale, nel menu in alto trovi le voci{" "}
          <em>Fatture elettroniche</em>, <em>Corrispettivi</em>, <em>Altro</em>.
          Clicca su <strong>Corrispettivi</strong> →{" "}
          <strong>Gestore ed esercente</strong>. Si apre una pagina con
          l&apos;elenco delle funzioni dedicate a chi gestisce corrispettivi
          telematici.
        </p>

        {/* ─── Passaggio 3 ─── */}
        <h2 className="mt-10 text-xl font-semibold">
          Passaggio 3 — Vai su Censimento POS
        </h2>
        <p className="text-muted-foreground mt-3 text-sm leading-relaxed">
          Nella sezione <em>Gestore ed esercente</em> trovi una card intitolata{" "}
          <strong>Censimento POS</strong>. Cliccala: ti ritrovi sulla pagina di
          gestione dei terminali registrati. Se non hai mai censito un POS, la
          lista sarà vuota. Clicca il pulsante <strong>Nuovo POS</strong> (in
          alto a destra, etichetta arancione).
        </p>

        {/* ─── Passaggio 4 ─── */}
        <h2 className="mt-10 text-xl font-semibold">
          Passaggio 4 — Compila i dati del terminale
        </h2>
        <p className="text-muted-foreground mt-3 text-sm leading-relaxed">
          Il modulo chiede pochi dati: prepara il contratto della banca accanto,
          ci trovi tutto. I campi principali:
        </p>
        <ul className="text-muted-foreground mt-3 list-disc space-y-2 pl-5 text-sm leading-relaxed">
          <li>
            <strong>Identificativo POS (TID)</strong> — il codice di 6-8 cifre
            del terminale. Lo trovi su un&apos;etichetta sotto il POS o sul
            contratto.
          </li>
          <li>
            <strong>Codice esercente (Merchant ID)</strong> — codice assegnato
            dalla banca all&apos;esercizio. Anche questo sul contratto.
          </li>
          <li>
            <strong>Codice fiscale dell&apos;esercente</strong> — viene
            precompilato con la P.IVA dell&apos;attività con cui hai fatto
            login, lascialo così.
          </li>
          <li>
            <strong>Soggetto gestore</strong> — la banca o l&apos;istituto di
            pagamento (Nexi, SumUp, Worldline, Intesa Sanpaolo, Unicredit,
            ecc.). Lo selezioni da un menu a tendina.
          </li>
          <li>
            <strong>Tipo POS</strong> — tipicamente &quot;POS
            tradizionale&quot;, &quot;POS evoluto&quot; o &quot;POS-RT&quot;. Se
            non sai cosa scegliere e il terminale è uno standard fornito dalla
            tua banca per accettare carte, è &quot;POS tradizionale&quot;. Se è
            un dispositivo che emette anche scontrini fiscali, è
            &quot;POS-RT&quot;.
          </li>
          <li>
            <strong>Data di attivazione</strong> — la data in cui hai iniziato a
            usare il terminale (di solito coincide con la data del contratto o
            di consegna).
          </li>
        </ul>
        <p className="text-muted-foreground mt-3 text-sm leading-relaxed">
          Clicca <strong>Salva</strong>. Il portale mostra un messaggio di
          conferma e il POS appare nella lista con stato <em>Attivo</em>.
        </p>

        {/* ─── Passaggio 5 ─── */}
        <h2 className="mt-10 text-xl font-semibold">
          Passaggio 5 — Conferma e archiviazione
        </h2>
        <p className="text-muted-foreground mt-3 text-sm leading-relaxed">
          Dalla lista dei POS censiti puoi scaricare la ricevuta della
          registrazione in PDF: cliccala una volta, salvala fra i documenti
          dell&apos;attività. Non è obbligatorio archiviarla, ma è la prova più
          immediata che il censimento è andato a buon fine in caso di controllo
          successivo. Da questa stessa pagina, in futuro, potrai disattivare il
          POS (se cambi banca o lo rendi), modificare i dati o aggiungerne uno
          nuovo.
        </p>

        {/* ─── Errori comuni ─── */}
        <h2 className="mt-10 text-xl font-semibold">
          Se il censimento fallisce: cosa controllare
        </h2>
        <div className="mt-3 space-y-4">
          <div>
            <p className="text-sm font-medium">
              {"«"}P.IVA non abilitata{"»"}
            </p>
            <p className="text-muted-foreground mt-1 text-sm leading-relaxed">
              Se la P.IVA è stata aperta di recente (meno di 5-7 giorni
              lavorativi), potrebbe non risultare ancora abilitata sulla sezione
              Corrispettivi del portale. Aspetta qualche giorno e riprova. Se
              persiste oltre i 10 giorni lavorativi, contatta l&apos;Agenzia
              delle Entrate al numero verde <strong>800 90 96 96</strong>{" "}
              (gratuito da telefono fisso, lunedì-venerdì 9-17) per verificare
              l&apos;abilitazione.
            </p>
          </div>
          <div>
            <p className="text-sm font-medium">
              {"«"}Identificativo POS non valido{"» / «"}TID già censito{"»"}
            </p>
            <p className="text-muted-foreground mt-1 text-sm leading-relaxed">
              Ricontrolla il TID copiandolo direttamente dal contratto o
              dall&apos;etichetta sul retro del terminale (è facile confondere
              uno 0 con la lettera O). Se l&apos;errore è {"«"}TID già censito
              {"»"}, vuol dire che lo stesso terminale è registrato a
              un&apos;altra P.IVA — può succedere se hai comprato un POS usato o
              se il precedente esercente non l&apos;ha disattivato. In quel caso
              devi chiedere alla banca o al fornitore di rilasciare il terminale
              e censirlo poi a tuo nome.
            </p>
          </div>
          <div>
            <p className="text-sm font-medium">
              Codice esercente / Merchant ID rifiutato
            </p>
            <p className="text-muted-foreground mt-1 text-sm leading-relaxed">
              Il codice esercente è specifico per la coppia terminale-banca.
              Verifica di averlo letto dal contratto giusto: se hai più POS con
              banche diverse, ognuno ha il suo. In caso di dubbio chiama
              l&apos;assistenza tecnica della banca che ti ha fornito il POS —
              sono loro a generare il codice e possono confermarlo in 5 minuti.
            </p>
          </div>
          <div>
            <p className="text-sm font-medium">
              Il portale dà errore generico o pagina bianca
            </p>
            <p className="text-muted-foreground mt-1 text-sm leading-relaxed">
              Il portale AdE può essere in manutenzione o sovraccarico,
              soprattutto in orari di punta (mattine fra le 10 e le 12). Prova a
              riaccedere dopo 15-30 minuti, o in serata. Se il problema persiste
              per più di mezza giornata, prova un browser diverso (Chrome /
              Firefox / Safari): il portale è noto per essere più stabile su
              Chrome e Firefox aggiornati.
            </p>
          </div>
        </div>

        {/* ─── Cosa succede dopo il censimento ─── */}
        <h2 className="mt-10 text-xl font-semibold">
          Cosa succede dopo il censimento
        </h2>
        <p className="text-muted-foreground mt-3 text-sm leading-relaxed">
          Una volta censito il POS, dal 2026 il terminale invierà
          all&apos;Agenzia delle Entrate i dati aggregati dei pagamenti
          elettronici ricevuti (importi e numero di transazioni giornaliere, non
          i dati dei singoli clienti). È un flusso automatico gestito dalla
          banca o dall&apos;operatore: tu non devi fare nulla. Se usi
          ScontrinoZero per emettere gli scontrini, i corrispettivi continuano
          ad arrivare all&apos;AdE come sempre: i due flussi (POS → AdE per gli
          incassi aggregati, ScontrinoZero → AdE per i corrispettivi
          giornalieri) viaggiano in parallelo e l&apos;Agenzia li incrocia per
          controllare la coerenza.
        </p>

        {/* ─── FAQ ─── */}
        <h2 className="mt-10 text-xl font-semibold">Domande frequenti</h2>
        <div className="mt-3 space-y-4">
          <div>
            <p className="text-sm font-medium">
              Devo censire anche i POS mobili tipo SumUp o myPOS?
            </p>
            <p className="text-muted-foreground mt-1 text-sm leading-relaxed">
              Sì. Qualsiasi terminale che accetta pagamenti elettronici in
              attività commerciale va censito, indipendentemente dalla forma
              fisica. I lettori da smartphone (SumUp, myPOS, Nexi Mobile POS,
              iZettle) hanno un Terminal ID proprio come i POS classici, lo
              trovi nell&apos;app o nel contratto dell&apos;operatore.
            </p>
          </div>
          <div>
            <p className="text-sm font-medium">
              Se ho più POS della stessa banca, li censisco in un&apos;unica
              volta?
            </p>
            <p className="text-muted-foreground mt-1 text-sm leading-relaxed">
              No, ognuno va censito singolarmente, perché ognuno ha il suo
              Terminal ID. Ripeti la procedura di &quot;Nuovo POS&quot; per ogni
              terminale. I dati di banca e codice esercente possono essere
              identici, ma il TID è univoco.
            </p>
          </div>
          <div>
            <p className="text-sm font-medium">
              Cosa succede se uso il POS senza averlo censito?
            </p>
            <p className="text-muted-foreground mt-1 text-sm leading-relaxed">
              In fase di prima applicazione (2026) l&apos;Agenzia ha annunciato
              un periodo di tolleranza per gli adeguamenti. Resta però una
              violazione formale: a regime sono previste sanzioni amministrative
              graduate, con possibilità di ravvedimento operoso. Per la
              disciplina aggiornata segui{" "}
              <Link
                href="/help/normativa-pos-2026"
                className="text-primary hover:underline"
              >
                Nuova normativa POS 2026
              </Link>
              .
            </p>
          </div>
          <div>
            <p className="text-sm font-medium">
              Devo censire il POS anche se uso ScontrinoZero?
            </p>
            <p className="text-muted-foreground mt-1 text-sm leading-relaxed">
              Sì. Le due cose sono separate. ScontrinoZero gestisce
              l&apos;emissione dello scontrino e la trasmissione dei
              corrispettivi; il POS è il dispositivo fisico che materialmente
              incassa il pagamento. Il censimento POS riguarda solo il terminale
              di pagamento. ScontrinoZero come strumento software non va censito
              né registrato.
            </p>
          </div>
          <div>
            <p className="text-sm font-medium">
              Quanto tempo richiede la procedura?
            </p>
            <p className="text-muted-foreground mt-1 text-sm leading-relaxed">
              Una volta che hai i dati sotto mano (TID e Merchant ID dal
              contratto), il censimento di un singolo POS richiede 5-10 minuti.
              La parte più lenta è di solito trovare il contratto fisico della
              banca o aspettare che la P.IVA risulti abilitata al portale
              Corrispettivi se l&apos;hai aperta da poco.
            </p>
          </div>
        </div>

        <RelatedHelpArticles slug="registrare-pos-portale-ade" />

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
