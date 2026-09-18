"use client";

import { Button } from "@/components/ui/button";
import type { AdeUtenzaCandidate, AdeUtenzaProvenienza } from "@/lib/ade/types";

/**
 * L'etichetta di provenienza, in italiano da esercente: il portale dice
 * "Me stesso" e "Incaricato", che fuori dal wizard AdE non significano niente.
 */
const PROVENIENZA_LABEL: Readonly<Record<AdeUtenzaProvenienza, string>> = {
  diretta: "La tua partita IVA",
  incarico: "Per conto di un altro soggetto",
};

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
 * Ogni riga porta la **provenienza**: un'utenza con entrambe le personae del
 * wizard mette in elenco la partita IVA dell'esercente accanto a quella di un
 * soggetto per cui lavora, e due numeri di undici cifre senza etichetta non si
 * distinguono. È il caso in cui un esercente si è visto offrire la sola società
 * cessata di cui era incaricato e l'ha letta come un errore di credenziali.
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
    // `text-left` e' del picker, non della pagina: l'onboarding rende il suo
    // step dentro un contenitore `text-center` e le partite IVA finivano
    // sfalsate l'una rispetto all'altra. Undici cifre si confrontano a colpo
    // d'occhio solo se partono dalla stessa colonna, e qui la scelta e'
    // irreversibile.
    <div className="space-y-2 pt-1 text-left">
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
              {/* Sempre, anche quando le righe hanno tutte la stessa
                  provenienza: chi ha un solo incarico ha comunque diritto di
                  sapere che sta collegando la partita IVA di qualcun altro. */}
              <span className="text-muted-foreground block text-xs">
                {PROVENIENZA_LABEL[choice.provenienza]}
              </span>
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
