import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Badge } from "@/components/ui/badge";

export const metadata: Metadata = {
  title: "Errori comuni di accesso AdE e come risolverli | ScontrinoZero Help",
  description:
    "Guida alla risoluzione degli errori più frequenti nel collegamento con l'Agenzia delle Entrate: PIN scaduto, credenziali errate, attività non autorizzata e servizio non disponibile.",
};

export default function ErroriAdePage() {
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
            Errori comuni di accesso AdE e come risolverli
          </h1>
          <Badge variant="secondary">Fiscalizzazione</Badge>
        </div>
        <p className="text-muted-foreground mt-3 text-sm leading-relaxed">
          Quando ScontrinoZero non riesce a comunicare con il portale Fatture e
          Corrispettivi dell&apos;Agenzia delle Entrate, lo scontrino rimane in
          stato <strong>In elaborazione</strong> o mostra un errore esplicito.
          Questa guida copre i casi più frequenti con la soluzione per ciascuno.
        </p>
        <p className="text-muted-foreground mt-1 text-sm">
          <strong>Ultimo aggiornamento:</strong> aprile 2026
        </p>

        {/* ─── Errore 1 ─── */}
        <h2 className="mt-10 text-xl font-semibold">
          PIN scaduto o non ancora personalizzato
        </h2>
        <p className="text-muted-foreground mt-3 text-sm leading-relaxed">
          <strong>Sintomo:</strong> il test di connessione AdE fallisce con un
          messaggio del tipo &quot;credenziali non valide&quot; o &quot;accesso
          negato&quot;.
        </p>
        <p className="text-muted-foreground mt-3 text-sm leading-relaxed">
          <strong>Causa:</strong> il PIN Fisconline ha una validità di 3 anni.
          Alla prima registrazione viene rilasciato un PIN temporaneo di 6 cifre
          che deve essere personalizzato in un PIN di 8 cifre entro 30 giorni.
        </p>
        <p className="text-muted-foreground mt-3 text-sm font-medium">
          Soluzione:
        </p>
        <ol className="text-muted-foreground mt-2 list-decimal space-y-2 pl-5 text-sm leading-relaxed">
          <li>
            {"Vai su "}
            <strong>
              ivaservizi.agenziaentrate.gov.it → Fisconline → Accedi
            </strong>
            {"."}
          </li>
          <li>
            Prova ad accedere: se il PIN è scaduto, il portale AdE ti chiede
            direttamente di cambiarlo.
          </li>
          <li>
            Scegli un nuovo PIN di 8 cifre e confermalo. Il nuovo PIN è
            immediatamente attivo.
          </li>
          <li>
            {"Torna su ScontrinoZero, vai in "}
            <strong>Impostazioni → Attività → Credenziali AdE</strong> e
            aggiorna il PIN con il nuovo valore.
          </li>
        </ol>

        {/* ─── Errore 2 ─── */}
        <h2 className="mt-10 text-xl font-semibold">
          Credenziali errate (codice fiscale o PIN sbagliato)
        </h2>
        <p className="text-muted-foreground mt-3 text-sm leading-relaxed">
          <strong>Sintomo:</strong> il test fallisce con &quot;credenziali non
          valide&quot; anche con un PIN che ritieni corretto.
        </p>
        <p className="text-muted-foreground mt-3 text-sm font-medium">
          Cosa verificare:
        </p>
        <ul className="text-muted-foreground mt-2 list-disc space-y-2 pl-5 text-sm leading-relaxed">
          <li>
            Il <strong>codice fiscale</strong> inserito deve corrispondere
            esattamente all&apos;account Fisconline. Per le ditte individuali è
            il CF del titolare; per le società è il CF della persona che
            gestisce l&apos;account Fisconline (non il CF della società).
          </li>
          <li>
            Il <strong>PIN</strong> deve essere quello di 8 cifre
            personalizzato, non il PIN temporaneo di 6 cifre ricevuto
            inizialmente.
          </li>
          <li>
            {
              "Verifica le credenziali accedendo direttamente al portale AdE. Se funzionano lì ma non su ScontrinoZero, aggiornale in "
            }
            <strong>Impostazioni → Attività → Credenziali AdE</strong>.
          </li>
        </ul>
        <p className="text-muted-foreground mt-3 text-sm leading-relaxed">
          Attenzione: 5 tentativi falliti consecutivi sul portale AdE bloccano
          l&apos;account per 24 ore. Se sei bloccato, attendi il giorno
          successivo prima di ritentare.
        </p>

        {/* ─── Errore 3 ─── */}
        <h2 className="mt-10 text-xl font-semibold">
          Attività non registrata o non autorizzata sul portale AdE
        </h2>
        <p className="text-muted-foreground mt-3 text-sm leading-relaxed">
          <strong>Sintomo:</strong> le credenziali Fisconline funzionano sul
          portale AdE, ma ScontrinoZero riceve un errore di tipo &quot;soggetto
          non abilitato&quot; o &quot;partita IVA non trovata&quot; al momento
          di emettere uno scontrino.
        </p>
        <p className="text-muted-foreground mt-3 text-sm leading-relaxed">
          <strong>Causa:</strong> per emettere documenti commerciali elettronici
          sul portale Fatture e Corrispettivi, l&apos;attività deve essere
          abilitata. L&apos;abilitazione avviene automaticamente per la maggior
          parte delle attività, ma potrebbe non essere ancora attiva per le
          P.IVA aperte di recente.
        </p>
        <p className="text-muted-foreground mt-3 text-sm font-medium">
          Soluzione:
        </p>
        <ol className="text-muted-foreground mt-2 list-decimal space-y-2 pl-5 text-sm leading-relaxed">
          <li>
            {"Accedi al portale "}
            <strong>
              ivaservizi.agenziaentrate.gov.it → Fatture e Corrispettivi →
              Documento Commerciale Online
            </strong>
            {"."}
          </li>
          <li>
            Se riesci ad accedere alla sezione e vedi il modulo di emissione, la
            tua attività è abilitata: il problema è probabilmente nelle
            credenziali inserite su ScontrinoZero (vedi errore precedente).
          </li>
          <li>
            Se il portale mostra &quot;servizio non disponibile per questo
            soggetto&quot;, contatta il supporto AdE (800.90.96.96) o uno
            sportello dell&apos;Agenzia delle Entrate per richiedere
            l&apos;abilitazione.
          </li>
        </ol>

        {/* ─── Errore 4 ─── */}
        <h2 className="mt-10 text-xl font-semibold">
          Portale AdE temporaneamente non disponibile o lento
        </h2>
        <p className="text-muted-foreground mt-3 text-sm leading-relaxed">
          <strong>Sintomo:</strong>
          {" gli scontrini restano in stato "}
          <strong>In elaborazione</strong> più a lungo del solito (oltre 5
          minuti), oppure il test di connessione fallisce con errori di timeout.
        </p>
        <p className="text-muted-foreground mt-3 text-sm leading-relaxed">
          <strong>Causa:</strong> il portale dell&apos;Agenzia delle Entrate ha
          picchi di carico (in particolare a fine mese) o periodi di
          manutenzione programmata (solitamente la notte o il fine settimana).
        </p>
        <p className="text-muted-foreground mt-3 text-sm font-medium">
          Come comportarsi:
        </p>
        <ul className="text-muted-foreground mt-2 list-disc space-y-2 pl-5 text-sm leading-relaxed">
          <li>
            ScontrinoZero riprova automaticamente la trasmissione a intervalli
            crescenti per diverse ore. Non è necessario fare nulla.
          </li>
          <li>
            Puoi continuare ad emettere scontrini normalmente: si accodano e
            vengono trasmessi appena il portale torna disponibile.
          </li>
          <li>
            {"Verifica lo stato del portale AdE su "}
            <strong>stato.agenziaentrate.gov.it</strong> o cercando
            &quot;Fatture e Corrispettivi manutenzione&quot; sul sito AdE.
          </li>
          <li>
            {
              "Se il problema persiste per oltre 24 ore, contatta il supporto ScontrinoZero a "
            }
            <a
              href="mailto:info@scontrinozero.it"
              className="text-primary hover:underline"
            >
              info@scontrinozero.it
            </a>
            {"."}
          </li>
        </ul>

        {/* ─── Errore 5 ─── */}
        <h2 className="mt-10 text-xl font-semibold">
          Troppi tentativi — account Fisconline bloccato
        </h2>
        <p className="text-muted-foreground mt-3 text-sm leading-relaxed">
          <strong>Sintomo:</strong> il portale AdE mostra &quot;utente
          bloccato&quot; o &quot;accesso sospeso per sicurezza&quot;.
        </p>
        <p className="text-muted-foreground mt-3 text-sm leading-relaxed">
          <strong>Causa:</strong> 5 tentativi di accesso falliti consecutivi
          attivano un blocco automatico di sicurezza di 24 ore.
        </p>
        <p className="text-muted-foreground mt-3 text-sm font-medium">
          Soluzione:
        </p>
        <ul className="text-muted-foreground mt-2 list-disc space-y-2 pl-5 text-sm leading-relaxed">
          <li>Attendi 24 ore, poi accedi con le credenziali corrette.</li>
          <li>
            Se non ricordi il PIN, puoi reimpostarlo tramite la funzione di
            recupero sul portale Fisconline o rivolgendoti a un CAF o a uno
            sportello AdE.
          </li>
          <li>
            Nel frattempo puoi continuare ad emettere scontrini su
            ScontrinoZero: verranno trasmessi all&apos;AdE non appena le
            credenziali saranno di nuovo valide.
          </li>
        </ul>

        {/* ─── Errore 6 ─── */}
        <h2 className="mt-10 text-xl font-semibold">
          Credenziali delegate (professionista o intermediario)
        </h2>
        <p className="text-muted-foreground mt-3 text-sm leading-relaxed">
          <strong>Sintomo:</strong> stai usando le credenziali del tuo
          commercialista o intermediario fiscale e ricevi un errore di accesso
          negato.
        </p>
        <p className="text-muted-foreground mt-3 text-sm leading-relaxed">
          <strong>Causa:</strong>
          {
            " le credenziali delegate funzionano per alcune sezioni del portale AdE, ma "
          }
          <strong>
            il Documento Commerciale Online richiede le credenziali del titolare
            dell&apos;attività
          </strong>
          {", non quelle di un intermediario."}
        </p>
        <p className="text-muted-foreground mt-3 text-sm leading-relaxed">
          {
            "Devi usare le tue credenziali Fisconline personali, associate al codice fiscale del titolare/legale rappresentante dell'attività. "
          }
          <Link
            href="/help/credenziali-fisconline"
            className="text-primary hover:underline"
          >
            Come ottenere le credenziali Fisconline →
          </Link>
        </p>

        {/* ─── Quando contattare il supporto ─── */}
        <h2 className="mt-10 text-xl font-semibold">
          Quando contattare il supporto
        </h2>
        <p className="text-muted-foreground mt-3 text-sm leading-relaxed">
          {"Contatta il supporto ScontrinoZero ("}
          <a
            href="mailto:info@scontrinozero.it"
            className="text-primary hover:underline"
          >
            info@scontrinozero.it
          </a>
          {") se:"}
        </p>
        <ul className="text-muted-foreground mt-2 list-disc space-y-1 pl-5 text-sm leading-relaxed">
          <li>
            Le credenziali funzionano sul portale AdE ma non su ScontrinoZero.
          </li>
          <li>
            Uno scontrino è rimasto in stato &quot;In elaborazione&quot; per più
            di 24 ore.
          </li>
          <li>Ricevi messaggi di errore diversi da quelli descritti sopra.</li>
        </ul>
        <p className="text-muted-foreground mt-3 text-sm leading-relaxed">
          Includi nella mail l&apos;ID dello scontrino problematico (visibile
          nello Storico) e uno screenshot del messaggio di errore, se
          disponibile.
        </p>

        {/* ─── Articoli correlati ─── */}
        <h2 className="mt-10 text-xl font-semibold">Articoli correlati</h2>
        <ul className="mt-3 space-y-1 text-sm">
          <li>
            <Link
              href="/help/credenziali-fisconline"
              className="text-primary hover:underline"
            >
              Credenziali Fisconline: dove trovarle e come verificarle
            </Link>
          </li>
          <li>
            <Link
              href="/help/come-collegare-ade"
              className="text-primary hover:underline"
            >
              Come collegare ScontrinoZero all&apos;Agenzia delle Entrate
            </Link>
          </li>
          <li>
            <Link
              href="/help/sicurezza-credenziali"
              className="text-primary hover:underline"
            >
              Sicurezza e privacy: come proteggiamo le tue credenziali
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
