"use client";

import { useActionState } from "react";
import Link from "next/link";
import { signUp, type AuthActionResult } from "@/server/auth-actions";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PasswordInput } from "@/components/ui/password-input";

export default function RegisterPage() {
  const [state, formAction, isPending] = useActionState<
    AuthActionResult,
    FormData
  >(async (_prevState, formData) => {
    return await signUp(formData);
  }, {});

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-center text-xl">Crea un account</CardTitle>
      </CardHeader>
      <CardContent>
        <form action={formAction} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="fullName">Nome completo</Label>
            <Input
              id="fullName"
              name="fullName"
              type="text"
              placeholder="Mario Rossi"
              autoComplete="name"
            />
          </div>
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
          <div className="space-y-2">
            <Label htmlFor="password">Password</Label>
            <PasswordInput
              id="password"
              name="password"
              minLength={8}
              required
              autoComplete="new-password"
            />
            <p className="text-muted-foreground text-xs">Minimo 8 caratteri</p>
          </div>

          {state?.error && (
            <p className="text-destructive text-sm">{state.error}</p>
          )}

          <Button type="submit" className="w-full" disabled={isPending}>
            {isPending ? "Registrazione..." : "Registrati"}
          </Button>
        </form>

        <p className="mt-4 text-center text-sm">
          Hai gia un account?{" "}
          <Link href="/login" className="text-primary underline">
            Accedi
          </Link>
        </p>
      </CardContent>
    </Card>
  );
}
