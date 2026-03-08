import { Resend } from "resend";
import type { ReactElement } from "react";

const DEFAULT_FROM = "ScontrinoZero <noreply@scontrinozero.it>";

export type SendEmailOptions = {
  to: string;
  subject: string;
  react: ReactElement;
};

export async function sendEmail(options: SendEmailOptions): Promise<void> {
  const resend = new Resend(process.env.RESEND_API_KEY);
  const from = process.env.FROM_EMAIL ?? DEFAULT_FROM;
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
