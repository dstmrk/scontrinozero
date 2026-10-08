"use server";

import { cache, createElement } from "react";
import { revalidatePath } from "next/cache";
import { and, eq, isNull, sql } from "drizzle-orm";
import { getDb } from "@/db";
import {
  businesses,
  adeCredentials,
  profiles,
  trialVatLedger,
  referralRedemptions,
  subscriptions,
} from "@/db/schema";
import { REFERRAL_BONUS_DAYS } from "@/lib/referral-code";
import { extendSubscriptionForReferral } from "@/server/referral-reward";
import { hashPiva } from "@/lib/piva-hash";
import {
  encrypt,
  decrypt,
  getEncryptionKey,
  getEncryptionKeys,
  getKeyVersion,
} from "@/lib/crypto";
import { createAdeClient, getAdeMode } from "@/lib/ade";
import { adeSessionCache } from "@/lib/ade/session-cache";
import { adeInteractiveSessionStore } from "@/lib/ade/interactive-session-store";
import {
  AdeAuthError,
  AdeError,
  AdePasswordExpiredError,
  AdeUtenzaSelectionRequiredError,
} from "@/lib/ade/errors";
import { getUserFacingAdeErrorMessage } from "@/lib/ade/error-messages";
import {
  classifyAdeLoginFailure,
  type RecordedVerifyOutcome,
} from "@/lib/ade/verify-outcome";
import type { AdeAdoptedSession } from "@/lib/ade/client";
import type {
  AdeCedentePrestatore,
  AdeLoginMethod,
  AdeUtenzaCandidate,
} from "@/lib/ade/types";
import { logAdeFailure } from "@/lib/ade/log-failure";
import { RateLimiter, RATE_LIMIT_WINDOWS } from "@/lib/rate-limit";
import { logger } from "@/lib/logger";
import { normalizeDenominazione } from "@/lib/business-identity";
import { isValidUuid } from "@/lib/uuid";
import { sendEmail } from "@/lib/email";
import { WelcomeEmail } from "@/emails/welcome";
import { notifyOperatorOfNewSignup } from "@/lib/operator-notification";
import {
  getAuthenticatedUser,
  checkBusinessOwnership,
} from "@/lib/server-auth";
import { authErrorResult } from "@/lib/auth-errors";
import {
  adeCieEmailSchema,
  adePinSchema,
  ADE_PASSWORD_MAX_LENGTH,
  BUSINESS_PROFILE_LIMITS,
  isValidItalianZipCode,
  ITALIAN_ZIP_MESSAGE,
  normalizeProvince,
  validateBusinessOptionalFields,
} from "@/lib/validation";
import { isInvalidPreferredVatCode } from "@/types/cassa";
import { ERROR_MESSAGES } from "@/lib/error-messages";
import {
  getFormString,
  getFormStringOrNull,
  getFormStringRaw,
} from "@/lib/form-utils";
import { isUniqueConstraintViolation } from "@/lib/db-errors";

export type OnboardingActionResult = {
  error?: string;
  businessId?: string;
  passwordExpired?: boolean;
  /**
   * La P.IVA è già associata a un altro account (vincolo UNIQUE anti-abuso
   * trial). La UI usa questo flag per offrire un percorso self-service verso
   * l'assistenza, dato che l'utente legittimo (vecchio account, trial
   * abbandonato) non ha modo di sbloccarsi da solo.
   */
  pivaConflict?: boolean;
  /**
   * Le credenziali verificate appartengono a una partita IVA diversa da quella
   * già registrata sul business. Bloccato per non sovrascrivere l'identità
   * fiscale (gli scontrini storici leggono live `businesses.vatNumber`): la UI
   * usa questo flag per spiegare che serve un account separato per un'altra
   * P.IVA, distinguendolo dal generico "credenziali errate".
   */
  pivaMismatch?: boolean;
  /**
   * L'AdE ha rifiutato le credenziali salvate (`auth_error`). La UI toglie
   * "Riprova" e rimanda alla modifica: rigiocare gli stessi dati dà lo stesso
   * esito e ogni tentativo è un login fallito sull'utenza, che l'AdE può
   * bloccare. Non vale per `account_locked`: lì i dati sono giusti e, una
   * volta sbloccata l'utenza sul portale, riprovare è proprio il rimedio.
   */
  credentialsRejected?: boolean;
  /**
   * La P.IVA ha già consumato un trial in passato (registrata in
   * `trial_vat_ledger`, sopravvissuta alla cancellazione del vecchio account):
   * l'onboarding viene completato ma il trial è negato (`trialStartedAt` =
   * null → sola lettura immediata). La UI usa questo flag per spiegare il
   * motivo e spingere all'attivazione di un piano, distinguendolo dal generico
   * "trial scaduto".
   */
  trialAlreadyUsed?: boolean;
  /**
   * Le partite IVA su cui questo accesso può operare, quando sono più d'una o
   * quando l'unica passa da un incarico (HAR.md #18). La UI la usa per il
   * picker. La `denominazione` c'è solo per le P.IVA **dirette**: il portale
   * non la espone per gli incarichi, dove resta il solo numero.
   */
  utenzaChoices?: AdeUtenzaCandidate[];
};

const changePasswordLimiter = new RateLimiter({
  maxRequests: 5,
  windowMs: RATE_LIMIT_WINDOWS.AUTH_15_MIN,
});

// Stesso profilo di costo di changeAdePassword (login AdE completo +
// getFiscalData). Senza questo gate un utente autenticato — già filtrato
// dall'ownership check — può martellare il login AdE ripetendo
// verifyAdeCredentials, rischiando un lockout/IP-block lato AdE sull'egress
// condiviso che impatterebbe TUTTI gli utenti (PR #671). 5/15 min in
// simmetria con changePasswordLimiter.
const verifyAdeLimiter = new RateLimiter({
  maxRequests: 5,
  windowMs: RATE_LIMIT_WINDOWS.AUTH_15_MIN,
});

// saveAdeCredentials era l'unica action credenziali AdE senza gate (PR
// #803). Il costo non è la cifratura ma l'invalidazione delle DUE cache di
// sessione AdE in coda alla action: la sessione Fisconline vale ~10 round-trip
// HTTP (è la ragione per cui session-cache.ts esiste) e quella CIE non è
// ri-creabile senza azione umana. Un client in loop — o una sessione rubata —
// terrebbe l'esercente permanentemente senza sessione cached, degradando
// l'emissione scontrini. 10/15 min è generoso per un onboarding con retry
// legittimi e resta ben sotto la soglia di abuso.
const saveAdeCredentialsLimiter = new RateLimiter({
  maxRequests: 10,
  windowMs: RATE_LIMIT_WINDOWS.AUTH_15_MIN,
});

export type OnboardingStatus = {
  hasProfile: boolean;
  hasBusiness: boolean;
  hasCredentials: boolean;
  credentialsVerified: boolean;
  /**
   * L'esercente ha **scelto** su quale partita IVA operare (migrazione 0037):
   * opera per conto di una societa', o ne ha piu' d'una propria.
   *
   * Sta qui e non dietro una query a parte perche' e' il gate a monte
   * dell'avviso sull'identita' AdE (issue #984), che puo' accendersi solo
   * in questo caso. Costa un'espressione su un JOIN che gia' c'e' — zero
   * righe, zero join in piu' — e in cambio risparmia la lettura mirata delle
   * tredici colonne a tutti gli altri, che sono la stragrande maggioranza.
   */
  hasUtenzaPiva: boolean;
  businessId?: string;
};

type SaveBusinessInput = {
  firstName: string;
  lastName: string;
  businessName: string | null;
  address: string;
  streetNumber: string | null;
  zipCode: string;
  city: string | null;
  province: string | null;
  hasPreferredVatCode: boolean;
  preferredVatCode: string | null;
};

/**
 * Validates the `saveBusiness` payload. Extracted from `saveBusiness` to keep
 * its Cognitive Complexity under SonarCloud's S3776 threshold.
 */
function validateSaveBusinessInput(input: SaveBusinessInput): string | null {
  if (!input.firstName) return "Il nome è obbligatorio.";
  if (input.firstName.length > BUSINESS_PROFILE_LIMITS.firstName)
    return `Il nome non può superare ${BUSINESS_PROFILE_LIMITS.firstName} caratteri.`;
  if (!input.lastName) return "Il cognome è obbligatorio.";
  if (input.lastName.length > BUSINESS_PROFILE_LIMITS.lastName)
    return `Il cognome non può superare ${BUSINESS_PROFILE_LIMITS.lastName} caratteri.`;
  if (!input.address) return "L'indirizzo è obbligatorio.";
  if (input.address.length > BUSINESS_PROFILE_LIMITS.address)
    return `L'indirizzo non può superare ${BUSINESS_PROFILE_LIMITS.address} caratteri.`;
  const optionalError = validateBusinessOptionalFields(input);
  if (optionalError) return optionalError;
  if (!isValidItalianZipCode(input.zipCode)) return ITALIAN_ZIP_MESSAGE;
  if (
    input.hasPreferredVatCode &&
    isInvalidPreferredVatCode(input.preferredVatCode)
  )
    return "Aliquota IVA non valida.";
  return null;
}

