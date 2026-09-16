import { BUSINESS_PROFILE_LIMITS, isValidItalianZipCode } from "./validation";

/**
 * Identita' dell'attivita': il confronto fra la ragione sociale che finisce
 * sullo scontrino e quella che l'AdE ha registrato sulla partita IVA.
 *
 * Perche' esiste (REVIEW.md #106). `businesses.business_name` lo digita
 * l'utente al primo passo dell'onboarding — campo facoltativo — e da li' va
 * sul PDF, sulla pagina pubblica /r/, sullo scontrino termico e nel
 * cedente/prestatore inviato all'AdE con `modificati: true`. La scelta della
 * partita IVA su cui operare arriva **dopo** (migration 0037): chi rappresenta
 * una societa' ha quindi digitato il proprio nome prima di sapere che avrebbe
 * emesso per conto di ACME SRL. Nessun controllo se ne accorgeva.
 *
 * Puro e client-safe: nessun accesso a DB o rete.
 */

/** Ripulisce una ragione sociale, riducendo a `null` cio' che e' vuoto. */
export function normalizeDenominazione(
  value: string | null | undefined,
): string | null {
  const trimmed = value?.trim() ?? "";
  return trimmed.length > 0 ? trimmed : null;
}

/**
 * Forma canonica per il **solo confronto**: maiuscole e spazi interni
 * ripetuti non distinguono due nomi. La punteggiatura si': "ACME S.R.L." e
 * "ACME SRL" si stampano diversi sullo scontrino, e quale dei due stampare
 * e' una scelta dell'esercente, non un errore da correggere in automatico.
 */
function comparisonKey(value: string): string {
  return value.replace(/\s+/g, " ").trim().toLocaleUpperCase("it-IT");
}

export interface DenominazioneMismatch {
  /**
   * - `assente`: sullo scontrino non comparirebbe nessuna ragione sociale.
   * - `divergente`: ne comparirebbe una diversa da quella registrata.
   * - `non-applicabile`: divergente, ma la denominazione AdE non entra nel
   *   limite di `business_name` — si mostra, non si offre l'allineamento.
   */
  kind: "assente" | "divergente" | "non-applicabile";
  /** Cio' che comparirebbe oggi sullo scontrino, ripulito. */
  current: string | null;
  /** Cio' che l'AdE ha registrato, ripulito. */
  ade: string;
}

/**
 * Restituisce la divergenza da segnalare all'esercente, o `null` se non c'e'
 * niente da dire.
 *
 * Gate su `utenzaPiva`: si tace sulle utenze "me stesso" (`utenzaPiva` null),
 * dove la P.IVA e' intestata a chi accede. Li' un'insegna diversa dalla
 * denominazione anagrafica — "Da Mario" contro "ROSSI MARIO" — e' la norma,
 * non un difetto, e segnalarla riempirebbe di rumore la stragrande
 * maggioranza degli account per non dire niente di utile.
 */
export function getDenominazioneMismatch(params: {
  businessName: string | null | undefined;
  adeDenominazione: string | null | undefined;
  utenzaPiva: string | null | undefined;
}): DenominazioneMismatch | null {
  const { businessName, adeDenominazione, utenzaPiva } = params;

  if (!utenzaPiva) return null;

  const ade = normalizeDenominazione(adeDenominazione);
  if (!ade) return null;

  const current = normalizeDenominazione(businessName);
  if (current && comparisonKey(current) === comparisonKey(ade)) return null;

  const fits = ade.length <= BUSINESS_PROFILE_LIMITS.businessName;
  let kind: DenominazioneMismatch["kind"];
  if (!fits) {
    kind = "non-applicabile";
  } else if (current) {
    kind = "divergente";
  } else {
    kind = "assente";
  }

  return { kind, current, ade };
}

// ---------------------------------------------------------------------------
// Sede legale (migration 0039)
// ---------------------------------------------------------------------------

/** La sede legale come la risponde l'AdE in `altriDatiIdentificativi`. */
export interface AdeSedeLegale {
  indirizzo?: string | null;
  numeroCivico?: string | null;
  cap?: string | null;
  comune?: string | null;
  provincia?: string | null;
}

/** L'indirizzo che oggi finisce stampato, dalle colonne di `businesses`. */
export interface StampatoSedeLegale {
  address?: string | null;
  streetNumber?: string | null;
  zipCode?: string | null;
  city?: string | null;
  province?: string | null;
}

/** Patch da scrivere su `businesses`: i soli campi che divergono. */
export type SedeLegalePatch = Partial<Record<keyof StampatoSedeLegale, string>>;

export interface SedeLegaleMismatch {
  /**
   * - `divergente`: c'e' almeno un campo da allineare, e `patch` lo contiene.
   * - `non-applicabile`: diverge, ma almeno un valore dell'AdE non entra nella
   *   colonna stampata o non ne ha la forma — si mostra, non si offre il
   *   bottone, e `patch` e' null.
   */
  kind: "divergente" | "non-applicabile";
  /** Solo i campi divergenti, in ordine di lettura di un indirizzo. */
  fields: { label: string; current: string | null; ade: string }[];
  patch: SedeLegalePatch | null;
}

