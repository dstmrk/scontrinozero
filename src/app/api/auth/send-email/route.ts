import { createElement } from "react";
import { ConfirmSignupEmail } from "@/emails/confirm-signup";
import { sendEmail } from "@/lib/email";
import { buildConfirmationRedirectTo } from "@/lib/confirmation-redirect";
import { resolveAppHostname } from "@/lib/hostname-env";
import { logger } from "@/lib/logger";
import { readTextWithLimit } from "@/lib/request-utils";
import { verifyStandardWebhook } from "@/lib/standard-webhook";
import { isValidEmail } from "@/lib/validation";

/**
 * **Send Email Hook** di Supabase Auth: GoTrue chiama questo endpoint invece di
 * spedire lui la mail via SMTP, e noi la mandiamo dal nostro path Resend.
 *
 * Perché esiste. GoTrue compone il messaggio con `SetBody("text/html", …)` e
 * basta: nessuna `multipart/alternative`, nessuna parte `text/plain`. Un
 * messaggio solo-HTML è un input negativo nei filtri antispam — è la forma di
 * un template di phishing, non quella di una mail scritta da un mittente
 * legittimo — ed era l'unica mail dell'app a partire così: tutte le altre
 * escono da `sendEmail()`, cioè dall'API Resend, che la parte testuale la
 * genera da sé quando non gliela passi. Qui la conferma rientra nella stessa
 * fila di tutte le altre, con lo stesso mittente, lo stesso template React e
 * lo stesso Reply-To.
 *
 * L'attivazione è nel dashboard Supabase (Authentication → Hooks → Send Email),
 * per progetto: finché l'hook è spento GoTrue continua a usare l'SMTP e questo
 * endpoint non riceve nulla.
 */

/** Il payload è utente + token: qualche KB. 64 KB è già larghissimo. */
const HOOK_MAX_BYTES = 64 * 1024;

/**
 * Gli unici tipi che GoTrue può mandare qui oggi sono `signup` e il suo
 * re-invio. Il reset password NON passa da qui: `resetPassword` genera il link
 * con `admin.generateLink`, che non spedisce nulla, e lo manda già via Resend.
 */
const HANDLED_ACTION_TYPE = "signup";

type EmailHookPayload = {
  user?: { email?: unknown };
  email_data?: {
    token_hash?: unknown;
    email_action_type?: unknown;
    redirect_to?: unknown;
  };
};

