"use server";

import { createElement } from "react";
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { sql } from "drizzle-orm";
import { getDb } from "@/db";
import { profiles } from "@/db/schema";
import {
  isValidEmail,
  isStrongPassword,
  isSafeRelativeRedirect,
  normalizeEmail,
} from "@/lib/validation";
import { getClientIp, hashIp } from "@/lib/get-client-ip";
import { RateLimiter, RATE_LIMIT_WINDOWS } from "@/lib/rate-limit";
import { logger } from "@/lib/logger";
import { sendEmail } from "@/lib/email";
import { PasswordResetEmail } from "@/emails/password-reset";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { ERROR_MESSAGES } from "@/lib/error-messages";
import { getFormString, getFormStringRaw } from "@/lib/form-utils";
import { isUniqueConstraintViolation } from "@/lib/db-errors";
import { normalizeSignupSource } from "@/lib/signup-source";
import {
  generateReferralCode,
  normalizeReferralCode,
  REFERRAL_BONUS_DAYS,
} from "@/lib/referral-code";
import { referralRedemptions } from "@/db/schema/referral-redemptions";
import { extractPartnerSlug } from "@/lib/partners/partner-host";
import { getPartnerBySlug } from "@/lib/partners/partner-context";

const CURRENT_TERMS_VERSION = "v01";

/**
 * Dove atterra l'utente dopo che Supabase ha verificato il token di recovery.
 * Flusso: link mail → `/auth/v1/verify` (Supabase) → `/callback`
 * (`exchangeCodeForSession` crea la sessione di recovery) → questa pagina, dove
 * `completePasswordReset` chiama `updateUser` SENZA richiedere la vecchia
 * password (è la sessione di recovery ad autorizzare il cambio). Senza questo
 * step finale il flusso si fermava sulla dashboard e la password non veniva
 * mai cambiata. Il `/callback` accetta solo redirect relativi (no open
 * redirect), quindi passiamo un path, non un URL assoluto.
 */
const PASSWORD_RESET_LANDING_PATH = "/reset-password/update";

const authLimiter = new RateLimiter({
  maxRequests: 5,
  windowMs: RATE_LIMIT_WINDOWS.AUTH_15_MIN,
});

/**
 * Pre-captcha rate limiter.
 *
 * `verifyCaptcha` performs a 5s-timeout HTTP call to Cloudflare Turnstile on
 * every request. Without an upfront gate, an attacker can force many outbound
 * Turnstile verifications and tie up server sockets/promises before the
 * functional auth limiter (5/15min) kicks in.
 *
 * Threshold is intentionally **more permissive** than `authLimiter` (30/15min
 * vs 5/15min): a legitimate user who retries a captcha challenge a handful of
 * times must never trip the pre-limit. The pre-limit only catches abusive
 * volumes (bots, scripted floods).
 */
const captchaPreLimiter = new RateLimiter({
  maxRequests: 30,
  windowMs: RATE_LIMIT_WINDOWS.AUTH_15_MIN,
});

export type AuthActionResult = {
  error?: string;
  email?: string;
  /**
   * true quando il login fallisce perché l'email non è ancora confermata.
   * La login page usa questo flag per mostrare il bottone "reinvia conferma"
   * invece del generico "credenziali errate". Supabase ritorna questo stato
   * SOLO con password corretta, quindi non è un leak di enumeration.
   */
  needsEmailConfirmation?: boolean;
};

async function getClientIpFromNextHeaders(): Promise<string> {
  const hdrs = await headers();
  return getClientIp(hdrs);
}

function checkRateLimit(ip: string, action: string): AuthActionResult | null {
  const key = `${action}:${ip}`;
  const result = authLimiter.check(key);
  if (!result.success) {
    // Log l'IP hashato — evita di scrivere PII nei sistemi downstream
    // (Sentry, log shipping, retention). La correlazione tra eventi dallo
    // stesso source resta possibile via hash deterministico (vedi `hashIp`).
    logger.warn(
      { ipHash: hashIp(ip), action, errorClass: "auth_rate_limit" },
      "Auth rate limit exceeded",
    );
    return { error: ERROR_MESSAGES.RATE_LIMIT_AUTH_MINUTES };
  }
  return null;
}

