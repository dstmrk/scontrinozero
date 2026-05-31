"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod/v4";
import { signIn, resendConfirmationEmail } from "@/server/auth-actions";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Form, FormInputField, FormPasswordField } from "@/components/ui/form";
import { TurnstileWidget } from "@/components/turnstile-widget";

const loginSchema = z.object({
  email: z.string().email("Inserisci un'email valida."),
  password: z.string().min(1, "La password è obbligatoria."),
});

type LoginData = z.infer<typeof loginSchema>;

type LoginMode = "login" | "resend";

function resolveButtonLabel(mode: LoginMode, isPending: boolean): string {
  if (mode === "resend") {
    return isPending ? "Invio in corso…" : "Reinvia email di conferma";
  }
  return isPending ? "Accesso in corso…" : "Accedi";
}

export default function LoginPage() {
  const [isPending, startTransition] = useTransition();
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);
  // "resend" si attiva quando il login fallisce perché l'email non è confermata:
  // mostra il messaggio dedicato e offre il re-invio della conferma. Il captcha
  // viene resettato sull'action corretta ("resend-confirmation").
  const [mode, setMode] = useState<LoginMode>("login");

  const form = useForm<LoginData>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: "", password: "" },
  });

  const turnstileAction = mode === "resend" ? "resend-confirmation" : "signin";

  function submitResend(email: string) {
    const formData = new FormData();
    formData.set("email", email);
    if (captchaToken) formData.set("captchaToken", captchaToken);

    startTransition(async () => {
      const result = await resendConfirmationEmail(formData);
      // Su successo resendConfirmationEmail reindirizza a /verify-email.
      if (result?.error) {
        form.setError("root", { message: result.error });
        setCaptchaToken(null);
      }
    });
  }

  function submitLogin(data: LoginData) {
    const formData = new FormData();
    formData.set("email", data.email);
    formData.set("password", data.password);
    if (captchaToken) formData.set("captchaToken", captchaToken);

    startTransition(async () => {
      const result = await signIn(formData);
      if (result?.needsEmailConfirmation) {
        // Passa alla modalità re-invio: il messaggio dedicato resta visibile e
        // il widget Turnstile si rimonta sull'action "resend-confirmation".
        setMode("resend");
        form.setError("root", { message: result.error });
        setCaptchaToken(null);
        return;
      }
      if (result?.error) {
        form.setError("root", { message: result.error });
        setCaptchaToken(null); // token single-use, force re-solve
      }
      // On success, signIn redirects to /dashboard
    });
  }

  function handleSubmit(data: LoginData) {
    if (mode === "resend") {
      submitResend(data.email);
      return;
    }
    submitLogin(data);
  }

  function backToLogin() {
    setMode("login");
    form.clearErrors("root");
    setCaptchaToken(null);
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-center text-xl">Accedi</CardTitle>
      </CardHeader>
      <CardContent>
        <Form {...form}>
          <form
            onSubmit={form.handleSubmit(handleSubmit)}
            noValidate
            className="space-y-4"
          >
            <FormInputField
              control={form.control}
              name="email"
              label="Email"
              type="email"
              placeholder="mario@esempio.it…"
              autoComplete="email"
              spellCheck={false}
            />

            {mode === "login" && (
              <FormPasswordField
                control={form.control}
                name="password"
                label="Password"
                autoComplete="current-password"
              />
            )}

            <TurnstileWidget
              key={mode}
              onToken={setCaptchaToken}
              action={turnstileAction}
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
              {resolveButtonLabel(mode, isPending)}
            </Button>
          </form>
        </Form>

        <div className="mt-4 space-y-2 text-center text-sm">
          {mode === "resend" ? (
            <p>
              <button
                type="button"
                onClick={backToLogin}
                className="text-muted-foreground hover:text-primary underline"
              >
                Torna al login
              </button>
            </p>
          ) : (
            <>
              <p>
                <Link
                  href="/reset-password"
                  className="text-muted-foreground hover:text-primary underline"
                >
                  Password dimenticata?
                </Link>
              </p>
              <p>
                Non hai un account?{" "}
                <Link href="/register" className="text-primary underline">
                  Registrati
                </Link>
              </p>
            </>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