/**
 * Descrizione di un campo dell'indirizzo: come si chiama da noi, come lo
 * chiama l'AdE, che etichetta legge l'utente e quale forma deve avere per
 * poter essere scritto nella colonna stampata.
 *
 * L'ordine e' quello in cui un indirizzo si legge, non quello delle colonne:
 * e' quello che finisce sotto gli occhi dell'esercente.
 */
const SEDE_LEGALE_FIELDS: {
  column: keyof StampatoSedeLegale;
  source: keyof AdeSedeLegale;
  label: string;
  accepts: (value: string) => boolean;
}[] = [
  {
    column: "address",
    source: "indirizzo",
    label: "Indirizzo",
    accepts: (v) => v.length <= BUSINESS_PROFILE_LIMITS.address,
  },
  {
    column: "streetNumber",
    source: "numeroCivico",
    label: "Civico",
    accepts: (v) => v.length <= BUSINESS_PROFILE_LIMITS.streetNumber,
  },
  {
    column: "zipCode",
    source: "cap",
    label: "CAP",
    // Lambda e non riferimento diretto: questo array si costruisce al caricamento
    // del modulo, e leggere li' un export di `validation` rompe ogni test che lo
    // mocka parzialmente — anche se non tocca la sede legale. Differire la
    // lettura al momento della chiamata costa nulla.
    accepts: (v) => isValidItalianZipCode(v),
  },
  {
    column: "city",
    source: "comune",
    label: "Comune",
    accepts: (v) => v.length <= BUSINESS_PROFILE_LIMITS.city,
  },
  {
    // L'AdE pretende la sigla maiuscola in emissione (`EF0 'Provincia' non
    // valido`, skill ade-integration), quindi si normalizza qui come fa
    // `updateBusiness` alla scrittura.
    column: "province",
    source: "provincia",
    label: "Provincia",
    accepts: (v) => /^[A-Z]{2}$/.test(v),
  },
];

/**
 * Restituisce la divergenza fra la sede legale registrata all'AdE e
 * l'indirizzo che finisce stampato, o `null` se non c'e' niente da dire.
 *
 * Tre asimmetrie rispetto alla denominazione, tutte volute:
 *
 * 1. **Un campo che l'AdE non ha non e' una divergenza.** Non si svuota
 *    l'indirizzo stampato perche' il portale tace su quel pezzo: si confronta
 *    solo cio' che e' stato osservato.
 * 2. **Divergere qui e' spesso legittimo.** Per una societa' la sede legale
 *    puo' essere lo studio del commercialista mentre il punto vendita sta
 *    altrove, e sullo scontrino ci va il secondo. L'avviso lo constata; non
 *    presume che l'AdE abbia ragione.
 * 3. **`non-applicabile` e' per tutto o niente.** Applicare i tre campi che
 *    entrano e lasciare indietro i due che non entrano produrrebbe un
 *    indirizzo meta' AdE e meta' digitato, che non e' nessuno dei due.
 *
 * Il gate su `utenzaPiva` e la forma del confronto sono gli stessi di
 * `getDenominazioneMismatch`: si tace sulle utenze "me stesso", e maiuscole e
 * spazi ripetuti non distinguono, la punteggiatura si'.
 */
export function getSedeLegaleMismatch(params: {
  current: StampatoSedeLegale;
  ade: AdeSedeLegale;
  utenzaPiva: string | null | undefined;
}): SedeLegaleMismatch | null {
  const { current, ade, utenzaPiva } = params;

  if (!utenzaPiva) return null;

  const fields: SedeLegaleMismatch["fields"] = [];
  const patch: SedeLegalePatch = {};
  let applicabile = true;

  for (const { column, source, label, accepts } of SEDE_LEGALE_FIELDS) {
    const raw = normalizeDenominazione(ade[source]);
    if (!raw) continue;

    // `raw` e' gia' trimmato e non vuoto, quindi qui basta il maiuscolo: e'
    // cio' che `normalizeProvince` farebbe, senza il `string | null` che
    // costringerebbe a un ramo di guardia irraggiungibile. L'AdE pretende la
    // sigla maiuscola in emissione (`EF0 'Provincia' non valido`, skill
    // ade-integration), quindi si confronta e si scrive normalizzata.
    const adeValue = column === "province" ? raw.toUpperCase() : raw;

    const mine = normalizeDenominazione(current[column]);
    if (mine && comparisonKey(mine) === comparisonKey(adeValue)) continue;

    fields.push({ label, current: mine, ade: adeValue });
    if (accepts(adeValue)) {
      patch[column] = adeValue;
    } else {
      applicabile = false;
    }
  }

  if (fields.length === 0) return null;

  return applicabile
    ? { kind: "divergente", fields, patch }
    : { kind: "non-applicabile", fields, patch: null };
}
