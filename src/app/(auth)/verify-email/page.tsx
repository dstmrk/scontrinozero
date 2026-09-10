"use client";

import { useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod/v4";
import type { TurnstileInstance } from "@marsidev/react-turnstile";
import { resendConfirmationEmail } from "@/server/auth-actions";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Form, FormInputField } from "@/components/ui/form";
import { TurnstileWidget } from "@/components/turnstile-widget";

const resendSchema = z.object({
  email: z.string().email("Inserisci un'email valida."),
});

type ResendData = z.infer<typeof resendSchema>;

/**
 * Pagina di attesa conferma, con il re-invio in linea.
 *
 * Il re-invio era raggiungibile solo tornando al login e sbagliando l'accesso
 * di proposito: chi atterrava qui dopo la registrazione non aveva alcun modo di
 * farsi rispedire il link, e restava bloccato se la prima mail non arrivava.
 *
 * L'email si ri-digita invece di essere prefillata da un query param o da un
 * cookie: chi torna qui il giorno dopo, da un bookmark o da un altro
 * dispositivo, ha comunque il form funzionante — ed è esattamente lo scenario
 * di chi la mail non l'ha ricevuta. In più tiene l'indirizzo fuori dall'URL,
 * quindi fuori da cronologia e referrer.
 */
export default function VerifyEmailPage() {
  const [isPending, startTransition] = useTransition();
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);
  const turnstileRef = useRef<TurnstileInstance | null>(null);

  const form = useForm<ResendData>({
    resolver: zodResolver(resendSchema),
    defaultValues: { email: "" },
  });

  function handleSubmit(data: ResendData) {
    const formData = new FormData();
    formData.set("email", data.email);
    if (captchaToken) formData.set("captchaToken", captchaToken);

    startTransition(async () => {
      const result = await resendConfirmationEmail(formData);
      // Su successo resendConfirmationEmail reindirizza (di nuovo) a
      // /verify-email: la pagina si rimonta e il form torna pulito.
      if (result?.error) {
        form.setError("root", { message: result.error });
        setCaptchaToken(null); // token single-use, force re-solve
        turnstileRef.current?.reset(); // ri-emette il token: riabilita il submit
      }
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-center text-xl">
          Controlla la tua email
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-muted-foreground text-center text-sm">
          Ti abbiamo inviato un&apos;email con un link di conferma. Clicca sul
          link per completare l&apos;operazione.
        </p>
        <p className="text-muted-foreground text-center text-xs">
          Non la trovi? Guarda nello spam. Se usi una casella aziendale può
          essere finita in quarantena: lì non la vedi tu, deve sbloccarla chi
          amministra la posta, autorizzando il mittente{" "}
          <span className="font-medium">mail.scontrinozero.it</span>.
        </p>

        <div className="border-t pt-4">
          <p className="text-muted-foreground mb-4 text-center text-sm">
            Puoi anche fartela rispedire.
          </p>

          <Form {...form}>
            <form
              onSubmit={(e) => form.handleSubmit(handleSubmit)(e)}
              noValidate
              className="space-y-4"
            >
              <FormInputField
                control={form.control}
                name="email"
                label="Email"
                type="email"
                placeholder="mario@esempio.it"
                autoComplete="email"
                spellCheck={false}
              />

              <TurnstileWidget
                ref={turnstileRef}
                onToken={setCaptchaToken}
                action="resend-confirmation"
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
                {isPending ? "Invio in corso…" : "Reinvia email di conferma"}
              </Button>
            </form>
          </Form>
        </div>

        <p className="text-muted-foreground text-center text-xs">
          Hai già confermato?{" "}
          <Link href="/login" className="text-primary underline">
            Accedi
          </Link>{" "}
          o{" "}
          <Link href="/reset-password" className="text-primary underline">
            reimposta la password
          </Link>
          .
        </p>
      </CardContent>
    </Card>
  );
}
