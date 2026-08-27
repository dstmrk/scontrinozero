"use client";

import { Banknote, CreditCard, X } from "lucide-react";
import { cn, formatCurrency } from "@/lib/utils";
import { splitCashElectronic } from "@/lib/receipts/payment-input";
import { NumericKeypad } from "./numeric-keypad";
import { PAYMENT_METHOD_LABELS, PaymentMethod } from "@/types/cassa";

interface PaymentSplitProps {
  /**
   * Quanto c'è da ripartire, in centesimi interi: il corrispettivo **meno** lo
   * sconto a pagare. Non il totale — l'abbuono non si incassa (`HAR.md` voce
   * #3b), e le voci di pagamento devono sommare all'incassato (voce #5).
   */
  readonly collectedCents: number;
  /** Quota in contanti. L'elettronico è sempre il resto: vedi sotto. */
  readonly cashCents: number;
  readonly onCashChange: (cents: number) => void;
  readonly onClose: () => void;
}

const METHOD_ICONS: Record<PaymentMethod, React.ReactNode> = {
  PC: <Banknote className="h-5 w-5" />,
  PE: <CreditCard className="h-5 w-5" />,
};

/**
 * Ripartitore del pagamento fra contanti ed elettronico (feature Pro).
 *
 * **Una sola cifra da digitare.** L'esercente inserisce quanto gli mette in
 * mano il cliente in contanti; l'elettronico è per costruzione il resto. È il
 * motivo per cui lo stato è un numero solo (`cashCents`) e non due: con due
 * campi indipendenti esisterebbe uno stato in cui la somma non fa l'incassato,
 * e la quadratura AdE (voce #5) diventerebbe un errore da mostrare invece di
 * un invariante. Qui non esiste un residuo diverso da zero da segnalare —
 * l'invio non si blocca mai su uno sbilancio, perché non se ne può creare uno.
 *
 * Portare a zero una delle due quote è legittimo e non è un caso speciale: il
 * documento torna a essere un pagamento singolo, e sia lo schema sia la
 * persistenza lo trattano come tale (`toPaymentEntries` scarta le voci a zero).
 */
export function PaymentSplit({
  collectedCents,
  cashCents,
  onCashChange,
  onClose,
}: PaymentSplitProps) {
  // Regola condivisa col submit (`splitCashElectronic`): la cassa non può
  // mostrare una ripartizione diversa da quella che trasmette.
  const split = splitCashElectronic(collectedCents, cashCents);

  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <p className="text-muted-foreground text-sm font-medium">
          Pagamento misto
        </p>
        <button
          type="button"
          aria-label="Rimuovi pagamento misto"
          onClick={onClose}
          className="text-muted-foreground hover:bg-muted rounded-lg p-1"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="mb-2 grid grid-cols-2 gap-3">
        <SplitRow method="PC" cents={split.cashCents} active />
        <SplitRow method="PE" cents={split.electronicCents} active={false} />
      </div>

      {/* Il tastierino lavora già in centesimi interi (regola 17): nessun
          parser di importi, e nessun passaggio da un float intermedio. */}
      <NumericKeypad
        value={cashCents}
        onChange={(cents) => onCashChange(Math.min(cents, collectedCents))}
      />
      <p className="text-muted-foreground mt-2 text-xs">
        {"Digita quanto incassi in contanti: l’elettronico è il resto."}
      </p>
    </div>
  );
}

/** Una delle due quote. `active` marca quella che il tastierino sta editando. */
function SplitRow({
  method,
  cents,
  active,
}: {
  readonly method: PaymentMethod;
  readonly cents: number;
  readonly active: boolean;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center gap-1 rounded-xl border-2 p-3",
        active
          ? "border-primary bg-primary/10 text-primary"
          : "border-muted bg-muted/30 text-muted-foreground",
      )}
    >
      {METHOD_ICONS[method]}
      <span className="text-xs font-medium">
        {PAYMENT_METHOD_LABELS[method]}
      </span>
      {/* Nessun `aria-label` sull'importo: duplicherebbe il testo che gli
          sta accanto, e uno `span` etichettato ma senza ruolo viene ignorato
          da parte degli screen reader. La riga si legge già "Contanti 2,50 €"
          dal suo contenuto. */}
      <span className="text-lg font-bold tabular-nums">
        {formatCurrency(cents / 100)}
      </span>
    </div>
  );
}
