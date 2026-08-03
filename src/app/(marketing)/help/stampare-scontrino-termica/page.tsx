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

export const metadata = helpArticleMetadata("stampare-scontrino-termica");

export default function StampareScontrinoTermicaPage() {
  return (
    <section className="px-4 py-16">
      <JsonLd
        data={helpArticleBreadcrumb(
          "stampare-scontrino-termica",
          "Stampare lo scontrino su carta termica",
        )}
      />
      <HelpArticleJsonLd slug="stampare-scontrino-termica" />
      <article className="mx-auto max-w-3xl">
        <Breadcrumbs
          items={helpArticleBreadcrumbItems(
            "stampare-scontrino-termica",
            "Stampare lo scontrino su carta termica",
          )}
        />

        {/* ─── Intestazione ─── */}
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-3xl font-extrabold tracking-tight">
            Come stampare lo scontrino su carta termica
          </h1>
          <Badge variant="secondary">Scontrini</Badge>
        </div>
        <p className="text-muted-foreground mt-3 text-sm leading-relaxed">
          ScontrinoZero emette lo scontrino in modo <strong>digitale</strong>:
          quello che ha valore legale è il documento commerciale online (DCO, la
          versione elettronica dello scontrino) trasmesso all&apos;Agenzia delle
          Entrate. La stampa su carta termica è un&apos;opzione comoda per
          consegnare una copia fisica al cliente, ma{" "}
          <strong>non è obbligatoria</strong>: in alternativa puoi mostrare lo
          scontrino a schermo al cliente.
        </p>
        <HelpArticleUpdatedAt slug="stampare-scontrino-termica" />
        <figure className="mt-6">
          <AppScreenshot
            src="/screenshots/documento-commerciale.png"
            alt="Ricevuta pubblica dello scontrino con il pulsante Scarica PDF"
            width={661}
            height={1188}
            sizes="(min-width: 768px) 320px, 80vw"
            className="mx-auto max-w-[320px] rounded-xl"
          />
          <figcaption className="text-muted-foreground mt-2 text-center text-xs">
            Dalla ricevuta pubblica puoi scaricare il PDF e stamparlo.
          </figcaption>
        </figure>

        {/* ─── Cos'è una stampante termica ─── */}
        <h2 className="mt-10 text-xl font-semibold">
          Cos&apos;è una stampante termica e perché va bene per ScontrinoZero
        </h2>
        <p className="text-muted-foreground mt-3 text-sm leading-relaxed">
          Una stampante termica non usa inchiostro: scalda la carta in punti
          precisi e fa apparire il testo (per questo la carta è leggermente
          lucida e va conservata al riparo dal sole, altrimenti sbiadisce). È il
          modello usato in praticamente tutti i negozi per ricevute e scontrini:
          silenziosa, veloce, costa poco (40-90 € per il modello base) e non ha
          cartucce da sostituire, solo rotoli di carta.
        </p>
        <p className="text-muted-foreground mt-3 text-sm leading-relaxed">
          Da Android, ScontrinoZero parla direttamente con la stampante via{" "}
          <strong>Bluetooth</strong> (la connessione senza fili a corto raggio).
          Da iPhone, iPad e computer stampi invece il PDF dello scontrino, già
          formattato a 58 mm. Non è richiesto un modello fiscale o omologato:
          una qualsiasi stampante termica generica va bene, perché lo scontrino
          legale è già stato registrato all&apos;AdE e qui stiamo solo stampando
          una copia di cortesia.
        </p>

        {/* ─── Quale stampante scegliere ─── */}
        <h2 className="mt-10 text-xl font-semibold">
          Quale stampante scegliere
        </h2>
        <p className="text-muted-foreground mt-3 text-sm leading-relaxed">
          Tre parametri da controllare prima di comprare:
        </p>
        <ul className="text-muted-foreground mt-3 list-disc space-y-2 pl-5 text-sm leading-relaxed">
          <li>
            <strong>Larghezza carta: 58 mm o 80 mm.</strong> 58 mm è la misura
            più diffusa per le mini-stampanti portatili (ambulanti, food truck,
            mercati): ingombro ridotto, basta. 80 mm è l&apos;equivalente da
            banco di un classico negozio: scontrini più larghi, più leggibili.
            Verifica i rotoli su Amazon o in cartoleria — il formato giusto è
            facile da reperire in entrambi i casi.
          </li>
          <li>
            <strong>Linguaggio ESC/POS</strong> (il dialetto standard delle
            stampanti termiche, sviluppato originariamente da Epson). La quasi
            totalità delle stampanti termiche in commercio lo supporta: nella
            scheda prodotto cerca la dicitura &quot;ESC/POS compatible&quot;
            oppure il marchio Epson, Xprinter, Sunmi, Gprinter, Munbyn. Se non
            lo trovi scritto, evita — modelli proprietari potrebbero non
            funzionare con ScontrinoZero.
          </li>
          <li>
            <strong>Connessione: Bluetooth + USB.</strong> Una stampante
            Bluetooth si abbina al telefono o al tablet senza cavi — ideale per
            la cassa mobile. Una stampante USB si collega al computer (Mac,
            Windows, Linux) e va bene per chi lavora da postazione fissa. I
            modelli più diffusi hanno entrambi i collegamenti, così sei
            flessibile.
          </li>
        </ul>
        <p className="text-muted-foreground mt-3 text-sm leading-relaxed">
          Modello economico testato e funzionante con ScontrinoZero:{" "}
          <strong>Munbyn ITPP047</strong> (58 mm, Bluetooth + USB, circa 50 €).
          Non è un consiglio sponsorizzato: serve solo come esempio concreto di
          stampante che &quot;funziona e basta&quot;. Qualsiasi alternativa con
          caratteristiche simili (ESC/POS, Bluetooth, 58 o 80 mm) andrà bene.
        </p>
        <p className="text-muted-foreground mt-3 text-sm leading-relaxed">
          Per un confronto approfondito tra i tipi di connessione (WiFi,
          Bluetooth, USB), le fasce di prezzo e i criteri di acquisto vedi la
          guida{" "}
          <Link
            href="/guide/stampante-termica-wifi-scontrini"
            className="text-primary hover:underline"
          >
            Stampanti termiche WiFi per scontrini: guida alla scelta
          </Link>
          .
        </p>

        {/* ─── Collegare la stampante da Android ─── */}
        <h2 className="mt-10 text-xl font-semibold">
          Collegare la stampante da Android
        </h2>
        <p className="text-muted-foreground mt-3 text-sm leading-relaxed">
          Su Android con <strong>Chrome</strong>, <strong>Edge</strong> o{" "}
          <strong>Samsung Internet</strong>, ScontrinoZero parla direttamente
          con la stampante: non serve abbinarla prima dalle impostazioni del
          telefono, ci pensa il browser.
        </p>
        <ol className="text-muted-foreground mt-3 list-decimal space-y-2 pl-5 text-sm leading-relaxed">
          <li>
            Accendi la stampante e tienila vicina al telefono (entro 1-2 metri).
            Verifica che ci sia un rotolo di carta caricato.
          </li>
          <li>
            Assicurati che il <strong>Bluetooth del telefono sia attivo</strong>
            . Se usi Android 11 o precedenti servono attivi anche i{" "}
            <strong>servizi di localizzazione</strong>: è un requisito di
            sistema per la ricerca dei dispositivi Bluetooth, non serve a
            geolocalizzarti.
          </li>
          <li>
            In ScontrinoZero apri{" "}
            <strong>Impostazioni → Stampante → Collega stampante</strong>. Il
            browser mostra la lista dei dispositivi trovati: cerca un nome
            simile a <em>POS-58</em>, <em>BT Printer</em> o il modello della tua
            stampante, selezionalo e conferma.
          </li>
          <li>
            Tocca <strong>Stampa di prova</strong>. Deve uscire una pagina con
            il righello dei numeri, un campione di lettere accentate e — se hai
            lasciato attiva l&apos;opzione — un QR code.
          </li>
        </ol>
        <p className="text-muted-foreground mt-3 text-sm leading-relaxed">
          La stampa di prova serve a verificare tre cose in un colpo solo. Il{" "}
          <strong>righello</strong> deve arrivare esattamente da bordo a bordo:
          se sborda o avanza spazio, cambia la larghezza carta (58 o 80 mm)
          nella stessa schermata. Le <strong>lettere accentate</strong> devono
          essere leggibili. Il <strong>QR code</strong> deve risultare un
          quadrato nitido: se esce una riga di caratteri casuali, la tua
          stampante non supporta i QR — disattiva l&apos;opzione &quot;Stampa il
          QR della ricevuta&quot; e il resto continuerà a funzionare.
        </p>
        <p className="text-muted-foreground mt-3 text-sm leading-relaxed">
          Lasciando attiva la <strong>Stampa automatica</strong>, lo scontrino
          esce da solo appena l&apos;Agenzia delle Entrate conferma
          l&apos;emissione: al banco non devi toccare altro.
        </p>
        <p className="text-muted-foreground mt-3 text-sm leading-relaxed">
          Il collegamento resta attivo finché tieni aperta l&apos;app. Se chiudi
          il browser o riavvii il telefono, ScontrinoZero ricorda quale
          stampante usavi e ti basta toccare <strong>Ricollega</strong> — una
          volta a inizio giornata, non a ogni scontrino.
        </p>

        {/* ─── iPhone e iPad ─── */}
        <h2 className="mt-10 text-xl font-semibold">
          Da iPhone, iPad o computer
        </h2>
        <p className="text-muted-foreground mt-3 text-sm leading-relaxed">
          Su iPhone e iPad la stampa Bluetooth diretta{" "}
          <strong>non è disponibile</strong>, e non è una limitazione di
          ScontrinoZero: Safari e tutti i browser su iOS non implementano la
          tecnologia (Web Bluetooth) che permette a una pagina web di parlare
          con un dispositivo Bluetooth. Non esiste un&apos;impostazione da
          attivare per abilitarla. Lo stesso vale per Firefox e per Safari su
          Mac.
        </p>
        <p className="text-muted-foreground mt-3 text-sm leading-relaxed">
          Su questi dispositivi il bottone <strong>Stampa</strong> apre il{" "}
          <strong>PDF dello scontrino</strong>, già formattato a 58 mm: da lì
          usi il foglio di stampa del sistema (AirPrint su iPhone e iPad, il
          dialogo di stampa su computer) e lo mandi a qualsiasi stampante
          collegata. Funziona bene con le stampanti di rete e WiFi; le
          stampantine Bluetooth economiche, invece, il foglio di stampa del
          sistema non le raggiunge — su nessuna piattaforma.
        </p>
        <p className="text-muted-foreground mt-3 text-sm leading-relaxed">
          In pratica: se il tuo lavoro richiede la stampantina Bluetooth al
          banco, usa ScontrinoZero da un telefono o tablet{" "}
          <strong>Android</strong>. Se stampi da computer, collega una termica
          via USB o rete e stampa il PDF.
        </p>

        {/* ─── Stampa da computer via USB ─── */}
        <h2 className="mt-10 text-xl font-semibold">
          Stampare da computer via USB
        </h2>
        <ol className="text-muted-foreground mt-3 list-decimal space-y-2 pl-5 text-sm leading-relaxed">
          <li>
            Collega la stampante al computer con il cavo USB. Su Mac e Linux
            viene rilevata automaticamente; su Windows potrebbe chiedere un
            driver (il software che permette al sistema di comunicare con la
            periferica) — di solito un piccolo CD o link nella confezione. In
            alternativa, su Windows 10/11 spesso basta &quot;Aggiungi
            stampante&quot; e scegliere il modello dalla lista generica ESC/POS.
          </li>
          <li>
            In ScontrinoZero, dopo aver emesso lo scontrino, clicca{" "}
            <strong>Stampa</strong>: si apre il PDF dello scontrino. Stampalo e
            seleziona la stampante termica, impostando il formato carta su{" "}
            <strong>58 mm</strong> o <strong>80 mm</strong> in &quot;Altre
            impostazioni → Formato carta&quot;.
          </li>
          <li>
            Margini consigliati: <strong>0 mm</strong> su tutti i lati (la
            stampante termica ha già un margine fisico minimo). Se i margini
            sono troppo larghi, il testo verrà tagliato a destra.
          </li>
        </ol>

        {/* ─── Troubleshooting ─── */}
        <h2 className="mt-10 text-xl font-semibold">
          Problemi comuni e come risolverli
        </h2>
        <div className="mt-3 space-y-4">
          <div>
            <p className="text-sm font-medium">
              La stampante non compare nella lista quando tocco &quot;Collega
              stampante&quot;
            </p>
            <p className="text-muted-foreground mt-1 text-sm leading-relaxed">
              Spegni e riaccendi la stampante (alcune entrano in modalità di
              abbinamento solo nei primi 60 secondi dopo l&apos;accensione).
              Verifica che non sia già collegata a un altro dispositivo: se sì,
              scollegala da lì prima di cercarla dal nuovo telefono. Se usi{" "}
              <strong>Android 11 o precedenti</strong>, controlla che i servizi
              di localizzazione siano attivi: senza, la ricerca dei dispositivi
              Bluetooth non restituisce nulla e la lista resta vuota senza
              spiegazione. È la causa non ovvia più frequente.
            </p>
          </div>
          <div>
            <p className="text-sm font-medium">
              Lo scontrino esce in bianco o con righe sbiadite
            </p>
            <p className="text-muted-foreground mt-1 text-sm leading-relaxed">
              Il rotolo è inserito al contrario. La carta termica stampa solo su
              un lato: passa l&apos;unghia sulla parte esterna del rotolo — se
              non si vede alcun segno, gira il rotolo. Se lo scontrino esce
              sbiadito ma leggibile, il rotolo è vecchio o conservato male: la
              carta termica perde sensibilità con il calore e la luce,
              sostituisci il rotolo.
            </p>
          </div>
          <div>
            <p className="text-sm font-medium">
              Il taglio è sbagliato, il testo va a capo male
            </p>
            <p className="text-muted-foreground mt-1 text-sm leading-relaxed">
              Vai su <strong>Impostazioni → Stampante</strong> in ScontrinoZero
              e controlla che la larghezza carta sia impostata sul valore
              corretto (58 o 80 mm,{" "}
              <strong>deve corrispondere al rotolo</strong>). Il modo più rapido
              per accorgersene è la <strong>stampa di prova</strong>: il
              righello dei numeri deve arrivare esattamente da bordo a bordo. Se
              stampi il PDF da computer, ricontrolla anche il formato carta nel
              dialogo di stampa: deve coincidere.
            </p>
          </div>
          <div>
            <p className="text-sm font-medium">
              La connessione si perde dopo qualche minuto di inattività
            </p>
            <p className="text-muted-foreground mt-1 text-sm leading-relaxed">
              Le stampanti termiche economiche hanno un timer di standby (di
              solito 10-30 minuti) per risparmiare la batteria. Quando vai a
              stampare il primo scontrino dopo una pausa lunga, premi il
              pulsante di accensione per riattivarla, poi tocca{" "}
              <strong>Ricollega</strong> in ScontrinoZero se il collegamento
              risulta caduto. Se preferisci che resti sempre accesa, alcuni
              modelli permettono di disattivare lo standby tenendo premuto il
              tasto FEED durante l&apos;accensione — controlla il manuale.
            </p>
          </div>
          <div>
            <p className="text-sm font-medium">
              La carta esce ma non stampa nulla, ed è calda al tatto
            </p>
            <p className="text-muted-foreground mt-1 text-sm leading-relaxed">
              È la stampante che gira a vuoto: la testina riscalda la carta ma
              la carta non risponde. Quasi sempre è il rotolo girato al
              contrario (vedi sopra) o un rotolo non termico (per stampanti a
              inchiostro). Sostituisci il rotolo con uno specifico per stampanti
              termiche.
            </p>
          </div>
        </div>

        {/* ─── FAQ ─── */}
        <h2 className="mt-10 text-xl font-semibold">Domande frequenti</h2>
        <div className="mt-3 space-y-4">
          <div>
            <p className="text-sm font-medium">
              Sono obbligato a consegnare lo scontrino stampato al cliente?
            </p>
            <p className="text-muted-foreground mt-1 text-sm leading-relaxed">
              No. Il documento commerciale online registrato all&apos;AdE è
              quello che ha valore fiscale. Al cliente puoi consegnare una copia
              stampata, una via email oppure mostrargli il QR code o il numero a
              schermo — sta a te decidere. La maggior parte dei clienti
              preferisce la carta per comodità, ma non è un requisito normativo.
            </p>
          </div>
          <div>
            <p className="text-sm font-medium">
              La carta termica sbiadisce: come faccio a tenere una copia di
              archivio?
            </p>
            <p className="text-muted-foreground mt-1 text-sm leading-relaxed">
              Non serve archiviare la copia cartacea: tutti gli scontrini emessi
              restano nel tuo Storico ScontrinoZero a tempo indeterminato e li
              trovi anche nel cassetto fiscale dell&apos;AdE. Per esportarli in
              un foglio Excel vedi{" "}
              <Link
                href="/help/storico-ed-esportazione"
                className="text-primary hover:underline"
              >
                Storico scontrini: filtri, ricerca ed esportazione
              </Link>
              .
            </p>
          </div>
          <div>
            <p className="text-sm font-medium">
              Posso usare la stampante che già ho per le ricevute del POS
              bancario?
            </p>
            <p className="text-muted-foreground mt-1 text-sm leading-relaxed">
              Se la stampante del POS è una termica standard ESC/POS esterna
              (Bluetooth o USB), sì — basta collegarla a ScontrinoZero come
              spiegato sopra. Se invece è una stampante interna integrata nel
              terminale POS, no: quella è guidata dal software del POS e non è
              accessibile da app esterne. In quel caso ti servirà una seconda
              stampante dedicata.
            </p>
          </div>
          <div>
            <p className="text-sm font-medium">
              Posso stampare uno scontrino già emesso, anche giorni dopo?
            </p>
            <p className="text-muted-foreground mt-1 text-sm leading-relaxed">
              Sì. Vai su <strong>Storico</strong>, apri lo scontrino che ti
              serve e tocca <strong>Stampa</strong>. Lo scontrino esce identico
              a quello originale, con la stessa data di emissione e lo stesso
              numero progressivo: non è un nuovo documento, è solo una copia.
            </p>
          </div>
          <div>
            <p className="text-sm font-medium">
              Devo dichiarare la stampante all&apos;Agenzia delle Entrate?
            </p>
            <p className="text-muted-foreground mt-1 text-sm leading-relaxed">
              No. La stampante termica usata da ScontrinoZero è una normale
              periferica di stampa, non un registratore telematico né un
              misuratore fiscale: l&apos;AdE non richiede alcuna registrazione
              del dispositivo. Diverso il caso del POS, che invece va censito
              sul portale Fatture e Corrispettivi — vedi{" "}
              <Link
                href="/help/registrare-pos-portale-ade"
                className="text-primary hover:underline"
              >
                Registrare un POS nel portale Fatture e Corrispettivi
              </Link>
              .
            </p>
          </div>
        </div>

        <RelatedHelpArticles slug="stampare-scontrino-termica" />

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
