"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod/v4";
import type { TurnstileInstance } from "@marsidev/react-turnstile";
import { acceptCollaboratorInvite } from "@/server/auth-actions";
import { passwordFieldSchema } from "@/lib/validation";
import { track, UMAMI_EVENTS } from "@/lib/umami";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { TurnstileWidget } from "@/components/turnstile-widget";
import {
  LegalLink,
  PASSWORD_REQUIREMENTS_HINT,
  SPECIFIC_CLAUSES_TEXT,
} from "@/components/auth/signup-consents";
import {
  Form,
  FormCheckboxField,
  FormInputField,
  FormPasswordField,
} from "@/components/ui/form";

const acceptSchema = z
  .object({
    name: z
      .string()
      .trim()
      .min(1, "Inserisci nome e cognome.")
      .max(100, "Il nome può avere al massimo 100 caratteri."),
    password: passwordFieldSchema,
    confirmPassword: z.string().min(1, "Conferma la password."),
    termsAccepted: z
      .boolean()
      .refine(
        (v) => v,
        "Devi accettare i Termini, le Condizioni per i collaboratori e la Privacy Policy.",
      ),
    specificClausesAccepted: z
      .boolean()
      .refine((v) => v, "Devi accettare specificamente le clausole indicate."),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "Le password non coincidono.",
    path: ["confirmPassword"],
  });

type AcceptData = z.infer<typeof acceptSchema>;

/**
 * Il collaboratore crea il suo accesso dal link dell'invito (issue #1099).
 * L'email è quella dell'invito e non si cambia: il link l'ha già provata.
 */
export function AcceptInviteForm({
  token,
  email,
  businessName,
}: Readonly<{
  token: string;
  email: string;
  businessName: string | null;
}>) {
  const router = useRouter();
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const turnstileRef = useRef<TurnstileInstance | null>(null);

  const form = useForm<AcceptData>({
    resolver: zodResolver(acceptSchema),
    defaultValues: {
      name: "",
      password: "",
      confirmPassword: "",
      termsAccepted: false,
      specificClausesAccepted: false,
    },
  });

  function handleSubmit(data: AcceptData) {
    const formData = new FormData();
    formData.set("token", token);
    formData.set("name", data.name);
    formData.set("password", data.password);
    formData.set("confirmPassword", data.confirmPassword);
    formData.set("termsAccepted", "true");
    formData.set("specificClausesAccepted", "true");
    if (captchaToken) formData.set("captchaToken", captchaToken);

    startTransition(async () => {
      const result = await acceptCollaboratorInvite(formData);
      if (result?.error) {
        form.setError("root", { message: result.error });
        setCaptchaToken(null); // token single-use, force re-solve
        turnstileRef.current?.reset(); // ri-emette il token: riabilita il submit
        return;
      }
      // Evento proprio: un invito accettato non è un'iscrizione e non entra
      // nel funnel di /register (issue #999).
      track(UMAMI_EVENTS.collaboratorInviteAccepted);
      router.replace("/dashboard");
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-center text-xl">
          Crea il tuo accesso
        </CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-muted-foreground mb-4 text-sm">
          <span className="text-foreground font-medium">
            {businessName ?? "Un'attività"}
          </span>{" "}
          ti ha invitato a emettere scontrini per suo conto. Entrerai con
          l&apos;email <span className="text-foreground">{email}</span>.
        </p>
        <Form {...form}>
          <form
            onSubmit={(e) => form.handleSubmit(handleSubmit)(e)}
            noValidate
            className="space-y-4"
          >
            <FormInputField
              control={form.control}
              name="name"
              label="Nome e cognome"
              autoComplete="name"
              placeholder="Anna Bianchi"
            />

            <FormPasswordField
              control={form.control}
              name="password"
              label="Password"
              autoComplete="new-password"
              description={PASSWORD_REQUIREMENTS_HINT}
            />

            <FormPasswordField
              control={form.control}
              name="confirmPassword"
              label="Conferma password"
              autoComplete="new-password"
            />

            <FormCheckboxField control={form.control} name="termsAccepted">
              Ho letto e accetto i{" "}
              <LegalLink href="/termini">Termini di servizio</LegalLink> e le{" "}
              <LegalLink href="/condizioni-collaboratori">
                Condizioni per i collaboratori
              </LegalLink>
              , e ho letto la{" "}
              <LegalLink href="/privacy">Privacy Policy</LegalLink>.
            </FormCheckboxField>

            <FormCheckboxField
              control={form.control}
              name="specificClausesAccepted"
            >
              {SPECIFIC_CLAUSES_TEXT}
            </FormCheckboxField>

            <TurnstileWidget
              ref={turnstileRef}
              onToken={setCaptchaToken}
              action="accept-invite"
            />

            {form.formState.errors.root && (
              <p className="text-destructive text-sm" role="alert">
                {form.formState.errors.root.message}
              </p>
            )}

            <Button
              type="submit"
              className="w-full"
              disabled={isPending || captchaToken === null}
            >
              {isPending ? "Creazione dell'accesso…" : "Crea il tuo accesso"}
            </Button>
          </form>
        </Form>
      </CardContent>
    </Card>
  );
}
