"use client";

import { ArrowLeft, Loader2, ReceiptEuro } from "lucide-react";
import { formatCurrency } from "@/lib/utils";
import { CartLine, PaymentMethod } from "@/types/cassa";
import { CartLineItem } from "./cart-line-item";
import { PaymentMethodSelector } from "./payment-method-selector";
import { ReceiptOptions } from "./receipt-options";
import { Button } from "@/components/ui/button";

/** Soglia minima della Lotteria degli Scontrini, in centesimi interi. */
const LOTTERY_MIN_CENTS = 100;

/**
 * Perché il codice lotteria non è disponibile — o cosa serve perché lo sia.
 *
 * L'ordine è quello dell'annullabilità: prima le condizioni che l'esercente ha
 * appena creato con un gesto e che può disfare con un altro (il metodo di
 * pagamento, la quota in contanti), per ultimo l'importo, che dipende dal
 * carrello e da qui non si tocca.
 */
function lotteryHint(
  isCashOnly: boolean,
  hasCashShare: boolean,
  belowMin: boolean,
): string {
  if (isCashOnly) {
    return "Non disponibile: la lotteria richiede un pagamento elettronico";
  }
  if (hasCashShare) {
    return "Non disponibile: la lotteria richiede un incasso solo elettronico";
  }
  if (belowMin) return "Non disponibile per importi inferiori a €1,00";
  return "Per la Lotteria degli Scontrini — solo pagamenti elettronici";
}

interface ReceiptSummaryProps {
  readonly lines: CartLine[];
  /**
   * Totale in centesimi interi (regola 17). Unica fonte sia per l'importo
   * mostrato sia per il gate lotteria, così il confronto con la soglia è
   * identico a quello di `resolveLotteryCode` lato server.
   */
  readonly totalCents: number;
  readonly paymentMethod: PaymentMethod;
  readonly onPaymentMethodChange: (method: PaymentMethod) => void;
  readonly onRemoveLine: (id: string) => void;
  readonly onSubmit: () => void;
  readonly onBack: () => void;
  readonly isSubmitting?: boolean;
  readonly lotteryCode?: string;
  readonly onLotteryCodeChange?: (value: string) => void;
  /**
   * Sconto a pagare in centesimi interi (regola 17). `0` = nessun abbuono.
   *
   * ⚠️ Non riduce `totalCents`: il corrispettivo resta pieno e l'IVA si versa
   * piena (`HAR.md` voce #3b). Riduce solo l'incassato.
   */
  readonly globalDiscountCents?: number;
  readonly onGlobalDiscountChange?: (cents: number) => void;
  /**
   * Quota in contanti di un pagamento misto, in centesimi interi, oppure
   * `null` quando il pagamento è su una modalità sola. La quota elettronica
   * non è uno stato a sé: è sempre `incassato − contanti` (vedi
   * `PaymentSplit`), così non può esistere una ripartizione che non quadra.
   */
  readonly splitCashCents?: number | null;
  readonly onSplitCashChange?: (cents: number | null) => void;
  /**
   * Gate di piano (Pro) per sconto a pagare e pagamento misto. Quando `false`
   * l'affordance non viene renderizzata affatto: la cassa e' il core flow
   * fiscale e un upsell in mezzo al checkout e' attrito: la scoperta della
   * feature vive su /prezzi, nelle impostazioni e nella guida.
   */
  readonly discountsUnlocked?: boolean;
}

