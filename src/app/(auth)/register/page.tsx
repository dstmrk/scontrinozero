"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod/v4";
import { Turnstile } from "@marsidev/react-turnstile";
import { signUp } from "@/server/auth-actions";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PasswordInput } from "@/components/ui/password-input";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormInputField,
  FormItem,
  FormLabel,
  FormMessage,
  FormPasswordField,
} from "@/components/ui/form";

const registerSchema = z
  .object({
    email: z.string().email("Inserisci un'email valida."),
    password: z
      .string()
      .min(8, "Almeno 8 caratteri.")
      .regex(/[A-Z]/, "Serve almeno una maiuscola.")
      .regex(/[a-z]/, "Serve almeno una minuscola.")
      .regex(/\d/, "Serve almeno un numero.")
      .regex(/[^A-Za-z0-9]/, "Serve almeno un carattere speciale (es. !)."),
    confirmPassword: z.string().min(1, "Conferma la password."),
    termsAccepted: z
      .boolean()
      .refine(
        (v) => v,
        "Devi accettare i Termini di servizio e la Privacy Policy.",
      ),
    specificClausesAccepted: z
      .boolean()
      .refine((v) => v, "Devi accettare specificamente le clausole indicate."),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "Le password non coincidono.",
    path: ["confirmPassword"],
  });

type RegisterData = z.infer<typeof registerSchema>;

export default function RegisterPage() {
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const form = useForm<RegisterData>({
    resolver: zodResolver(registerSchema),
    defaultValues: {
      email: "",
      password: "",
      confirmPassword: "",
      termsAccepted: false,
      specificClausesAccepted: false,
    },
  });

  function handleSubmit(data: RegisterData) {
    const formData = new FormData();
    formData.set("email", data.email);
    formData.set("password", data.password);
    formData.set("confirmPassword", data.confirmPassword);
    formData.set("termsAccepted", "true");
    formData.set("specificClausesAccepted", "true");
    if (captchaToken) formData.set("captchaToken", captchaToken);

    startTransition(async () => {
      const result = await signUp(formData);
      if (result?.error) {
        form.setError("root", { message: result.error });
        setCaptchaToken(null); // token single-use, force re-solve
      }
      // On success, signUp redirects to /verify-email
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-center text-xl">Crea un account</CardTitle>
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

            {/* password: keeps explicit FormField for the conditional FormDescription */}
            <FormField
              control={form.control}
              name="password"
              render={({ field, fieldState }) => (
                <FormItem>
                  <FormLabel>Password</FormLabel>
                  <FormControl>
                    <PasswordInput autoComplete="new-password" {...field} />
                  </FormControl>
                  {!fieldState.error && (
                    <FormDescription>
                      Almeno 8 caratteri con maiuscola, minuscola, numero e
                      carattere speciale (es.&nbsp;!)
                    </FormDescription>
                  )}
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormPasswordField
              control={form.control}
              name="confirmPassword"
              label="Conferma password"
              autoComplete="new-password"
            />

            <FormField
              control={form.control}
              name="termsAccepted"
              render={({ field }) => (
                <FormItem>
                  <div className="flex items-start gap-2">
                    <input
                      id="termsAccepted"
                      type="checkbox"
                      checked={field.value}
                      onChange={(e) => field.onChange(e.target.checked)}
                      onBlur={field.onBlur}
                      name={field.name}
                      className="accent-primary mt-0.5 h-4 w-4 shrink-0 cursor-pointer"
                    />
                    <label
                      htmlFor="termsAccepted"
                      className="cursor-pointer text-sm leading-snug select-none"
                    >
                      Ho letto e accetto i{" "}
                      <Link
                        href="/termini"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-primary underline"
                      >
                        Termini di servizio
                      </Link>{" "}
                      e la{" "}
                      <Link
                        href="/privacy"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-primary underline"
                      >
                        Privacy Policy
                      </Link>
                      .
                    </label>
                  </div>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="specificClausesAccepted"
              render={({ field }) => (
                <FormItem>
                  <div className="flex items-start gap-2">
                    <input
                      id="specificClausesAccepted"
                      type="checkbox"
                      checked={field.value}
                      onChange={(e) => field.onChange(e.target.checked)}
                      onBlur={field.onBlur}
                      name={field.name}
                      className="accent-primary mt-0.5 h-4 w-4 shrink-0 cursor-pointer"
                    />
                    <label
                      htmlFor="specificClausesAccepted"
                      className="cursor-pointer text-sm leading-snug select-none"
                    >
                      Accetto specificamente, ai sensi dell&apos;art. 1341 c.c.,
                      le clausole: 9 (limitazione e cap di responsabilità), 10
                      (no rimborso corrispettivi già pagati), 11 (sospensione e
                      cessazione unilaterale del servizio), 16 (foro esclusivo
                      di Torino per controversie B2B).
                    </label>
                  </div>
                  <FormMessage />
                </FormItem>
              )}
            />

            {process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY && (
              <Turnstile
                siteKey={process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY}
                onSuccess={(token) => setCaptchaToken(token)}
                onExpire={() => setCaptchaToken(null)}
                onError={() => setCaptchaToken(null)}
                options={{ theme: "auto" }}
              />
            )}

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
              {isPending ? "Registrazione…" : "Registrati"}
            </Button>
          </form>
        </Form>

        <p className="mt-4 text-center text-sm">
          Hai già un account?{" "}
          <Link href="/login" className="text-primary underline">
            Accedi
          </Link>
        </p>
      </CardContent>
    </Card>
  );
}
