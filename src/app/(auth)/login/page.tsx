"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod/v4";
import { Turnstile } from "@marsidev/react-turnstile";
import { signIn } from "@/server/auth-actions";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Form, FormInputField, FormPasswordField } from "@/components/ui/form";

const loginSchema = z.object({
  email: z.string().email("Inserisci un'email valida."),
  password: z.string().min(1, "La password è obbligatoria."),
});

type LoginData = z.infer<typeof loginSchema>;

export default function LoginPage() {
  const [isPending, startTransition] = useTransition();
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);

  const form = useForm<LoginData>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: "", password: "" },
  });

  function handleSubmit(data: LoginData) {
    const formData = new FormData();
    formData.set("email", data.email);
    formData.set("password", data.password);
    if (captchaToken) formData.set("captchaToken", captchaToken);

    startTransition(async () => {
      const result = await signIn(formData);
      if (result?.error) {
        form.setError("root", { message: result.error });
      }
      // On success, signIn redirects to /dashboard
    });
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

            <FormPasswordField
              control={form.control}
              name="password"
              label="Password"
              autoComplete="current-password"
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
              {isPending ? "Accesso in corso…" : "Accedi"}
            </Button>
          </form>
        </Form>

        <div className="mt-4 space-y-2 text-center text-sm">
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
        </div>
      </CardContent>
    </Card>
  );
}