export async function saveBusiness(
  formData: FormData,
): Promise<OnboardingActionResult> {
  // Sessione assente → degrada a { error } inline (regola 19/20).
  let user: Awaited<ReturnType<typeof getAuthenticatedUser>>;
  try {
    user = await getAuthenticatedUser();
  } catch (err) {
    return authErrorResult(err, "saveBusiness");
  }

  const firstName = getFormString(formData, "firstName");
  const lastName = getFormString(formData, "lastName");
  const businessName = getFormStringOrNull(formData, "businessName");
  const address = getFormString(formData, "address");
  const streetNumber = getFormStringOrNull(formData, "streetNumber");
  const zipCode = getFormString(formData, "zipCode");
  const city = getFormStringOrNull(formData, "city");
  // Maiuscolo alla scrittura: l'AdE rifiuta una sigla minuscola con
  // `EF0 — 'Provincia' non valido` al momento dell'emissione (regola 9).
  const province = normalizeProvince(getFormStringOrNull(formData, "province"));

  // Distinguish "field absent" (don't touch existing preference on UPDATE)
  // from "field present and empty" (clear it). `getFormStringOrNull` collapses
  // both into null, which would silently wipe `preferredVatCode` for a user
  // re-entering the onboarding wizard with a partial form. Same fix-class as
  // `updateBusiness` in `profile-actions.ts`.
  const hasPreferredVatCode = formData.has("preferredVatCode");
  const preferredVatCode = hasPreferredVatCode
    ? getFormStringOrNull(formData, "preferredVatCode")
    : null;

  const validationError = validateSaveBusinessInput({
    firstName,
    lastName,
    businessName,
    address,
    streetNumber,
    zipCode,
    city,
    province,
    hasPreferredVatCode,
    preferredVatCode,
  });
  if (validationError) return { error: validationError };

  const db = getDb();

  // Wrap both writes in a transaction: updating the profile and upserting
  // the business must stay consistent. A partial failure (profile updated but
  // business insert failed) would leave the user in an incomplete onboarding
  // state that is hard to recover from.
  return db.transaction(async (tx) => {
    // P1.2: serializza submit concorrenti con SELECT ... FOR UPDATE sulla riga
    // del profilo. Senza lock due richieste parallele leggono entrambe "nessun
    // business esistente" e inseriscono, creando businesses duplicati per lo
    // stesso profilo. Il vincolo UNIQUE(profile_id) (migration 0016) è il
    // backstop DB. Stesso pattern di api-key-actions.ts.
    await tx
      .select({ id: profiles.id })
      .from(profiles)
      .where(eq(profiles.authUserId, user.id))
      .for("update");

    // Find the user's profile (now that the row is locked)
    const [profile] = await tx
      .select()
      .from(profiles)
      .where(eq(profiles.authUserId, user.id))
      .limit(1);

    if (!profile) {
      return { error: "Profilo non trovato." };
    }

    // Upsert: check if business already exists for this profile
    const [existing] = await tx
      .select()
      .from(businesses)
      .where(eq(businesses.profileId, profile.id))
      .limit(1);

    // Aggiorna firstName/lastName su profile SOLO se l'onboarding non è già
    // stato completato (fiscalCode è valorizzato dalla verifica AdE). Edit
    // del nome post-onboarding deve passare da /dashboard/settings.
    if (!existing?.fiscalCode) {
      await tx
        .update(profiles)
        .set({ firstName, lastName })
        .where(eq(profiles.id, profile.id));
    }

    if (existing) {
      // Omit `preferredVatCode` from the UPDATE payload when the field is
      // absent from the form — preserves the existing preference instead of
      // overwriting it with null.
      await tx
        .update(businesses)
        .set({
          businessName,
          address,
          streetNumber,
          city,
          province,
          zipCode,
          ...(hasPreferredVatCode && { preferredVatCode }),
        })
        .where(eq(businesses.id, existing.id));

      return { businessId: existing.id };
    }

    const [newBiz] = await tx
      .insert(businesses)
      .values({
        profileId: profile.id,
        businessName,
        address,
        streetNumber,
        city,
        province,
        zipCode,
        preferredVatCode,
      })
      .returning({ id: businesses.id });

    return { businessId: newBiz.id };
  });
}

/**
 * Campi cifrati/metodo che compongono una riga `ade_credentials`. Per metodo
 * solo un sottoinsieme è valorizzato (gli altri restano NULL — migrazione 0027).
 */
type AdeCredentialValues = {
  loginMethod: string;
  encryptedCodiceFiscale: string | null;
  encryptedUsername: string | null;
  encryptedPassword: string | null;
  encryptedPin: string | null;
  spidProvider: string | null;
  keyVersion: number;
};

/**
 * Costruisce i valori cifrati per Fisconline (CF + password + PIN). Ritorna
 * `{ error }` su input non valido.
 */
function buildFisconlineValues(
  formData: FormData,
  key: Buffer,
  keyVersion: number,
): AdeCredentialValues | { error: string } {
  const codiceFiscale = getFormString(formData, "codiceFiscale");
  // La password Fisconline è una credenziale opaca (regole AdE: 8–15 char,
  // charset misto). Non trimmare: ogni byte ha significato semantico.
  const password = getFormStringRaw(formData, "password");
  // PIN già validato a regex `^\d{10}$`: trimming è sicuro.
  const pin = getFormString(formData, "pin");

  if (codiceFiscale.length !== 16) {
    return { error: "Codice fiscale non valido (16 caratteri)." };
  }
  if (!password) {
    return { error: "Password Fisconline obbligatoria." };
  }
  if (password.length > ADE_PASSWORD_MAX_LENGTH) {
    return { error: "Password Fisconline troppo lunga." };
  }
  const pinResult = adePinSchema.safeParse(pin);
  if (!pinResult.success) {
    return {
      error: pinResult.error.issues[0]?.message ?? "PIN Fisconline non valido.",
    };
  }

  return {
    loginMethod: "fisconline",
    encryptedCodiceFiscale: encrypt(codiceFiscale, key, keyVersion),
    encryptedUsername: null,
    encryptedPassword: encrypt(password, key, keyVersion),
    encryptedPin: encrypt(pin, key, keyVersion),
    spidProvider: null,
    keyVersion,
  };
}

/**
 * Costruisce i valori cifrati per CIE (email dell'app CIE ID + password). Il CF
 * non è un input: viene estratto dal portale post-login (wizardTemplate).
 */
function buildCieValues(
  formData: FormData,
  key: Buffer,
  keyVersion: number,
): AdeCredentialValues | { error: string } {
  // L'email dell'app CIE ID è una credenziale di un sistema esterno: NON
  // normalizzare (niente trim/lowercase). Case e spazi vanno preservati
  // byte-per-byte come la password, così il valore cifrato fa round-trip
  // identico all'input. Uso `getFormStringRaw` + Zod `z.email()` — stesso
  // criterio del client, il boundary server non è più debole (regola 9).
  const username = getFormStringRaw(formData, "username");
  const password = getFormStringRaw(formData, "password");

  const usernameResult = adeCieEmailSchema.safeParse(username);
  if (!usernameResult.success) {
    return {
      error:
        usernameResult.error.issues[0]?.message ??
        "Inserisci l'email dell'app CIE ID.",
    };
  }
  if (!password) {
    return { error: "Password CIE obbligatoria." };
  }
  if (password.length > ADE_PASSWORD_MAX_LENGTH) {
    return { error: "Password CIE troppo lunga." };
  }

  return {
    loginMethod: "cie",
    encryptedCodiceFiscale: null,
    encryptedUsername: encrypt(username, key, keyVersion),
    encryptedPassword: encrypt(password, key, keyVersion),
    encryptedPin: null,
    spidProvider: null,
    keyVersion,
  };
}

export async function saveAdeCredentials(
  formData: FormData,
): Promise<OnboardingActionResult> {
  // Sessione assente → degrada a { error } inline (regola 19/20).
  let user: Awaited<ReturnType<typeof getAuthenticatedUser>>;
  try {
    user = await getAuthenticatedUser();
  } catch (err) {
    return authErrorResult(err, "saveAdeCredentials");
  }

  const businessId = getFormString(formData, "businessId");
  if (!businessId) {
    return { error: "Business ID mancante." };
  }
  // Guard UUID (regola 9): evita il 22P02 di Postgres in checkBusinessOwnership.
  if (!isValidUuid(businessId)) {
    return { error: "Identificativo non valido." };
  }

  // Rate limit DOPO i guard cheap sull'input (che non consumano quota) e PRIMA
  // di cifratura/upsert/invalidazione cache: degradare con un messaggio
  // standard (regola 19), warn senza Sentry (input prevedibile, regola 20).
  // Chiave per-utente, non per-IP: utenti dietro lo stesso NAT non si bloccano
  // a vicenda (simmetria con verifyAdeLimiter).
  const rateLimitResult = saveAdeCredentialsLimiter.check(
    `save-ade:${user.id}`,
  );
  if (!rateLimitResult.success) {
    logger.warn(
      { userId: user.id, errorClass: "save_ade_rate_limit" },
      "saveAdeCredentials rate limit exceeded",
    );
    return { error: ERROR_MESSAGES.RATE_LIMIT_AUTH_MINUTES };
  }

  // Metodo di accesso (default 'fisconline' per retrocompatibilità dei form).
  const loginMethod = getFormString(formData, "loginMethod") || "fisconline";

  const key = getEncryptionKey();
  const keyVersion = getKeyVersion();

  // Validazione + cifratura PRIMA dell'ownership check: gli errori d'input non
  // devono dipendere dall'accesso al business (coerente col comportamento
  // storico Fisconline).
  // SPID non è supportato dalla PWA (nessuna via provider-agnostica: la webview
  // nativa dei competitor non è replicabile cross-origin nel browser). Rifiutato
  // esplicitamente: solo Fisconline e CIE sono metodi validi.
  let values: AdeCredentialValues | { error: string };
  if (loginMethod === "cie") {
    values = buildCieValues(formData, key, keyVersion);
  } else if (loginMethod === "spid") {
    return { error: "L'accesso con SPID non è disponibile." };
  } else {
    values = buildFisconlineValues(formData, key, keyVersion);
  }

  if ("error" in values) return values;

  const ownershipError = await checkBusinessOwnership(user.id, businessId);
  if (ownershipError) return ownershipError;

  const db = getDb();

  // Atomic upsert per evitare race condition (doppio submit del form, retry
  // di rete) — il vincolo UNIQUE su business_id garantisce 1:1.
  // verifiedAt: null al re-insert E al conflict update — credenziali nuove
  // non sono ancora state verificate contro AdE. Lo spread di `values` azzera
  // esplicitamente i campi non pertinenti al metodo (es. switch Fisconline→CIE
  // pulisce CF/PIN).
  await db
    .insert(adeCredentials)
    .values({ businessId, ...values })
    .onConflictDoUpdate({
      target: adeCredentials.businessId,
      set: { ...values, verifiedAt: null },
    });

  logger.info({ businessId, loginMethod }, "ADE credentials updated");

  // Invalida la sessione AdE cached (PR #624): le credenziali sono cambiate,
  // la prossima emissione/annullo deve rieffettuare il login con le nuove.
  await adeSessionCache.invalidate(businessId);
  await adeInteractiveSessionStore.invalidate(businessId);

  // Invalida la Router Cache client-side del dashboard: dopo aver salvato le
  // credenziali l'utente è eleggibile ad accedere al dashboard, ma il redirect
  // precedente (dashboard → onboarding) potrebbe essere ancora in cache.
  revalidatePath("/dashboard", "layout");

  return { businessId };
}