/**
 * Pre-captcha gate.
 *
 * Returns a rate-limit error result if the IP has exceeded the captcha
 * pre-limit. Logged with `errorClass: captcha_prelimit` so dashboards can
 * separate "Turnstile call suppressed" from "auth attempts blocked".
 */
function checkCaptchaPreLimit(
  ip: string,
  action: CaptchaAction,
): AuthActionResult | null {
  const key = `captchaPre:${action}:${ip}`;
  const result = captchaPreLimiter.check(key);
  if (!result.success) {
    logger.warn(
      { ipHash: hashIp(ip), action, errorClass: "captcha_prelimit" },
      "Captcha pre-limit exceeded — Turnstile call suppressed",
    );
    return { error: ERROR_MESSAGES.RATE_LIMIT_AUTH_MINUTES };
  }
  return null;
}

type CaptchaAction =
  "signup" | "signin" | "reset-password" | "resend-confirmation";

/**
 * Hostname accettati nella response Turnstile siteverify.
 *
 * Da quando le pagine `(marketing)/*` usano `appHref()` + plain `<a>` per i
 * link auth (vedi `src/lib/marketing-to-app-href.ts`), il widget Turnstile
 * dovrebbe caricarsi solo sul subdomain app. Manteniamo comunque marketing +
 * www come safety net: copre i deploy single-domain (app servita dal dominio
 * marketing) e protegge da regressioni se in futuro un nuovo link marketing
 * viene aggiunto come `<Link>` di Next dimenticando `appHref()`. Senza questo
 * fallback il bug `captcha_hostname_mismatch` (commit ac59efc) tornerebbe a
 * bloccare ogni login.
 */
function getAcceptedTurnstileHostnames(): ReadonlySet<string> {
  // Cloudflare Turnstile `siteverify` ritorna `data.hostname` sempre in
  // lowercase, e il confronto è `Set.has` (match esatto). Normalizziamo
  // (`.trim().toLowerCase()`) come in `getAppHostname` (partner-host.ts):
  // un env d'identità "quasi giusto" (`"App.ScontrinoZero.IT"`,
  // `"scontrinozero.it "`) non deve rompere l'auth con
  // `captcha_hostname_mismatch`. Empty-safe (regola 18): un `??` non scatta
  // su una env presente ma vuota (`""`), quindi scartiamo le stringhe vuote.
  const appHostname =
    pickHostnameEnv(
      process.env.APP_HOSTNAME, // runtime override (sandbox, self-hosted)
      process.env.NEXT_PUBLIC_APP_HOSTNAME, // baked at build time
    ) ?? "app.scontrinozero.it";
  const marketingHostname =
    pickHostnameEnv(process.env.NEXT_PUBLIC_MARKETING_HOSTNAME) ??
    "scontrinozero.it";
  return new Set([appHostname, marketingHostname, `www.${marketingHostname}`]);
}

/**
 * Prima env non-vuota dopo `.trim().toLowerCase()`, o `undefined` se nessuna
 * è valorizzata. Centralizza la normalizzazione (regola 18 present-but-empty +
 * lowercase per il match esatto con `data.hostname` di Turnstile).
 */
function pickHostnameEnv(
  ...candidates: ReadonlyArray<string | undefined>
): string | undefined {
  for (const candidate of candidates) {
    const normalised = candidate?.trim().toLowerCase();
    if (normalised) return normalised;
  }
  return undefined;
}

/**
 * Estende l'allowlist statica ai subdomain partner attivi
 * (`<slug>-app.scontrinozero.it`). Senza questo, ogni auth sul subdomain
 * fallirebbe con `captcha_hostname_mismatch` (login/register/reset usano tutti
 * Turnstile). Il lookup DB scatta solo quando l'host non è nell'allowlist
 * statica, ed è cacheato per-richiesta (`getPartnerBySlug`).
 *
 * ⚠️ Lato Cloudflare il widget Turnstile deve a sua volta ammettere i
 * subdomain partner (vedi PARTNER.md), altrimenti `siteverify` rifiuta il
 * token prima ancora di arrivare qui.
 */
async function isAcceptedTurnstileHostname(host: string): Promise<boolean> {
  if (getAcceptedTurnstileHostnames().has(host)) return true;
  const slug = extractPartnerSlug(host);
  if (!slug) return false;
  return (await getPartnerBySlug(slug)) !== null;
}

