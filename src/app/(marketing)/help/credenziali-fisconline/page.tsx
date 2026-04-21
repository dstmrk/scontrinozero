import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Badge } from "@/components/ui/badge";

export const metadata: Metadata = {
  title:
    "Credenziali Fisconline: dove trovarle e come verificarle | ScontrinoZero Help",
  description:
    "Guida completa a Fisconline: cos'è, chi può ottenere le credenziali, come verificarle e cosa fare se la password è scaduta.",
};

export default function CredenzialiPage() {
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
            Credenziali Fisconline: dove trovarle e come verificarle
          </h1>
          <Badge variant="secondary">Fiscalizzazione</Badge>
        </div>
        <p className="text-muted-foreground mt-3 text-sm leading-relaxed">
          Per trasmettere scontrini elettronici all&apos;Agenzia delle Entrate
          servono le credenziali <strong>Fisconline</strong> del titolare
          dell&apos;attività. Questa guida spiega cosa sono, chi può ottenerle e
          come verificare che funzionino.
        </p>
        <p className="text-muted-foreground mt-1 text-sm">
          <strong>Ultimo aggiornamento:</strong> aprile 2026
        </p>

        {/* ─── Cos'è Fisconline ─── */}
        <h2 className="mt-10 text-xl font-semibold">Cos&apos;è Fisconline?</h2>
        <p className="text-muted-foreground mt-3 text-sm leading-relaxed">
          Fisconline è il sistema di credenziali storico dell&apos;Agenzia delle
          Entrate che permette di accedere ai servizi telematici, incluso il
          portale <strong>Fatture e Corrispettivi</strong> dove vengono
          trasmessi i documenti commerciali elettronici (scontrini).
        </p>
        <p className="text-muted-foreground mt-3 text-sm leading-relaxed">
          {
            "Dal 1° marzo 2021 (DL 76/2020 — “decreto Semplificazioni”) l'Agenzia non rilascia più credenziali Fisconline ai privati cittadini: questi accedono al portale AdE con "
          }
          <strong>SPID, CIE o CNS</strong>
          {
            ". Fisconline resta disponibile per i titolari di partita IVA attiva e per gli operatori autorizzati a operare per conto di società, enti o professionisti — ed è proprio questo il canale che ScontrinoZero utilizza per trasmettere gli scontrini."
          }
        </p>
        <p className="text-muted-foreground mt-3 text-sm leading-relaxed">
          Le credenziali Fisconline sono composte da{" "}
          <strong>tre elementi</strong>:
        </p>
        <ul className="text-muted-foreground mt-2 list-disc space-y-1 pl-5 text-sm leading-relaxed">
          <li>
            <strong>Codice fiscale</strong> — il codice fiscale personale (16
            caratteri) del titolare o del legale rappresentante.
          </li>
          <li>
            <strong>Password</strong> — scelta dall&apos;utente al primo
            accesso, scade ogni <strong>90 giorni</strong> e va rinnovata.
          </li>
          <li>
            <strong>PIN</strong> — codice di <strong>10 cifre</strong> assegnato
            dall&apos;Agenzia delle Entrate. Non scade e non può essere scelto.
          </li>
        </ul>
        <p className="text-muted-foreground mt-3 text-sm leading-relaxed">
          In ScontrinoZero vanno inseriti <strong>tutti e tre</strong> i valori
          {" in "}
          <strong>Impostazioni → Credenziali AdE</strong>
          {"."}
        </p>

        {/* ─── Come ottenere le credenziali ─── */}
        <h2 className="mt-10 text-xl font-semibold">
          Come ottenere le credenziali Fisconline
        </h2>
        <p className="text-muted-foreground mt-3 text-sm leading-relaxed">
          Le credenziali possono essere richieste solo se hai una{" "}
          <strong>partita IVA attiva</strong> o se sei già autorizzato a operare
          per conto di una società/ente/professionista. Hai due strade:
        </p>

        <h3 className="mt-6 text-base font-semibold">
          Opzione A — Online (dal sito AdE)
        </h3>
        <ol className="text-muted-foreground mt-2 list-decimal space-y-1 pl-5 text-sm leading-relaxed">
          <li>
            {"Vai su "}
            <strong>agenziaentrate.gov.it</strong>
            {" e accedi all'area riservata con SPID, CIE o CNS."}
          </li>
          <li>
            Nel menu dei servizi telematici seleziona{" "}
            <strong>Richiesta credenziali Fisconline</strong>.
          </li>
          <li>
            {
              "Il sistema mostra immediatamente le prime 4 cifre del PIN e la password di primo accesso."
            }
          </li>
          <li>
            {
              "Le restanti 6 cifre del PIN arrivano per posta al tuo domicilio fiscale entro "
            }
            <strong>15 giorni</strong>
            {"."}
          </li>
          <li>
            {
              "Al primo accesso al portale telematico ti verrà chiesto di scegliere una "
            }
            <strong>password personale</strong>
            {" (sostituendo quella di primo accesso)."}
          </li>
        </ol>

        <h3 className="mt-6 text-base font-semibold">
          Opzione B — Ufficio dell&apos;Agenzia delle Entrate
        </h3>
        <p className="text-muted-foreground mt-2 text-sm leading-relaxed">
          Presentandoti a uno sportello AdE con un documento d&apos;identità e
          l&apos;attestazione di partita IVA, ricevi in giornata il PIN completo
          (tutte e 10 le cifre) e la password di primo accesso.
        </p>
        <p className="text-muted-foreground mt-2 text-sm leading-relaxed">
          Se hai un commercialista o un intermediario abilitato, può attivare le
          credenziali per la tua attività come{" "}
          <strong>gestore incaricato</strong>
          {": il canale è quello corretto per una società."}
        </p>

        {/* ─── Password + PIN ─── */}
        <h2 className="mt-10 text-xl font-semibold">
          Password e PIN: come funzionano
        </h2>
        <div className="mt-3 space-y-3">
          <div className="bg-muted/50 rounded-md p-4 text-sm">
            <p className="font-medium">PIN (10 cifre)</p>
            <p className="text-muted-foreground mt-1 leading-relaxed">
              {
                "Assegnato dall'Agenzia: prime 4 cifre subito (via portale o email), ultime 6 cifre per posta entro 15 giorni. Il PIN è fisso, "
              }
              <strong>non scade</strong>
              {
                " e non si cambia. Finché non arriva la parte postale il PIN è incompleto e non funziona con ScontrinoZero."
              }
            </p>
          </div>
          <div className="bg-muted/50 rounded-md p-4 text-sm">
            <p className="font-medium">Password</p>
            <p className="text-muted-foreground mt-1 leading-relaxed">
              {"Scelta da te al primo accesso. Scade ogni "}
              <strong>90 giorni</strong>
              {
                " per motivi di sicurezza: quando scade, il portale AdE ti chiede di rinnovarla al successivo login. Dopo il rinnovo ricordati di aggiornarla anche in ScontrinoZero, altrimenti la trasmissione degli scontrini fallirà."
              }
            </p>
          </div>
        </div>

        {/* ─── Come verificare le credenziali ─── */}
        <h2 className="mt-10 text-xl font-semibold">
          Come verificare che le credenziali funzionino
        </h2>
        <p className="text-muted-foreground mt-3 text-sm leading-relaxed">
          Prima di inserirle in ScontrinoZero puoi provarle direttamente sul
          portale AdE:
        </p>
        <ol className="text-muted-foreground mt-3 list-decimal space-y-1 pl-5 text-sm leading-relaxed">
          <li>
            {"Vai su "}
            <strong>agenziaentrate.gov.it</strong>
            {" e seleziona "}
            <strong>Area riservata → Accedi</strong>
            {"."}
          </li>
          <li>
            Scegli <strong>Fisconline</strong> come metodo di accesso.
          </li>
          <li>
            Inserisci codice fiscale, password e PIN. Se accedi correttamente,
            le credenziali sono valide.
          </li>
          <li>
            Torna su ScontrinoZero, apri{" "}
            <strong>Impostazioni → Credenziali AdE</strong> e inseriscile: il
            collegamento dovrebbe riuscire al primo tentativo.
          </li>
        </ol>

        {/* ─── Password scaduta ─── */}
        <h2 className="mt-10 text-xl font-semibold">
          Cosa fare se la password è scaduta
        </h2>
        <p className="text-muted-foreground mt-3 text-sm leading-relaxed">
          La password Fisconline scade ogni 90 giorni. Se è scaduta:
        </p>
        <ol className="text-muted-foreground mt-3 list-decimal space-y-1 pl-5 text-sm leading-relaxed">
          <li>
            {
              "Accedi al portale AdE con codice fiscale, vecchia password e PIN: il sistema ti chiede automaticamente di impostarne una nuova."
            }
          </li>
          <li>
            Scegli una password conforme ai requisiti dell&apos;Agenzia
            (lunghezza minima, lettere e numeri) e confermala.
          </li>
          <li>
            {"Aggiorna la nuova password in ScontrinoZero ("}
            <strong>Impostazioni → Credenziali AdE</strong>
            {"): il codice fiscale e il PIN restano invariati."}
          </li>
        </ol>
        <p className="text-muted-foreground mt-3 text-sm leading-relaxed">
          {"Se non riesci ad accedere nemmeno per cambiarla, usa la procedura "}
          <strong>Ripristina password</strong>
          {" sul portale AdE o contatta il numero verde "}
          <strong>800 90 96 96</strong>
          {" (gratuito da telefono fisso, lun–ven 9–17)."}
        </p>

        {/* ─── Domande frequenti ─── */}
        <h2 className="mt-10 text-xl font-semibold">Domande frequenti</h2>
        <div className="mt-3 space-y-4">
          <div>
            <p className="text-sm font-medium">
              Posso usare le credenziali del mio commercialista o di un
              delegato?
            </p>
            <p className="text-muted-foreground mt-1 text-sm leading-relaxed">
              No. Le credenziali devono essere del{" "}
              <strong>titolare dell&apos;attività</strong> (o del legale
              rappresentante, se si tratta di una società). Usare le credenziali
              di un terzo non è previsto da ScontrinoZero e potrebbe violare le
              condizioni d&apos;uso del portale AdE.
            </p>
          </div>
          <div>
            <p className="text-sm font-medium">
              Ho una società — quale codice fiscale uso?
            </p>
            <p className="text-muted-foreground mt-1 text-sm leading-relaxed">
              {"Il "}
              <strong>
                codice fiscale personale del legale rappresentante
              </strong>
              {
                ", non la partita IVA della società. Le credenziali Fisconline sono associate alla persona fisica che risulta abilitata a operare per conto della società (gestore incaricato)."
              }
            </p>
          </div>
          <div>
            <p className="text-sm font-medium">
              Dove vengono conservate le mie credenziali?
            </p>
            <p className="text-muted-foreground mt-1 text-sm leading-relaxed">
              {
                "Vengono cifrate con AES-256-GCM (cifratura autenticata) prima di essere salvate nel database e vengono decifrate solo dal server a runtime, nel momento esatto in cui serve comunicare con l'Agenzia delle Entrate. Non sono mai visibili in chiaro, nemmeno al team di ScontrinoZero, e non transitano mai in log o email."
              }
            </p>
          </div>
        </div>

        {/* ─── Link correlati ─── */}
        <h2 className="mt-10 text-xl font-semibold">Articoli correlati</h2>
        <ul className="mt-3 space-y-1 text-sm">
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
              href="/help/primo-scontrino"
              className="text-primary hover:underline"
            >
              Come emettere il primo scontrino elettronico
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