/**
 * Identity guard per `verifyAdeCredentials`. Su un business GIÀ onboardato la
 * P.IVA/CF è l'identità fiscale: cambiare le credenziali verso un soggetto
 * fiscale DIVERSO non è una rotazione password/PIN, ma sovrascriverebbe
 * `businesses.vatNumber`/`fiscalCode`. Poiché storico/PDF/pagina pubblica/CSV
 * leggono LIVE quel valore (gli scontrini non salvano uno snapshot fiscale),
 * ri-renderizzerebbe con la nuova P.IVA scontrini già trasmessi all'AdE sotto
 * la vecchia → divergenza documento fiscale vs documento consegnato.
 *
 * Ritorna l'errore da propagare (chiamante NON entra nella transazione, così
 * verifiedAt resta null e l'identità non viene toccata) oppure `null` se la
 * verifica può procedere. Il primo onboarding (`wasAlreadyOnboarded` false)
 * passa sempre. Gira anche in `connectAdeWithSpid`, prima di scrivere la riga
 * `spid` (issue #1040).
 */
function checkAdeIdentityGuard(
  wasAlreadyOnboarded: boolean,
  businessId: string,
  snapshot: BusinessIdentity | undefined,
  fiscalData: {
    identificativiFiscali: { partitaIva: string; codiceFiscale: string };
  } | null,
  loginMethod: string,
): VerifyStep | null {
  if (!wasAlreadyOnboarded) return null;

  if (!fiscalData) {
    // Non possiamo confermare che la nuova P.IVA combaci con quella registrata:
    // non marcare "verificate" credenziali mai confrontate (chiude il bypass
    // del controllo quando getFiscalData fallisce).
    logger.warn(
      { businessId, errorClass: "ade_identity_unconfirmed" },
      "verifyAdeCredentials: identità fiscale non confermabile (getFiscalData fallito) su business già onboardato",
    );
    return {
      result: {
        error:
          "Non è stato possibile confermare la connessione con l'Agenzia delle Entrate. Riprova tra qualche istante.",
      },
      outcome: "identity_unconfirmed",
    };
  }

  const registeredVat = snapshot?.vatNumber?.trim() ?? "";
  const registeredFiscalCode = snapshot?.fiscalCode?.trim() ?? "";
  const newVat = fiscalData.identificativiFiscali.partitaIva.trim();
  const newFiscalCode = fiscalData.identificativiFiscali.codiceFiscale.trim();

  // P.IVA come chiave primaria; fallback sul CF se la P.IVA registrata è assente
  // (onboarding parziale: fiscalCode presente ma vatNumber null).
  const identityMismatch = registeredVat
    ? newVat !== registeredVat
    : newFiscalCode !== registeredFiscalCode;

  if (!identityMismatch) return null;

  // Input utente prevedibile (credenziali di un'altra P.IVA): warn, non error →
  // niente issue Sentry (regola 20).
  logger.warn(
    { businessId, loginMethod, errorClass: "ade_piva_mismatch" },
    "verifyAdeCredentials: credenziali associate a una P.IVA diversa da quella registrata",
  );
  return {
    result: { error: pivaMismatchMessage(loginMethod), pivaMismatch: true },
    outcome: "piva_mismatch",
  };
}

/**
 * Il messaggio del mismatch nomina il metodo usato. Con SPID l'utenza la
 * sceglie l'utente nel portale, quindi la causa probabile è un'utenza sbagliata
 * e il rimedio è sceglierne un'altra. Il testo Fisconline è citato alla
 * lettera in `/help/errori-ade`.
 */
function pivaMismatchMessage(loginMethod: string): string {
  if (loginMethod === "spid") {
    return "L'utenza scelta con SPID è intestata a una partita IVA diversa da quella registrata sul tuo account. Se hai più utenze, ricollegati e scegli quella giusta nel portale; per gestire un'altra partita IVA è necessario un account separato.";
  }
  const credentials =
    loginMethod === "cie" ? "credenziali CIE" : "credenziali Fisconline";
  return `Queste ${credentials} appartengono a una partita IVA diversa da quella registrata sul tuo account. Per gestire un'altra partita IVA è necessario un account separato.`;
}

/** P.IVA e codice fiscale registrati: l'identità contro cui gira il guard. */
type BusinessIdentity = { fiscalCode: string | null; vatNumber: string | null };

async function readBusinessIdentity(
  db: ReturnType<typeof getDb>,
  businessId: string,
): Promise<BusinessIdentity | undefined> {
  const [identity] = await db
    .select({
      fiscalCode: businesses.fiscalCode,
      vatNumber: businesses.vatNumber,
    })
    .from(businesses)
    .where(eq(businesses.id, businessId))
    .limit(1);
  return identity;
}

/**
 * Applica la scelta dell'utenza di lavoro AdE (HAR.md #18) prima del login.
 *
 * Estratta da `verifyAdeCredentials` per tenerne la Cognitive Complexity sotto
 * la soglia SonarCloud, come gia' fatto per `checkAdeIdentityGuard` e
 * `finalizeAdeVerification`.
 *
 * La scelta si persiste **prima** del login perche' e' un input della
 * procedura, non un suo risultato: se la verifica fallisce la riga resta
 * riscrivibile, esattamente come le credenziali.
 *
 * La scrittura e' guardata da `wasAlreadyOnboarded`: dopo il primo collegamento
 * riuscito l'identita' fiscale e' immutabile (`checkAdeIdentityGuard`), e
 * lasciar riscrivere questa colonna punterebbe i re-auth silenziosi a una
 * societa' diversa da quella su cui il business emette — con l'esercente che se
 * ne accorge solo emettendo uno scontrino sulla P.IVA sbagliata. Il guard
 * dell'identita' non basta: gira DOPO il login, quando la colonna sarebbe gia'
 * stata riscritta.
 *
 * Ritorna anche `credentialVersion`: la UPDATE fa scattare `$onUpdate` su
 * `updatedAt`, che è la versione su cui `finalizeAdeVerification` monta il
 * lock ottimistico. Senza rileggerla, il lock userebbe lo snapshot
 * pre-scrittura, matcherebbe zero righe e OGNI verifica con utenza scelta
 * fallirebbe in silenzio come "credenziali cambiate durante la verifica".
 */
async function applyUtenzaSelection(params: {
  db: ReturnType<typeof getDb>;
  businessId: string;
  storedUtenzaPiva: string | null;
  requested: string | undefined;
  wasAlreadyOnboarded: boolean;
}): Promise<
  | { error: string; outcome: RecordedVerifyOutcome }
  | { utenzaPiva: string | null; credentialVersion: Date | null }
> {
  const { db, businessId, storedUtenzaPiva, requested, wasAlreadyOnboarded } =
    params;

  if (requested === undefined) {
    return { utenzaPiva: storedUtenzaPiva, credentialVersion: null };
  }

  // Boundary (regola 9): il CHECK della migrazione 0037 vuole 11 cifre.
  if (!/^\d{11}$/.test(requested)) {
    return { error: "Partita IVA non valida.", outcome: "invalid_utenza_piva" };
  }

  if (wasAlreadyOnboarded) {
    logger.warn(
      { businessId, errorClass: "ade_utenza_locked" },
      "verifyAdeCredentials: scelta utenza rifiutata su business già onboardato",
    );
    return {
      error:
        "La partita IVA di questo account è già stata collegata e non può essere cambiata. Per gestirne un'altra serve un account separato.",
      outcome: "utenza_locked",
    };
  }

  const [bumped] = await db
    .update(adeCredentials)
    .set({ utenzaPiva: requested })
    .where(eq(adeCredentials.businessId, businessId))
    .returning({ updatedAt: adeCredentials.updatedAt });

  return {
    utenzaPiva: requested,
    credentialVersion: bumped?.updatedAt ?? null,
  };
}

/**
 * Finalizza la verifica AdE in un'unica transazione guardata dalla versione
 * delle credenziali (optimistic locking). Estratta da `verifyAdeCredentials`
 * per tenere il flusso principale sotto la soglia di Cognitive Complexity:
 * tutta la logica annidata (lock miss → identità fiscale → claim P.IVA →
 * anti-abuso trial) vive qui. Ritorna i due flag che il chiamante traduce in
 * messaggi/email. Le violazioni del vincolo UNIQUE sulla P.IVA propagano:
 * il chiamante le distingue con `isUniqueConstraintViolation`.
 */