/**
 * Bypass dev del captcha: i browser di verifica automatizzati (Playwright /
 * motori headless) non risolvono la managed challenge Turnstile, che quindi non
 * emette token e blocca ogni login su dev. Doppio gate: il flag esplicito `TURNSTILE_DISABLED` NON basta da solo.
 * `ADE_MODE === "mock"` è esclusivo di dev/sandbox (la produzione gira con
 * `ADE_MODE=real`), quindi in produzione il captcha non si può disattivare
 * nemmeno se il flag trapelasse nell'ambiente. Lettura raw (non `getAdeMode()`)
 * di proposito: un gate di sicurezza non deve mai throware e deve fallire chiuso
 * — `ADE_MODE` assente/inatteso ⇒ captcha attivo. Speculare al bypass client in
 * `turnstile-widget.tsx`.
 */
function isCaptchaDisabled(): boolean {
  return (
    process.env.TURNSTILE_DISABLED === "true" && process.env.ADE_MODE === "mock"
  );
}

async function verifyCaptcha(
  token: string | null,
  remoteIp: string | undefined,
  expectedAction: CaptchaAction,
): Promise<boolean> {
  if (isCaptchaDisabled()) return true;
  if (!token) return false;
  const secret = process.env.TURNSTILE_SECRET_KEY;
  if (!secret) {
    logger.error("TURNSTILE_SECRET_KEY not configured");
    return false;
  }
  try {
    // Forwarding `remoteip` lets Cloudflare correlate the verify call with the
    // visitor that solved the challenge (extra protection against token replay
    // from a different IP). We only send a non-empty trusted IP — see
    // CLAUDE.md §15: "CF-Connecting-IP is the only trusted source".
    const payload: Record<string, string> = { secret, response: token };
    if (remoteIp && remoteIp !== "unknown") {
      payload.remoteip = remoteIp;
    }

    const response = await fetch(
      "https://challenges.cloudflare.com/turnstile/v0/siteverify",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(5000),
      },
    );
    if (!response.ok) return false;
    const data = (await response.json()) as {
      success: boolean;
      hostname: string;
      action?: string;
      "error-codes"?: string[];
    };
    if (!data.success) {
      // `error-codes` distingue `invalid-input-response`, `timeout-or-duplicate`,
      // `internal-error`, ecc. — segnale necessario per diagnosi captcha in prod.
      logger.warn(
        {
          errorCodes: data["error-codes"] ?? [],
          errorClass: "captcha_verification_failed",
        },
        "Turnstile siteverify rejected token",
      );
      return false;
    }
    if (!(await isAcceptedTurnstileHostname(data.hostname))) {
      logger.warn(
        {
          captchaHostname: data.hostname,
          acceptedHostnames: [...getAcceptedTurnstileHostnames()],
          errorClass: "captcha_hostname_mismatch",
        },
        "Turnstile hostname mismatch",
      );
      return false;
    }
    // Action isolation: il token deve essere stato emesso esattamente per il
    // flow corrente. Senza questo check, un token catturato su signup può
    // essere riusato su signin/reset-password entro la finestra di validità.
    if (data.action !== expectedAction) {
      logger.warn(
        {
          captchaAction: data.action ?? null,
          expectedAction,
          errorClass: "captcha_action_mismatch",
        },
        "Turnstile action mismatch",
      );
      return false;
    }
    return true;
  } catch (err) {
    logger.error({ err }, "Turnstile verification request failed");
    return false;
  }
}

function validateSignUpInput(
  email: string,
  password: string,
  confirmPassword: string,
  termsAccepted: FormDataEntryValue | null,
  specificClausesAccepted: FormDataEntryValue | null,
): string | null {
  if (!email || !isValidEmail(email)) return "Email non valida.";
  if (!password || !isStrongPassword(password))
    return ERROR_MESSAGES.PASSWORD_NOT_STRONG;
  if (password !== confirmPassword) return ERROR_MESSAGES.PASSWORDS_MISMATCH;
  if (termsAccepted !== "true")
    return "Devi accettare i Termini di servizio e la Privacy Policy.";
  if (specificClausesAccepted !== "true")
    return "Devi accettare specificamente le clausole indicate.";
  return null;
}

