"use client";

import { useId, useState } from "react";

import { ChevronDown, X } from "lucide-react";
import { cn, formatCurrency } from "@/lib/utils";
import { NumericKeypad } from "./numeric-keypad";
import { PaymentSplit } from "./payment-split";
import { Input } from "@/components/ui/input";

interface ReceiptOptionsProps {
  /**
   * Gate di piano (Pro) per sconto a pagare e pagamento misto. Quando `false`
   * il pannello contiene il solo codice lotteria — che non ha gate di piano.
   * Un layout unico per tutti i piani: biforcarlo (lotteria inline per
   * Starter, nel pannello per Pro) raddoppierebbe i modi in cui il core flow
   * fiscale può rompersi, per risparmiare un tap su una feature marginale.
   */
  readonly discountsUnlocked: boolean;
  /** Corrispettivo pieno, in centesimi: serve alla nota dello sconto. */
  readonly totalCents: number;
  /** Corrispettivo meno abbuono: è ciò che `PaymentSplit` ripartisce. */
  readonly collectedCents: number;
  readonly globalDiscountCents: number;
  /** Già clampato dal padre a `totale − 1 centesimo`. */
  readonly onGlobalDiscountChange: (cents: number) => void;
  readonly isSplit: boolean;
  readonly cashCents: number;
  readonly onSplitCashChange: (cents: number | null) => void;
  readonly lotteryCode: string;
  readonly onLotteryCodeChange: (value: string) => void;
  readonly lotteryDisabled: boolean;
  readonly lotteryHint: string;
}

/**
 * Riassunto di cosa il pannello contiene mentre è chiuso.
 *
 * Un `Altre opzioni ▾` muto su uno scontrino con un abbuono da €2 nasconde un
 * dato fiscale: chi collassa il pannello deve continuare a vedere che cosa ha
 * impostato. Vale soprattutto per il misto, che quando è attivo rimpiazza il
 * selettore del metodo di pagamento — senza queste etichette il riepilogo non
 * direbbe più da nessuna parte come si sta incassando.
 */
function activeOptionLabels({
  isSplit,
  cashCents,
  globalDiscountCents,
  lotteryCode,
  lotteryDisabled,
}: {
  readonly isSplit: boolean;
  readonly cashCents: number;
  readonly globalDiscountCents: number;
  readonly lotteryCode: string;
  readonly lotteryDisabled: boolean;
}): string[] {
  const labels: string[] = [];
  if (isSplit) {
    labels.push(`Misto: ${formatCurrency(cashCents / 100)} in contanti`);
  }
  if (globalDiscountCents > 0) {
    labels.push(`Sconto: ${formatCurrency(globalDiscountCents / 100)}`);
  }
  // Un codice digitato su un incasso che non lo ammette è inerte — lo scarta
  // `resolveLotteryCode` lato server. Annunciarlo qui direbbe che finisce sul
  // documento: resta nel campo, con la ragione scritta, dentro il pannello.
  if (lotteryCode !== "" && !lotteryDisabled) labels.push("Lotteria");
  return labels;
}

/**
 * Le opzioni marginali del riepilogo, sotto una sola disclosure.
 *
 * Sconto a pagare, pagamento misto e codice lotteria servono in una frazione
 * degli scontrini, ma da fuori costavano tre blocchi di altezza a **ogni**
 * emissione, fra il metodo di pagamento e il bottone Emetti. Raggrupparli non
 * è solo nasconderli: due link testuali sciolti non dicevano di appartenere
 * alla stessa famiglia — erano appendici incollate al riepilogo dopo il fatto.
 *
 * Dentro resta un secondo livello di disclosure per sconto e misto: entrambi
 * aprono un tastierino numerico, e aprire il pannello non deve rovesciare
 * addosso all'esercente 250px di tastierino che non ha chiesto.
 */
export function ReceiptOptions({
  discountsUnlocked,
  totalCents,
  collectedCents,
  globalDiscountCents,
  onGlobalDiscountChange,
  isSplit,
  cashCents,
  onSplitCashChange,
  lotteryCode,
  onLotteryCodeChange,
  lotteryDisabled,
  lotteryHint,
}: ReceiptOptionsProps) {
  const panelId = useId();

  // Il pannello si apre da solo su un'opzione già impostata (es. rientrando
  // dal carrello): il riepilogo non deve mai far sparire dietro un tap una
  // scelta che l'esercente ha già fatto. Altrimenti resta chiuso — zero
  // ingombro per la quasi totalità degli scontrini, che non usa nulla di
  // tutto questo.
  const [open, setOpen] = useState(
    globalDiscountCents > 0 || isSplit || lotteryCode !== "",
  );
  const [discountOpen, setDiscountOpen] = useState(globalDiscountCents > 0);

  const labels = activeOptionLabels({
    isSplit,
    cashCents,
    globalDiscountCents,
    lotteryCode,
    lotteryDisabled,
  });

  const closeDiscount = () => {
    setDiscountOpen(false);
    onGlobalDiscountChange(0);
  };

  return (
    <div className="rounded-xl border">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        aria-controls={panelId}
        className="flex w-full items-center gap-2 px-4 py-3 text-left"
      >
        <span className="flex-1">
          <span className="text-sm font-medium">Altre opzioni</span>
          {!open && labels.length > 0 && (
            <span className="text-muted-foreground block text-xs">
              {labels.join(" · ")}
            </span>
          )}
        </span>
        <ChevronDown
          aria-hidden="true"
          className={cn(
            "text-muted-foreground h-4 w-4 transition-transform",
            open && "rotate-180",
          )}
        />
      </button>

      {open && (
        <div id={panelId} className="flex flex-col gap-4 border-t px-4 py-4">
          {/* Pagamento misto (Pro) */}
          {discountsUnlocked && !isSplit && (
            <button
              type="button"
              onClick={() => onSplitCashChange(0)}
              className="text-muted-foreground hover:text-foreground self-start text-sm font-medium underline underline-offset-4"
            >
              {"+ Pagamento misto"}
            </button>
          )}

          {isSplit && (
            <PaymentSplit
              collectedCents={Math.max(collectedCents, 0)}
              cashCents={cashCents}
              onCashChange={onSplitCashChange}
              onClose={() => onSplitCashChange(null)}
            />
          )}

          {/* Sconto a pagare (Pro) — sta sotto il pagamento misto perché è lì
              che lo mette il wizard AdE: è una voce della fase di pagamento,
              non uno sconto sul prezzo. */}
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
              {/* Stesso tastierino del resto della cassa: lavora gia' in
                  centesimi interi (regola 17), quindi non serve nessun parser
                  di importi. */}
              <NumericKeypad
                value={globalDiscountCents}
                onChange={onGlobalDiscountChange}
              />
              <p className="text-muted-foreground mt-2 text-xs">
                {"Non riduce l’IVA: il totale resta "}
                {formatCurrency(totalCents / 100)}
                {". Riduce solo quanto incassi."}
              </p>
            </div>
          )}

          {/* Codice lotteria — sempre presente, disabilitato con la ragione
              scritta quando non è ammesso. Farlo sparire (com'era fuori dal
              pannello sui pagamenti in contanti) lascia l'esercente a cercare
              un campo che non c'è, e qui lascerebbe pure il pannello vuoto per
              chi non ha il piano Pro. */}
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
              disabled={lotteryDisabled}
              onChange={(e) => {
                onLotteryCodeChange(e.target.value.toUpperCase());
              }}
              className="rounded-xl font-mono uppercase"
            />
            <p className="text-muted-foreground mt-1 text-xs">{lotteryHint}</p>
          </div>
        </div>
      )}
    </div>
  );
}
