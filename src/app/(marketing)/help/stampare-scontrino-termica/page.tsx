import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { JsonLd, helpArticleBreadcrumb } from "@/components/json-ld";
import { HelpArticleJsonLd } from "@/components/help/article-json-ld";
import { RelatedHelpArticles } from "@/components/help/related-articles";

export const metadata: Metadata = {
  title: "Come stampare lo scontrino su carta termica",
  description:
    "Guida pratica alla scelta di una stampante termica per scontrini (58 o 80 mm), all'abbinamento Bluetooth da Android, iPhone e computer e alla risoluzione dei problemi più comuni.",
};

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
          <strong>non è obbligatoria</strong>: in alternativa puoi inviare lo
          scontrino via email o mostrarlo a schermo.
        </p>
        <p className="text-muted-foreground mt-1 text-sm">
          <strong>Ultimo aggiornamento:</strong> aprile 2026
        </p>

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
          ScontrinoZero parla con la stampante tramite{" "}
          <strong>Bluetooth</strong> (la connessione senza fili a corto raggio)
          o via cavo USB. Non è richiesto un modello fiscale o omologato: una
          qualsiasi stampante termica generica va bene, perché lo scontrino
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

        {/* ─── Pairing Android ─── */}
        <h2 className="mt-10 text-xl font-semibold">
          Abbinare la stampante da Android
        </h2>
        <ol className="text-muted-foreground mt-3 list-decimal space-y-2 pl-5 text-sm leading-relaxed">
          <li>
            Accendi la stampante e tienila vicina al telefono (entro 1-2 metri).
            Verifica che ci sia un rotolo di carta caricato.
          </li>
          <li>
            Sul telefono apri <strong>Impostazioni → Bluetooth</strong> e
            assicurati che il Bluetooth sia attivo.
          </li>
          <li>
            Cerca tra i &quot;Dispositivi disponibili&quot;: dovresti vedere un
            nome simile a <em>POS-58</em>, <em>BT Printer</em> o il modello
            della tua stampante. Toccalo per avviare l&apos;abbinamento.
          </li>
          <li>
            Se chiede un PIN di abbinamento (PIN, codice di sicurezza iniziale
            del dispositivo), prova <strong>0000</strong> o{" "}
            <strong>1234</strong> — sono i valori predefiniti della quasi
            totalità delle stampanti termiche economiche. Il PIN esatto è
            scritto sul manualetto cartaceo nella confezione.
          </li>
          <li>
            Apri ScontrinoZero, vai su <strong>Impostazioni → Stampante</strong>{" "}
            e seleziona la stampante dalla lista dei dispositivi abbinati. Tocca{" "}
            <strong>Stampa di prova</strong>: deve uscire una pagina con il logo
            ScontrinoZero e la dicitura &quot;Test stampa riuscito&quot;.
          </li>
        </ol>

        {/* ─── Pairing iPhone ─── */}
        <h2 className="mt-10 text-xl font-semibold">
          Abbinare la stampante da iPhone o iPad
        </h2>
        <p className="text-muted-foreground mt-3 text-sm leading-relaxed">
          Su iOS la procedura è simile, ma con un&apos;importante avvertenza:
          molte stampanti termiche economiche supportano solo{" "}
          <strong>Bluetooth Low Energy</strong> (BLE, la versione moderna a
          basso consumo) ma <strong>non</strong> il vecchio profilo SPP usato
          dai modelli più datati. iOS funziona solo con BLE, quindi assicurati
          che la stampante abbia la dicitura &quot;BLE&quot; o &quot;Bluetooth
          4.0/5.0&quot; nella scheda prodotto prima di comprarla.
        </p>
        <ol className="text-muted-foreground mt-3 list-decimal space-y-2 pl-5 text-sm leading-relaxed">
          <li>Accendi la stampante e avvicinala all&apos;iPhone.</li>
          <li>
            Vai su <strong>Impostazioni → Bluetooth</strong> e attendi che il
            nome della stampante compaia tra &quot;Altri dispositivi&quot;.
            Toccalo.
          </li>
          <li>
            Se la stampante non compare entro 30-40 secondi, apri ScontrinoZero
            (dev&apos;essere installato come app, vedi{" "}
            <Link
              href="/help/installare-app"
              className="text-primary hover:underline"
            >
              Installare ScontrinoZero come app
            </Link>
            {") e vai su "}
            <strong>Impostazioni → Stampante → Cerca dispositivo</strong>. In
            alcuni casi iOS mostra la stampante solo se la ricerca parte
            dall&apos;app che la userà.
          </li>
          <li>
            Conferma l&apos;abbinamento, poi torna su ScontrinoZero e fai la
            stampa di prova come per Android.
          </li>
        </ol>

        {/* ─── Stampa da desktop ─── */}
        <h2 className="mt-10 text-xl font-semibold">
          Stampare da computer (Mac, Windows, Linux)
        </h2>
        <p className="text-muted-foreground mt-3 text-sm leading-relaxed">
          Se lavori dal computer puoi collegare la stampante via USB e stampare
          lo scontrino come faresti con qualsiasi altro documento:
        </p>
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
            <strong>Stampa</strong>: si apre il dialogo di stampa standard del
            browser. Seleziona la stampante termica, imposta il formato carta su{" "}
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
              La stampante non compare nella lista Bluetooth
            </p>
            <p className="text-muted-foreground mt-1 text-sm leading-relaxed">
              Spegni e riaccendi la stampante (alcune entrano in modalità di
              abbinamento solo nei primi 60 secondi dopo l&apos;accensione).
              Verifica che non sia già abbinata a un altro dispositivo: se sì,
              scollegala da lì prima di cercarla dal nuovo telefono. Su Android,
              se l&apos;hai già abbinata e poi rimossa, può aiutare cancellare
              la cache Bluetooth {"("}
              <strong>
                Impostazioni → App → Bluetooth → Memoria → Cancella cache
              </strong>
              {") e riavviare."}
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
              <strong>deve corrispondere al rotolo</strong>). Se stampi da
              desktop, ricontrolla anche le impostazioni del dialogo di stampa
              del browser: il formato carta lì deve coincidere.
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
              pulsante di accensione per riattivarla: l&apos;abbinamento
              Bluetooth si ripristina automaticamente in 2-3 secondi. Se
              preferisci che resti sempre accesa, alcuni modelli permettono di
              disattivare lo standby tenendo premuto il tasto FEED durante
              l&apos;accensione — controlla il manuale.
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
              (Bluetooth o USB), sì — basta abbinarla a ScontrinoZero come
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
              serve e tocca <strong>Ristampa</strong>. Lo scontrino esce
              identico a quello originale, con la stessa data di emissione e lo
              stesso numero progressivo: non è un nuovo documento, è solo una
              copia.
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