/**
 * Compensating delete: remove an orphan Supabase auth user (e.g. when the
 * profile INSERT fails after `auth.signUp` already succeeded). Always invoked
 * on any insertProfileOrRollback failure — including UNIQUE constraint races,
 * where one of two concurrent signups loses the profile insert and would
 * otherwise leave a zombie auth user without a profile (CLAUDE.md regola #17).
 *
 * 3 retry with exponential backoff (500ms / 1s / 2s). On exhaustion logs
 * `critical: true` — manual cleanup via Supabase dashboard required.
 */
async function compensatingDeleteAuthUser(authUserId: string): Promise<void> {
  const adminClient = createAdminSupabaseClient();
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const { error } = await adminClient.auth.admin.deleteUser(authUserId);
      if (!error) return;
      if (attempt === 3) {
        logger.error(
          { err: error, authUserId, critical: true },
          "Compensating delete failed after 3 retries — manual cleanup required (auth.users)",
        );
        return;
      }
    } catch (deleteErr) {
      if (attempt === 3) {
        logger.error(
          { err: deleteErr, authUserId, critical: true },
          "Compensating delete threw after 3 retries — manual cleanup required (auth.users)",
        );
        return;
      }
    }
    await new Promise((resolve) => setTimeout(resolve, attempt * 500));
  }
}

async function insertProfileOrRollback(
  authUserId: string,
  email: string,
  signupSource: string | null,
  referrer: { id: string; referralCode: string } | null,
): Promise<AuthActionResult | null> {
  try {
    const db = getDb();
    const referralCode = generateReferralCode(authUserId);
    // Profilo + eventuale redemption in UNA transazione: se l'insert della
    // redemption fallisce (referrer sparito tra lookup e insert, hiccup DB)
    // il rollback rimuove anche il profilo, così il catch sotto cancella
    // l'auth user senza lasciare un profilo orfano che punta a un auth user
    // inesistente.
    await db.transaction(async (tx) => {
      const [profile] = await tx
        .insert(profiles)
        .values({
          authUserId,
          email,
          termsAcceptedAt: new Date(),
          termsVersion: CURRENT_TERMS_VERSION,
          signupSource,
          referralCode,
          referredByReferralCode: referrer?.referralCode ?? null,
          referralBonusDays: referrer ? REFERRAL_BONUS_DAYS : 0,
        })
        .returning({ id: profiles.id });

      if (referrer) {
        await tx.insert(referralRedemptions).values({
          referrerId: referrer.id,
          refereeId: profile.id,
          referralCode: referrer.referralCode,
        });
      }
    });
    return null;
  } catch (err) {
    // Any insert failure means the auth user just created has no matching
    // profile and must be removed to avoid orphans (CLAUDE.md regola #17).
    // This covers both the UNIQUE-constraint race (two concurrent signups for
    // the same email) and transient DB errors.
    await compensatingDeleteAuthUser(authUserId);

    if (isUniqueConstraintViolation(err)) {
      // Anti-enumeration: redirect like resetPassword, no distinct error.
      redirect("/verify-email");
    }
    logger.error({ err }, "Failed to record terms acceptance; blocking signup");
    return { error: "Registrazione fallita. Riprova." };
  }
}

type ReferrerRow = { id: string; referralCode: string };

/**
 * Codice referral del partner se la richiesta arriva da un subdomain partner
 * attivo (`<slug>-app.scontrinozero.it`), altrimenti `null` (dominio standard
 * o slug non mappato a un partner attivo).
 */
async function resolvePartnerReferralCode(): Promise<string | null> {
  let host: string | null;
  try {
    host = (await headers()).get("host");
  } catch {
    return null;
  }
  const slug = extractPartnerSlug(host);
  if (!slug) return null;
  const partner = await getPartnerBySlug(slug);
  return partner?.referralCode ?? null;
}

/**
 * Force + lock dell'attribuzione sui subdomain partner: la registrazione è
 * valida solo col codice referral del partner. Il campo è bloccato lato client
 * (vedi register-form.tsx); questo guard server-side copre tampering /
 * direct-POST. Ritorna un errore utente se il codice inviato non coincide,
 * `null` se non siamo su un subdomain partner o se il codice combacia.
 *
 * `warn`, non `error`: è una condizione prevedibile dall'input utente, non un
 * bug nostro (regola 20).
 */