async function finalizeAdeVerification(params: {
  db: ReturnType<typeof getDb>;
  businessId: string;
  userId: string;
  credentialVersion: Date;
  businessSnapshot:
    { fiscalCode: string | null; vatNumber: string | null } | undefined;
  fiscalData: {
    identificativiFiscali: { partitaIva: string; codiceFiscale: string };
    altriDatiIdentificativi?: {
      denominazione?: string;
      indirizzo?: string;
      numeroCivico?: string;
      cap?: string;
      comune?: string;
      provincia?: string;
    };
  } | null;
}): Promise<{ credentialsChanged: boolean; trialAlreadyUsed: boolean }> {
  const {
    db,
    businessId,
    userId,
    credentialVersion,
    businessSnapshot,
    fiscalData,
  } = params;

  let credentialsChanged = false;
  let trialAlreadyUsed = false;
  // Estensione Stripe del referrer differita a DOPO il commit: è una chiamata
  // esterna, non può vivere dentro la transazione DB (regola 10). Valorizzata
  // dentro la tx solo se il referrer ha un abbonamento Stripe attivo.
  let pendingStripeExtension: {
    stripeSubscriptionId: string;
    referrerId: string;
    refereeId: string;
  } | null = null;

  await db.transaction(async (tx) => {
    const updated = await tx
      .update(adeCredentials)
      .set({ verifiedAt: new Date() })
      .where(
        and(
          eq(adeCredentials.businessId, businessId),
          sql`date_trunc('milliseconds', ${adeCredentials.updatedAt}) = ${credentialVersion.toISOString()}::timestamptz`,
        ),
      )
      .returning({ id: adeCredentials.id });

    if (updated.length === 0) {
      // Optimistic-lock miss: credentials replaced during verification.
      // Abort without writing any fiscal data from the stale session.
      credentialsChanged = true;
      return;
    }

    if (!fiscalData) return;

    const vatNumber = fiscalData.identificativiFiscali.partitaIva;
    const fiscalCode = fiscalData.identificativiFiscali.codiceFiscale;

    // Denominazione registrata sulla P.IVA (issue #984). Scritta qui e non
    // in una UPDATE propria per due motivi: eredita lo stesso lock ottimistico
    // — una sessione stantia non ne lascia traccia piu' di quanta ne lasci
    // sugli identificativi — e viaggia con la P.IVA a cui si riferisce, che e'
    // l'unica combinazione che ha senso leggere. `businessName` NON viene
    // toccato: allinearlo e' un'azione esplicita dell'esercente
    // (applyAdeDenominazione), perche' per una ditta individuale l'insegna
    // diverge legittimamente dalla denominazione anagrafica.
    // Stessa cosa per la sede legale (migrazione 0040): osservata, non
    // stampata. Le cinque colonne viaggiano con la denominazione perche'
    // descrivono la stessa identita' alla stessa data — leggerne una sola
    // aggiornata e le altre no non avrebbe senso.
    const altri = fiscalData.altriDatiIdentificativi;
    const adeDenominazione = normalizeDenominazione(altri?.denominazione);

    await tx
      .update(businesses)
      .set({
        vatNumber,
        fiscalCode,
        adeDenominazione,
        adeIndirizzo: normalizeDenominazione(altri?.indirizzo),
        adeNumeroCivico: normalizeDenominazione(altri?.numeroCivico),
        adeCap: normalizeDenominazione(altri?.cap),
        adeComune: normalizeDenominazione(altri?.comune),
        adeProvincia: normalizeDenominazione(altri?.provincia),
      })
      .where(eq(businesses.id, businessId));

    // Primo claim di questa P.IVA da parte del business, vs re-verifica
    // dello stesso account (stessa P.IVA già registrata). `businessSnapshot`
    // (letto prima della transazione) è in sync con `profiles.partitaIva`,
    // scritti insieme atomicamente; l'identity guard ha già bloccato un
    // business onboardato che arriva con una P.IVA diversa. Distinguere è
    // essenziale: senza, ri-verificare le proprie credenziali troverebbe la
    // P.IVA nel ledger e azzererebbe il trial attivo.
    const wasFirstClaim = businessSnapshot?.vatNumber !== vatNumber;

    // Anti-abuso trial: la P.IVA è UNIQUE su profiles per impedire trial
    // multipli con email diverse ma stessa P.IVA (account ancora vivo). Il
    // vincolo DB fa fallire l'UPDATE e l'intera transazione esegue rollback
    // (verifiedAt incluso), così nessun dato resta in stato parziale.
    await tx
      .update(profiles)
      .set({ partitaIva: vatNumber })
      .where(eq(profiles.authUserId, userId));

    if (!wasFirstClaim) return;

    // Anti-abuso trial cross-cancellazione: il vincolo UNIQUE su
    // profiles.partita_iva sparisce quando l'account viene cancellato,
    // liberando la P.IVA per un secondo trial. `trial_vat_ledger`
    // sopravvive alla cancellazione e registra ogni P.IVA che ha già
    // consumato un trial. ON CONFLICT DO NOTHING RETURNING è race-safe:
    // se non torna righe la P.IVA era già nel ledger da un account
    // PRECEDENTE → trial già consumato → niente nuovo trial.
    const inserted = await tx
      .insert(trialVatLedger)
      .values({ pivaHash: hashPiva(vatNumber) })
      .onConflictDoNothing()
      .returning({ id: trialVatLedger.id });

    if (inserted.length === 0) {
      // trialStartedAt = null → isTrialExpired() true → sola lettura
      // immediata, riusando i gate esistenti (canEmit/canAddCatalogItem).
      // La P.IVA era già nel ledger → NON è un nuovo cliente vero: niente
      // reward al referrer (sotto). Esce dalla transazione qui.
      await tx
        .update(profiles)
        .set({ trialStartedAt: null })
        .where(eq(profiles.authUserId, userId));
      trialAlreadyUsed = true;
      return;
    }

    // Reward referral: trigger = trial EFFETTIVAMENTE concesso (raggiunto
    // solo se il ledger sopra ha accettato la P.IVA — nuovo cliente vero).
    // Gatare qui, e non sulla sola verifica P.IVA, chiude il farming di
    // reward con una P.IVA riciclata: un referee in sola-lettura (P.IVA già
    // consumata) non frutta nulla al referrer. Claim atomico via
    // UPDATE ... WHERE rewarded_at IS NULL: idempotente sotto retry della
    // stessa finalizeAdeVerification, niente doppio reward.
    const [refereeProfile] = await tx
      .select({ id: profiles.id })
      .from(profiles)
      .where(eq(profiles.authUserId, userId))
      .limit(1);

    if (refereeProfile) {
      const claimed = await tx
        .update(referralRedemptions)
        .set({ rewardedAt: new Date() })
        .where(
          and(
            eq(referralRedemptions.refereeId, refereeProfile.id),
            sql`${referralRedemptions.rewardedAt} IS NULL`,
          ),
        )
        .returning({ referrerId: referralRedemptions.referrerId });

      if (claimed.length > 0) {
        const referrerId = claimed[0].referrerId;

        // Come erogare il mese gratis dipende dallo stato del referrer:
        // - abbonamento Stripe ATTIVO → estensione su Stripe (post-commit),
        //   così la prossima data di addebito si sposta davvero e l'app resta
        //   coerente col portale (regola: Stripe = fonte di verità sui piani a
        //   pagamento). NON si tocca referralBonusDays.
        // - trial / unlimited / abbonamento non attivo → si incrementa
        //   referralBonusDays, che ormai estende esclusivamente il trial
        //   (no-op per unlimited e per i pagati non attivi: documentato).
        const [referrerSub] = await tx
          .select({
            status: subscriptions.status,
            stripeSubscriptionId: subscriptions.stripeSubscriptionId,
          })
          .from(subscriptions)
          .innerJoin(profiles, eq(subscriptions.userId, profiles.authUserId))
          .where(eq(profiles.id, referrerId))
          .limit(1);

        if (
          referrerSub?.status === "active" &&
          referrerSub.stripeSubscriptionId
        ) {
          pendingStripeExtension = {
            stripeSubscriptionId: referrerSub.stripeSubscriptionId,
            referrerId,
            refereeId: refereeProfile.id,
          };
        } else {
          await tx
            .update(profiles)
            .set({
              referralBonusDays: sql`${profiles.referralBonusDays} + ${REFERRAL_BONUS_DAYS}`,
            })
            .where(eq(profiles.id, referrerId));
        }
      }
    }
  });

  // Fuori transazione: estensione Stripe best-effort (non deve rompere
  // l'onboarding del referee se Stripe è giù — la funzione logga critical e
  // non rilancia).
  if (pendingStripeExtension) {
    await extendSubscriptionForReferral(pendingStripeExtension);
  }

  return { credentialsChanged, trialAlreadyUsed };
}

/** Esito + risposta alla UI: ogni uscita della verifica produce entrambi. */
type VerifyStep = {
  result: OnboardingActionResult;
  outcome: RecordedVerifyOutcome;
};

/**
 * Scrive l'esito sulla riga credenziali. Best-effort per costruzione: la
 * telemetria non può far fallire un collegamento riuscito, quindi un errore
 * qui si logga e basta. È anche ciò che rende sicuro il CHECK della 0038 —
 * un valore fuori vocabolario costa una riga di telemetria, non un onboarding.
 *
 * **SQL raw, e non `db.update(adeCredentials).set({...})`.** Il costruttore
 * Drizzle farebbe scattare `$onUpdate` su `updatedAt`, che è la versione su
 * cui `finalizeAdeVerification` monta il lock ottimistico: una verifica
 * concorrente vedrebbe "credenziali cambiate durante la verifica" per colpa di
 * una scrittura di telemetria. Qui si toccano le tre colonne dell'esito e
 * nient'altro.
 *
 * Il timestamp lo mette Postgres con `now()`: dentro un template `sql` Drizzle
 * non ha il column-type context per bindare una JS `Date` e postgres-js
 * crasherebbe in `Buffer.byteLength` (skill `db-migrations`).
 */
async function recordVerifyOutcome(
  db: ReturnType<typeof getDb>,
  businessId: string,
  outcome: RecordedVerifyOutcome,
): Promise<void> {
  try {
    await db.execute(sql`
      UPDATE ade_credentials
         SET last_verify_outcome = ${outcome},
             last_verify_at = now(),
             verify_attempts = verify_attempts + 1
       WHERE business_id = ${businessId}::uuid
    `);
  } catch (err) {
    // Regola 20: non è un bug nostro nel senso che conta per l'utente, e non
    // deve generare un'issue per una riga di telemetria persa.
    logger.warn(
      { err, businessId, outcome, errorClass: "ade_verify_outcome_write" },
      "verifyAdeCredentials: esito non registrato",
    );
  }
}

/** Contesto di una verifica: per il logging e il messaggio all'utente. */
type VerifyFlow = {
  flow: string;
  defaultMessage: string;
  method: AdeLoginMethod;
};

/**
 * Esegue il login AdE per la verifica credenziali e traduce gli errori in un
 * `VerifyStep` — la risposta pronta per il client, più l'esito da registrare
 * sulla riga. Ritorna `null` quando il login ha successo. Estratto da
 * verifyAdeCredentials per tenerne sotto controllo la Cognitive Complexity
 * (SonarCloud).
 */
async function attemptAdeLoginForVerification(
  doLogin: () => Promise<unknown>,
  businessId: string,
  opts: VerifyFlow & { wasAlreadyOnboarded: boolean },
): Promise<VerifyStep | null> {
  try {
    await doLogin();
    return null;
  } catch (err) {
    return verificationErrorStep(err, businessId, opts);
  }
}

