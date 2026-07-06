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
  getKeyVersion,
} from "@/lib/crypto";
import { createAdeClient, getAdeMode } from "@/lib/ade";
import { adeSessionCache } from "@/lib/ade/session-cache";
import {
  AdeAuthError,
  AdeError,
  AdePasswordExpiredError,
} from "@/lib/ade/errors";
import { getUserFacingAdeErrorMessage } from "@/lib/ade/error-messages";
import { logAdeFailure } from "@/lib/ade/log-failure";
import { RateLimiter, RATE_LIMIT_WINDOWS } from "@/lib/rate-limit";
import { logger } from "@/lib/logger";
import { sendEmail } from "@/lib/email";
import { WelcomeEmail } from "@/emails/welcome";
import { notifyOperatorOfNewSignup } from "@/lib/operator-notification";
import {
  getAuthenticatedUser,
  checkBusinessOwnership,
} from "@/lib/server-auth";
import {
  adePinSchema,
  BUSINESS_PROFILE_LIMITS,
  isValidItalianZipCode,
  ITALIAN_ZIP_MESSAGE,
  validateBusinessOptionalFieldLengths,
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
   * La P.IVA ha già consumato un trial in passato (registrata in
   * `trial_vat_ledger`, sopravvissuta alla cancellazione del vecchio account):
   * l'onboarding viene completato ma il trial è negato (`trialStartedAt` =
   * null → sola lettura immediata). La UI usa questo flag per spiegare il
   * motivo e spingere all'attivazione di un piano, distinguendolo dal generico
   * "trial scaduto".
   */
  trialAlreadyUsed?: boolean;
};

const changePasswordLimiter = new RateLimiter({
  maxRequests: 5,
  windowMs: RATE_LIMIT_WINDOWS.AUTH_15_MIN,
});

// Stesso profilo di costo di changeAdePassword (login AdE completo +
// getFiscalData). Senza questo gate un utente autenticato — già filtrato
// dall'ownership check — può martellare il login AdE ripetendo
// verifyAdeCredentials, rischiando un lockout/IP-block lato AdE sull'egress
// condiviso che impatterebbe TUTTI gli utenti (REVIEW.md #36). 5/15 min in
// simmetria con changePasswordLimiter.
const verifyAdeLimiter = new RateLimiter({
  maxRequests: 5,
  windowMs: RATE_LIMIT_WINDOWS.AUTH_15_MIN,
});