async function enforcePartnerReferral(
  rawReferralCode: string,
  ip: string,
): Promise<AuthActionResult | null> {
  const partnerCode = await resolvePartnerReferralCode();
  if (!partnerCode) return null;
  if (normalizeReferralCode(rawReferralCode) === partnerCode) return null;
  logger.warn(
    { ipHash: hashIp(ip), errorClass: "partner_referral_mismatch" },
    "Registration on partner subdomain with missing/mismatched referral code",
  );
  return {
    error:
      "Su questo indirizzo la registrazione è riservata agli utenti del partner. Usa il link che ti ha fornito.",
  };
}

/**
 * Risolve il codice referral grezzo dal form in un referrer DB row, oppure
 * in un errore utente. Estratto da `signUp` per tenerne sotto controllo la
 * complessità cognitiva (SonarCloud S3776).
 */
async function resolveReferrer(
  rawReferralCode: string,
): Promise<{ referrer: ReferrerRow | null } | { error: string }> {
  if (rawReferralCode.trim().length === 0) return { referrer: null };

  // Codice referral: a differenza di `ref` (signup source, soft) un codice
  // presente ma invalido blocca la registrazione — l'utente deve correggerlo
  // o rimuoverlo dal form per procedere. Non è un problema di enumeration
  // (il codice non è un segreto, identifica solo il referrer) quindi l'errore
  // può essere esplicito.
  const normalizedReferralCode = normalizeReferralCode(rawReferralCode);
  const invalidCodeError = {
    error: "Codice referral non valido. Correggilo o rimuovilo per continuare.",
  };
  if (!normalizedReferralCode) return invalidCodeError;

  try {
    const db = getDb();
    const [referrerRow] = await db
      .select({ id: profiles.id, referralCode: profiles.referralCode })
      .from(profiles)
      .where(sql`${profiles.referralCode} = ${normalizedReferralCode}`)
      .limit(1);
    if (!referrerRow) return invalidCodeError;
    return { referrer: referrerRow };
  } catch (err) {
    logger.error({ err }, "Referral code lookup failed");
    return { error: "Registrazione fallita. Riprova." };
  }
}

export async function signUp(formData: FormData): Promise<AuthActionResult> {
  // Centralised email normalisation — consistent across signUp / signIn /
  // magicLink / resetPassword (CLAUDE.md regola 22).
  const email = normalizeEmail(getFormString(formData, "email"));
  // CRITICAL: passwords must NOT be trimmed — trimming changes credential
  // semantics and breaks login for users registered with leading/trailing
  // whitespace. See `getFormStringRaw` doc.
  const password = getFormStringRaw(formData, "password");
  const confirmPassword = getFormStringRaw(formData, "confirmPassword");
  const termsAccepted = formData.get("termsAccepted");
  const specificClausesAccepted = formData.get("specificClausesAccepted");
  const captchaToken = getFormString(formData, "captchaToken");
  const signupSource = normalizeSignupSource(getFormString(formData, "ref"));
  const rawReferralCode = getFormString(formData, "rcode");

  const validationError = validateSignUpInput(
    email,
    password,
    confirmPassword,
    termsAccepted,
    specificClausesAccepted,
  );
  if (validationError) return { error: validationError };

  const ip = await getClientIpFromNextHeaders();
  // Pre-captcha gate: suppresses the Turnstile siteverify call when the IP
  // is already over the abuse threshold — protects the 5s-timeout outbound
  // HTTP call from being weaponised as a server load vector before the
  // functional auth limit kicks in.
  const captchaPreLimited = checkCaptchaPreLimit(ip, "signup");
  if (captchaPreLimited) return captchaPreLimited;

  const captchaOk = await verifyCaptcha(captchaToken, ip, "signup");
  if (!captchaOk) return { error: "Verifica CAPTCHA fallita. Riprova." };

  const rateLimited = checkRateLimit(ip, "signUp");
  if (rateLimited) return rateLimited;

  // Pre-check: block re-registration before hitting Supabase.
  // Supabase's behaviour for duplicate emails varies by config (anti-enumeration
  // returns null user; auto-confirm may create a new auth user with a different UUID).
  // Checking our own table by email is the only reliable guard in all cases.
  // Uses lower() for case-insensitive comparison, consistent with DB unique index.
  let emailAlreadyRegistered = false;
  try {
    const db = getDb();
    const [existingByEmail] = await db
      .select({ id: profiles.id })
      .from(profiles)
      .where(sql`lower(${profiles.email}) = ${email}`)
      .limit(1);

    emailAlreadyRegistered = Boolean(existingByEmail);
  } catch (err) {
    logger.error({ err }, "Pre-registration email check failed");
    return { error: "Registrazione fallita. Riprova." };
  }
  if (emailAlreadyRegistered) {
    // Anti-enumeration: silent redirect to /verify-email so that an attacker
    // cannot distinguish "already registered" from a normal new signup. Mirrors
    // the resetPassword flow (CLAUDE.md regola #19 spirit).
    redirect("/verify-email");
  }

  // Subdomain partner: la registrazione è vincolata al codice del partner.
  const partnerReferralError = await enforcePartnerReferral(
    rawReferralCode,
    ip,
  );
  if (partnerReferralError) return partnerReferralError;

  const referralResult = await resolveReferrer(rawReferralCode);
  if ("error" in referralResult) return { error: referralResult.error };
  const { referrer } = referralResult;

  const supabase = await createServerSupabaseClient();
  const hostname =
    process.env.APP_HOSTNAME ??
    process.env.NEXT_PUBLIC_APP_HOSTNAME ??
    "app.scontrinozero.it";
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: { emailRedirectTo: `https://${hostname}/dashboard` },
  });

  if (error) {
    logger.error({ error: error.message }, "signUp failed");
    return { error: "Registrazione fallita. Riprova." };
  }

  // Create profile in our DB (mandatory: records terms acceptance for compliance)
  if (data.user) {
    const profileError = await insertProfileOrRollback(
      data.user.id,
      email,
      signupSource,
      referrer,
    );
    if (profileError) return profileError;
  }

  redirect("/verify-email");
}

