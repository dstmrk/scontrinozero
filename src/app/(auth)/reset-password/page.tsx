"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod/v4";
import { resetPassword } from "@/server/auth-actions";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Form, FormInputField } from "@/components/ui/form";
import { TurnstileWidget } from "@/components/turnstile-widget";

const resetSchema = z.object({
  email: z.string().email("Inserisci un'email valida."),
});

type ResetData = z.infer<typeof resetSchema>;

export default function ResetPasswordPage() {
  const [isPending, startTransition] = useTransition();
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);

  const form = useForm<ResetData>({
    resolver: zodResolver(resetSchema),
    defaultValues: { email: "" },
  });

  function handleSubmit(data: ResetData) {
    const formData = new FormData();
    formData.set("email", data.email);
    if (captchaToken) formData.set("captchaToken", captchaToken);

    startTransition(async () => {
      const result = await resetPassword(formData);
      if (result?.error) {
        form.setError("root", { message: result.error });
      }
      // On success, resetPassword redirects or shows confirmation
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-center text-xl">Recupera password</CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-muted-foreground mb-4 text-center text-sm">
          Inserisci la tua email e ti invieremo un link per reimpostare la
          password.
        </p>

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
              placeholder="mario@esempio.it"
              autoComplete="email"
            />

            <TurnstileWidget onToken={setCaptchaToken} />

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
              {isPending ? "Invio in corso..." : "Invia link di recupero"}
            </Button>
          </form>
        </Form>

        <p className="mt-4 text-center text-sm">
          <Link href="/login" className="text-primary underline">
            Torna al login
          </Link>
        </p>
      </CardContent>
    </Card>
  );
}
