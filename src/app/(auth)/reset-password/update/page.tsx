"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod/v4";
import { completePasswordReset } from "@/server/profile-actions";
import { passwordFieldSchema } from "@/lib/validation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
  FormPasswordField,
} from "@/components/ui/form";
import { PasswordInput } from "@/components/ui/password-input";

const updateSchema = z
  .object({
    newPassword: passwordFieldSchema,
    confirmPassword: z.string().min(1, "Conferma la password."),
  })
  .refine((data) => data.newPassword === data.confirmPassword, {
    message: "Le password non coincidono.",
    path: ["confirmPassword"],
  });

type UpdateData = z.infer<typeof updateSchema>;

export default function UpdatePasswordPage() {
  const [isPending, startTransition] = useTransition();
  const [done, setDone] = useState(false);

  const form = useForm<UpdateData>({
    resolver: zodResolver(updateSchema),
    defaultValues: { newPassword: "", confirmPassword: "" },
  });

  function handleSubmit(data: UpdateData) {
    const formData = new FormData();
    formData.set("newPassword", data.newPassword);
    formData.set("confirmPassword", data.confirmPassword);

    startTransition(async () => {
      const result = await completePasswordReset(formData);
      if (result?.error) {
        form.setError("root", { message: result.error });
        return;
      }
      setDone(true);
    });
  }

  if (done) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-center text-xl">
            Password aggiornata
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground mb-4 text-center text-sm">
            La tua password è stata reimpostata. Le altre sessioni attive sono
            state disconnesse.
          </p>
          <Button asChild className="w-full">
            <Link href="/dashboard">Vai alla dashboard</Link>
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-center text-xl">Nuova password</CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-muted-foreground mb-4 text-center text-sm">
          Scegli una nuova password per il tuo account.
        </p>

        <Form {...form}>
          <form
            onSubmit={(e) => form.handleSubmit(handleSubmit)(e)}
            noValidate
            className="space-y-4"
          >
            <FormField
              control={form.control}
              name="newPassword"
              render={({ field, fieldState }) => (
                <FormItem>
                  <FormLabel>Nuova password</FormLabel>
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

            {form.formState.errors.root && (
              <p className="text-destructive text-sm" role="alert">
                {form.formState.errors.root.message}
              </p>
            )}

            <Button type="submit" className="w-full" disabled={isPending}>
              {isPending ? "Aggiornamento…" : "Reimposta password"}
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