export async function signIn(formData: FormData): Promise<AuthActionResult> {
  const email = normalizeEmail(getFormString(formData, "email"));
  // Raw read: trimming would break login for users whose password has
  // significant whitespace (see `getFormStringRaw`).
  const password = getFormStringRaw(formData, "password");

  if (!email || !isValidEmail(email)) {
    return { error: "Email non valida." };
  }
  if (!password) {
    return { error: "Inserisci la password." };
  }

  const captchaToken = getFormString(formData, "captchaToken");
  const ip = await getClientIpFromNextHeaders();
  // Pre-captcha gate prima dell'HTTP call esterna a Turnstile.
  const captchaPreLimited = checkCaptchaPreLimit(ip, "signin");
  if (captchaPreLimited) return captchaPreLimited;

  // Turnstile su signIn — il rate-limit per-IP da solo non frena
  // credential-stuffing su botnet con IP rotation. Il captcha forza un costo
  // marginale per ogni tentativo.
  const captchaOk = await verifyCaptcha(captchaToken, ip, "signin");
  if (!captchaOk) return { error: "Verifica CAPTCHA fallita. Riprova." };

  const rateLimited = checkRateLimit(ip, "signIn");
  if (rateLimited) return rateLimited;

  const supabase = await createServerSupabaseClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    // Structured failure log: classify the Supabase error so dashboards can
    // separate "user typed wrong password" from "auth provider down" without
    // reading raw messages, and correlate floods via ipHash without leaking PII.
    const errorClass = classifySupabaseAuthError(error);
    logger.warn(
      {
        action: "signIn",
        ipHash: hashIp(ip),
        errorClass,
      },
      "signIn failed",
    );
    // Email non confermata: messaggio dedicato + flag, così la login page può
    // offrire il re-invio della conferma. Supabase ritorna questo stato solo
    // con password corretta → nessun leak di enumeration.
    if (errorClass === "email_not_confirmed") {
      return {
        error:
          "Conferma prima la tua email per accedere. Controlla la posta (anche lo spam).",
        email,
        needsEmailConfirmation: true,
      };
    }
    return { error: "Email o password non corretti.", email };
  }

  // Deep-link post-login: il middleware imposta `?redirect=<pathname+search>`
  // quando una route protetta viene aperta senza sessione (`proxy.ts`). Lo
  // consumiamo qui, ma SOLO se supera la stessa guardia anti-open-redirect del
  // callback OAuth/reset — altrimenti fallback a /dashboard.
  const redirectTo = getFormString(formData, "redirect");
  redirect(isSafeRelativeRedirect(redirectTo) ? redirectTo : "/dashboard");
}

