import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Badge } from "@/components/ui/badge";

export const metadata: Metadata = {
  title: "API per sviluppatori | ScontrinoZero",
  description:
    "Documentazione completa delle API REST di ScontrinoZero: autenticazione, endpoint, esempi curl e riferimenti tecnici.",
};

export default function ApiDocsPage() {
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
            API per sviluppatori
          </h1>
          <Badge variant="secondary">Piano Pro</Badge>
        </div>
        <p className="text-muted-foreground mt-3 text-sm leading-relaxed">
          Le API REST di ScontrinoZero permettono di integrare l&apos;emissione
          di scontrini elettronici direttamente nel tuo gestionale, POS o
          e-commerce. Ogni chiamata usa le credenziali Fisconline del tuo
          esercente e trasmette il documento all&apos;Agenzia delle Entrate in
          tempo reale.
        </p>

        {/* ─── Prerequisiti ─── */}
        <h2 className="mt-12 text-xl font-semibold">Prerequisiti</h2>
        <ul className="text-muted-foreground mt-3 list-disc space-y-1 pl-5 text-sm leading-relaxed">
          <li>
            Account ScontrinoZero con <strong>Piano Pro</strong> attivo.
          </li>
          <li>
            {"Credenziali Fisconline configurate nella sezione "}
            <em>Configurazione attività</em>.
          </li>
          <li>
            {"Una chiave API di tipo "}
            <strong>business</strong>
            {" generata dalla dashboard: vai su "}
            <strong>Impostazioni → API</strong>
            {", clicca "}
            <em>Genera nuova chiave</em>
            {
              ', assegnale un nome descrittivo (es. "POS principale") e copia la chiave — sarà mostrata '
            }
            <strong>una sola volta</strong>.
          </li>
        </ul>

        {/* ─── Autenticazione ─── */}
        <h2 className="mt-12 text-xl font-semibold">Autenticazione</h2>
        <p className="text-muted-foreground mt-3 text-sm leading-relaxed">
          {"Includi la chiave API in ogni richiesta tramite l'header "}
          <code className="bg-muted rounded px-1 py-0.5 font-mono text-xs">
            Authorization
          </code>
          {":"}
        </p>
        <pre className="bg-muted mt-3 overflow-x-auto rounded-md p-4 font-mono text-xs leading-relaxed">
          <code>
            Authorization: Bearer
            szk_live_XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX
          </code>
        </pre>
        <div className="mt-4 rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm dark:border-amber-800 dark:bg-amber-950">
          <strong>Attenzione:</strong> la chiave viene mostrata una sola volta
          al momento della creazione e non è recuperabile in seguito. Se la
          perdi, revoca la vecchia e genera una nuova dalla dashboard.
        </div>

        {/* ─── Base URL ─── */}
        <h2 className="mt-12 text-xl font-semibold">Base URL</h2>
        <pre className="bg-muted mt-3 overflow-x-auto rounded-md p-4 font-mono text-xs leading-relaxed">
          <code>https://api.scontrinozero.it/v1</code>
        </pre>

        {/* ─── Sandbox ─── */}
        <h2 className="mt-12 text-xl font-semibold">Sandbox</h2>
        <p className="text-muted-foreground mt-3 text-sm leading-relaxed">
          Per sviluppare e testare la tua integrazione senza emettere scontrini
          reali all&apos;Agenzia delle Entrate, usa l&apos;ambiente sandbox:
        </p>
        <pre className="bg-muted mt-3 overflow-x-auto rounded-md p-4 font-mono text-xs leading-relaxed">
          <code>https://api-sandbox.scontrinozero.it/v1</code>
        </pre>
        <p className="text-muted-foreground mt-3 text-sm leading-relaxed">
          Il sandbox è identico alla produzione, ma ogni chiamata all&apos;AdE è
          simulata — nessun documento viene trasmesso. Le risposte hanno la
          stessa struttura di quelle reali, incluso un{" "}
          <code className="bg-muted rounded px-1 font-mono text-xs">
            adeTransactionId
          </code>{" "}
          fittizio (prefisso{" "}
          <code className="bg-muted rounded px-1 font-mono text-xs">MOCK-</code>
          {")."}
        </p>
        <ul className="text-muted-foreground mt-3 list-disc space-y-1 pl-5 text-sm leading-relaxed">
          <li>
            Registra un account separato su{" "}
            <strong>sandbox.scontrinozero.it</strong> (non collegato alla
            produzione).
          </li>
          <li>
            Le credenziali Fisconline accettano qualsiasi valore nel sandbox.
          </li>
          <li>I dati sandbox possono essere resettati senza preavviso.</li>
          <li>
            La chiave API sandbox inizia sempre con{" "}
            <code className="bg-muted rounded px-1 font-mono text-xs">
              szk_live_
            </code>{" "}
            — è un token di accesso all&apos;ambiente sandbox, non alla
            produzione.
          </li>
        </ul>

        {/* ─── Endpoint ─── */}
        <h2 className="mt-12 text-xl font-semibold">Endpoint</h2>
        <div className="text-muted-foreground mt-1 text-sm">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b">
                <th className="py-2 pr-6 text-left text-xs font-semibold tracking-wide uppercase">
                  Metodo
                </th>
                <th className="py-2 pr-6 text-left text-xs font-semibold tracking-wide uppercase">
                  Path
                </th>
                <th className="py-2 text-left text-xs font-semibold tracking-wide uppercase">
                  Descrizione
                </th>
              </tr>
            </thead>
            <tbody>
              <tr className="border-b">
                <td className="py-2 pr-6 font-mono text-xs font-bold text-green-700 dark:text-green-400">
                  POST
                </td>
                <td className="py-2 pr-6 font-mono text-xs">/v1/receipts</td>
                <td className="py-2 text-xs">Emetti uno scontrino</td>
              </tr>
              <tr className="border-b">
                <td className="py-2 pr-6 font-mono text-xs font-bold text-blue-700 dark:text-blue-400">
                  GET
                </td>
                <td className="py-2 pr-6 font-mono text-xs">
                  /v1/receipts/{"{id}"}
                </td>
                <td className="py-2 text-xs">
                  Recupera lo stato di uno scontrino
                </td>
              </tr>
              <tr>
                <td className="py-2 pr-6 font-mono text-xs font-bold text-green-700 dark:text-green-400">
                  POST
                </td>
                <td className="py-2 pr-6 font-mono text-xs">
                  /v1/receipts/{"{id}"}/void
                </td>
                <td className="py-2 text-xs">Annulla uno scontrino</td>
              </tr>
            </tbody>
          </table>
        </div>

        {/* ─── POST /v1/receipts ─── */}
        <h3 className="mt-10 text-base font-semibold">
          <span className="mr-2 font-mono text-green-700 dark:text-green-400">
            POST
          </span>
          {"/v1/receipts"}
        </h3>
        <p className="text-muted-foreground mt-2 text-sm leading-relaxed">
          Emette uno scontrino elettronico e lo trasmette all&apos;Agenzia delle
          Entrate.
        </p>

        <p className="mt-4 text-sm font-medium">Corpo della richiesta</p>
        <div className="text-muted-foreground mt-2 overflow-x-auto text-sm">
          <table className="w-full border-collapse">
            <thead>
              <tr className="border-b">
                <th className="py-2 pr-4 text-left text-xs font-semibold tracking-wide uppercase">
                  Campo
                </th>
                <th className="py-2 pr-4 text-left text-xs font-semibold tracking-wide uppercase">
                  Tipo
                </th>
                <th className="py-2 text-left text-xs font-semibold tracking-wide uppercase">
                  Descrizione
                </th>
              </tr>
            </thead>
            <tbody>
              <tr className="border-b">
                <td className="py-2 pr-4 font-mono text-xs">lines</td>
                <td className="py-2 pr-4 text-xs">array (1–100)</td>
                <td className="py-2 text-xs">Righe dello scontrino</td>
              </tr>
              <tr className="border-b">
                <td className="py-2 pr-4 pl-4 font-mono text-xs">
                  lines[].description
                </td>
                <td className="py-2 pr-4 text-xs">string (1–200)</td>
                <td className="py-2 text-xs">
                  Descrizione del prodotto/servizio
                </td>
              </tr>
              <tr className="border-b">
                <td className="py-2 pr-4 pl-4 font-mono text-xs">
                  lines[].quantity
                </td>
                <td className="py-2 pr-4 text-xs">number (0–9999)</td>
                <td className="py-2 text-xs">Quantità (decimali ammessi)</td>
              </tr>
              <tr className="border-b">
                <td className="py-2 pr-4 pl-4 font-mono text-xs">
                  lines[].grossUnitPrice
                </td>
                <td className="py-2 pr-4 text-xs">number (≥ 0)</td>
                <td className="py-2 text-xs">
                  Prezzo unitario IVA inclusa (€)
                </td>
              </tr>
              <tr className="border-b">
                <td className="py-2 pr-4 pl-4 font-mono text-xs">
                  lines[].vatCode
                </td>
                <td className="py-2 pr-4 text-xs">string (enum)</td>
                <td className="py-2 text-xs">
                  Codice aliquota IVA (vedi tabella sotto)
                </td>
              </tr>
              <tr className="border-b">
                <td className="py-2 pr-4 font-mono text-xs">paymentMethod</td>
                <td className="py-2 pr-4 text-xs">string (enum)</td>
                <td className="py-2 text-xs">
                  <code className="bg-muted rounded px-1 font-mono text-xs">
                    PC
                  </code>
                  {" = contanti, "}
                  <code className="bg-muted rounded px-1 font-mono text-xs">
                    PE
                  </code>
                  {" = carta/elettronico"}
                </td>
              </tr>
              <tr className="border-b">
                <td className="py-2 pr-4 font-mono text-xs">idempotencyKey</td>
                <td className="py-2 pr-4 text-xs">string (UUID v4)</td>
                <td className="py-2 text-xs">
                  Chiave di idempotenza (vedi sezione Idempotenza)
                </td>
              </tr>
              <tr>
                <td className="py-2 pr-4 font-mono text-xs">lotteryCode</td>
                <td className="py-2 pr-4 text-xs">string (max 8) | null</td>
                <td className="py-2 text-xs">
                  {"Codice lotteria scontrini (opzionale, solo con "}
                  <code className="bg-muted rounded px-1 font-mono text-xs">
                    PE
                  </code>
                  {")"}
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <p className="mt-5 text-sm font-medium">Esempio</p>
        <pre className="bg-muted mt-2 overflow-x-auto rounded-md p-4 font-mono text-xs leading-relaxed">
          <code>{String.raw`curl -X POST https://api.scontrinozero.it/v1/receipts \
  -H "Authorization: Bearer szk_live_XXXX" \
  -H "Content-Type: application/json" \
  -d '{
    "lines": [
      {
        "description": "Pizza Margherita",
        "quantity": 2,
        "grossUnitPrice": 8.00,
        "vatCode": "10"
      },
      {
        "description": "Acqua naturale",
        "quantity": 1,
        "grossUnitPrice": 2.50,
        "vatCode": "10"
      }
    ],
    "paymentMethod": "PE",
    "idempotencyKey": "550e8400-e29b-41d4-a716-446655440000",
    "lotteryCode": "ABCD1234"
  }'`}</code>
        </pre>

        <p className="mt-5 text-sm font-medium">
          {"Risposta — "}
          <code className="bg-muted rounded px-1 font-mono text-xs">
            201 Created
          </code>
        </p>
        <pre className="bg-muted mt-2 overflow-x-auto rounded-md p-4 font-mono text-xs leading-relaxed">
          <code>{`{
  "documentId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "adeTransactionId": "151085589",
  "adeProgressive": "DCW2026/5111-2188"
}`}</code>
        </pre>

        {/* ─── GET /v1/receipts/{id} ─── */}
        <h3 className="mt-10 text-base font-semibold">
          <span className="mr-2 font-mono text-blue-700 dark:text-blue-400">
            GET
          </span>
          {"/v1/receipts/{id}"}
        </h3>
        <p className="text-muted-foreground mt-2 text-sm leading-relaxed">
          Restituisce i dettagli e lo stato di uno scontrino emesso. Utile per
          verificare l&apos;esito di un&apos;emissione o per implementare
          l&apos;idempotency check sul tuo client.
        </p>

        <p className="mt-4 text-sm font-medium">Esempio</p>
        <pre className="bg-muted mt-2 overflow-x-auto rounded-md p-4 font-mono text-xs leading-relaxed">
          <code>{String.raw`curl https://api.scontrinozero.it/v1/receipts/a1b2c3d4-e5f6-7890-abcd-ef1234567890 \
  -H "Authorization: Bearer szk_live_XXXX"`}</code>
        </pre>

        <p className="mt-5 text-sm font-medium">
          {"Risposta — "}
          <code className="bg-muted rounded px-1 font-mono text-xs">
            200 OK
          </code>
        </p>
        <pre className="bg-muted mt-2 overflow-x-auto rounded-md p-4 font-mono text-xs leading-relaxed">
          <code>{`{
  "id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "kind": "SALE",
  "status": "ACCEPTED",
  "idempotencyKey": "550e8400-e29b-41d4-a716-446655440000",
  "adeTransactionId": "151085589",
  "adeProgressive": "DCW2026/5111-2188",
  "createdAt": "2026-03-26T10:00:00.000Z"
}`}</code>
        </pre>
        <p className="text-muted-foreground mt-3 text-xs">
          {"Il campo "}
          <code className="bg-muted rounded px-1 font-mono">kind</code>
          {" può essere "}
          <code className="bg-muted rounded px-1 font-mono">SALE</code>
          {" o "}
          <code className="bg-muted rounded px-1 font-mono">VOID</code>
          {". Il campo "}
          <code className="bg-muted rounded px-1 font-mono">status</code>
          {" può essere "}
          <code className="bg-muted rounded px-1 font-mono">ACCEPTED</code>
          {", "}
          <code className="bg-muted rounded px-1 font-mono">REJECTED</code>
          {" o "}
          <code className="bg-muted rounded px-1 font-mono">PENDING</code>
          {"."}
        </p>

        {/* ─── POST /v1/receipts/{id}/void ─── */}
        <h3 className="mt-10 text-base font-semibold">
          <span className="mr-2 font-mono text-green-700 dark:text-green-400">
            POST
          </span>
          {"/v1/receipts/{id}/void"}
        </h3>
        <p className="text-muted-foreground mt-2 text-sm leading-relaxed">
          Annulla uno scontrino precedentemente emesso. L&apos;annullamento è
          irreversibile e viene trasmesso all&apos;Agenzia delle Entrate.
        </p>

        <p className="mt-4 text-sm font-medium">Corpo della richiesta</p>
        <div className="text-muted-foreground mt-2 overflow-x-auto text-sm">
          <table className="w-full border-collapse">
            <thead>
              <tr className="border-b">
                <th className="py-2 pr-4 text-left text-xs font-semibold tracking-wide uppercase">
                  Campo
                </th>
                <th className="py-2 pr-4 text-left text-xs font-semibold tracking-wide uppercase">
                  Tipo
                </th>
                <th className="py-2 text-left text-xs font-semibold tracking-wide uppercase">
                  Descrizione
                </th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td className="py-2 pr-4 font-mono text-xs">idempotencyKey</td>
                <td className="py-2 pr-4 text-xs">string (UUID v4)</td>
                <td className="py-2 text-xs">
                  Chiave di idempotenza per l&apos;annullamento
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <p className="mt-4 text-sm font-medium">Esempio</p>
        <pre className="bg-muted mt-2 overflow-x-auto rounded-md p-4 font-mono text-xs leading-relaxed">
          <code>{String.raw`curl -X POST https://api.scontrinozero.it/v1/receipts/a1b2c3d4-e5f6-7890-abcd-ef1234567890/void \
  -H "Authorization: Bearer szk_live_XXXX" \
  -H "Content-Type: application/json" \
  -d '{"idempotencyKey": "b2c3d4e5-f6a7-8901-bcde-f01234567890"}'`}</code>
        </pre>

        <p className="mt-5 text-sm font-medium">
          {"Risposta — "}
          <code className="bg-muted rounded px-1 font-mono text-xs">
            200 OK
          </code>
        </p>
        <pre className="bg-muted mt-2 overflow-x-auto rounded-md p-4 font-mono text-xs leading-relaxed">
          <code>{`{
  "voidDocumentId": "c3d4e5f6-a7b8-9012-cdef-012345678901",
  "adeTransactionId": "151085590",
  "adeProgressive": "DCW2026/5111-2189"
}`}</code>
        </pre>

        {/* ─── Codici IVA ─── */}
        <h2 className="mt-12 text-xl font-semibold">Codici IVA</h2>
        <p className="text-muted-foreground mt-2 text-sm leading-relaxed">
          {"Il campo "}
          <code className="bg-muted rounded px-1 py-0.5 font-mono text-xs">
            vatCode
          </code>
          {" accetta i seguenti valori:"}
        </p>
        <div className="text-muted-foreground mt-3 overflow-x-auto text-sm">
          <table className="w-full border-collapse">
            <thead>
              <tr className="border-b">
                <th className="py-2 pr-6 text-left text-xs font-semibold tracking-wide uppercase">
                  Valore
                </th>
                <th className="py-2 pr-6 text-left text-xs font-semibold tracking-wide uppercase">
                  Aliquota
                </th>
                <th className="py-2 text-left text-xs font-semibold tracking-wide uppercase">
                  Regime
                </th>
              </tr>
            </thead>
            <tbody>
              {[
                ["4", "4%", "Ridotta (es. beni di prima necessità)"],
                ["5", "5%", "Ridotta (es. alcuni prodotti farmaceutici)"],
                ["10", "10%", "Ridotta (es. alimenti, ristorazione, turismo)"],
                ["22", "22%", "Ordinaria"],
                ["N1", "0%", "Art. 15 DPR 633/72 — Escluso da IVA"],
                ["N2", "0%", "Non soggetto a IVA"],
                ["N3", "0%", "Non imponibile"],
                ["N4", "0%", "Esente"],
                ["N5", "0%", "Regime del margine"],
                ["N6", "0%", "Inversione contabile (reverse charge)"],
              ].map(([code, rate, desc]) => (
                <tr key={code} className="border-b last:border-0">
                  <td className="py-2 pr-6 font-mono text-xs font-medium">
                    {code}
                  </td>
                  <td className="py-2 pr-6 text-xs">{rate}</td>
                  <td className="py-2 text-xs">{desc}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* ─── Idempotenza ─── */}
        <h2 className="mt-12 text-xl font-semibold">Idempotenza</h2>
        <p className="text-muted-foreground mt-3 text-sm leading-relaxed">
          {"Ogni richiesta di emissione e annullamento richiede un campo "}
          <code className="bg-muted rounded px-1 py-0.5 font-mono text-xs">
            idempotencyKey
          </code>
          {": un UUID v4 univoco che identifichi quella specifica operazione."}
        </p>
        <p className="text-muted-foreground mt-2 text-sm leading-relaxed">
          {"Se invii la stessa richiesta due volte con lo stesso "}
          <code className="bg-muted rounded px-1 py-0.5 font-mono text-xs">
            idempotencyKey
          </code>
          {" (es. in seguito a un timeout di rete), il sistema restituisce il"}
          risultato dell&apos;operazione originale senza emettere un secondo
          scontrino. Genera una nuova chiave per ogni scontrino distinto.
        </p>
        <pre className="bg-muted mt-4 overflow-x-auto rounded-md p-4 font-mono text-xs leading-relaxed">
          <code>{`// Esempio generazione in JavaScript
const idempotencyKey = crypto.randomUUID();`}</code>
        </pre>

        {/* ─── Rate limiting ─── */}
        <h2 className="mt-12 text-xl font-semibold">Rate limiting</h2>
        <p className="text-muted-foreground mt-2 text-sm leading-relaxed">
          I limiti sono per chiave API, con finestra scorrevole di 1 ora:
        </p>
        <div className="text-muted-foreground mt-3 overflow-x-auto text-sm">
          <table className="w-full border-collapse">
            <thead>
              <tr className="border-b">
                <th className="py-2 pr-6 text-left text-xs font-semibold tracking-wide uppercase">
                  Endpoint
                </th>
                <th className="py-2 text-left text-xs font-semibold tracking-wide uppercase">
                  Limite
                </th>
              </tr>
            </thead>
            <tbody>
              <tr className="border-b">
                <td className="py-2 pr-6 font-mono text-xs">
                  POST /v1/receipts
                </td>
                <td className="py-2 text-xs">120 richieste / ora</td>
              </tr>
              <tr>
                <td className="py-2 pr-6 font-mono text-xs">
                  POST /v1/receipts/{"{id}"}/void
                </td>
                <td className="py-2 text-xs">20 richieste / ora</td>
              </tr>
            </tbody>
          </table>
        </div>
        <p className="text-muted-foreground mt-3 text-sm">
          {"Al superamento del limite ricevi una risposta "}
          <code className="bg-muted rounded px-1 font-mono text-xs">429</code>
          {". Attendi qualche minuto e riprova."}
        </p>

        {/* ─── Codici di errore ─── */}
        <h2 className="mt-12 text-xl font-semibold">Codici di errore</h2>
        <p className="text-muted-foreground mt-2 text-sm leading-relaxed">
          {"Tutti gli errori restituiscono un oggetto JSON con il campo "}
          <code className="bg-muted rounded px-1 py-0.5 font-mono text-xs">
            error
          </code>
          {":"}
        </p>
        <pre className="bg-muted mt-3 overflow-x-auto rounded-md p-4 font-mono text-xs leading-relaxed">
          <code>{`{ "error": "Descrizione dell'errore." }`}</code>
        </pre>
        <div className="text-muted-foreground mt-4 overflow-x-auto text-sm">
          <table className="w-full border-collapse">
            <thead>
              <tr className="border-b">
                <th className="py-2 pr-6 text-left text-xs font-semibold tracking-wide uppercase">
                  Codice
                </th>
                <th className="py-2 text-left text-xs font-semibold tracking-wide uppercase">
                  Causa
                </th>
              </tr>
            </thead>
            <tbody>
              {[
                [
                  "400",
                  "Corpo della richiesta non valido (campo mancante, tipo errato, UUID non valido).",
                ],
                ["401", "Chiave API assente, non valida, revocata o scaduta."],
                [
                  "402",
                  "Il piano attivo non include l'accesso alle API. Passa al Piano Pro.",
                ],
                [
                  "422",
                  "Errore di logica: scontrino già annullato, credenziali AdE mancanti, o risposta di rifiuto dall'Agenzia delle Entrate.",
                ],
                ["429", "Rate limit superato. Riprova tra qualche minuto."],
                ["500", "Errore interno del server."],
              ].map(([code, desc]) => (
                <tr key={code} className="border-b last:border-0">
                  <td className="py-2 pr-6 font-mono text-xs font-semibold">
                    {code}
                  </td>
                  <td className="py-2 text-xs">{desc}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </article>
    </section>
  );
}
