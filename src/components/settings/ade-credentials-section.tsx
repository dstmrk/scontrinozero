"use client";

import { useState, useTransition, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { RefreshCw, CheckCircle2, AlertCircle, Loader2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { verifyAdeCredentials } from "@/server/onboarding-actions";

type VerifyState =
  | { status: "idle" }
  | { status: "pending" }
  | { status: "success" }
  | { status: "error"; message: string };

interface AdeCredentialsSectionProps {
  businessId: string | null;
  hasCredentials: boolean;
  verifiedAt: Date | null;
}

const SUCCESS_DISMISS_MS = 3000;

export function AdeCredentialsSection({
  businessId,
  hasCredentials,
  verifiedAt,
}: Readonly<AdeCredentialsSectionProps>) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [verifyState, setVerifyState] = useState<VerifyState>({
    status: "idle",
  });
  const [hasEverVerified, setHasEverVerified] = useState(!!verifiedAt);
  const dismissTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (dismissTimerRef.current) {
        clearTimeout(dismissTimerRef.current);
      }
    };
  }, []);

  if (!hasCredentials) {
    return (
      <p className="text-muted-foreground">Nessuna credenziale configurata.</p>
    );
  }

  function handleVerify() {
    if (!businessId) return;

    if (dismissTimerRef.current) {
      clearTimeout(dismissTimerRef.current);
      dismissTimerRef.current = null;
    }

    setVerifyState({ status: "pending" });
    const id = businessId;

    startTransition(async () => {
      const result = await verifyAdeCredentials(id);

      if (result.error) {
        setVerifyState({ status: "error", message: result.error });
        return;
      }

      setHasEverVerified(true);
      setVerifyState({ status: "success" });
      router.refresh();

      dismissTimerRef.current = setTimeout(() => {
        setVerifyState({ status: "idle" });
        dismissTimerRef.current = null;
      }, SUCCESS_DISMISS_MS);
    });
  }

  let buttonLabel = "Verifica connessione";
  if (verifyState.status === "pending") {
    buttonLabel = "Verifica in corso…";
  } else if (verifyState.status === "error") {
    buttonLabel = "Riprova";
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="text-muted-foreground text-sm">Stato:</span>
          {hasEverVerified ? (
            <Badge variant="default">Verificate</Badge>
          ) : (
            <Badge variant="secondary">Non verificate</Badge>
          )}
        </div>
        <Button
          size="sm"
          variant="outline"
          onClick={handleVerify}
          disabled={verifyState.status === "pending"}
        >
          {verifyState.status === "pending" ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <RefreshCw className="mr-2 h-4 w-4" />
          )}
          {buttonLabel}
        </Button>
      </div>

      {verifiedAt && verifyState.status !== "success" && (
        <p className="text-muted-foreground text-xs">
          Ultima verifica:{" "}
          {verifiedAt.toLocaleDateString("it-IT", {
            day: "numeric",
            month: "long",
            year: "numeric",
          })}
        </p>
      )}

      {verifyState.status === "success" && (
        <p className="flex items-center gap-1.5 text-sm text-green-600">
          <CheckCircle2 className="h-4 w-4" />
          Connessione verificata.
        </p>
      )}

      {verifyState.status === "error" && (
        <p className="text-destructive flex items-center gap-1.5 text-sm">
          <AlertCircle className="h-4 w-4" />
          {verifyState.message}
        </p>
      )}
    </div>
  );
}