/**
 * Traduce l'errore di un login (o di un'adozione SPID) di verifica nel
 * `VerifyStep` da restituire e registrare. Separata dal `try` perché
 * `connectAdeWithSpid` ha bisogno di ciò che l'adozione restituisce.
 */
function verificationErrorStep(
  err: unknown,
  businessId: string,
  opts: VerifyFlow & { wasAlreadyOnboarded: boolean },
): VerifyStep {
  if (err instanceof AdePasswordExpiredError) {
    logger.warn({ businessId }, "AdE password scaduta durante verifica");
    return {
      result: {
        error: "La password Fisconline è scaduta.",
        passwordExpired: true,
      },
      outcome: "password_expired",
    };
  }
  logAdeFailure(
    err,
    { businessId, flow: opts.flow },
    {
      transient: "AdE credential verification: transient failure",
      failure: "AdE credential verification failed",
    },
  );
  // Più partite IVA disponibili: la lista risale alla UI, che la trasforma nel
  // picker (HAR.md #18, issue #984).
  //
  // Su un business già collegato il picker NON si offre: `applyUtenzaSelection`
  // rifiuta ogni scelta, quindi mostrarlo sarebbe un vicolo cieco — l'utente
  // sceglie e riceve "non può essere cambiata". Se un business onboardato
  // arriva qui, la P.IVA a cui era legato non è più raggiungibile da queste
  // credenziali, che è la stessa sostanza di AdeUtenzaNotAvailableError.
  if (err instanceof AdeUtenzaSelectionRequiredError) {
    if (opts.wasAlreadyOnboarded) {
      return {
        result: {
          error:
            "La partita IVA collegata a questo account non risulta più raggiungibile con queste credenziali. Verifica le abilitazioni sul portale Agenzia delle Entrate.",
          pivaMismatch: true,
        },
        // NON `utenza_selection_required`: qui il picker non viene offerto, e
        // la sostanza è che le P.IVA di queste credenziali non comprendono
        // più quella collegata — cioè AdeUtenzaNotAvailableError.
        outcome: "utenza_not_available",
      };
    }
    return {
      result: {
        error: getUserFacingAdeErrorMessage(
          err,
          opts.defaultMessage,
          opts.method,
        ).message,
        utenzaChoices: err.candidates.map(
          ({ piva, denominazione, provenienza }) => ({
            piva,
            denominazione,
            provenienza,
          }),
        ),
      },
      outcome: "utenza_selection_required",
    };
  }
  const userFacing = getUserFacingAdeErrorMessage(
    err,
    opts.defaultMessage,
    opts.method,
  );
  const outcome = classifyAdeLoginFailure(err);
  return {
    result: {
      error: userFacing.message,
      ...(userFacing.passwordExpired ? { passwordExpired: true } : {}),
      ...(outcome === "auth_error" ? { credentialsRejected: true } : {}),
    },
    outcome,
  };
}

/**
 * Costruisce la closure di login per la verifica in base al metodo salvato
 * (`cred.loginMethod`). Ritorna la closure + i metadati per il logging, oppure
 * `{ error }` se la riga credenziali è incompleta per il metodo.
 *
 * Fisconline: CF+password+PIN cifrati. CIE: username(email)+password cifrati.
 * SPID: nessun segreto salvato; il "login" è l'adozione dei cookie della
 * webview dell'app nativa, già fatta da `connectAdeWithSpid` sul client che
 * arriva qui (`spidAdopted`). Senza, non c'è niente da verificare.
 */
function buildVerificationLogin(
  adeClient: ReturnType<typeof createAdeClient>,
  cred: typeof adeCredentials.$inferSelect,
  keys: Map<number, Buffer>,
  utenzaPiva: string | undefined,
  spidAdopted: boolean,
): (VerifyFlow & { doLogin: () => Promise<unknown> }) | { error: string } {
  if (cred.loginMethod === "cie") {
    if (cred.encryptedUsername === null || cred.encryptedPassword === null) {
      return { error: "Credenziali CIE incomplete." };
    }
    const username = decrypt(cred.encryptedUsername, keys);
    const password = decrypt(cred.encryptedPassword, keys);
    return {
      doLogin: () => adeClient.loginCie({ username, password }, utenzaPiva),
      flow: "onboarding-verify-cie",
      defaultMessage: "Verifica fallita. Controlla le credenziali CIE.",
      method: "cie",
    };
  }

  if (cred.loginMethod === "spid") {
    // Senza cookie (es. "Verifica" premuto dalla PWA) non c'è niente da
    // adottare: il server non ha segreti SPID per rifare il login.
    if (!spidAdopted) {
      return { error: SPID_RECONNECT_FROM_APP };
    }
    // Sessione già adottata sullo stesso client: niente da rifare.
    return { doLogin: () => Promise.resolve(), ...SPID_VERIFY_FLOW };
  }

  // fisconline (default)
  if (
    cred.encryptedCodiceFiscale === null ||
    cred.encryptedPassword === null ||
    cred.encryptedPin === null
  ) {
    return { error: "Credenziali Fisconline incomplete." };
  }
  const codiceFiscale = decrypt(cred.encryptedCodiceFiscale, keys);
  const password = decrypt(cred.encryptedPassword, keys);
  const pin = decrypt(cred.encryptedPin, keys);
  return {
    doLogin: () =>
      adeClient.login({ codiceFiscale, password, pin }, utenzaPiva),
    flow: "onboarding-verify",
    defaultMessage: "Verifica fallita. Controlla le credenziali Fisconline.",
    method: "fisconline",
  };
}

/**
 * Reclama in modo atomico e idempotente i flag welcome_email_sent_at /
 * operator_notified_at (migration 0023) e invia le rispettive notifiche
 * fire-and-forget. Estratto da verifyAdeCredentials per tenerne sotto controllo
 * la Cognitive Complexity (SonarCloud). I due flag sono INDIPENDENTI: chi vince
 * il claim (UPDATE ... WHERE ... IS NULL RETURNING) invia — race-safe (due
 * verify simultanei → un solo invio per flag) e a prova di reset manuale di
 * fiscalCode / re-run. Il claim si imposta PRIMA dell'invio (semantica "tentato
 * una volta"): un fallimento transitorio non ritenta, coerente col precedente
 * comportamento fire-and-forget.
 */
async function claimAndSendOnboardingNotifications(
  db: ReturnType<typeof getDb>,
  businessId: string,
  user: Awaited<ReturnType<typeof getAuthenticatedUser>>,
): Promise<void> {
  const email = user.email;
  if (email) {
    const claimedWelcome = await db
      .update(businesses)
      .set({ welcomeEmailSentAt: new Date() })
      .where(
        and(
          eq(businesses.id, businessId),
          isNull(businesses.welcomeEmailSentAt),
        ),
      )
      .returning({ id: businesses.id });

    if (claimedWelcome.length > 0) {
      void sendEmail({
        to: email,
        subject: "Sei pronto! Inizia a emettere scontrini con ScontrinoZero",
        react: createElement(WelcomeEmail, { email }),
      }).catch((err) => logger.error({ err }, "Welcome email failed"));
    }
  }

  // Notifica operatore interna: claim separato (può partire anche senza
  // user.email). Fire-and-forget, non-critical, env-gated in
  // notifyOperatorOfNewSignup.
  const claimedOperator = await db
    .update(businesses)
    .set({ operatorNotifiedAt: new Date() })
    .where(
      and(eq(businesses.id, businessId), isNull(businesses.operatorNotifiedAt)),
    )
    .returning({ id: businesses.id });

  if (claimedOperator.length > 0) {
    void notifyOperatorOfNewSignup(user.id).catch((err) =>
      logger.warn({ err }, "Operator signup notification failed"),
    );
  }
}

/**
 * Dati fiscali dopo il login di verifica, best-effort: la verifica riesce
 * anche se l'AdE non li restituisce, e P.IVA/CF si completano a un giro
 * successivo. Estratto da verifyAdeCredentials per contenerne la Cognitive
 * Complexity (SonarCloud).
 */
async function fetchFiscalData(
  adeClient: ReturnType<typeof createAdeClient>,
  businessId: string,
): Promise<AdeCedentePrestatore | null> {
  try {
    return await adeClient.getFiscalData();
  } catch (err) {
    logger.error({ err, businessId }, "Failed to fetch fiscal data from AdE");
    return null;
  }
}

/**
 * Tetto all'header Cookie di una sessione SPID adottata. Quello reale del
 * portale (docs/mobile-v2.md punto 5) sta in pochi KB: 16 KB lasciano margine
 * senza accettare un payload arbitrario (regola 9).
 */
const SPID_COOKIE_MAX_BYTES = 16 * 1024;

const SPID_RECONNECT_FROM_APP =
  "La connessione SPID si rinnova solo dall'app ScontrinoZero: aprila e accedi con SPID.";

/** Client con la sessione SPID adottata e i dati fiscali letti nell'adozione. */
type AdoptedSpid = {
  client: ReturnType<typeof createAdeClient>;
  fiscalData: AdeCedentePrestatore;
};

/** La verifica SPID, all'adozione e nella pipeline. */
const SPID_VERIFY_FLOW: VerifyFlow = {
  flow: "onboarding-verify-spid",
  defaultMessage:
    "Sessione SPID non valida o scaduta. Accedi di nuovo con SPID dall'app.",
  method: "spid",
};

/** I nomi dell'header `Cookie`, nell'ordine e con i duplicati. */
function cookieNamesOf(header: string): string[] {
  return header
    .split(";")
    .map((pair) => pair.split("=", 1)[0].trim())
    .filter(Boolean);
}

/**
 * Collega (o ricollega) l'AdE con una sessione SPID aperta nella webview
 * dell'app nativa (docs/mobile-v2.md punto 5). L'app legge i cookie del
 * portale e li passa qui; il server non vede mai credenziali SPID.
 *
 * Adotta i cookie e confronta i dati fiscali letti con la P.IVA registrata
 * prima di scrivere: con un'altra P.IVA la riga credenziali esistente resta
 * com'è (issue #1040). Solo allora salva la riga `spid` senza segreti e la
 * verifica con la stessa pipeline di Fisconline e CIE (l'adozione al posto
 * del login); la sessione entra nello store interattivo solo a verifica
 * riuscita. La scelta dell'utenza di lavoro l'ha già fatta l'utente nel
 * portale, dentro la webview.
 */
