"use client";

import { useState } from "react";

import { ArrowLeft, Loader2, ReceiptEuro, X } from "lucide-react";
import { formatCurrency } from "@/lib/utils";
import { CartLine, PaymentMethod } from "@/types/cassa";
import { CartLineItem } from "./cart-line-item";
import { NumericKeypad } from "./numeric-keypad";
import { PaymentMethodSelector } from "./payment-method-selector";
import { PaymentSplit } from "./payment-split";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

/** Soglia minima della Lotteria degli Scontrini, in centesimi interi. */
const LOTTERY_MIN_CENTS = 100;

/**
 * Perché il codice lotteria non è disponibile — o cosa serve perché lo sia.
 *
 * La quota in contanti si nomina per prima: è la condizione che l'esercente
 * ha appena creato con un gesto, e quella su cui può tornare indietro.
 */
function lotteryHint(belowMin: boolean, hasCashShare: boolean): string {
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
   * Gate di piano (Pro). Quando `false` l'affordance non viene renderizzata
   * affatto: la cassa e' il core flow fiscale e un upsell in mezzo al
   * checkout e' attrito: la scoperta della feature vive su /prezzi, nelle
   * impostazioni e nella guida.
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

  // L'affordance si apre da sola su un abbuono gia' impostato (es. tornando
  // dal carrello), altrimenti resta chiusa: zero ingombro per chi non sconta.
  const [discountOpen, setDiscountOpen] = useState(globalDiscountCents > 0);

  const collectedCents = totalCents - globalDiscountCents;

  const isSplit = splitCashCents !== null;
  // Clamp: l'incassato cambia quando cambia l'abbuono, e una quota contanti
  // rimasta più alta produrrebbe un elettronico negativo.
  const cashCents = Math.min(splitCashCents ?? 0, Math.max(collectedCents, 0));
  // Il codice lotteria richiede un incasso ESCLUSIVAMENTE elettronico
  // (`HAR.md` voce #13): qualunque quota in contanti lo squalifica. Stesso
  // predicato di `isElectronicOnly` lato server.
  const hasCashShare = isSplit && cashCents > 0;

  const closeDiscount = () => {
    setDiscountOpen(false);
    onGlobalDiscountChange?.(0);
  };

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

      {/* Pagamento misto (Pro) — stessa progressive disclosure dello sconto a
          pagare: un link finché non serve, il ripartitore quando l'esercente
          lo chiede. Zero costo per il caso a metodo singolo, che è la quasi
          totalità degli scontrini. */}
      {discountsUnlocked && !isSplit && (
        <button
          type="button"
          onClick={() => onSplitCashChange?.(0)}
          className="text-muted-foreground hover:text-foreground self-start text-sm font-medium underline underline-offset-4"
        >
          {"+ Pagamento misto"}
        </button>
      )}

      {isSplit && (
        <PaymentSplit
          collectedCents={Math.max(collectedCents, 0)}
          cashCents={cashCents}
          onCashChange={(cents) => onSplitCashChange?.(cents)}
          onClose={() => onSplitCashChange?.(null)}
        />
      )}

      {/* Sconto a pagare (Pro) — progressive disclosure: un link finche' non
          serve, il campo solo quando l'esercente lo chiede. Sta qui, sotto il
          metodo di pagamento, perche' e' li' che lo mette il wizard AdE: e'
          una voce della fase di pagamento, non uno sconto sul prezzo. */}
      {discountsUnlocked && !discountOpen && (
        <button
          type="button"
          onClick={() => setDiscountOpen(true)}
          className="text-muted-foreground hover:text-foreground self-start text-sm font-medium underline underline-offset-4"
        >
          {"+ Sconto a pagare"}
        </button>
      )}

      {discountsUnlocked && discountOpen && (
        <div>
          <div className="mb-1 flex items-center justify-between">
            <p className="text-muted-foreground text-sm font-medium">
              Sconto a pagare
            </p>
            <button
              type="button"
              aria-label="Rimuovi sconto a pagare"
              onClick={closeDiscount}
              className="text-muted-foreground hover:bg-muted rounded-lg p-1"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          <div className="mb-2 rounded-xl py-2 text-center">
            <span className="text-3xl font-bold tracking-tight tabular-nums">
              {formatCurrency(globalDiscountCents / 100)}
            </span>
          </div>
          {/* Stesso tastierino del resto della cassa: lavora gia' in centesimi
              interi (regola 17), quindi non serve nessun parser di importi. */}
          <NumericKeypad
            value={globalDiscountCents}
            onChange={handleDiscountChange}
          />
          <p className="text-muted-foreground mt-2 text-xs">
            {"Non riduce l\u2019IVA: il totale resta "}
            {formatCurrency(totalCents / 100)}
            {". Riduce solo quanto incassi."}
          </p>
        </div>
      )}

      {/* Da incassare — compare solo quando diverge dal totale, cosi' la
          differenza fra corrispettivo e incassato e' esplicita prima
          dell'invio invece che una sorpresa sullo scontrino. */}
      {globalDiscountCents > 0 && (
        <div className="flex items-center justify-between rounded-xl border px-4 py-3">
          <span className="font-medium">Da incassare</span>
          <span className="text-xl font-bold tabular-nums">
            {formatCurrency(collectedCents / 100)}
          </span>
        </div>
      )}

      {/* Lottery code — solo se l'incasso è tutto elettronico. Su un misto il
          campo resta visibile ma disabilitato, con la ragione scritta: farlo
          sparire in silenzio lascerebbe l'esercente a digitare un codice che
          non finirà mai sul documento (`HAR.md` voce #13). */}
      {(paymentMethod === "PE" || isSplit) && (
        <div>
          <p className="text-muted-foreground mb-1 text-sm font-medium">
            Codice lotteria <span className="font-normal">(opzionale)</span>
          </p>
          <Input
            type="text"
            placeholder="Codice lotteria (8 caratteri)"
            maxLength={8}
            spellCheck={false}
            autoComplete="off"
            autoCapitalize="characters"
            value={lotteryCode}
            disabled={isBelowLotteryMin || hasCashShare}
            onChange={(e) => {
              onLotteryCodeChange?.(e.target.value.toUpperCase());
            }}
            className="rounded-xl font-mono uppercase"
          />
          <p className="text-muted-foreground mt-1 text-xs">
            {lotteryHint(isBelowLotteryMin, hasCashShare)}
          </p>
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
