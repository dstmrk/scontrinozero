import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Verifica di una firma **Standard Webhooks** (standardwebhooks.com), lo schema
 * che Supabase Auth usa per il Send Email Hook.
 *
 * Scritta su `node:crypto` invece che sul pacchetto `standardwebhooks`: lo
 * schema è tre righe di HMAC-SHA256 su una stringa concatenata, mentre la
 * libreria porterebbe con sé una implementazione JS di SHA-256 su un runtime
 * che ce l'ha nativa. Il costo di scriverla è il rischio di sbagliarla, e quel
 * rischio è chiuso dal test vector pubblicato nella spec (vedi
 * `standard-webhook.test.ts`): se questa funzione riproduce quella firma, sta
 * implementando lo schema e non una sua variante.
 *
 * Contratto:
 * - header `webhook-id`, `webhook-timestamp` (unix, secondi),
 *   `webhook-signature` (lista separata da spazi di `v1,<base64>`);
 * - contenuto firmato `${id}.${timestamp}.${body}`, sui **byte grezzi** del
 *   body — mai su un JSON ri-serializzato, che cambierebbe spaziatura e
 *   ordine delle chiavi;
 * - segreto base64, con prefisso `whsec_` (Supabase lo consegna come
 *   `v1,whsec_<base64>`);
 * - finestra di tolleranza sul timestamp contro il replay.
 */

/** Tolleranza sul `webhook-timestamp`, in secondi (valore raccomandato). */
const TIMESTAMP_TOLERANCE_SECONDS = 5 * 60;

export type StandardWebhookFailure =
  | "missing_headers"
  | "invalid_secret"
  | "timestamp_invalid"
  | "timestamp_out_of_tolerance"
  | "signature_mismatch";

export type StandardWebhookResult =
  { ok: true } | { ok: false; reason: StandardWebhookFailure };

type VerifyParams = Readonly<{
  /** Body della richiesta, esattamente come arrivato sul filo. */
  payload: string;
  headers: Headers;
  /** `v1,whsec_<base64>`, `whsec_<base64>` o il solo base64. */
  secret: string;
  /** Iniettabile nei test; default `Date.now()`. */
  nowMs?: number;
}>;

export function verifyStandardWebhook({
  payload,
  headers,
  secret,
  nowMs = Date.now(),
}: VerifyParams): StandardWebhookResult {
  const id = headers.get("webhook-id");
  const timestamp = headers.get("webhook-timestamp");
  const signatureHeader = headers.get("webhook-signature");

  if (!id || !timestamp || !signatureHeader) {
    return { ok: false, reason: "missing_headers" };
  }

  const key = decodeSecret(secret);
  if (!key) return { ok: false, reason: "invalid_secret" };

  const sentAtSeconds = Number(timestamp);
  if (!Number.isFinite(sentAtSeconds)) {
    return { ok: false, reason: "timestamp_invalid" };
  }
  const skewSeconds = Math.abs(nowMs / 1000 - sentAtSeconds);
  if (skewSeconds > TIMESTAMP_TOLERANCE_SECONDS) {
    return { ok: false, reason: "timestamp_out_of_tolerance" };
  }

  const expected = createHmac("sha256", key)
    .update(`${id}.${timestamp}.${payload}`)
    .digest();

  // La lista può contenere più firme: durante una rotazione del segreto il
  // mittente firma con la chiave nuova e con la vecchia, e ne basta una valida.
  const matches = signatureHeader
    .split(" ")
    .filter((entry) => entry.startsWith("v1,"))
    .some((entry) => equalsInConstantTime(expected, entry.slice("v1,".length)));

  return matches ? { ok: true } : { ok: false, reason: "signature_mismatch" };
}

/**
 * `Buffer.from(x, "base64")` non fallisce mai — scarta i caratteri illegali e
 * ritorna quel che resta — quindi un segreto malformato diventa una chiave
 * silenziosamente sbagliata e ogni firma "non combacia". Un buffer vuoto è il
 * solo segnale che quel valore non era un segreto, e va distinto: dice
 * "configurazione rotta", non "richiesta non autentica".
 */
function decodeSecret(secret: string): Buffer | null {
  const base64 = secret.replace(/^v1,/, "").replace(/^whsec_/, "");
  const key = Buffer.from(base64, "base64");
  return key.length > 0 ? key : null;
}

function equalsInConstantTime(expected: Buffer, candidateBase64: string) {
  const candidate = Buffer.from(candidateBase64, "base64");
  // `timingSafeEqual` lancia su lunghezze diverse: il confronto di lunghezza
  // non è un leak (la lunghezza dell'hash è pubblica e fissa).
  return (
    candidate.length === expected.length && timingSafeEqual(candidate, expected)
  );
}
