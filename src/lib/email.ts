import { Resend } from "resend";
import type { ReactElement } from "react";

export type SendEmailOptions = {
  to: string;
  subject: string;
  react: ReactElement;
};

export async function sendEmail(options: SendEmailOptions): Promise<void> {
  const from = process.env.FROM_EMAIL;
  if (!from) {
    throw new Error(
      "FROM_EMAIL environment variable is required. " +
        "Set it to a sender address on a domain verified with Resend, " +
        "e.g. YourApp <noreply@mail.yourdomain.com>",
    );
  }
  const resend = new Resend(process.env.RESEND_API_KEY);
  const { error } = await resend.emails.send({
    from,
    to: options.to,
    subject: options.subject,
    react: options.react,
  });

  if (error) {
    throw new Error(error.message);
  }
}