/**
 * Maps a Supabase Auth error to a small, machine-readable category.
 * The category names are stable across deploys and safe to put on a dashboard;
 * the underlying error.message is not (it can change with Supabase upgrades).
 */
function classifySupabaseAuthError(err: {
  message?: string;
  status?: number;
}): string {
  const status = err.status ?? 0;
  const msg = (err.message ?? "").toLowerCase();
  if (status === 400 && msg.includes("invalid login"))
    return "invalid_credentials";
  if (status === 400 && msg.includes("email not confirmed"))
    return "email_not_confirmed";
  if (status === 422) return "validation_error";
  if (status === 429) return "auth_provider_throttled";
  if (status >= 500) return "auth_provider_5xx";
  return "other";
}

export async function signOut(): Promise<void> {
  const supabase = await createServerSupabaseClient();
  await supabase.auth.signOut();
  redirect("/login");
}

/**
 * Re-invia l'email di conferma registrazione (Supabase `resend` type=signup).
 *
 * Stessi presidi anti-abuso degli altri endpoint auth pubblici: normalizzazione
 * email, pre-captcha gate, Turnstile, rate-limit per-IP — l'invio parte da
 * Resend e senza guardie un attacker potrebbe esaurire la quota free-tier e
 * degradare la deliverability del dominio.
 *
 * Anti-enumeration: reindirizza SEMPRE a `/verify-email` (come signUp /
 * resetPassword), senza distinguere email inesistente / già confermata.
 */
export async function resendConfirmationEmail(
  formData: FormData,
): Promise<AuthActionResult> {
  const email = normalizeEmail(getFormString(formData, "email"));

  if (!email || !isValidEmail(email)) {
    return { error: "Email non valida." };
  }

  const captchaToken = getFormString(formData, "captchaToken");
  const ip = await getClientIpFromNextHeaders();
  const captchaPreLimited = checkCaptchaPreLimit(ip, "resend-confirmation");
  if (captchaPreLimited) return captchaPreLimited;

  const captchaOk = await verifyCaptcha(
    captchaToken,
    ip,
    "resend-confirmation",
  );
  if (!captchaOk) return { error: "Verifica CAPTCHA fallita. Riprova." };

  const rateLimited = checkRateLimit(ip, "resendConfirmation");
  if (rateLimited) return rateLimited;

  const hostname =
    process.env.APP_HOSTNAME ??
    process.env.NEXT_PUBLIC_APP_HOSTNAME ??
    "app.scontrinozero.it";

  const supabase = await createServerSupabaseClient();
  const { error } = await supabase.auth.resend({
    type: "signup",
    email,
    options: { emailRedirectTo: `https://${hostname}/dashboard` },
  });

  if (error) {
    // Non rivelare lo stato (inesistente / già confermata): logghiamo per
    // diagnosi e reindirizziamo come nel flusso normale.
    logger.warn(
      { errorClass: classifySupabaseAuthError(error) },
      "resendConfirmationEmail: supabase.auth.resend failed",
    );
  }

  redirect("/verify-email");
}

