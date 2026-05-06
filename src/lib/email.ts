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

export async function sendEmail(options: SendEmailOptions): Promise<void> {
  const from = process.env.FROM_EMAIL;
  if (!from) {
    throw new Error(
      "FROM_EMAIL environment variable is required. " +
        "Set it to a sender address on a domain verified with Resend, " +
        "e.g. YourApp <noreply@mail.yourdomain.com>",
    );
  }
  const { error } = await getResendClient().emails.send({
    from,
    to: options.to,
    subject: options.subject,
    react: options.react,
  });

  if (error) {
    throw new Error(error.message);
  }
}
