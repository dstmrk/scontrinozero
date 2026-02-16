"use client";

import { useActionState } from "react";
import Link from "next/link";
import { signIn, type AuthActionResult } from "@/server/auth-actions";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export default function LoginPage() {
  const [state, formAction, isPending] = useActionState<
    AuthActionResult,
    FormData
  >(async (_prevState, formData) => {
    return await signIn(formData);
  }, {});

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-center text-xl">Accedi</CardTitle>
      </CardHeader>
      <CardContent>
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
          <div className="space-y-2">
            <Label htmlFor="password">Password</Label>
            <Input
              id="password"
              name="password"
              type="password"
              required
              autoComplete="current-password"
            />
          </div>

          {state?.error && (
            <p className="text-destructive text-sm">{state.error}</p>
          )}

          <Button type="submit" className="w-full" disabled={isPending}>
            {isPending ? "Accesso in corso..." : "Accedi"}
          </Button>
        </form>

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