export async function resetPassword(
  formData: FormData,
): Promise<AuthActionResult> {
  const email = normalizeEmail(getFormString(formData, "email"));

  if (!email || !isValidEmail(email)) {
    return { error: "Email non valida." };
  }

  const captchaToken = getFormString(formData, "captchaToken");
  const ip = await getClientIpFromNextHeaders();
  // Pre-captcha gate prima dell'HTTP call esterna a Turnstile.
  const captchaPreLimited = checkCaptchaPreLimit(ip, "reset-password");
  if (captchaPreLimited) return captchaPreLimited;

  // Turnstile su resetPassword — endpoint pubblico che fa partire email
  // transazionali via Resend. Senza captcha un attacker può esaurire la quota
  // free-tier (3000/mese) e degradare la deliverability del dominio.
  const captchaOk = await verifyCaptcha(captchaToken, ip, "reset-password");
  if (!captchaOk) return { error: "Verifica CAPTCHA fallita. Riprova." };

  const rateLimited = checkRateLimit(ip, "resetPassword");
  if (rateLimited) return rateLimited;

  const appHostname =
    process.env.APP_HOSTNAME ?? // runtime override (sandbox, self-hosted)
    process.env.NEXT_PUBLIC_APP_HOSTNAME ?? // baked at build time
    "app.scontrinozero.it";

  const supabaseAdmin = createAdminSupabaseClient();
  const { data, error } = await supabaseAdmin.auth.admin.generateLink({
    type: "recovery",
    email,
    // Pin where the user lands after Supabase verifies the token. Must be in the
    // Supabase Redirect URLs allow-list (the /callback route already is — used by
    // signup/OAuth), otherwise GoTrue falls back to the Site URL. Makes the
    // redirect_to validated below deterministic, not dependent on dashboard config.
    options: {
      redirectTo: `https://${appHostname}/callback?redirect=${encodeURIComponent(
        PASSWORD_RESET_LANDING_PATH,
      )}`,
    },
  });

  if (error || !data.properties?.action_link) {
    // Causa di gran lunga più comune: email non registrata → GoTrue risponde
    // "User not found". È input utente prevedibile, non un bug nostro: warn
    // (osservabilità in pino → Sentry Logs) ma NON un'issue Sentry. Allinea
    // questo branch al flow gemello resendConfirmationEmail (CLAUDE.md regola
    // 20, SCONTRINOZERO-Q). Il logger.error resta riservato al mismatch di
    // hostname sotto, che segnala una vera misconfigurazione/anomalia.
    logger.warn(
      { errorClass: classifySupabaseAuthError(error ?? {}) },
      "Reset password generateLink failed",
    );
    // Always redirect to avoid email enumeration
    redirect("/verify-email");
  }

  // Defensive check: the link the user clicks must point to OUR Supabase issuer
  // (the /auth/v1/verify endpoint), and its embedded redirect_to must point back
  // to OUR app domain. generateLink returns an action_link on the SUPABASE project
  // host (e.g. <ref>.supabase.co), NOT on the app host — so the action_link is
  // validated against NEXT_PUBLIC_SUPABASE_URL, while redirect_to carries the app
  // host. Parse the URLs explicitly instead of using startsWith — a prefix check
  // can be bypassed via subdomain spoofing (e.g., https://<host>.evil.tld/).
  const actionLink = data.properties.action_link;
  let supabaseHostname: string | null = null;
  try {
    supabaseHostname = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "")
      .hostname;
  } catch {
    // Missing or malformed NEXT_PUBLIC_SUPABASE_URL — treat as mismatch
  }
  let parsedActionLink: URL | null = null;
  try {
    parsedActionLink = new URL(actionLink);
  } catch {
    // Malformed URL — treat as mismatch
  }
  let parsedRedirectTo: URL | null = null;
  try {
    parsedRedirectTo = new URL(
      parsedActionLink?.searchParams.get("redirect_to") ?? "",
    );
  } catch {
    // Missing or malformed redirect_to — treat as mismatch
  }
  if (
    !supabaseHostname ||
    parsedActionLink?.protocol !== "https:" ||
    parsedActionLink.hostname !== supabaseHostname ||
    parsedRedirectTo?.protocol !== "https:" ||
    parsedRedirectTo.hostname !== appHostname
  ) {
    logger.error(
      {
        actionLinkHostname: parsedActionLink?.hostname ?? null,
        supabaseHostname,
        redirectToHostname: parsedRedirectTo?.hostname ?? null,
        appHostname,
        hasToken: true,
      },
      "Reset password: action_link hostname mismatch or invalid URL — email not sent",
    );
    redirect("/verify-email");
  }

  try {
    await sendEmail({
      to: email,
      subject: "Reimposta la tua password — ScontrinoZero",
      react: createElement(PasswordResetEmail, {
        resetLink: actionLink,
      }),
    });
  } catch (err) {
    logger.warn({ err }, "Password reset email failed");
    // Messaggio neutro: identico sia che l'email esista sia che non esista,
    // l'unica differenza è l'esito dell'invio (mai un oracle di enumerazione).
    return {
      error:
        "Non siamo riusciti a inviare l'email. Riprova tra qualche minuto.",
    };
  }

  redirect("/verify-email");
}