export async function POST(req: Request): Promise<Response> {
  // Body grezzo prima di qualsiasi parsing: la firma è calcolata sui byte
  // esatti, e un JSON ri-serializzato non li riprodurrebbe.
  const bodyResult = await readTextWithLimit(req, HOOK_MAX_BYTES);
  if (!bodyResult.ok) {
    const tooLarge = "tooLarge" in bodyResult;
    return hookError(tooLarge ? 413 : 400, "Payload non leggibile.");
  }
  const payload = bodyResult.text;

  const secret = process.env.SEND_EMAIL_HOOK_SECRET;
  if (!secret) {
    logger.error("SEND_EMAIL_HOOK_SECRET is not configured");
    return hookError(500, "Server misconfiguration.");
  }

  const verification = verifyStandardWebhook({
    payload,
    headers: req.headers,
    secret,
  });
  if (!verification.ok) {
    // `warn` e non `error`: su un endpoint pubblico una firma assente o
    // sbagliata è quasi sempre uno scanner, e non deve aprire issue Sentry
    // (regola 20). L'unica eccezione è il segreto illeggibile, che è
    // configurazione rotta e non traffico ostile.
    if (verification.reason === "invalid_secret") {
      logger.error("SEND_EMAIL_HOOK_SECRET is not valid base64");
      return hookError(500, "Server misconfiguration.");
    }
    logger.warn(
      { reason: verification.reason },
      "Send email hook: signature verification failed",
    );
    return hookError(401, "Firma non valida.");
  }

  let parsed: EmailHookPayload;
  try {
    parsed = JSON.parse(payload) as EmailHookPayload;
  } catch {
    logger.error("Send email hook: payload is not valid JSON");
    return hookError(400, "Payload non valido.");
  }

  const email = parsed.user?.email;
  const tokenHash = parsed.email_data?.token_hash;
  const actionType = parsed.email_data?.email_action_type;

  if (
    typeof email !== "string" ||
    !isValidEmail(email) ||
    typeof tokenHash !== "string" ||
    !tokenHash
  ) {
    logger.error(
      { hasEmail: typeof email === "string", hasTokenHash: !!tokenHash },
      "Send email hook: payload missing email or token_hash",
    );
    return hookError(400, "Payload non valido.");
  }

  if (actionType !== HANDLED_ACTION_TYPE) {
    // Fail loud: un tipo che non sappiamo rendere sarebbe una mail che
    // l'utente non riceve mai, e un 200 la seppellirebbe. Il 500 la fa
    // risalire a chi ha acceso il flusso che la produce.
    logger.error(
      { actionType: String(actionType) },
      "Send email hook: unhandled email_action_type",
    );
    return hookError(500, "Tipo di email non gestito.");
  }

  const confirmLink = buildConfirmLink(
    tokenHash,
    parsed.email_data?.redirect_to,
  );
  if (!confirmLink) {
    logger.error(
      "Send email hook: NEXT_PUBLIC_SUPABASE_URL is missing or malformed",
    );
    return hookError(500, "Server misconfiguration.");
  }

  try {
    await sendEmail({
      to: email,
      subject: "Conferma il tuo account — ScontrinoZero",
      react: createElement(ConfirmSignupEmail, { confirmLink }),
    });
  } catch (err) {
    logger.error({ err }, "Send email hook: Resend send failed");
    return hookError(500, "Invio email fallito.");
  }

  return Response.json({});
}

/**
 * Il link di conferma è quello che GoTrue avrebbe messo nel suo template:
 * `<supabase>/auth/v1/verify?token=<token_hash>&type=signup&redirect_to=<…>`.
 *
 * `redirect_to` arriva dal payload, cioè dall'`emailRedirectTo` che passiamo in
 * `signUp`, ma non lo diamo per buono: se GoTrue non lo trova nella allow-list
 * del progetto ricade sul Site URL, che può essere un altro host. Fuori dal
 * nostro dominio app lo sostituiamo col valore canonico invece di rifiutare
 * l'invio — una conferma che atterra sul posto giusto vale più di una mail mai
 * partita — e lo logghiamo come errore, perché è configurazione da sistemare.
 */
function buildConfirmLink(
  tokenHash: string,
  redirectTo: unknown,
): string | null {
  let supabaseOrigin: string;
  try {
    supabaseOrigin = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").origin;
  } catch {
    return null;
  }

  const appHostname = resolveAppHostname();
  let validated = buildConfirmationRedirectTo();
  if (typeof redirectTo === "string" && redirectTo) {
    try {
      const parsed = new URL(redirectTo);
      if (parsed.protocol === "https:" && parsed.hostname === appHostname) {
        validated = redirectTo;
      } else {
        logger.error(
          { redirectToHostname: parsed.hostname, appHostname },
          "Send email hook: redirect_to outside the app domain — falling back to canonical",
        );
      }
    } catch {
      logger.error(
        "Send email hook: redirect_to is not a valid URL — falling back to canonical",
      );
    }
  }

  const url = new URL("/auth/v1/verify", supabaseOrigin);
  url.searchParams.set("token", tokenHash);
  url.searchParams.set("type", HANDLED_ACTION_TYPE);
  url.searchParams.set("redirect_to", validated);
  return url.toString();
}

/**
 * Forma d'errore che GoTrue riconosce: legge `error.message` e la fa risalire
 * al chiamante dell'auth action invece di mostrare un 500 nudo.
 */
function hookError(httpCode: number, message: string): Response {
  return Response.json(
    { error: { http_code: httpCode, message } },
    { status: httpCode },
  );
}
