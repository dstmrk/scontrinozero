"use client";

import { useActionState } from "react";
import Link from "next/link";
import { resetPassword, type AuthActionResult } from "@/server/auth-actions";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export default function ResetPasswordPage() {
  const [state, formAction, isPending] = useActionState<
    AuthActionResult,
    FormData
  >(async (_prevState, formData) => {
    return await resetPassword(formData);
  }, {});

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

        <form action={formAction} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              name="email"
              type="email"
              placeholder="mario@esempio.it"
              required
              autoComplete="email"
            />
          </div>

          {state?.error && (
            <p className="text-destructive text-sm">{state.error}</p>
          )}

          <Button type="submit" className="w-full" disabled={isPending}>
            {isPending ? "Invio in corso..." : "Invia link di recupero"}
          </Button>
        </form>

        <p className="mt-4 text-center text-sm">
          <Link href="/login" className="text-primary underline">
            Torna al login
          </Link>
        </p>
      </CardContent>
    </Card>
  );
}
