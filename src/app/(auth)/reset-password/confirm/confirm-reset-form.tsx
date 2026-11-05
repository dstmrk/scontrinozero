"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { confirmPasswordReset } from "@/server/auth-actions";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

/**
 * Il pulsante che consuma il token del reset. Va premuto dall'utente: è il
 * motivo per cui la pagina esiste (issue #1159). Al successo il server action
 * reindirizza a `/reset-password/update`.
 */
export function ConfirmResetForm({
  tokenHash,
}: Readonly<{ tokenHash: string }>) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleConfirm() {
    const formData = new FormData();
    formData.set("tokenHash", tokenHash);
    setError(null);
    startTransition(async () => {
      const result = await confirmPasswordReset(formData);
      if (result?.error) setError(result.error);
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-center text-xl">
          Reimposta la password
        </CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-muted-foreground mb-4 text-center text-sm">
          Premi il pulsante per scegliere una nuova password. Il link vale una
          sola volta.
        </p>

        {error && (
          <p className="text-destructive mb-4 text-sm" role="alert">
            {error}
          </p>
        )}

        <Button
          type="button"
          className="w-full"
          disabled={isPending}
          onClick={handleConfirm}
        >
          {isPending ? "Verifica in corso…" : "Imposta una nuova password"}
        </Button>

        <p className="mt-4 text-center text-sm">
          <Link href="/login" className="text-primary underline">
            Torna al login
          </Link>
        </p>
      </CardContent>
    </Card>
  );
}
