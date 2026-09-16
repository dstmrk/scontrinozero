"use client";

import { useState, useTransition, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { RefreshCw, CheckCircle2, AlertCircle, Loader2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { verifyAdeCredentials } from "@/server/onboarding-actions";
import { ChangeAdePasswordDialog } from "@/components/ade/change-ade-password-dialog";
import type { AdeLoginMethod } from "@/lib/ade/types";

type VerifyState =
  | { status: "idle" }
  | { status: "pending" }
  | { status: "success" }
  | {
      status: "error";
      message: string;
      pivaConflict?: boolean;
      pivaMismatch?: boolean;
      /**
       * Le partite IVA fra cui scegliere (HAR.md #18). La `denominazione` c'è
       * solo per quelle intestate a chi accede: per gli incarichi il portale
       * espone il solo numero, e lì non abbiamo un nome da mostrare.
       */
      utenzaChoices?: { piva: string; denominazione?: string }[];
    };

interface AdeCredentialsSectionProps {
  businessId: string | null;
  hasCredentials: boolean;
  verifiedAt: Date | null;
  loginMethod?: AdeLoginMethod;
}

const SUCCESS_DISMISS_MS = 3000;

/**
 * Le partite IVA su cui l'accesso AdE può operare (HAR.md #18).
 *
 * Con un solo candidato non c'è niente da scegliere: l'unica cosa che l'utente
 * fa è **confermare**, e i testi lo dicono — altrimenti "Scegli" sopra e
 * "Collega" sul bottone sarebbero due verbi per un'azione che il messaggio
 * d'errore chiama già "conferma".
 *
 * Righe con un bottone ciascuna e non una tendina: con pochi candidati è un
 * clic invece di tre (apri, seleziona, invia), regge meglio su mobile, e con un
 * candidato solo la riga È già la preselezione. Stesso pattern del banner degli
 * scontrini in sospeso.
 */
function UtenzaPicker({
  choices,
  onSelect,
}: Readonly<{
  choices: { piva: string; denominazione?: string }[];
  onSelect: (piva: string) => void;
}>) {
  const onlyOne = choices.length === 1;

  return (
    <div className="space-y-2 pt-1">
      <p className="text-sm font-medium">
        {onlyOne
          ? "Conferma la partita IVA su cui operare"
          : "Scegli la partita IVA su cui operare"}
      </p>
      <ul className="space-y-2">
        {choices.map((choice) => (
          <li
            key={choice.piva}
            className="flex flex-wrap items-center justify-between gap-2"
          >
            <span className="text-sm">
              {choice.denominazione ? (
                <>
                  {choice.denominazione}{" "}
                  <span className="text-muted-foreground font-mono">
                    {choice.piva}
                  </span>
                </>
              ) : (
                <span className="font-mono">{choice.piva}</span>
              )}
            </span>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => onSelect(choice.piva)}
            >
              {onlyOne ? "Conferma" : "Collega"}
            </Button>
          </li>
        ))}
      </ul>
      <p className="text-muted-foreground text-xs">
        Controlla bene la partita IVA: <strong>non potrai più cambiarla</strong>
        . Per gestirne un&apos;altra servirà un account separato.
      </p>
    </div>
  );
}

export function AdeCredentialsSection({
  businessId,
  hasCredentials,
  verifiedAt,
  loginMethod = "fisconline",
}: Readonly<AdeCredentialsSectionProps>) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [verifyState, setVerifyState] = useState<VerifyState>({
    status: "idle",
  });
  const [hasEverVerified, setHasEverVerified] = useState(!!verifiedAt);
  const [changePasswordOpen, setChangePasswordOpen] = useState(false);
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

  function handleVerify(utenzaPiva?: string) {
    if (!businessId) return;

    if (dismissTimerRef.current) {
      clearTimeout(dismissTimerRef.current);
      dismissTimerRef.current = null;
    }

    setVerifyState({ status: "pending" });
    const id = businessId;

    startTransition(async () => {
      const result = await verifyAdeCredentials(id, utenzaPiva);

      if (result.error) {
        if (result.passwordExpired) {
          setVerifyState({ status: "idle" });
          setChangePasswordOpen(true);
          return;
        }
        setVerifyState({
          status: "error",
          message: result.error,
          pivaConflict: result.pivaConflict,
          pivaMismatch: result.pivaMismatch,
          utenzaChoices: result.utenzaChoices,
        });
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

  const isCie = loginMethod === "cie";

  let buttonLabel: string;
  if (isCie) {
    buttonLabel = hasEverVerified ? "Ricollega" : "Collega";
    if (verifyState.status === "pending") {
      buttonLabel = "Collegamento in corso…";
    } else if (verifyState.status === "error") {
      buttonLabel = "Riprova";
    }
  } else {
    buttonLabel = "Verifica connessione";
    if (verifyState.status === "pending") {
      buttonLabel = "Verifica in corso…";
    } else if (verifyState.status === "error") {
      buttonLabel = "Riprova";
    }
  }

  return (
    <>
      {businessId && (
        <ChangeAdePasswordDialog
          businessId={businessId}
          open={changePasswordOpen}
          onClose={() => setChangePasswordOpen(false)}
          onSuccess={() => {
            setChangePasswordOpen(false);
            setHasEverVerified(true);
            router.refresh();
          }}
        />
      )}
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
            onClick={() => handleVerify()}
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

        {isCie && (
          <p className="text-muted-foreground text-xs">
            Il collegamento richiede l&apos;approvazione di una notifica
            sull&apos;app CIE ID sul tuo telefono.
          </p>
        )}

        {isCie && verifyState.status === "pending" && (
          <p className="flex items-center gap-1.5 text-sm text-amber-600">
            <Loader2 className="h-4 w-4 animate-spin" />
            Approva ora la notifica sull&apos;app CIE ID sul tuo telefono…
          </p>
        )}

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
          <div className="space-y-1">
            <p className="text-destructive flex items-center gap-1.5 text-sm">
              <AlertCircle className="h-4 w-4" />
              {verifyState.message}
            </p>
            {verifyState.utenzaChoices &&
              verifyState.utenzaChoices.length > 0 && (
                <UtenzaPicker
                  choices={verifyState.utenzaChoices}
                  onSelect={handleVerify}
                />
              )}
            {verifyState.pivaConflict && (
              <p className="text-muted-foreground text-xs">
                Se questa P.IVA è tua (es. un vecchio account o un trial
                abbandonato),{" "}
                <a
                  href="/help/contatto-assistenza"
                  className="underline underline-offset-2"
                >
                  contatta l&apos;assistenza
                </a>{" "}
                per sbloccarla.
              </p>
            )}
            {verifyState.pivaMismatch && (
              <p className="text-muted-foreground text-xs">
                Per emettere scontrini con un&apos;altra partita IVA registra un
                account separato. Se pensi sia un errore,{" "}
                <a
                  href="/help/contatto-assistenza"
                  className="underline underline-offset-2"
                >
                  contatta l&apos;assistenza
                </a>
                {"."}
              </p>
            )}
          </div>
        )}
      </div>
    </>
  );
}