export function ReceiptSummary({
  lines,
  totalCents,
  paymentMethod,
  onPaymentMethodChange,
  onRemoveLine,
  onSubmit,
  onBack,
  isSubmitting = false,
  lotteryCode = "",
  onLotteryCodeChange,
  globalDiscountCents = 0,
  onGlobalDiscountChange,
  splitCashCents = null,
  onSplitCashChange,
  discountsUnlocked = false,
}: ReceiptSummaryProps) {
  const count = lines.length;
  // Soglia lotteria sul CORRISPETTIVO, non sull'incassato: lo sconto a pagare
  // non puo' far scendere uno scontrino sotto il minimo di 1 euro perche' non
  // riduce il corrispettivo (`HAR.md` voce #13). Stesso confronto di
  // `resolveLotteryCode` lato server, quindi client e server non divergono.
  const isBelowLotteryMin = totalCents < LOTTERY_MIN_CENTS;

  const collectedCents = totalCents - globalDiscountCents;

  const isSplit = splitCashCents !== null;
  // Clamp: l'incassato cambia quando cambia l'abbuono, e una quota contanti
  // rimasta più alta produrrebbe un elettronico negativo.
  const cashCents = Math.min(splitCashCents ?? 0, Math.max(collectedCents, 0));
  // Il codice lotteria richiede un incasso ESCLUSIVAMENTE elettronico
  // (`HAR.md` voce #13): qualunque quota in contanti lo squalifica, che sia
  // l'unica modalità o una delle due. Stesso predicato di `isElectronicOnly`
  // lato server.
  const isCashOnly = !isSplit && paymentMethod === "PC";
  const hasCashShare = isSplit && cashCents > 0;

  /**
   * Clamp a `totale - 1 centesimo`: lo sconto a pagare deve lasciare almeno un
   * centesimo da incassare (stesso vincolo di `refineGlobalDiscount` lato
   * server, dove sta il gate vero). Clampare invece di mostrare un errore
   * evita di far digitare all'esercente un importo che verra' rifiutato dopo.
   */
  const handleDiscountChange = (cents: number) => {
    onGlobalDiscountChange?.(Math.min(cents, Math.max(totalCents - 1, 0)));
  };

  return (
    <div className="flex flex-col gap-4">
      {/* Header */}
      <div className="flex items-center gap-3">
        <button
          type="button"
          aria-label="Torna indietro"
          onClick={onBack}
          className="hover:bg-muted rounded-lg p-2 transition-colors"
        >
          <ArrowLeft className="h-5 w-5" />
        </button>
        <div>
          <h2 className="text-lg font-semibold">Riepilogo scontrino</h2>
          <p className="text-muted-foreground text-sm">
            {count} {count === 1 ? "articolo" : "articoli"}
          </p>
        </div>
      </div>

      {/* Lines */}
      <div className="flex flex-col gap-2">
        {lines.map((line) => (
          <CartLineItem key={line.id} line={line} onRemove={onRemoveLine} />
        ))}
      </div>

      {/* Total */}
      <div className="bg-muted flex items-center justify-between rounded-xl px-4 py-3">
        <span className="font-medium">Totale</span>
        <span className="text-xl font-bold tabular-nums">
          {formatCurrency(totalCents / 100)}
        </span>
      </div>

      {/* Payment method — il selettore sparisce quando il pagamento è
          ripartito: la modalità non è più una scelta, sono due importi. */}
      {!isSplit && (
        <div>
          <p className="text-muted-foreground mb-2 text-sm font-medium">
            Metodo di pagamento
          </p>
          <PaymentMethodSelector
            value={paymentMethod}
            onChange={onPaymentMethodChange}
          />
        </div>
      )}

      {/* Sconto a pagare, pagamento misto e codice lotteria: tre casi
          marginali sotto una disclosure sola, così non costano altezza a ogni
          scontrino. Fuori restano solo le grandezze che l'esercente deve
          vedere senza chiederle. */}
      <ReceiptOptions
        discountsUnlocked={discountsUnlocked}
        totalCents={totalCents}
        collectedCents={collectedCents}
        globalDiscountCents={globalDiscountCents}
        onGlobalDiscountChange={handleDiscountChange}
        isSplit={isSplit}
        cashCents={cashCents}
        onSplitCashChange={(cents) => onSplitCashChange?.(cents)}
        lotteryCode={lotteryCode}
        onLotteryCodeChange={(value) => onLotteryCodeChange?.(value)}
        lotteryDisabled={isCashOnly || hasCashShare || isBelowLotteryMin}
        lotteryHint={lotteryHint(isCashOnly, hasCashShare, isBelowLotteryMin)}
      />

      {/* Da incassare — resta FUORI dal pannello: non è un'opzione, è il
          risultato di una scelta già fatta. Compare solo quando diverge dal
          totale, così la differenza fra corrispettivo e incassato è esplicita
          prima dell'invio invece che una sorpresa sullo scontrino. */}
      {globalDiscountCents > 0 && (
        <div className="flex items-center justify-between rounded-xl border px-4 py-3">
          <span className="font-medium">Da incassare</span>
          <span className="text-xl font-bold tabular-nums">
            {formatCurrency(collectedCents / 100)}
          </span>
        </div>
      )}

      {/* Submit */}
      <Button
        type="button"
        size="lg"
        className="w-full"
        onClick={onSubmit}
        disabled={isSubmitting || collectedCents <= 0}
      >
        {isSubmitting ? (
          <Loader2 className="mr-2 h-5 w-5 animate-spin" />
        ) : (
          <ReceiptEuro className="mr-2 h-5 w-5" />
        )}
        {isSubmitting ? "Invio in corso…" : "Emetti scontrino"}
      </Button>
    </div>
  );
}
