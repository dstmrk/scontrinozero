/**
 * Codice referral personale: condivisibile via link
 * (`/register?rcode=<code>`), riusabile da più nuovi utenti (a differenza dei
 * partner code monouso). Non è un segreto — non protegge nulla, identifica
 * solo il referrer — quindi nessun hash separato, salvato in chiaro su
 * `profiles.referral_code`.
 *
 * **Deterministico, non casuale**: derivato dall'`authUserId` via SHA-256
 * troncato, non da `crypto.randomInt`. Due motivi: (1) ripetibile — lo stesso
 * authUserId produce sempre lo stesso codice, utile per il backfill dei
 * profili pre-esistenti (replicato in SQL nella migration 0021, via
 * `digest()`/pgcrypto, stesso algoritmo bit-per-bit); (2) nessun retry su
 * collisione necessario in pratica (40 bit di entropia su un alfabeto
 * non-ambiguo, rischio di collisione trascurabile per le dimensioni di
 * questo prodotto).
 *
 * Alfabeto Crockford base32 (`0123456789ABCDEFGHJKMNPQRSTVWXYZ`): 32 simboli
 * = esattamente 5 bit/carattere, così i primi 5 byte del digest (40 bit) si
 * suddividono in 8 simboli senza bias né bit di scarto, e ogni indice a 5 bit
 * (0–31) ha un simbolo corrispondente. Esclude I/L/O/U (ambigui con 1/0 e tra
 * loro): tenere 0 e 1 è sicuro proprio perché O e I non esistono nell'alfabeto.
 * ⚠️ Deve restare identico, carattere per carattere, alla replica SQL in
 * `supabase/migrations/0021_referral_program.sql` (backfill via pgcrypto):
 * qualunque divergenza genera codici diversi tra app e backfill.
 */
import { createHash } from "node:crypto";

/**
 * Giorni di bonus referral (member-get-member, +1 mese), unica sorgente di
 * verità per: il bonus al nuovo utente (referee) al signup, l'incremento al
 * referrer in trial al reward, e l'estensione `trial_end` su Stripe per i
 * referrer a pagamento. Tenere un solo valore evita divergenze tra i tre
 * punti che lo applicano.
 */
export const REFERRAL_BONUS_DAYS = 30;

const ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
const CODE_LENGTH = 8;
const CODE_RE = new RegExp(`^[${ALPHABET}]{${CODE_LENGTH}}$`);

/** Genera il codice referral per `seed` (tipicamente `authUserId`). Deterministico. */
export function generateReferralCode(seed: string): string {
  const digest = createHash("sha256").update(seed).digest();
  let bits = BigInt(0);
  for (let i = 0; i < 5; i++) {
    bits = (bits << BigInt(8)) | BigInt(digest[i]);
  }
  let code = "";
  for (let i = CODE_LENGTH - 1; i >= 0; i--) {
    const index = Number((bits >> BigInt(i * 5)) & BigInt(31));
    code += ALPHABET[index];
  }
  return code;
}

/**
 * Valida solo il formato del codice letto da `?rcode=`/form — nessun accesso
 * DB (boundary API, stesso pattern di `normalizeSignupSource`). Il lookup in
 * `profiles` avviene a parte, nel chiamante.
 */
export function normalizeReferralCode(
  raw: string | null | undefined,
): string | null {
  if (typeof raw !== "string") return null;
  const normalised = raw.trim().toUpperCase();
  return CODE_RE.test(normalised) ? normalised : null;
}