export async function connectAdeWithSpid(
  businessId: string,
  cookieHeader: string,
): Promise<OnboardingActionResult> {
  let user: Awaited<ReturnType<typeof getAuthenticatedUser>>;
  try {
    user = await getAuthenticatedUser();
  } catch (err) {
    return authErrorResult(err, "connectAdeWithSpid");
  }

  if (!isValidUuid(businessId)) {
    return { error: "Identificativo non valido." };
  }

  const header = typeof cookieHeader === "string" ? cookieHeader.trim() : "";
  if (!header || Buffer.byteLength(header, "utf8") > SPID_COOKIE_MAX_BYTES) {
    logger.warn(
      { businessId, errorClass: "spid_cookie_invalid" },
      "connectAdeWithSpid: header cookie vuoto o troppo grande",
    );
    return { error: "Sessione SPID non valida. Accedi di nuovo con SPID." };
  }

  const ownershipError = await checkBusinessOwnership(user.id, businessId);
  if (ownershipError) return ownershipError;

  // Stesso limiter e stessa chiave della verifica: collegare con SPID È una
  // verifica, e i due percorsi non devono sommare i tentativi.
  const rateLimitResult = verifyAdeLimiter.check(`verify-ade:${user.id}`);
  if (!rateLimitResult.success) {
    logger.warn({ userId: user.id }, "connectAdeWithSpid rate limit exceeded");
    return { error: ERROR_MESSAGES.RATE_LIMIT_AUTH_MINUTES };
  }

  // Solo i nomi, mai i valori. Su sandbox `MockAdeClient` accetta qualunque
  // header: questo log è ciò che mostra se la cattura porta l'insieme del
  // punto E di docs/mobile-v2.md (issue #1043). Non sotto la chiave `cookie`,
  // che REDACT_PATHS censura.
  logger.info(
    { businessId, cookieNames: cookieNamesOf(header) },
    "connectAdeWithSpid: cookie ricevuti",
  );

  // Adozione e identità PRIMA di scrivere: la riga `spid` sostituisce le
  // credenziali salvate (es. Fisconline di chi già emette), quindi si scrive
  // solo con cookie validi e un'utenza della P.IVA registrata. Con SPID
  // l'utenza la sceglie l'utente nel portale: chi ne ha più d'una può
  // sceglierne una di un'altra P.IVA (issue #1040). Lo stesso client, con i
  // dati fiscali già letti, passa poi alla verifica: una sola GET all'AdE.
  const db = getDb();
  const adeClient = createAdeClient(getAdeMode());
  let adopted: AdeAdoptedSession;
  try {
    adopted = await adeClient.adoptSession(header);
  } catch (err) {
    const step = verificationErrorStep(err, businessId, {
      ...SPID_VERIFY_FLOW,
      wasAlreadyOnboarded: false,
    });
    await recordVerifyOutcome(db, businessId, step.outcome);
    return step.result;
  }

  const identity = await readBusinessIdentity(db, businessId);
  const identityError = checkAdeIdentityGuard(
    Boolean(identity?.fiscalCode),
    businessId,
    identity,
    adopted.fiscalData,
    "spid",
  );
  if (identityError) {
    await recordVerifyOutcome(db, businessId, identityError.outcome);
    return identityError.result;
  }

  const values: AdeCredentialValues = {
    loginMethod: "spid",
    encryptedCodiceFiscale: null,
    encryptedUsername: null,
    encryptedPassword: null,
    encryptedPin: null,
    spidProvider: null,
    keyVersion: getKeyVersion(),
  };
  await db
    .insert(adeCredentials)
    .values({ businessId, ...values })
    .onConflictDoUpdate({
      target: adeCredentials.businessId,
      set: { ...values, verifiedAt: null },
    });

  await adeSessionCache.invalidate(businessId);
  await adeInteractiveSessionStore.invalidate(businessId);

  return verifyStoredCredentials({
    user,
    businessId,
    utenzaPiva: undefined,
    adoptedSpid: { client: adeClient, fiscalData: adopted.fiscalData },
  });
}

export async function verifyAdeCredentials(
  businessId: string,
  utenzaPiva?: string,
): Promise<OnboardingActionResult> {
  // Sessione assente → degrada a { error } inline (regola 19/20).
  let user: Awaited<ReturnType<typeof getAuthenticatedUser>>;
  try {
    user = await getAuthenticatedUser();
  } catch (err) {
    return authErrorResult(err, "verifyAdeCredentials");
  }

  // Guard UUID (regola 9): evita il 22P02 di Postgres in checkBusinessOwnership.
  if (!isValidUuid(businessId)) {
    return { error: "Identificativo non valido." };
  }

  const ownershipError = await checkBusinessOwnership(user.id, businessId);
  if (ownershipError) return ownershipError;

  // Rate limit DOPO l'ownership gate, PRIMA del decrypt/login AdE: degradare
  // con un messaggio standard (regola 19), warn senza Sentry (input prevedibile,
  // regola 20). Simmetria con changeAdePassword (PR #671).
  const rateLimitResult = verifyAdeLimiter.check(`verify-ade:${user.id}`);
  if (!rateLimitResult.success) {
    logger.warn(
      { userId: user.id },
      "verifyAdeCredentials rate limit exceeded",
    );
    return { error: ERROR_MESSAGES.RATE_LIMIT_AUTH_MINUTES };
  }

  return verifyStoredCredentials({ user, businessId, utenzaPiva });
}

/**
 * Verifica contro l'AdE la riga credenziali già salvata del business: login
 * (o adozione della sessione SPID), identity guard, finalizzazione, esito
 * registrato. Comune a `verifyAdeCredentials` e `connectAdeWithSpid`, che
 * fanno prima i propri controlli d'accesso.
 */
async function verifyStoredCredentials(params: {
  user: Awaited<ReturnType<typeof getAuthenticatedUser>>;
  businessId: string;
  utenzaPiva: string | undefined;
  adoptedSpid?: AdoptedSpid;
}): Promise<OnboardingActionResult> {
  const { user, businessId, utenzaPiva, adoptedSpid } = params;
  const db = getDb();

  const [cred] = await db
    .select()
    .from(adeCredentials)
    .where(eq(adeCredentials.businessId, businessId))
    .limit(1);

  if (!cred) {
    // Nessuna riga su cui registrare un esito: l'uscita precede la telemetria
    // per costruzione, non per scelta.
    return { error: "Credenziali non trovate." };
  }

  // Snapshot fiscalCode BEFORE the transaction that sets it. fiscalCode is
  // assigned once on the first successful AdE verification and never reset
  // (saveBusiness/saveAdeCredentials preserve it), so its absence is the
  // canonical "user has never completed onboarding" signal — usato qui solo per
  // l'identity guard (cambio P.IVA su business già onboardato). L'idempotency
  // delle email di onboarding NON dipende più da fiscalCode: vive sui flag
  // durabili welcome_email_sent_at / operator_notified_at reclamati a valle
  // (migration 0023).
  const businessSnapshot = await readBusinessIdentity(db, businessId);
  const wasAlreadyOnboarded = Boolean(businessSnapshot?.fiscalCode);

  const { result, outcome } = await runAdeVerification({
    db,
    businessId,
    user,
    cred,
    requestedUtenzaPiva: utenzaPiva,
    businessSnapshot,
    wasAlreadyOnboarded,
    adoptedSpid,
  });

  // Un solo punto di scrittura, dopo ogni ramo d'uscita. Spargere la chiamata
  // sui dodici `return` di `runAdeVerification` avrebbe garantito che prima o
  // poi qualcuno ne dimenticasse uno, e un buco nell'attribuzione è
  // indistinguibile da un "mai tentato" (PR #957).
  await recordVerifyOutcome(db, businessId, outcome);

  return result;
}

/**
 * Il corpo della verifica AdE, dal primo input al login fino alla
 * finalizzazione. Ogni uscita porta con sé il proprio esito
 * (`RecordedVerifyOutcome`), che il chiamante scrive una volta sola.
 *
 * Estratta da `verifyAdeCredentials` per questo: il flusso ha una dozzina di
 * uscite anticipate e la sola forma in cui l'esito non si può dimenticare è
 * quella in cui il tipo di ritorno lo pretende.
 *
 * Restano fuori — sopra, nel chiamante — i gate d'accesso (sessione, UUID,
 * ownership, rate limit) e la lettura delle credenziali: non sono tentativi di
 * verifica, e registrarli come tali falserebbe sia l'ultimo esito sia il
 * contatore.
 */
