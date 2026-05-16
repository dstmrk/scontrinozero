import { Resend } from "resend";
import type { ReactElement } from "react";

export type SendEmailOptions = {
  to: string;
  subject: string;
  react: ReactElement;
};

// Module-level singleton: il client Resend è stateless lato app, niente
// motivo di re-istanziarlo per ogni invio (sprecava allocazioni e setup pool
// HTTP interni). Lazy init: la prima chiamata costruisce l'istanza, le
// successive la riusano. Pattern coerente con `getStripe()`.
let _resend: Resend | null = null;

function getResendClient(): Resend {
  _resend ??= new Resend(process.env.RESEND_API_KEY);
  return _resend;
}

/**
 * Resets the cached Resend singleton. For use in tests only.
 * @internal
 */
export function _resetResendForTest(): void {
  _resend = null;
}

/**
 * Hard ceiling on a single Resend HTTP call. Resend's SDK already retries
 * transient errors internally, but a degraded provider can keep a request open
 * for tens of seconds without erroring — long enough to block the calling
 * server action (signup, password reset, account deletion) and tie up workers.
 *
 * 8s is a deliberate compromise: long enough to ride out an isolated TCP
 * stall, short enough that the caller surfaces a visible error before the
 * Next.js server action timeout (~30s) and well before any browser-side
 * timeout the user would notice.
 */
const SEND_EMAIL_TIMEOUT_MS = 8_000;

/**
 * Wraps an inflight promise with a hard timeout. On timeout the returned
 * promise rejects with a tagged Error — the underlying operation may continue
 * to completion in the background (Resend SDK has no `AbortSignal` hook), but
 * the caller is unblocked.
 */
async function withTimeout<T>(
  p: Promise<T>,
  ms: number,
  label: string,
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      p,
      new Promise<never>((_, reject) => {
        timer = setTimeout(
          () => reject(new Error(`${label} timed out after ${ms}ms`)),
          ms,
        );
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export async function sendEmail(options: SendEmailOptions): Promise<void> {
  const from = process.env.FROM_EMAIL;
  if (!from) {
    throw new Error(
      "FROM_EMAIL environment variable is required. " +
        "Set it to a sender address on a domain verified with Resend, " +
        "e.g. YourApp <noreply@mail.yourdomain.com>",
    );
  }
  const { error } = await withTimeout(
    getResendClient().emails.send({
      from,
      to: options.to,
      subject: options.subject,
      react: options.react,
    }),
    SEND_EMAIL_TIMEOUT_MS,
    "sendEmail",
  );

  if (error) {
    throw new Error(error.message);
  }
}
