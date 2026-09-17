"use client";

import { Button } from "@/components/ui/button";
import type { AdeUtenzaCandidate } from "@/lib/ade/types";

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
 *
 * Vive qui e non dentro una delle due sezioni che lo usano perché le superfici
 * che chiamano `verifyAdeCredentials` sono due — impostazioni e onboarding — e
 * la prima versione di questo picker ne copriva una sola: chi arrivava con
 * un'utenza incaricata durante l'onboarding leggeva "scegli qui sotto" con
 * niente sotto, e non aveva nessuna strada per uscirne.
 */
export function UtenzaPicker({
  choices,
  onSelect,
}: Readonly<{
  choices: AdeUtenzaCandidate[];
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
      </p>
      <p className="text-muted-foreground text-xs">
        Per gestirne un&apos;altra servirà un account separato.
      </p>
    </div>
  );
}