async function runAdeVerification(params: {
  db: ReturnType<typeof getDb>;
  businessId: string;
  user: Awaited<ReturnType<typeof getAuthenticatedUser>>;
  cred: typeof adeCredentials.$inferSelect;
  requestedUtenzaPiva: string | undefined;
  businessSnapshot: BusinessIdentity | undefined;
  wasAlreadyOnboarded: boolean;
  adoptedSpid?: AdoptedSpid;
}): Promise<VerifyStep> {
  const {
    db,
    businessId,
    user,
    cred,
    requestedUtenzaPiva,
    businessSnapshot,
    wasAlreadyOnboarded,
    adoptedSpid,
  } = params;

  // Scelta dell'utenza di lavoro (HAR.md #18), applicata prima del login.
  const selection = await applyUtenzaSelection({
    db,
    businessId,
    storedUtenzaPiva: cred.utenzaPiva,
    requested: requestedUtenzaPiva,
    wasAlreadyOnboarded,
  });
  if ("error" in selection) {
    return { result: { error: selection.error }, outcome: selection.outcome };
  }
  const effectiveUtenzaPiva = selection.utenzaPiva;

  // Snapshot updatedAt to detect concurrent credential updates (optimistic locking).
  // If the user saves new credentials while AdE login is in progress, the WHERE
  // below will match 0 rows, preventing verifiedAt from being set on stale data.
  const credentialVersion = selection.credentialVersion ?? cred.updatedAt;

  // Key map per VERSIONE reale (PR #785): sotto rotazione la riga può
  // essere ancora cifrata con la chiave precedente.
  const keys = getEncryptionKeys();

  const adeClient = adoptedSpid?.client ?? createAdeClient(getAdeMode());

  // Login method-aware (Fisconline / CIE / adozione SPID). La coda post-login
  // (dati fiscali, identity guard, finalize, notifiche) è identica per tutti.
  const loginPlan = buildVerificationLogin(
    adeClient,
    cred,
    keys,
    effectiveUtenzaPiva ?? undefined,
    adoptedSpid !== undefined,
  );
  if ("error" in loginPlan) {
    // Riga incompleta per il metodo salvato, o `spid` verificato senza una
    // sessione da adottare (il rinnovo SPID passa solo dall'app nativa).
    // È un vicolo cieco silenzioso: senza questa riga chi ci finisce sarebbe
    // indistinguibile da chi non ha mai premuto Verifica.
    return {
      result: { error: loginPlan.error },
      outcome: "incomplete_credentials",
    };
  }

  const loginError = await attemptAdeLoginForVerification(
    loginPlan.doLogin,
    businessId,
    {
      flow: loginPlan.flow,
      defaultMessage: loginPlan.defaultMessage,
      method: loginPlan.method,
      wasAlreadyOnboarded,
    },
  );
  if (loginError) return loginError;

  // Dati fiscali per identity guard e finalizzazione: quelli che l'adozione
  // SPID ha già letto, altrimenti una GET con la sessione appena aperta.
  const fiscalData = adoptedSpid
    ? adoptedSpid.fiscalData
    : await fetchFiscalData(adeClient, businessId);

  // CIE e SPID (real) tengono la sessione: non si ricrea in silenzio (secondo
  // fattore umano), quindi emit/void la riusano dallo store interattivo. Ci
  // entra solo a verifica riuscita (issue #1040): con un'identità diversa o un
  // salvataggio fallito lo store terrebbe una sessione che non deve usare.
  // Fisconline (e il mock): logout subito, come prima.
  const keepsSession =
    (cred.loginMethod === "cie" || cred.loginMethod === "spid") &&
    getAdeMode() === "real";
  if (!keepsSession) {
    await adeClient
      .logout()
      .catch((err) => logger.warn({ err }, "AdE logout failed"));
  }

  const step = await finalizeVerifiedIdentity({
    db,
    businessId,
    user,
    loginMethod: cred.loginMethod,
    credentialVersion,
    businessSnapshot,
    wasAlreadyOnboarded,
    fiscalData,
  });
  if (keepsSession && step.outcome === "success") {
    adeInteractiveSessionStore.set(businessId, adeClient);
  }
  return step;
}

/**
 * Dopo un login (o un'adozione) riuscito: identity guard, finalizzazione
 * atomica, notifiche di onboarding. Estratta da `runAdeVerification` per
 * tenerne la Cognitive Complexity sotto la soglia SonarCloud, e perché chi la
 * chiama decide della sessione in base all'esito.
 */
async function finalizeVerifiedIdentity(params: {
  db: ReturnType<typeof getDb>;
  businessId: string;
  user: Awaited<ReturnType<typeof getAuthenticatedUser>>;
  loginMethod: string;
  credentialVersion: Date;
  businessSnapshot: BusinessIdentity | undefined;
  wasAlreadyOnboarded: boolean;
  fiscalData: AdeCedentePrestatore | null;
}): Promise<VerifyStep> {
  const {
    db,
    businessId,
    user,
    loginMethod,
    credentialVersion,
    businessSnapshot,
    wasAlreadyOnboarded,
    fiscalData,
  } = params;

  // Identity guard: blocca il cambio credenziali verso una P.IVA diversa su un
  // business già onboardato (logica in checkAdeIdentityGuard). Eseguito PRIMA
  // della transazione, così verifiedAt resta null e l'identità non viene
  // toccata. Il primo onboarding (wasAlreadyOnboarded false) passa sempre.
  const identityError = checkAdeIdentityGuard(
    wasAlreadyOnboarded,
    businessId,
    businessSnapshot,
    fiscalData,
    loginMethod,
  );
  if (identityError) return identityError;

  // Finalize atomically AND optimistically in a single transaction guarded by
  // the credential version snapshotted BEFORE talking to AdE. The guarded
  // verifiedAt UPDATE is the FIRST statement: if the user replaced the
  // credentials while AdE login/getFiscalData was in flight, it matches 0 rows
  // and the whole transaction is abandoned — so fiscal identity from a STALE
  // session is never written to businesses/profiles (review P1.1). Previously
  // only verifiedAt was guarded while vatNumber/fiscalCode/partitaIva were
  // written unconditionally, corrupting the business identity on a concurrent
  // credential swap.
  //
  // date_trunc to milliseconds: defaultNow() lets PostgreSQL set updatedAt via
  // NOW() (microsecond precision), but JS Date is only millisecond-precise.
  // Truncating before comparison prevents false mismatches on the first SELECT.
  // The snapshot is serialized as ISO string + `::timestamptz` cast: inside a
  // raw `sql` template Drizzle has no column-type context to bind a JS Date and
  // would crash `Buffer.byteLength(<Date>)` in postgres-js.
  let credentialsChanged = false;
  let trialAlreadyUsed = false;
  try {
    ({ credentialsChanged, trialAlreadyUsed } = await finalizeAdeVerification({
      db,
      businessId,
      userId: user.id,
      credentialVersion,
      businessSnapshot,
      fiscalData,
    }));
  } catch (err) {
    if (isUniqueConstraintViolation(err)) {
      logger.warn({ businessId }, "P.IVA già in uso — possibile abuso trial");
      return {
        result: {
          error: "Questa P.IVA è già associata a un altro account.",
          pivaConflict: true,
        },
        outcome: "piva_conflict",
      };
    }
    logger.error(
      { err, businessId, critical: true },
      "verifyAdeCredentials: finalizzazione DB fallita dopo verifica AdE",
    );
    return {
      result: {
        error:
          "Verifica riuscita ma il salvataggio è fallito. Riprova tra qualche istante.",
      },
      outcome: "finalize_failed",
    };
  }

  if (credentialsChanged) {
    // Credentials were replaced while AdE login was in progress: neither the
    // fiscal identity nor verifiedAt was written. The new credentials will be
    // verified on the next attempt.
    logger.warn(
      { businessId },
      "verifyAdeCredentials: credenziali modificate durante verifica, verifiedAt non impostato",
    );
    return { result: { businessId }, outcome: "credentials_changed" };
  }

  // Email di onboarding: idempotency DURABILE sui flag welcome_email_sent_at /
  // operator_notified_at (migration 0023), non più derivata da fiscalCode.
  // wasAlreadyOnboarded resta in uso solo per l'identity guard sopra. Logica
  // estratta per Cognitive Complexity (vedi helper).
  await claimAndSendOnboardingNotifications(db, businessId, user);

  if (trialAlreadyUsed) {
    // Input prevedibile (utente che ha già usato il trial con questa P.IVA),
    // non un bug nostro: warn → osservabilità senza issue Sentry (regola 20).
    logger.warn(
      { businessId },
      "Trial già usato per questa P.IVA — onboarding completato in sola lettura",
    );
  }

  revalidatePath("/dashboard", "layout");

  return {
    result: {
      businessId,
      ...(trialAlreadyUsed ? { trialAlreadyUsed: true } : {}),
    },
    outcome: "success",
  };
}

/**
 * Restituisce lo stato di onboarding dell'utente con un'unica query JOIN
 * (profile → business → credentials) anziché 3 query sequenziali.
 *
 * `cache()` di React deduplicaza le chiamate nello stesso render tree RSC:
 * `dashboard/layout.tsx` + `dashboard/<segment>/page.tsx` ora condividono
 * la stessa risposta invece di colpire il DB due volte. Combinato con il
 * JOIN, una page navigation dashboard scende da 6 query a 1.
 *
 * Nota CLAUDE.md: `cache()` non deduplicaza tra Route Handler e RSC, ma qui
 * tutti i caller sono RSC nello stesso request — funziona.
 */
export const getOnboardingStatus = cache(
  async (): Promise<OnboardingStatus> => {
    const user = await getAuthenticatedUser();
    const db = getDb();

    const [row] = await db
      .select({
        profileId: profiles.id,
        businessId: businesses.id,
        hasCredentials: sql<boolean>`(${adeCredentials.id} is not null)`,
        credentialsVerified: sql<boolean>`(${adeCredentials.verifiedAt} is not null)`,
        hasUtenzaPiva: sql<boolean>`(${adeCredentials.utenzaPiva} is not null)`,
      })
      .from(profiles)
      .leftJoin(businesses, eq(businesses.profileId, profiles.id))
      .leftJoin(adeCredentials, eq(adeCredentials.businessId, businesses.id))
      .where(eq(profiles.authUserId, user.id))
      .limit(1);

    if (!row) {
      return {
        hasProfile: false,
        hasBusiness: false,
        hasCredentials: false,
        credentialsVerified: false,
        hasUtenzaPiva: false,
      };
    }

    if (!row.businessId) {
      return {
        hasProfile: true,
        hasBusiness: false,
        hasCredentials: false,
        credentialsVerified: false,
        hasUtenzaPiva: false,
      };
    }

    return {
      hasProfile: true,
      hasBusiness: true,
      businessId: row.businessId,
      hasCredentials: row.hasCredentials,
      credentialsVerified: row.credentialsVerified,
      hasUtenzaPiva: row.hasUtenzaPiva,
    };
  },
);

/**
 * Legge il flag "tour onboarding visto" per l'utente corrente (v1.4.1).
 * Usato dal dashboard layout per decidere se montare il walkthrough guidato:
 * letto server-side → niente flash di overlay (performance percepita, priorità #1).
 *
 * `cache()` deduplicaza la chiamata nello stesso render tree RSC (come
 * `getOnboardingStatus`). Query mirata sulla sola colonna — non gonfia il JOIN
 * hot-path di `getOnboardingStatus`.
 *
 * Fail-safe (regola 19): un fallimento DB degrada a "già visto" → non mostra il
 * tour, ma NON fa esplodere l'error boundary del dashboard per una feature
 * puramente cosmetica.
 */