export type OnboardingStatus = {
  hasProfile: boolean;
  hasBusiness: boolean;
  hasCredentials: boolean;
  credentialsVerified: boolean;
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
  const optionalError = validateBusinessOptionalFieldLengths(input);
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
  const user = await getAuthenticatedUser();

  const firstName = getFormString(formData, "firstName");
  const lastName = getFormString(formData, "lastName");
  const businessName = getFormStringOrNull(formData, "businessName");
  const address = getFormString(formData, "address");
  const streetNumber = getFormStringOrNull(formData, "streetNumber");
  const zipCode = getFormString(formData, "zipCode");
  const city = getFormStringOrNull(formData, "city");
  const province = getFormStringOrNull(formData, "province");

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

export async function saveAdeCredentials(
  formData: FormData,
): Promise<OnboardingActionResult> {
  const user = await getAuthenticatedUser();

  const businessId = getFormString(formData, "businessId");
  const codiceFiscale = getFormString(formData, "codiceFiscale");
  // La password Fisconline è una credenziale opaca (regole AdE: 8–15 char,
  // charset misto). Non trimmare: ogni byte ha significato semantico —
  // lo stesso principio della password app.
  const password = getFormStringRaw(formData, "password");
  // PIN già validato a regex `^\d{10}$`: trimming è sicuro perché
  // qualsiasi whitespace verrebbe comunque rifiutato dallo schema.
  const pin = getFormString(formData, "pin");

  if (!businessId) {
    return { error: "Business ID mancante." };
  }
  if (codiceFiscale.length !== 16) {
    return { error: "Codice fiscale non valido (16 caratteri)." };
  }
  if (!password) {
    return { error: "Password Fisconline obbligatoria." };
  }
  const pinResult = adePinSchema.safeParse(pin);
  if (!pinResult.success) {
    return {
      error: pinResult.error.issues[0]?.message ?? "PIN Fisconline non valido.",
    };
  }

  const ownershipError = await checkBusinessOwnership(user.id, businessId);
  if (ownershipError) return ownershipError;

  const key = getEncryptionKey();
  const keyVersion = getKeyVersion();

  const encryptedCodiceFiscale = encrypt(codiceFiscale, key, keyVersion);
  const encryptedPassword = encrypt(password, key, keyVersion);
  const encryptedPin = encrypt(pin, key, keyVersion);

  const db = getDb();

  // Atomic upsert per evitare race condition (doppio submit del form, retry
  // di rete) — il vincolo UNIQUE su business_id garantisce 1:1.
  // verifiedAt: null al re-insert E al conflict update — credenziali nuove
  // non sono ancora state verificate contro AdE.
  await db
    .insert(adeCredentials)
    .values({
      businessId,
      encryptedCodiceFiscale,
      encryptedPassword,
      encryptedPin,
      keyVersion,
    })
    .onConflictDoUpdate({
      target: adeCredentials.businessId,
      set: {
        encryptedCodiceFiscale,
        encryptedPassword,
        encryptedPin,
        keyVersion,
        verifiedAt: null,
      },
    });

  logger.info({ businessId }, "ADE credentials updated");

  // Invalida la sessione AdE cached (REVIEW #5): le credenziali sono cambiate,
  // la prossima emissione/annullo deve rieffettuare il login con le nuove.
  await adeSessionCache.invalidate(businessId);

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
 * passa sempre.
 */
function checkAdeIdentityGuard(
  wasAlreadyOnboarded: boolean,
  businessId: string,
  snapshot: { fiscalCode: string | null; vatNumber: string | null } | undefined,
  fiscalData: {
    identificativiFiscali: { partitaIva: string; codiceFiscale: string };
  } | null,
): OnboardingActionResult | null {
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
      error:
        "Non è stato possibile confermare la connessione con l'Agenzia delle Entrate. Riprova tra qualche istante.",
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
    { businessId, errorClass: "ade_piva_mismatch" },
    "verifyAdeCredentials: credenziali associate a una P.IVA diversa da quella registrata",
  );
  return {
    error:
      "Queste credenziali Fisconline appartengono a una partita IVA diversa da quella registrata sul tuo account. Per gestire un'altra partita IVA è necessario un account separato.",
    pivaMismatch: true,
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

    await tx
      .update(businesses)
      .set({ vatNumber, fiscalCode })
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

/**
 * Esegue il login AdE per la verifica credenziali e traduce gli errori in un
 * OnboardingActionResult pronto da restituire al client. Ritorna `null` quando
 * il login ha successo. Estratto da verifyAdeCredentials per tenerne sotto
 * controllo la Cognitive Complexity (SonarCloud).
 */
async function attemptAdeLoginForVerification(
  adeClient: ReturnType<typeof createAdeClient>,
  credentials: { codiceFiscale: string; password: string; pin: string },
  businessId: string,
): Promise<OnboardingActionResult | null> {
  try {
    await adeClient.login(credentials);
    return null;
  } catch (err) {
    if (err instanceof AdePasswordExpiredError) {
      logger.warn({ businessId }, "AdE password scaduta durante verifica");
      return {
        error: "La password Fisconline è scaduta.",
        passwordExpired: true,
      };
    }
    logAdeFailure(
      err,
      { businessId, flow: "onboarding-verify" },
      {
        transient: "AdE credential verification: transient failure",
        failure: "AdE credential verification failed",
      },
    );
    const userFacing = getUserFacingAdeErrorMessage(
      err,
      "Verifica fallita. Controlla le credenziali Fisconline.",
    );
    return {
      error: userFacing.message,
      ...(userFacing.passwordExpired ? { passwordExpired: true } : {}),
    };
  }
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

export async function verifyAdeCredentials(
  businessId: string,
): Promise<OnboardingActionResult> {
  const user = await getAuthenticatedUser();

  const ownershipError = await checkBusinessOwnership(user.id, businessId);
  if (ownershipError) return ownershipError;

  // Rate limit DOPO l'ownership gate, PRIMA del decrypt/login AdE: degradare
  // con un messaggio standard (regola 19), warn senza Sentry (input prevedibile,
  // regola 20). Simmetria con changeAdePassword (REVIEW.md #36).
  const rateLimitResult = verifyAdeLimiter.check(`verify-ade:${user.id}`);
  if (!rateLimitResult.success) {
    logger.warn(
      { userId: user.id },
      "verifyAdeCredentials rate limit exceeded",
    );
    return { error: ERROR_MESSAGES.RATE_LIMIT_AUTH_MINUTES };
  }

  const db = getDb();

  const [cred] = await db
    .select()
    .from(adeCredentials)
    .where(eq(adeCredentials.businessId, businessId))
    .limit(1);

  if (!cred) {
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
  const [businessSnapshot] = await db
    .select({
      fiscalCode: businesses.fiscalCode,
      vatNumber: businesses.vatNumber,
    })
    .from(businesses)
    .where(eq(businesses.id, businessId))
    .limit(1);
  const wasAlreadyOnboarded = Boolean(businessSnapshot?.fiscalCode);

  // Snapshot updatedAt to detect concurrent credential updates (optimistic locking).
  // If the user saves new credentials while AdE login is in progress, the WHERE
  // below will match 0 rows, preventing verifiedAt from being set on stale data.
  const credentialVersion = cred.updatedAt;

  const key = getEncryptionKey();
  const keys = new Map<number, Buffer>([[cred.keyVersion, key]]);

  const codiceFiscale = decrypt(cred.encryptedCodiceFiscale, keys);
  const password = decrypt(cred.encryptedPassword, keys);
  const pin = decrypt(cred.encryptedPin, keys);

  const adeClient = createAdeClient(getAdeMode());

  const loginError = await attemptAdeLoginForVerification(
    adeClient,
    { codiceFiscale, password, pin },
    businessId,
  );
  if (loginError) return loginError;

  // Fetch fiscal data from AdE while the session is still active. Best-effort:
  // verification still succeeds (verifiedAt set) even if AdE doesn't return it;
  // P.IVA/CF are then filled on a later run.
  let fiscalData: Awaited<ReturnType<typeof adeClient.getFiscalData>> | null =
    null;
  try {
    fiscalData = await adeClient.getFiscalData();
  } catch (err) {
    logger.error({ err, businessId }, "Failed to fetch fiscal data from AdE");
  } finally {
    await adeClient
      .logout()
      .catch((err) => logger.warn({ err }, "AdE logout failed"));
  }

  // Identity guard: blocca il cambio credenziali verso una P.IVA diversa su un
  // business già onboardato (logica in checkAdeIdentityGuard). Eseguito PRIMA
  // della transazione, così verifiedAt resta null e l'identità non viene
  // toccata. Il primo onboarding (wasAlreadyOnboarded false) passa sempre.
  const identityError = checkAdeIdentityGuard(
    wasAlreadyOnboarded,
    businessId,
    businessSnapshot,
    fiscalData,
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
        error: "Questa P.IVA è già associata a un altro account.",
        pivaConflict: true,
      };
    }
    logger.error(
      { err, businessId, critical: true },
      "verifyAdeCredentials: finalizzazione DB fallita dopo verifica AdE",
    );
    return {
      error:
        "Verifica riuscita ma il salvataggio è fallito. Riprova tra qualche istante.",
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
    return { businessId };
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
    businessId,
    ...(trialAlreadyUsed ? { trialAlreadyUsed: true } : {}),
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
      };
    }

    if (!row.businessId) {
      return {
        hasProfile: true,
        hasBusiness: false,
        hasCredentials: false,
        credentialsVerified: false,
      };
    }

    return {
      hasProfile: true,
      hasBusiness: true,
      businessId: row.businessId,
      hasCredentials: row.hasCredentials,
      credentialsVerified: row.credentialsVerified,
    };
  },
);

/**
 * Legge il flag "tour onboarding visto" per l'utente corrente (PLAN.md v1.4.1).
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
 * Marca il tour onboarding come visto/skippato per l'utente corrente (PLAN.md
 * v1.4.1). Chiamata dal componente client quando il walkthrough termina
 * (FINISHED) o viene skippato (SKIPPED).
 *
 * `WHERE onboarding_tour_seen_at IS NULL`: idempotente e race-safe — il primo
 * write vince e i successivi sono no-op (nessun overwrite del timestamp
 * originale). Degrada con `{ error }` su fallimento DB (regola 19), `logger.warn`
 * — non un bug nostro né da Sentry (regola 20): la persistenza del tour è
 * cosmetica, il client l'ha già nascosto in modo optimistic.
 */
export async function markOnboardingTourSeen(): Promise<{ error?: string }> {
  const user = await getAuthenticatedUser();
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

export async function changeAdePassword(
  businessId: string,
  currentPassword: string,
  newPassword: string,
  confirmNewPassword: string,
): Promise<OnboardingActionResult> {
  const user = await getAuthenticatedUser();

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

  const key = getEncryptionKey();
  const keys = new Map<number, Buffer>([[cred.keyVersion, key]]);
  const codiceFiscale = decrypt(cred.encryptedCodiceFiscale, keys);

  const adeClient = createAdeClient(getAdeMode());

  try {
    await adeClient.changePasswordFisconline({
      codiceFiscale,
      oldPassword: currentPassword,
      newPassword,
      confirmNewPassword,
    });
  } catch (err) {
    if (err instanceof AdeAuthError) {
      logger.warn({ businessId }, "changeAdePassword: password attuale errata");
      return { error: "Password attuale non corretta." };
    }
    if (err instanceof AdeError && err.code === "ADE_CHANGE_PW_SAME") {
      return {
        error: "La nuova password deve essere diversa da quella attuale.",
      };
    }
    logAdeFailure(
      err,
      { businessId },
      {
        transient: "changeAdePassword: AdE transient failure",
        failure: "Cambio password AdE fallito",
      },
    );
    const userFacing = getUserFacingAdeErrorMessage(
      err,
      "Errore durante il cambio password. Riprova più tardi.",
    );
    return { error: userFacing.message };
  }

  const newEncryptedPassword = encrypt(newPassword, key, cred.keyVersion);
  await db
    .update(adeCredentials)
    .set({ encryptedPassword: newEncryptedPassword, verifiedAt: new Date() })
    .where(eq(adeCredentials.businessId, businessId));

  revalidatePath("/dashboard", "layout");
  logger.info({ businessId }, "Password Fisconline aggiornata con successo");
  return { businessId };
}
