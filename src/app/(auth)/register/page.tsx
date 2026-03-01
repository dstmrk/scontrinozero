"use client";

import { useState } from "react";
import Link from "next/link";
import { signUp } from "@/server/auth-actions";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PasswordInput } from "@/components/ui/password-input";

const ERR_CONFIRM_REQUIRED = "Conferma la password.";
const ERR_PWD_MISMATCH = "Le password non coincidono.";

function validatePassword(pw: string): string | null {
  if (pw.length < 8) return "Almeno 8 caratteri.";
  if (!/[A-Z]/.test(pw)) return "Serve almeno una maiuscola.";
  if (!/[a-z]/.test(pw)) return "Serve almeno una minuscola.";
  if (!/\d/.test(pw)) return "Serve almeno un numero.";
  if (!/[^A-Za-z0-9]/.test(pw))
    return "Serve almeno un carattere speciale (es. !).";
  return null;
}

export default function RegisterPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [fieldErrors, setFieldErrors] = useState<{
    email?: string;
    password?: string;
    confirmPassword?: string;
  }>({});
  const [serverError, setServerError] = useState<string | null>(null);
  const [isPending, setIsPending] = useState(false);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();

    // Client-side validation
    const errors: typeof fieldErrors = {};
    if (!email.trim()) errors.email = "L'email è obbligatoria.";
    const pwError = validatePassword(password);
    if (pwError) errors.password = pwError;
    if (!confirmPassword) errors.confirmPassword = ERR_CONFIRM_REQUIRED;
    else if (password !== confirmPassword)
      errors.confirmPassword = ERR_PWD_MISMATCH;

    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors);
      setServerError(null);
      return;
    }

    setFieldErrors({});
    setServerError(null);
    setIsPending(true);

    const formData = new FormData();
    formData.set("email", email);
    formData.set("password", password);
    formData.set("confirmPassword", confirmPassword);

    const result = await signUp(formData);
    setIsPending(false);

    if (result?.error) {
      setServerError(result.error);
    }
    // On success, signUp redirects to /verify-email — no need to handle here
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-center text-xl">Crea un account</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} noValidate className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              name="email"
              type="email"
              placeholder="mario@esempio.it"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
            {fieldErrors.email && (
              <p className="text-destructive text-xs">{fieldErrors.email}</p>
            )}
          </div>
          <div className="space-y-2">
            <Label htmlFor="password">Password</Label>
            <PasswordInput
              id="password"
              name="password"
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            {fieldErrors.password ? (
              <p className="text-destructive text-xs">{fieldErrors.password}</p>
            ) : (
              <p className="text-muted-foreground text-xs">
                Almeno 8 caratteri con maiuscola, minuscola, numero e carattere
                speciale (es.&nbsp;!)
              </p>
            )}
          </div>
          <div className="space-y-2">
            <Label htmlFor="confirmPassword">Conferma password</Label>
            <PasswordInput
              id="confirmPassword"
              name="confirmPassword"
              autoComplete="new-password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
            />
            {fieldErrors.confirmPassword && (
              <p className="text-destructive text-xs">
                {fieldErrors.confirmPassword}
              </p>
            )}
          </div>

          {serverError && (
            <p className="text-destructive text-sm">{serverError}</p>
          )}

          <Button type="submit" className="w-full" disabled={isPending}>
            {isPending ? "Registrazione..." : "Registrati"}
          </Button>
        </form>

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