export const getOnboardingTourSeen = cache(async (): Promise<boolean> => {
  const user = await getAuthenticatedUser();
  const db = getDb();
  try {
    const [row] = await db
      .select({ seenAt: profiles.onboardingTourSeenAt })
      .from(profiles)
      .where(eq(profiles.authUserId, user.id))
      .limit(1);
    return row?.seenAt != null;
  } catch (err) {
    logger.warn({ err, userId: user.id }, "getOnboardingTourSeen failed");
    return true;
  }
});

/**
 * Marca il tour onboarding come visto/skippato per l'utente corrente
 * (v1.4.1). Chiamata dal componente client quando il walkthrough termina
 * (FINISHED) o viene skippato (SKIPPED).
 *
 * `WHERE onboarding_tour_seen_at IS NULL`: idempotente e race-safe — il primo
 * write vince e i successivi sono no-op (nessun overwrite del timestamp
 * originale). Degrada con `{ error }` su fallimento DB (regola 19), `logger.warn`
 * — non un bug nostro né da Sentry (regola 20): la persistenza del tour è
 * cosmetica, il client l'ha già nascosto in modo optimistic.
 */
export async function markOnboardingTourSeen(): Promise<{ error?: string }> {
  // Sessione assente → degrada a { error } inline (regola 19/20).
  let user: Awaited<ReturnType<typeof getAuthenticatedUser>>;
  try {
    user = await getAuthenticatedUser();
  } catch (err) {
    return authErrorResult(err, "markOnboardingTourSeen");
  }
  const db = getDb();
  try {
    await db
      .update(profiles)
      .set({ onboardingTourSeenAt: new Date() })
      .where(
        and(
          eq(profiles.authUserId, user.id),
          isNull(profiles.onboardingTourSeenAt),
        ),
      );
    return {};
  } catch (err) {
    logger.warn({ err, userId: user.id }, "markOnboardingTourSeen failed");
    return { error: "Impossibile salvare lo stato del tour." };
  }
}

const ADE_PASSWORD_REGEX = /^[a-zA-Z0-9*+§°ç@^?=)(/&%$£!|\\<>]{8,15}$/;

/**
 * Traduce un errore del cambio password AdE nel messaggio mostrato all'utente,
 * loggandolo al livello corretto. Estratta da `changeAdePassword` per tenerla
 * sotto la soglia S3776 di Cognitive Complexity (stesso motivo di
 * `formatVoidError`): i due rami d'input utente (password attuale errata,
 * nuova uguale alla vecchia) sono `warn` e non devono aprire issue Sentry
 * (regola 20); tutto il resto passa da `logAdeFailure`, che distingue
 * transient e failure.
 */
function formatChangePasswordError(err: unknown, businessId: string): string {
  if (err instanceof AdeAuthError) {
    logger.warn({ businessId }, "changeAdePassword: password attuale errata");
    return "Password attuale non corretta.";
  }
  if (err instanceof AdeError && err.code === "ADE_CHANGE_PW_SAME") {
    return "La nuova password deve essere diversa da quella attuale.";
  }
  logAdeFailure(
    err,
    { businessId },
    {
      transient: "changeAdePassword: AdE transient failure",
      failure: "Cambio password AdE fallito",
    },
  );
  return getUserFacingAdeErrorMessage(
    err,
    "Errore durante il cambio password. Riprova più tardi.",
  ).message;
}

/**
 * Ri-cifra TUTTI i campi cifrati della riga credenziali con la chiave corrente
 * e ritorna il set da scrivere, `key_version` inclusa.
 *
 * Perché tutti e non solo la password appena cambiata: `key_version` è UNA
 * colonna per RIGA, non per campo. Cifrare la nuova password con
 * `getEncryptionKey()` (la chiave corrente) etichettandola con
 * `cred.keyVersion` (la versione MEMORIZZATA) produce, a cavallo di una
 * rotazione, un payload marcato v1 ma cifrato con la chiave v2: una key-map
 * multi-versione corretta lo decifrerebbe con la chiave v1 → authTag mismatch
 * → credenziali illeggibili. Allineare l'intera riga alla versione corrente
 * chiude il buco (PR #782) e non ostacola la rotazione zero-downtime
 * (PR #785).
 *
 * `encryptedUsername` è normalmente null su Fisconline (l'username è il CF), ma
 * viene ri-cifrato se presente: qualunque campo lasciato alla chiave vecchia
 * sotto una `key_version` nuova sarebbe perso.
 */
function reencryptCredentialFields(params: {
  cred: { encryptedUsername: string | null; encryptedPin: string | null };
  keys: Map<number, Buffer>;
  key: Buffer;
  codiceFiscale: string;
  newPassword: string;
}) {
  const { cred, keys, key, codiceFiscale, newPassword } = params;
  const version = getKeyVersion();
  const reencrypt = (payload: string | null) =>
    payload === null ? null : encrypt(decrypt(payload, keys), key, version);

  return {
    // Il CF è già decifrato dal flusso: nessun decrypt ridondante.
    encryptedCodiceFiscale: encrypt(codiceFiscale, key, version),
    encryptedUsername: reencrypt(cred.encryptedUsername),
    encryptedPassword: encrypt(newPassword, key, version),
    encryptedPin: reencrypt(cred.encryptedPin),
    keyVersion: version,
  };
}

export async function changeAdePassword(
  businessId: string,
  currentPassword: string,
  newPassword: string,
  confirmNewPassword: string,
): Promise<OnboardingActionResult> {
  // Sessione assente → degrada a { error } inline (regola 19/20).
  let user: Awaited<ReturnType<typeof getAuthenticatedUser>>;
  try {
    user = await getAuthenticatedUser();
  } catch (err) {
    return authErrorResult(err, "changeAdePassword");
  }

  // Guard UUID (regola 9): evita il 22P02 di Postgres in checkBusinessOwnership.
  if (!isValidUuid(businessId)) {
    return { error: "Identificativo non valido." };
  }

  const ownershipError = await checkBusinessOwnership(user.id, businessId);
  if (ownershipError) return ownershipError;

  const rateLimitResult = changePasswordLimiter.check(
    `change-ade-pw:${user.id}`,
  );
  if (!rateLimitResult.success) {
    logger.warn({ userId: user.id }, "changeAdePassword rate limit exceeded");
    return { error: ERROR_MESSAGES.RATE_LIMIT_AUTH_MINUTES };
  }

  if (!ADE_PASSWORD_REGEX.test(newPassword)) {
    return {
      error:
        "Password non valida. Usa 8–15 caratteri: lettere (non accentate), numeri o caratteri speciali.",
    };
  }
  if (newPassword !== confirmNewPassword) {
    return { error: "Le password non coincidono." };
  }
  if (newPassword === currentPassword) {
    return {
      error: "La nuova password deve essere diversa da quella attuale.",
    };
  }

  const db = getDb();
  const [cred] = await db
    .select()
    .from(adeCredentials)
    .where(eq(adeCredentials.businessId, businessId))
    .limit(1);

  if (!cred) return { error: "Credenziali non trovate." };
  if (cred.encryptedCodiceFiscale === null) {
    return { error: "Codice fiscale non disponibile per il cambio password." };
  }

  // Si decifra da N versioni (`keys`, PR #785) ma si ri-cifra sempre con la
  // chiave corrente (`key`), coerentemente con `reencryptCredentialFields`.
  const key = getEncryptionKey();
  const keys = getEncryptionKeys();
  const codiceFiscale = decrypt(cred.encryptedCodiceFiscale, keys);
  // Snapshot per l'optimistic lock, letto PRIMA del flusso HTTP AdE: è la
  // finestra (secondi) in cui un altro tab può sostituire le credenziali.
  const credentialVersion = cred.updatedAt;

  const adeClient = createAdeClient(getAdeMode());

  try {
    await adeClient.changePasswordFisconline({
      codiceFiscale,
      oldPassword: currentPassword,
      newPassword,
      confirmNewPassword,
    });
  } catch (err) {
    return { error: formatChangePasswordError(err, businessId) };
  }

  // La ri-cifratura decifra PIN/username: succede DOPO il cambio password sul
  // portale, quindi un payload illeggibile non deve propagare (regola 19) —
  // l'error boundary di Next lascerebbe l'utente senza spiegazione con la
  // password AdE già cambiata.
  let reencrypted: ReturnType<typeof reencryptCredentialFields>;
  try {
    reencrypted = reencryptCredentialFields({
      cred,
      keys,
      key,
      codiceFiscale,
      newPassword,
    });
  } catch (err) {
    logger.error(
      { err, businessId },
      "changeAdePassword: ri-cifratura credenziali fallita",
    );
    return {
      error:
        "Password cambiata sul portale AdE, ma non è stato possibile salvarla. Verifica la connessione dalle impostazioni.",
    };
  }

  const updated = await db
    .update(adeCredentials)
    .set({
      ...reencrypted,
      verifiedAt: new Date(),
    })
    .where(
      and(
        eq(adeCredentials.businessId, businessId),
        // Guard sul metodo: se nel frattempo la riga è passata a CIE, la
        // password Fisconline appena cambiata non deve sovrascriverla.
        eq(adeCredentials.loginMethod, "fisconline"),
        // Stesso optimistic lock di `finalizeAdeVerification`: `date_trunc`
        // perché PostgreSQL scrive `updatedAt` con precisione microsecondo
        // mentre `Date` è millisecondo; snapshot serializzato come ISO string
        // + cast esplicito perché dentro un template `sql` Drizzle non ha il
        // tipo colonna per bindare un Date (postgres-js crasherebbe su
        // `Buffer.byteLength(<Date>)`).
        sql`date_trunc('milliseconds', ${adeCredentials.updatedAt}) = ${credentialVersion.toISOString()}::timestamptz`,
      ),
    )
    .returning({ id: adeCredentials.id });

  if (updated.length === 0) {
    // La password sul portale AdE è GIÀ cambiata: il messaggio deve spingere
    // alla ri-verifica delle credenziali, non a ritentare il cambio.
    logger.warn(
      { businessId },
      "changeAdePassword: credenziali modificate durante il cambio password",
    );
    return {
      error:
        "Le credenziali sono state modificate nel frattempo. Verifica la connessione dalle impostazioni.",
    };
  }

  revalidatePath("/dashboard", "layout");
  logger.info({ businessId }, "Password Fisconline aggiornata con successo");
  return { businessId };
}
