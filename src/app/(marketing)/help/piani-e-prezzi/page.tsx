import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { JsonLd, helpArticleBreadcrumb } from "@/components/json-ld";

export const metadata: Metadata = {
  title:
    "Piani disponibili: Starter, Pro e self-hosted gratuito | ScontrinoZero Help",
  description:
    "Scopri le differenze tra i piani Starter, Pro e la versione self-hosted gratuita di ScontrinoZero. Prezzi, feature e come scegliere il piano giusto.",
};

export default function PianiEPrezziPage() {
  return (
    <section className="px-4 py-16">
      <JsonLd
        data={helpArticleBreadcrumb("piani-e-prezzi", "Piani e prezzi")}
      />
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
            Piani disponibili: Starter, Pro e self-hosted gratuito
          </h1>
          <Badge variant="secondary">Abbonamento</Badge>
        </div>
        <p className="text-muted-foreground mt-3 text-sm leading-relaxed">
          ScontrinoZero è disponibile in tre versioni: due piani hosted a
          pagamento (Starter e Pro) con un trial gratuito di 30 giorni, e una
          versione self-hosted completamente gratuita per chi preferisce gestire
          il proprio server.
        </p>
        <p className="text-muted-foreground mt-1 text-sm">
          <strong>Ultimo aggiornamento:</strong> aprile 2026
        </p>

        {/* ─── Panoramica piani ─── */}
        <h2 className="mt-10 text-xl font-semibold">Panoramica dei piani</h2>
        <div className="mt-3 overflow-x-auto">
          <table className="text-muted-foreground w-full text-sm">
            <thead>
              <tr className="border-border border-b text-left">
                <th className="text-foreground pb-2 font-semibold">Piano</th>
                <th className="text-foreground pb-2 font-semibold">Mensile</th>
                <th className="text-foreground pb-2 font-semibold">Annuale</th>
                <th className="text-foreground pb-2 font-semibold">Target</th>
              </tr>
            </thead>
            <tbody className="divide-border divide-y">
              <tr>
                <td className="text-foreground py-2 font-medium">Starter</td>
                <td className="py-2">€4,99/mese</td>
                <td className="py-2">€29,99/anno</td>
                <td className="py-2">Micro-attività, ambulanti</td>
              </tr>
              <tr>
                <td className="text-foreground py-2 font-medium">Pro</td>
                <td className="py-2">€8,99/mese</td>
                <td className="py-2">€49,99/anno</td>
                <td className="py-2">Negozi, attività regolari</td>
              </tr>
              <tr>
                <td className="text-foreground py-2 font-medium">
                  Self-hosted
                </td>
                <td className="py-2 font-semibold text-green-600">Gratuito</td>
                <td className="py-2 font-semibold text-green-600">Gratuito</td>
                <td className="py-2">Tecnici, smanettoni</td>
              </tr>
            </tbody>
          </table>
        </div>
        <p className="text-muted-foreground mt-3 text-sm leading-relaxed">
          L&apos;abbonamento annuale fa risparmiare il <strong>50%</strong>{" "}
          rispetto al mensile per Starter e il <strong>54%</strong> per Pro. Non
          è richiesta nessuna carta di credito per iniziare il trial.
        </p>

        {/* ─── Piano Starter ─── */}
        <h2 className="mt-10 text-xl font-semibold">Piano Starter</h2>
        <p className="text-muted-foreground mt-3 text-sm leading-relaxed">
          Pensato per chi emette pochi scontrini al giorno e non ha bisogno di
          funzioni avanzate. Include tutto il necessario per operare in modo
          conforme:
        </p>
        <ul className="text-muted-foreground mt-2 list-disc space-y-1 pl-5 text-sm leading-relaxed">
          <li>Scontrini elettronici illimitati</li>
          <li>Annullamento scontrini</li>
          <li>Pagamento in contanti o con carta</li>
          <li>
            Catalogo rapido fino a <strong>5 prodotti</strong>
          </li>
          <li>Storico scontrini con filtri per data e stato</li>
          <li>Lotteria degli Scontrini</li>
          <li>PWA installabile su smartphone</li>
          <li>Supporto via email entro 48 ore</li>
        </ul>
        <p className="text-muted-foreground mt-3 text-sm leading-relaxed">
          A <strong>€29,99/anno</strong> è il prezzo più basso del mercato per
          un registratore di cassa virtuale conforme all&apos;AdE.
        </p>

        {/* ─── Piano Pro ─── */}
        <h2 className="mt-10 text-xl font-semibold">Piano Pro</h2>
        <p className="text-muted-foreground mt-3 text-sm leading-relaxed">
          Per esercenti con un volume di vendite regolare che hanno bisogno di
          strumenti avanzati per la gestione e la contabilità. Include tutto ciò
          che è disponibile nel piano Starter, più il catalogo illimitato e il
          supporto prioritario. Sono inoltre in sviluppo alcune feature
          riservate al piano Pro:
        </p>
        <ul className="text-muted-foreground mt-2 list-disc space-y-1 pl-5 text-sm leading-relaxed">
          <li>
            Catalogo rapido <strong>illimitato</strong>
          </li>
          <li>Supporto prioritario via email entro 24 ore</li>
          <li>
            <em>In arrivo:</em> analytics avanzata con dashboard storica
          </li>
          <li>
            <em>In arrivo:</em> <strong>Export CSV</strong> dello storico
            scontrini (per commercialista o contabilità)
          </li>
          <li>
            <em>In arrivo:</em> recupero corrispettivi da AdE (sincronizzazione
            dati storici)
          </li>
          <li>
            <em>In arrivo:</em> sync catalogo prodotti da rubrica AdE
          </li>
        </ul>
        <p className="text-muted-foreground mt-3 text-sm leading-relaxed">
          A <strong>€49,99/anno</strong> Pro è più conveniente di Starter su
          base percentuale (54% di risparmio sul mensile vs. 50% di Starter),
          pensato per chi usa ScontrinoZero tutti i giorni.
        </p>

        {/* ─── Self-hosted ─── */}
        <h2 className="mt-10 text-xl font-semibold">
          Versione self-hosted (gratuita)
        </h2>
        <p className="text-muted-foreground mt-3 text-sm leading-relaxed">
          ScontrinoZero è open source con licenza O&apos;Saasy. Puoi scaricare
          il codice sorgente, installarlo sul tuo server e usarlo gratuitamente:
          hai accesso a tutto il codice del progetto e ricevi le feature in
          arrivo (analytics avanzata, export CSV, recupero corrispettivi AdE)
          man mano che vengono rilasciate. È la scelta giusta se:
        </p>
        <ul className="text-muted-foreground mt-2 list-disc space-y-1 pl-5 text-sm leading-relaxed">
          <li>
            Hai competenze tecniche (Linux, Docker, Node.js) o un team IT.
          </li>
          <li>
            Vuoi che le tue credenziali Fisconline non transitino da server di
            terzi.
          </li>
          <li>Preferisci un controllo totale sull&apos;infrastruttura.</li>
        </ul>
        <p className="text-muted-foreground mt-3 text-sm leading-relaxed">
          Con la versione self-hosted sei responsabile di hosting, backup e
          aggiornamenti. Non è incluso supporto tecnico.
        </p>

        {/* ─── Trial gratuito ─── */}
        <h2 className="mt-10 text-xl font-semibold">
          Trial gratuito di 30 giorni
        </h2>
        <p className="text-muted-foreground mt-3 text-sm leading-relaxed">
          Tutti i nuovi account hanno <strong>30 giorni di prova</strong>{" "}
          gratuita con accesso completo alle funzioni Pro. Nessuna carta di
          credito richiesta per iniziare.
        </p>
        <p className="text-muted-foreground mt-3 text-sm leading-relaxed">
          <strong>Cosa succede alla scadenza del trial:</strong>
        </p>
        <ul className="text-muted-foreground mt-2 list-disc space-y-1 pl-5 text-sm leading-relaxed">
          <li>
            Se aggiungi una carta di credito e scegli un piano, l&apos;account
            resta attivo senza interruzioni.
          </li>
          <li>
            Se non aggiungi una carta, l&apos;account passa in{" "}
            <strong>sola lettura</strong>: puoi consultare lo storico degli
            scontrini ma non emetterne di nuovi.
          </li>
          <li>I tuoi dati vengono conservati e rimangono accessibili.</li>
        </ul>

        {/* ─── Confronto feature ─── */}
        <h2 className="mt-10 text-xl font-semibold">
          Confronto feature per piano
        </h2>
        <div className="mt-3 overflow-x-auto">
          <table className="text-muted-foreground w-full text-sm">
            <thead>
              <tr className="border-border border-b text-left">
                <th className="text-foreground pb-2 font-semibold">Feature</th>
                <th className="text-foreground pb-2 font-semibold">Starter</th>
                <th className="text-foreground pb-2 font-semibold">Pro</th>
              </tr>
            </thead>
            <tbody className="divide-border divide-y">
              <tr>
                <td className="text-foreground py-2 font-medium">
                  Scontrini illimitati
                </td>
                <td className="py-2">✓</td>
                <td className="py-2">✓</td>
              </tr>
              <tr>
                <td className="text-foreground py-2 font-medium">
                  Pagamento contanti o carta
                </td>
                <td className="py-2">✓</td>
                <td className="py-2">✓</td>
              </tr>
              <tr>
                <td className="text-foreground py-2 font-medium">
                  Lotteria Scontrini
                </td>
                <td className="py-2">✓</td>
                <td className="py-2">✓</td>
              </tr>
              <tr>
                <td className="text-foreground py-2 font-medium">
                  Catalogo prodotti
                </td>
                <td className="py-2">Max 5</td>
                <td className="py-2">Illimitato</td>
              </tr>
              <tr>
                <td className="text-foreground py-2 font-medium">
                  Analytics avanzata
                </td>
                <td className="py-2">—</td>
                <td className="py-2">In arrivo</td>
              </tr>
              <tr>
                <td className="text-foreground py-2 font-medium">Export CSV</td>
                <td className="py-2">—</td>
                <td className="py-2">In arrivo</td>
              </tr>
              <tr>
                <td className="text-foreground py-2 font-medium">
                  Recupero corrispettivi AdE
                </td>
                <td className="py-2">—</td>
                <td className="py-2">In arrivo</td>
              </tr>
              <tr>
                <td className="text-foreground py-2 font-medium">
                  Supporto prioritario
                </td>
                <td className="py-2">—</td>
                <td className="py-2">✓</td>
              </tr>
            </tbody>
          </table>
        </div>

        {/* ─── Come scegliere ─── */}
        <h2 className="mt-10 text-xl font-semibold">
          Come scegliere il piano giusto
        </h2>
        <div className="mt-3 space-y-3">
          <div>
            <p className="text-sm font-medium">Scegli Starter se:</p>
            <ul className="text-muted-foreground mt-1 list-disc space-y-1 pl-5 text-sm leading-relaxed">
              <li>Emetti meno di 20-30 scontrini al giorno.</li>
              <li>Hai un catalogo entro i 5 prodotti.</li>
              <li>
                Lavori in mobilità (ambulante, mercatino, servizio occasionale)
                e ti basta lo storico scontrini con i filtri base.
              </li>
            </ul>
          </div>
          <div>
            <p className="text-sm font-medium">Scegli Pro se:</p>
            <ul className="text-muted-foreground mt-1 list-disc space-y-1 pl-5 text-sm leading-relaxed">
              <li>Hai un negozio aperto tutti i giorni.</li>
              <li>Hai più di 5 prodotti nel catalogo rapido.</li>
              <li>Vuoi il supporto prioritario via email entro 24 ore.</li>
              <li>
                Vuoi accedere alle feature in arrivo riservate al piano Pro
                (export CSV scontrini, analytics avanzata, recupero
                corrispettivi e sync catalogo da rubrica AdE).
              </li>
            </ul>
          </div>
        </div>
        <p className="text-muted-foreground mt-3 text-sm leading-relaxed">
          Ricorda: puoi provare tutto con il <strong>trial di 30 giorni</strong>{" "}
          e decidere alla scadenza.
        </p>

        {/* ─── Articoli correlati ─── */}
        <h2 className="mt-10 text-xl font-semibold">Articoli correlati</h2>
        <ul className="mt-3 space-y-1 text-sm">
          <li>
            <Link
              href="/help/prima-configurazione"
              className="text-primary hover:underline"
            >
              Prima configurazione passo-passo (onboarding completo)
            </Link>
          </li>
          <li>
            <Link
              href="/help/storico-ed-esportazione"
              className="text-primary hover:underline"
            >
              Storico scontrini: filtri, ricerca ed esportazione
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
